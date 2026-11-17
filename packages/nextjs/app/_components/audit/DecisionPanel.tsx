"use client";

import { useEffect, useState } from "react";
import { DocumentHashField } from "~~/app/_components/audit/DocumentHashField";
import {
  type BusyRecord,
  DECISION_EVENTS,
  type DecisionEvent,
  type DecisionOutcome,
  MAX_REASON_LENGTH,
  type RecordPayload,
} from "~~/services/hcsAudit/types";

type DecisionPanelProps = {
  disabled: boolean;
  busyRecord: BusyRecord | null;
  decisionError: string | null;
  holderAccountId: string | null;
  onRecord: (payload: RecordPayload) => void;
};

const DECISION_LABELS: Record<DecisionEvent, { title: string; hint: string }> = {
  kyc_review: { title: "KYC review", hint: "An identity review concluded: the file behind it is the evidence." },
  sanctions_check: { title: "Sanctions screening", hint: "A screening ran against a list at a point in time." },
  approval: { title: "Board approval", hint: "A person or committee approved something off chain." },
};

/**
 * Records a decision nobody can find on the ledger.
 *
 * This is the half of the trail the network cannot keep. A KYC review, a sanctions
 * screening and a board approval all happen in an office: no transaction, no
 * receipt, nothing for a mirror node to show. The entry is the only record they
 * ever get, which is why the topic has to carry what it carries — the outcome, the
 * reason, the authority behind it, and the hash of the document that proves it was
 * not written after the fact.
 *
 * All three are required here, and the regulator's feed refuses a decision entry
 * missing any of them.
 */
export const DecisionPanel = ({
  disabled,
  busyRecord,
  decisionError,
  holderAccountId,
  onRecord,
}: DecisionPanelProps) => {
  const [event, setEvent] = useState<DecisionEvent>("kyc_review");
  const [outcome, setOutcome] = useState<DecisionOutcome>("PASSED");
  const [target, setTarget] = useState(holderAccountId ?? "");
  const [reason, setReason] = useState("");
  const [authority, setAuthority] = useState("");
  const [evidence, setEvidence] = useState<string | null>(null);

  useEffect(() => setTarget(holderAccountId ?? ""), [holderAccountId]);

  const anyBusy = busyRecord !== null;
  const complete = Boolean(evidence) && authority.trim() !== "";
  const off = disabled || anyBusy || !complete;

  const record = () =>
    onRecord({
      kind: "decision",
      event,
      outcome,
      account: target.trim() || undefined,
      reason: reason.trim() || undefined,
      authority: authority.trim(),
      evidence: evidence ?? undefined,
    });

  return (
    <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300 flex flex-col gap-4">
      <div>
        <h3 className="font-bold text-lg m-0">Off-chain decisions</h3>
        <p className="text-sm text-base-content/70 m-0 mt-1">
          Nothing here touches the network. These are the decisions the ledger has no record of, so the entry is the
          record — and it carries the document&apos;s hash, so the file cannot be swapped later.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="decision-event" className="text-sm text-base-content/70">
          Decision
        </label>
        <select
          id="decision-event"
          className="select select-sm select-bordered w-64"
          value={event}
          onChange={e => setEvent(e.target.value as DecisionEvent)}
          disabled={anyBusy}
        >
          {DECISION_EVENTS.map(id => (
            <option key={id} value={id}>
              {DECISION_LABELS[id].title}
            </option>
          ))}
        </select>
        <span className="text-xs text-base-content/60">{DECISION_LABELS[event].hint}</span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="decision-outcome" className="text-sm text-base-content/70">
          Outcome
        </label>
        <select
          id="decision-outcome"
          className="select select-sm select-bordered w-40"
          value={outcome}
          onChange={e => setOutcome(e.target.value as DecisionOutcome)}
          disabled={anyBusy}
        >
          <option value="PASSED">PASSED</option>
          <option value="REFUSED">REFUSED</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="decision-account" className="text-sm text-base-content/70">
          Subject account
        </label>
        <input
          id="decision-account"
          className="input input-sm input-bordered w-48 font-mono"
          placeholder="0.0.1234"
          value={target}
          onChange={e => setTarget(e.target.value)}
          disabled={anyBusy}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="decision-reason" className="text-sm text-base-content/70">
          Reason
        </label>
        <input
          id="decision-reason"
          className="input input-sm input-bordered w-full max-w-md"
          placeholder="Case KYC-2026-0094: renewal, documents verified"
          maxLength={MAX_REASON_LENGTH}
          value={reason}
          onChange={e => setReason(e.target.value)}
          disabled={anyBusy}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="decision-authority" className="text-sm text-base-content/70">
          Authority
        </label>
        <input
          id="decision-authority"
          className="input input-sm input-bordered w-48 font-mono"
          placeholder="0.0.1234"
          value={authority}
          onChange={e => setAuthority(e.target.value)}
          disabled={anyBusy}
        />
        <span className="text-xs text-base-content/60">Required: the account that approved this decision.</span>
      </div>

      <DocumentHashField
        id="decision-evidence"
        label="Document"
        hint="Required. Hashed in your browser; only the hash is published."
        disabled={anyBusy}
        hash={evidence}
        onHash={setEvidence}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button id="record-decision" className="btn btn-sm btn-primary" disabled={off} onClick={record}>
          {busyRecord === event && <span className="loading loading-spinner loading-xs" />}
          {busyRecord === event ? "Recording…" : "Record decision"}
        </button>
        {!complete && (
          <span className="text-xs text-base-content/60">A document and an authority are both required.</span>
        )}
      </div>

      {decisionError && <span className="text-sm text-error">{decisionError}</span>}
    </div>
  );
};
