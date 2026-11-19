"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentHashField } from "./DocumentHashField";
import { SetupCard } from "./SetupCard";
import {
  AttackOutcome,
  Busy,
  ChainCard,
  Columns,
  DeskStrip,
  Label,
  Link,
  Panel,
  Refusal,
  StepCard,
  type TourResult,
  UnderTheHood,
} from "./TourParts";
import { useAuditDesk } from "~~/hooks/hcsAudit/useAuditDesk";
import { useRegulatorFeed } from "~~/hooks/hcsAudit/useRegulatorFeed";
import { useTopicMessages } from "~~/hooks/hcsAudit/useTopicMessages";
import { decodeEntryBase64, sha256Hex } from "~~/services/hcsAudit/entry";
import { hashscanTransactionUrl } from "~~/services/hcsAudit/mirror";
import { type AuditEntry, type DeskState, MAX_REASON_LENGTH, isDecisionEvent } from "~~/services/hcsAudit/types";

type Stage = "setup" | "refuse" | "approve" | "decide" | "break" | "verify";
type Chapter = "break" | "verify";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "setup", label: "Set up" },
  { stage: "refuse", label: "Refuse" },
  { stage: "approve", label: "Approve" },
  { stage: "decide", label: "Decide" },
  { stage: "break", label: "Break it" },
  { stage: "verify", label: "Verify" },
];
const TOTAL = STEPS.length;
const TRANSFER = 100;

type Ready = DeskState & { topicId: string; tokenId: string; holderAccountId: string };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/hedera/audit/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `${path} failed`);
  return json as T;
}

/** Records through the Issuer, and reports the entry the way every tour step reports its result. */
async function record(body: unknown): Promise<TourResult> {
  const { entry } = await post<{ entry: AuditEntry }>("action", body);
  return { ok: true, result: entry.result, message: "", transaction: entry.tx };
}

/**
 * A document the reader can hold, check and download, the same every time for this desk, so the Verify step can
 * hash it again after a reload. Stands in for a real screening report, which would never leave the officer's files.
 */
const sampleDocument = (desk: Ready) =>
  [
    "Sanctions screening report",
    `Subject: ${desk.holderAccountId}`,
    `Security token: ${desk.tokenId}`,
    `Audit topic: ${desk.topicId}`,
    "Lists checked: demo sanctions list",
    "Outcome: PASSED",
    "",
  ].join("\n");

function SampleReportLink({ id, desk, children }: { id: string; desk: Ready; children: string }) {
  return (
    <a
      id={id}
      className="link"
      download="sanctions-screening.txt"
      href={`data:text/plain;charset=utf-8,${encodeURIComponent(sampleDocument(desk))}`}
    >
      {children}
    </a>
  );
}

const hashOf = (text: string) => sha256Hex(new TextEncoder().encode(text));

/**
 * The step follows the trail on the topic, not this tab, so a reload or a detour through the Sandbox lands on the
 * right one. Only which of the last two chapters the reader is on is their own. `null` until the trail is read.
 */
function stageOf(desk: DeskState | null, entries: AuditEntry[] | null, chapter: Chapter): Stage | null {
  if (!desk) return null;
  if (!desk.topicId || !desk.tokenId || !desk.holderAccountId) return "setup";
  if (!entries) return null;
  const holder = desk.holderAccountId;
  const kyc = entries.some(e => e.event === "grant_kyc" && e.result === "SUCCESS" && e.account === holder);
  // Once KYC is granted a transfer goes through, so the refusal can no longer be shown: the step is behind us.
  const refused = entries.some(e => e.event === "transfer" && e.result !== "SUCCESS");
  if (!kyc && !refused) return "refuse";
  if (!kyc) return "approve";
  if (!entries.some(e => isDecisionEvent(e.event))) return "decide";
  return chapter;
}

type Ctx = {
  desk: Ready;
  busyKey: string | null;
  results: Record<string, TourResult | null>;
  go: (key: string, work: () => Promise<TourResult>) => Promise<void>;
};

export function Tour() {
  const audit = useAuditDesk();
  const desk = audit.desk;
  const { messages, loading } = useTopicMessages(desk?.topicId ?? null);
  const [chapter, setChapter] = useState<Chapter>("break");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TourResult | null>>({});

  // A fresh trail forgets the last one's results and starts its chapters over.
  const topicId = desk?.topicId ?? null;
  useEffect(() => {
    setResults({});
    setChapter("break");
  }, [topicId]);

  // The messages are the previous topic's until the first read of a new one lands.
  const current = messages.length === 0 || messages[0].topic_id === topicId;
  const entries =
    loading || !current
      ? null
      : messages.map(m => decodeEntryBase64(m.message)?.entry).filter((e): e is AuditEntry => Boolean(e));
  const stage = audit.deskLoaded ? stageOf(desk, entries, chapter) : null;

  const go: Ctx["go"] = async (key, work) => {
    setBusyKey(key);
    setResults(previous => ({ ...previous, [key]: null }));
    let result: TourResult;
    try {
      result = await work();
    } catch (e) {
      result = { ok: false, result: "Error", message: errorMessage(e), transaction: null };
    }
    setResults(previous => ({ ...previous, [key]: result }));
    setBusyKey(null);
  };

  const ready = desk?.topicId && desk.tokenId && desk.holderAccountId ? (desk as Ready) : null;
  const ctx: Ctx | null = ready ? { desk: ready, busyKey, results, go } : null;
  const trail = current ? messages : [];

  return (
    <div className="flex flex-col gap-4">
      <Stepper stage={stage} pickable={stage === "break" || stage === "verify"} onPick={setChapter} />
      {ready && stage !== "setup" ? (
        <DeskStrip
          topicId={ready.topicId}
          tokenId={ready.tokenId}
          holderAccountId={ready.holderAccountId}
          entries={trail.length}
        />
      ) : null}
      {stage === null ? (
        <div className="flex items-center gap-3 text-base-content/70">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          Reading the trail…
        </div>
      ) : stage === "setup" || !ctx ? (
        <SetupScreen audit={audit} />
      ) : stage === "refuse" ? (
        <RefuseScreen ctx={ctx} trail={trail} />
      ) : stage === "approve" ? (
        <ApproveScreen ctx={ctx} trail={trail} />
      ) : stage === "decide" ? (
        <DecideScreen ctx={ctx} trail={trail} />
      ) : stage === "break" ? (
        <BreakScreen ctx={ctx} entries={trail.length} onNext={() => setChapter("verify")} />
      ) : (
        <VerifyScreen desk={ctx.desk} />
      )}
    </div>
  );
}

function Stepper({
  stage,
  pickable,
  onPick,
}: {
  /** `null` until the reads land: no step is claimed before the trail is known. */
  stage: Stage | null;
  pickable: boolean;
  onPick: (chapter: Chapter) => void;
}) {
  const current = stage === null ? -1 : STEPS.findIndex(step => step.stage === stage);
  return (
    <nav id="tour-progress" aria-label="Progress" className="flex flex-wrap gap-2 items-center">
      {STEPS.map((step, index) => {
        const done = index < current;
        const here = index === current;
        const look = here
          ? "bg-primary text-primary-content font-semibold"
          : done
            ? "bg-success/20 border border-success/50 font-semibold"
            : "bg-base-100 border border-base-300 text-base-content/70";
        const text = done ? `✓ ${step.label}` : `${index + 1} ${step.label}`;
        // Once a decision is on the trail, the last two chapters are the reader's to move between.
        const canPick = pickable && !here && (step.stage === "break" || step.stage === "verify");
        return (
          <span key={step.stage} className="contents">
            {index > 0 ? (
              <span aria-hidden className="text-base-content/40">
                —
              </span>
            ) : null}
            {canPick ? (
              <button
                type="button"
                className={`px-3.5 py-2 rounded-full text-sm cursor-pointer hover:ring-2 hover:ring-primary/40 ${look}`}
                onClick={() => onPick(step.stage as Chapter)}
              >
                {text}
              </button>
            ) : (
              <span aria-current={here ? "step" : undefined} className={`px-3.5 py-2 rounded-full text-sm ${look}`}>
                {text}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function SetupScreen({ audit }: { audit: ReturnType<typeof useAuditDesk> }) {
  return (
    <Columns
      main={
        <SetupCard
          configured={Boolean(audit.desk?.configured)}
          deskLoaded={audit.deskLoaded}
          desk={audit.desk}
          steps={audit.steps}
          setupRunning={audit.setupRunning}
          setupError={audit.setupError}
          onRunSetup={audit.runSetup}
          step={{ label: `Step 1 of ${TOTAL} · Issuer`, title: "Set up the audit trail" }}
        />
      }
      aside={
        <>
          <Panel title="Who is who" caption="Two demo accounts the app creates, and you as the issuer.">
            <ul className="m-0 pl-5 list-disc flex flex-col gap-1.5 text-sm">
              <li>
                <strong>Issuer</strong>: your operator account. Owns the topic and the token, acts on the holder, and
                publishes every entry.
              </li>
              <li>
                <strong>Holder</strong>: the account the token actions apply to.
              </li>
              <li>
                <strong>Outsider</strong>: an account with no rights on the topic, created when you try to break it.
              </li>
              <li>
                <strong>Regulator</strong>: holds no key and no account, and reads only the public mirror node.
              </li>
            </ul>
          </Panel>
          <Panel title="What happens next" caption="One action a step.">
            <ol className="m-0 pl-5 list-decimal flex flex-col gap-1 text-sm">
              <li>
                <strong>Refuse</strong>: a transfer the network refuses, logged anyway.
              </li>
              <li>
                <strong>Approve</strong>: grant KYC, with the reason why.
              </li>
              <li>
                <strong>Decide</strong>: a decision the ledger never sees.
              </li>
              <li>
                <strong>Break it</strong>: three ways to tamper with the trail.
              </li>
              <li>
                <strong>Verify</strong>: check it all as the regulator.
              </li>
            </ol>
          </Panel>
        </>
      }
    />
  );
}

/** Shown once the action is logged, until the mirror node has the entry and the step moves on. */
function Logged({ result }: { result: TourResult | null | undefined }) {
  if (!result || result.result === "Error") return null;
  return (
    <p className="m-0 text-sm text-base-content/70">
      Logged with <strong className="font-mono">{result.result}</strong>
      {result.transaction ? (
        <>
          {" "}
          for <Link href={hashscanTransactionUrl(result.transaction)}>its transaction</Link>
        </>
      ) : null}
      . Waiting for the mirror node to show the entry…
    </p>
  );
}

const SUBMIT_CODE = `new TopicMessageSubmitTransaction()
  .setTopicId(topic)                  // its submit key is the Issuer's: nobody else can write
  .setMessage(JSON.stringify(entry))
  .execute(client);`;

function RefuseScreen({ ctx, trail }: { ctx: Ctx; trail: Parameters<typeof ChainCard>[0]["messages"] }) {
  const { desk, busyKey, results, go } = ctx;
  return (
    <Columns
      main={
        <>
          <StepCard step={2} total={TOTAL} who="Issuer" title={`Transfer ${TRANSFER} tokens before KYC`}>
            <p className="m-0 text-base-content/80 max-w-2xl">
              The holder has no KYC on the token yet, so the network will refuse the transfer. The trail logs it anyway,
              with the network&apos;s result code: a compliance record that only kept what succeeded would hide the
              attempts that did not.
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="tour-transfer"
                type="button"
                className="btn btn-primary"
                disabled={busyKey !== null || results.transfer?.ok === true}
                onClick={() =>
                  void go("transfer", () => record({ kind: "action", action: "transfer", amount: TRANSFER }))
                }
              >
                <Busy on={busyKey === "transfer"} />
                Transfer and log it
              </button>
            </div>
            <Logged result={results.transfer} />
            <Refusal id="tour-transfer-error" result={results.transfer} />
          </StepCard>
          <UnderTheHood
            title="the calls this step makes"
            code={`const result = await new TransferTransaction()
  .addTokenTransfer(token, issuer, -${TRANSFER})
  .addTokenTransfer(token, "${desk.holderAccountId}", ${TRANSFER})
  .execute(client);                   // refused: ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN

const entry = { v: 2, event: "transfer", token, account, amount: ${TRANSFER},
  tx: result.transactionId, result: status, reason, authority, evidence,
  prev: sha256(previousMessageBytes) };
${SUBMIT_CODE}`}
          />
        </>
      }
      aside={<ChainCard messages={trail} />}
    />
  );
}

function ApproveScreen({ ctx, trail }: { ctx: Ctx; trail: Parameters<typeof ChainCard>[0]["messages"] }) {
  const { desk, busyKey, results, go } = ctx;
  const [reason, setReason] = useState("KYC file KYC-2026-0094 reviewed and approved");
  return (
    <Columns
      main={
        <>
          <StepCard step={3} total={TOTAL} who="Issuer" title="Grant KYC, and say why">
            <p className="m-0 text-base-content/80 max-w-2xl">
              The ledger will record that KYC was granted. It cannot record why: that is what the entry adds. The reason
              is published with the entry, on a topic nobody can rewrite.
            </p>
            <div className="flex flex-col gap-1 max-w-xl">
              <label htmlFor="tour-reason" className="text-sm text-base-content/70">
                Reason, published with the entry
              </label>
              <input
                id="tour-reason"
                className="input input-bordered w-full"
                maxLength={MAX_REASON_LENGTH}
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={busyKey !== null}
              />
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="tour-grant-kyc"
                type="button"
                className="btn btn-primary"
                disabled={busyKey !== null || results.kyc?.ok === true}
                onClick={() => void go("kyc", () => record({ kind: "action", action: "grant_kyc", reason }))}
              >
                <Busy on={busyKey === "kyc"} />
                Grant KYC and log it
              </button>
            </div>
            <Logged result={results.kyc} />
            <Refusal id="tour-grant-kyc-error" result={results.kyc} />
          </StepCard>
          <UnderTheHood
            title="the calls this step makes"
            code={`const result = await new TokenGrantKycTransaction()
  .setTokenId(token)
  .setAccountId("${desk.holderAccountId}")
  .execute(client);

const entry = { v: 2, event: "grant_kyc", ..., tx: result.transactionId, result: "SUCCESS",
  reason: ${JSON.stringify(reason.trim() || null)}, prev: sha256(previousMessageBytes) };
${SUBMIT_CODE}`}
          />
        </>
      }
      aside={<ChainCard messages={trail} />}
    />
  );
}

function DecideScreen({ ctx, trail }: { ctx: Ctx; trail: Parameters<typeof ChainCard>[0]["messages"] }) {
  const { desk, busyKey, results, go } = ctx;
  const issuer = desk.publishers.find(p => p.role === "issuer")?.accountId ?? "";
  const [authority, setAuthority] = useState(issuer);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [sampleHash, setSampleHash] = useState<string | null>(null);
  const sample = sampleDocument(desk);

  useEffect(() => {
    void hashOf(sample).then(hash => {
      setSampleHash(hash);
      setEvidence(previous => previous ?? hash);
    });
  }, [sample]);

  const usingSample = evidence !== null && evidence === sampleHash;
  const complete = evidence !== null && authority.trim() !== "";
  return (
    <Columns
      main={
        <>
          <StepCard step={4} total={TOTAL} who="Compliance officer" title="Record a decision the ledger never sees">
            <p className="m-0 text-base-content/80 max-w-2xl">
              A sanctions screening of the holder passed. Nothing executes, so there is no transaction and nothing for a
              mirror node to show: the entry is the only record. It carries the authority that approved it and the hash
              of the report, so the report cannot be swapped later.
            </p>
            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col gap-1">
                <label htmlFor="tour-authority" className="text-sm text-base-content/70">
                  Authority: the account that approved it
                </label>
                <input
                  id="tour-authority"
                  className="input input-bordered w-48 font-mono"
                  value={authority}
                  onChange={e => setAuthority(e.target.value)}
                  disabled={busyKey !== null}
                />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <DocumentHashField
                  id="tour-evidence"
                  label="Report, hashed here: only the hash is published"
                  hint={
                    usingSample
                      ? "Using the sample report. Choose a file to use your own."
                      : "Hashed in your browser; the file never leaves it."
                  }
                  disabled={busyKey !== null}
                  hash={evidence}
                  onHash={setEvidence}
                />
                <span className="text-xs">
                  <SampleReportLink id="tour-sample-document" desk={desk}>
                    Download the sample report
                  </SampleReportLink>
                  {!usingSample && sampleHash ? (
                    <>
                      {" · "}
                      <button type="button" className="link" onClick={() => setEvidence(sampleHash)}>
                        Use it again
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="tour-decide"
                type="button"
                className="btn btn-primary"
                disabled={busyKey !== null || !complete || results.decide?.ok === true}
                onClick={() =>
                  void go("decide", () =>
                    record({
                      kind: "decision",
                      event: "sanctions_check",
                      outcome: "PASSED",
                      reason: "Screened against the demo sanctions list",
                      authority: authority.trim(),
                      evidence,
                    }),
                  )
                }
              >
                <Busy on={busyKey === "decide"} />
                Record the screening: PASSED
              </button>
              {!complete ? (
                <span className="text-sm text-base-content/60">An authority and a report are both required.</span>
              ) : null}
            </div>
            <Logged result={results.decide} />
            <Refusal id="tour-decide-error" result={results.decide} />
          </StepCard>
          <UnderTheHood
            title="the call this step makes"
            code={`// No token transaction: the decision happened in an office, not on the network.
const entry = { v: 2, event: "sanctions_check", token, account: "${desk.holderAccountId}",
  amount: null, tx: null, result: "PASSED",
  reason: "Screened against the demo sanctions list",
  authority: "${authority.trim()}",
  evidence: "${evidence ?? "…"}",   // sha256 of the report
  prev: sha256(previousMessageBytes) };
${SUBMIT_CODE}`}
          />
        </>
      }
      aside={<ChainCard messages={trail} />}
    />
  );
}

const ATTACKS: { type: string; title: string; text: string; meaning: string; code: string }[] = [
  {
    type: "forge",
    title: "Write a fake entry",
    text: "The outsider submits a transfer of 999,999 tokens that never happened, chained to the real last entry.",
    meaning: "The topic's submit key is the Issuer's. Without its signature the network did not add the message.",
    code: "new TopicMessageSubmitTransaction()\n  .setTopicId(topic)\n  .setMessage(forgedEntry)   // signed by the outsider",
  },
  {
    type: "take-over",
    title: "Make yourself a publisher",
    text: "The outsider changes the topic's submit key to its own, so its entries would be accepted.",
    meaning: "Only the topic's admin key can change its keys, and that key is the Issuer's.",
    code: "new TopicUpdateTransaction()\n  .setTopicId(topic)\n  .setSubmitKey(outsiderKey)   // signed by the outsider",
  },
  {
    type: "delete-topic",
    title: "Delete the trail",
    text: "The outsider deletes the topic, to stop new entries and take the trail down with it.",
    meaning: "Only the admin key can delete the topic. And what is on it stays on the mirror node regardless.",
    code: "new TopicDeleteTransaction()\n  .setTopicId(topic)   // signed by the outsider",
  },
];

function BreakScreen({ ctx, entries, onNext }: { ctx: Ctx; entries: number; onNext: () => void }) {
  const { busyKey, results, go } = ctx;
  const tried = ATTACKS.map(attack => results[attack.type]).filter(result => result && result.result !== "Error");
  const refused = tried.filter(result => result && !result.ok).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-4xl">
          <Label>Step 5 of {TOTAL} · optional</Label>
          <h2 className="m-0 text-xl font-bold">Try to break it</h2>
          <p className="m-0 text-sm text-base-content/80">
            An outsider with no rights on the topic tries to write to the trail, take it over, or delete it. Each
            attempt is a real transaction: <strong>a refusal is a pass</strong>, and the {entries} entries above stay{" "}
            {entries}.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span role="status" className="badge badge-lg badge-outline">
            {tried.length} of {ATTACKS.length} tried · {refused} refused
          </span>
          <button id="next-verify" type="button" className="btn btn-primary" onClick={onNext}>
            Next: verify →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {ATTACKS.map(attack => (
          <Panel key={attack.type} title={attack.title}>
            <p className="m-0 text-sm">{attack.text}</p>
            <pre className="m-0 rounded-box bg-[#11151d] text-[#f0f0f2] px-3 py-2 text-[12px] whitespace-pre-wrap font-mono">
              {attack.code}
            </pre>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <button
                id={attack.type}
                type="button"
                className={`btn ${results[attack.type] ? "btn-outline" : "btn-neutral"}`}
                disabled={busyKey !== null}
                onClick={() =>
                  void go(attack.type, async () => {
                    const { ok, result, transaction } = await post<{
                      ok: boolean;
                      result: string;
                      transaction: string | null;
                    }>("attack", { type: attack.type });
                    return { ok, result, message: "", transaction };
                  })
                }
              >
                <Busy on={busyKey === attack.type} />
                {results[attack.type] ? "Try again" : "Run this attack"}
              </button>
              <span className="text-xs text-base-content/60">Outsider</span>
            </div>
            <AttackOutcome
              id={`${attack.type}-result`}
              result={results[attack.type] ?? null}
              meaning={attack.meaning}
            />
          </Panel>
        ))}
      </div>
    </div>
  );
}

const CHECKS = [
  ["sequence", "seq", "Sequence number follows the previous one"],
  ["chain", "chain", "prev is the hash of the previous message"],
  ["transaction", "tx", "The transaction exists, with the logged result and what the event claims"],
] as const;

function VerifyScreen({ desk }: { desk: Ready }) {
  const router = useRouter();
  const { result } = useRegulatorFeed(desk.topicId);
  const [verdict, setVerdict] = useState<string | null>(null);

  const checkSample = async () => {
    const hash = await hashOf(sampleDocument(desk));
    const matches = result.rows.filter(row => row.entry?.evidence === hash).map(row => `#${row.sequenceNumber}`);
    setVerdict(
      matches.length
        ? `The sample report matches entry ${matches.join(", ")}: it is the document that decision was recorded on.`
        : "No entry on this topic carries the sample report's hash.",
    );
  };

  return (
    <Columns
      main={
        <>
          <StepCard step={6} total={TOTAL} who="Regulator" title="Verify the trail as the regulator">
            <p className="m-0 text-base-content/80 max-w-2xl">
              This page now does what the regulator&apos;s feed does, in your browser: it reads every message from the
              public mirror node and checks each one. No key, no account, and nothing from this app&apos;s server.
            </p>
            <div className="flex flex-wrap gap-4 items-baseline">
              <span
                id="tour-feed-status"
                className={`text-2xl font-bold ${result.status === "VERIFIED" ? "text-success" : result.status === "BROKEN" ? "text-error" : ""}`}
              >
                {result.status}
              </span>
              <span className="text-sm text-base-content/70">
                {result.rows.length} {result.rows.length === 1 ? "entry" : "entries"} checked
              </span>
              {result.brokenAt ? (
                <span className="text-sm text-error">
                  First failure at #{result.brokenAt.sequenceNumber}: {result.brokenAt.reason}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="tour-check-document"
                type="button"
                className="btn btn-primary"
                onClick={() => void checkSample()}
              >
                Check the sample report against the trail
              </button>
              <a
                id="tour-regulator-link"
                className="btn btn-outline"
                href={`/regulator?topic=${desk.topicId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open the regulator&apos;s feed
              </a>
            </div>
            {verdict ? (
              <p id="tour-document-verdict" className="m-0 text-sm">
                {verdict} To check it the way a regulator would,{" "}
                <SampleReportLink id="tour-verify-sample-document" desk={desk}>
                  download the sample report
                </SampleReportLink>{" "}
                and choose it on their feed.
              </p>
            ) : null}
            <p className="m-0 text-sm text-base-content/70 max-w-2xl">
              That is the tour. The{" "}
              <button type="button" className="link" onClick={() => router.replace("/?view=sandbox")}>
                Sandbox
              </button>{" "}
              has every control on one page: any target account, freezes, other decisions, and HashPack as a second
              publisher.
            </p>
          </StepCard>
          <UnderTheHood
            title="what the regulator checks"
            code={`for each message on the topic, oldest first:
  sequence_number == previous + 1
  entry.prev == sha256(previous message bytes)        // 64 zeros for the first
  ledger event:  mirror /transactions/{entry.tx} has entry.result,
                 and is the kind the event claims (TOKENGRANTKYC of that account, ...)
  decision:      no tx; carries an authority, a document hash, PASSED or REFUSED`}
          />
        </>
      }
      aside={
        <Panel title="Every entry, checked" caption="✓ passed · ✗ failed · – does not apply">
          <ol className="m-0 p-0 list-none flex flex-col gap-1.5 text-sm max-h-[24rem] overflow-y-auto">
            {result.rows.map(row => (
              <li key={row.sequenceNumber} className="flex justify-between gap-2 rounded-box bg-base-200 px-3 py-1.5">
                <span
                  className="min-w-0 truncate"
                  title={`${row.entry?.event ?? "unreadable"} ${row.entry?.result ?? ""}`}
                >
                  <strong>#{row.sequenceNumber}</strong> {row.entry?.event ?? "unreadable"}{" "}
                  <span className="font-mono text-xs text-base-content/70">{row.entry?.result}</span>
                </span>
                <span className="flex gap-2 font-mono text-xs shrink-0">
                  {CHECKS.map(([key, label, what]) => {
                    const ok = row.checks[key];
                    return (
                      <span
                        key={key}
                        title={what}
                        className={ok === null ? "text-base-content/50" : ok ? "text-success" : "text-error"}
                      >
                        {label} {ok === null ? "–" : ok ? "✓" : "✗"}
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      }
    />
  );
}
