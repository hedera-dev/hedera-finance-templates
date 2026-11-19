"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { decodeEntryBase64, sha256Hex } from "~~/services/hcsAudit/entry";
import { shortHash } from "~~/services/hcsAudit/format";
import {
  MIRROR_BASE_URL,
  type MirrorTopicMessage,
  hashscanAccountUrl,
  hashscanTokenUrl,
  hashscanTopicUrl,
} from "~~/services/hcsAudit/mirror";
import { ZERO_HASH } from "~~/services/hcsAudit/types";

/** What an action in the tour came to: the network's code, or why it did not run (`result: "Error"`). */
export type TourResult = { ok: boolean; result: string; message: string; transaction: string | null };

export function Label({ children }: { children: ReactNode }) {
  return <p className="m-0 text-xs uppercase tracking-wide text-base-content/60">{children}</p>;
}

/** The one card on a step that holds the next action. */
export function StepCard({
  step,
  total,
  who,
  title,
  children,
}: {
  step: number;
  total: number;
  who: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card bg-base-100 border-2 border-primary shadow-sm" aria-labelledby="step-title">
      <div className="card-body gap-4 p-6">
        <Label>
          Step {step} of {total} · {who}
        </Label>
        <h2 id="step-title" className="m-0 text-xl font-bold">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

export function Panel({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4 p-5">
        <div>
          <h2 className="card-title text-lg m-0">{title}</h2>
          {caption ? <p className="m-0 text-sm text-base-content/70">{caption}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

/** The exact calls behind a step, one click away: the audience is developers. */
export function UnderTheHood({ title, code }: { title: string; code: string }) {
  return (
    <details className="rounded-box bg-[#11151d] text-[#f0f0f2] px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Under the hood: {title}</summary>
      <pre className="m-0 mt-3 text-[12px] leading-relaxed whitespace-pre overflow-x-auto font-mono">{code}</pre>
    </details>
  );
}

export function Columns({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-4 items-start">
      <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">{main}</div>
      <aside className="flex-[1_1_380px] min-w-0 flex flex-col gap-4">{aside}</aside>
    </div>
  );
}

export function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link normal-case [overflow-wrap:anywhere]">
      {children}
    </a>
  );
}

/** A spinner while a step's request runs. */
export function Busy({ on }: { on: boolean }) {
  return on ? <span className="loading loading-spinner loading-xs" aria-hidden /> : null;
}

/** A failure beside the button that was pressed. */
export function Refusal({ id, result }: { id: string; result: TourResult | null | undefined }) {
  if (!result || result.result !== "Error") return null;
  return (
    <div id={id} role="alert" className="alert alert-error text-sm">
      <span className="min-w-0 [overflow-wrap:anywhere]">{result.message}</span>
    </div>
  );
}

function Cross() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * An attack's result: refused in red, because the attack failed, which is the trail holding. A request that could
 * not run at all is neither: it says why, in neutral colours, and does not count as a refusal.
 */
export function AttackOutcome({ id, result, meaning }: { id: string; result: TourResult | null; meaning: string }) {
  if (!result) return null;
  if (result.result === "Error")
    return (
      <div id={id} role="alert" className="alert text-sm">
        <span>
          <strong>Not run.</strong> {result.message}
        </span>
      </div>
    );
  if (result.ok)
    return (
      <div id={id} role="alert" className="alert alert-warning text-sm">
        <span>
          <strong>Accepted.</strong> The network carried it out. Something is broken: the trail is not protected.
        </span>
      </div>
    );
  return (
    <div id={id} className="flex gap-2 items-start rounded-box border border-error bg-error/15 px-3 py-2">
      <span className="shrink-0 text-error">
        <Cross />
      </span>
      <span className="flex flex-col gap-0.5 text-xs min-w-0 [overflow-wrap:anywhere]">
        <strong className="text-sm">
          Refused · <span className="font-mono">{result.result}</span>
        </strong>
        <span>{meaning}</span>
        {result.transaction ? (
          <Link href={`https://hashscan.io/testnet/transaction/${result.transaction}`}>
            The refused transaction on HashScan
          </Link>
        ) : null}
      </span>
    </div>
  );
}

type HolderToken = { balance: number; kyc_status: string; freeze_status: string };

/** The holder's standing on the token, read from the public mirror node like everything else the tour shows. */
function useHolderToken(holder: string, token: string) {
  return useQuery({
    queryKey: ["holder-token", holder, token],
    queryFn: async (): Promise<HolderToken | null> => {
      const res = await fetch(`${MIRROR_BASE_URL}/api/v1/accounts/${holder}/tokens?token.id=${token}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      return ((await res.json()).tokens?.[0] as HolderToken | undefined) ?? null;
    },
    refetchInterval: 5000,
  });
}

function Badge({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="rounded-box bg-base-200 px-3 py-2 flex flex-col gap-0.5 min-w-40">
      <strong className="text-sm">{name}</strong>
      <span className="text-sm">{children}</span>
    </div>
  );
}

/** What stays in view on every step once the trail exists: its ids, its length, and where the holder stands. */
export function DeskStrip({
  topicId,
  tokenId,
  holderAccountId,
  entries,
}: {
  topicId: string;
  tokenId: string;
  holderAccountId: string;
  entries: number;
}) {
  const holder = useHolderToken(holderAccountId, tokenId).data;
  return (
    <section id="desk-strip" className="card bg-base-100 border border-base-300 shadow-sm" aria-label="The desk">
      <div className="card-body flex-row flex-wrap gap-x-6 gap-y-2 items-center justify-between p-3">
        <div className="flex flex-col gap-1 text-xs uppercase tracking-wide text-base-content/60">
          <span>
            Audit topic <Link href={hashscanTopicUrl(topicId)}>{topicId}</Link>
          </span>
          <span>
            Security token <Link href={hashscanTokenUrl(tokenId)}>{tokenId}</Link>
          </span>
          <span>
            Holder <Link href={hashscanAccountUrl(holderAccountId)}>{holderAccountId}</Link>
          </span>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="State">
          <Badge name="Trail">
            <strong>{entries}</strong> {entries === 1 ? "entry" : "entries"} on the topic
          </Badge>
          <Badge name="Holder">
            {holder ? (
              <>
                <strong>{holder.balance.toLocaleString()}</strong> tokens · KYC{" "}
                {holder.kyc_status === "GRANTED" ? "granted" : "not granted"}
                {holder.freeze_status === "FROZEN" ? " · frozen" : ""}
              </>
            ) : (
              "reading…"
            )}
          </Badge>
        </div>
      </div>
    </section>
  );
}

/** The newest entries, each with its `prev` checked against the hash of the message before it, here in the browser. */
export function ChainCard({ messages }: { messages: MirrorTopicMessage[] }) {
  const [hashes, setHashes] = useState<Record<number, string>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      messages.map(
        async m =>
          [m.sequence_number, await sha256Hex(Uint8Array.from(atob(m.message), c => c.charCodeAt(0)))] as const,
      ),
    ).then(pairs => {
      if (!cancelled) setHashes(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [messages]);

  const newest = [...messages].reverse().slice(0, 4);
  return (
    <Panel
      title="The trail"
      caption="The newest entries, read from the mirror node. Each names the hash of the one before."
    >
      {newest.length === 0 ? (
        <p className="m-0 text-sm text-base-content/60">No entries yet.</p>
      ) : (
        <ol className="m-0 p-0 list-none flex flex-col gap-2">
          {newest.map(message => {
            const entry = decodeEntryBase64(message.message)?.entry;
            const expected = message.sequence_number === 1 ? ZERO_HASH : hashes[message.sequence_number - 1];
            return (
              <li
                key={message.sequence_number}
                className="rounded-box bg-base-200 px-3 py-2 flex flex-col gap-0.5 text-xs"
              >
                <span className="flex flex-wrap justify-between gap-x-2 text-sm">
                  <strong className="shrink-0">
                    #{message.sequence_number} {entry?.event ?? "unreadable"}
                  </strong>
                  <span
                    className={`font-mono text-xs min-w-0 [overflow-wrap:anywhere] ${entry?.result === "SUCCESS" || entry?.result === "PASSED" ? "text-success" : "text-warning"}`}
                  >
                    {entry?.result ?? "—"}
                  </span>
                </span>
                {entry?.reason ? <span className="text-base-content/80">“{entry.reason}”</span> : null}
                <span className="font-mono text-base-content/60">
                  prev {entry ? shortHash(entry.prev) : "—"}{" "}
                  {entry && expected !== undefined ? (
                    entry.prev === expected ? (
                      <span className="text-success">
                        = {message.sequence_number === 1 ? "first entry" : `hash of #${message.sequence_number - 1}`}
                      </span>
                    ) : (
                      <span className="text-error">≠ hash of #{message.sequence_number - 1}</span>
                    )
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
