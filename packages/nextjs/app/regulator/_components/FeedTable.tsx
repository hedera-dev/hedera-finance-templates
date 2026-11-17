"use client";

import { formatConsensus, shortHash, shortTx } from "~~/services/hcsAudit/format";
import { hashscanAccountUrl, hashscanTransactionUrl } from "~~/services/hcsAudit/mirror";
import type { FeedRow } from "~~/services/hcsAudit/verify";

/**
 * One labelled mark per check, e.g. "seq ✓"; the title spells out what failed. `ok
 * === null` is a check that does not apply — a decision has no transaction — and
 * shows a dash, not a tick: a tick would claim a verification nobody performed.
 */
function CheckMark({ ok, label, what }: { ok: boolean | null; label: string; what: string }) {
  if (ok === null) {
    return (
      <span className="text-base-content/40" title={`${what}: not applicable to this entry`}>
        <span className="sr-only">{label} not applicable</span>–
      </span>
    );
  }
  return (
    <span className={ok ? "text-success" : "text-error"} title={`${what}: ${ok ? "passed" : "failed"}`}>
      <span className="sr-only">{label} </span>
      {ok ? "✓" : "✕"}
    </span>
  );
}

/**
 * How far the network backs the named authority: the one column here that is not a
 * pass or a fail. An entry published by the account it names was signed by that
 * account; one written *about* an account is a name nothing on the network confirms.
 */
function AuthorityProof({ proof, payer }: { proof: "proved" | "claimed"; payer: string }) {
  const proved = proof === "proved";
  return (
    <span
      className={`text-xs ${proved ? "text-success" : "text-base-content/50"}`}
      title={
        proved
          ? `Signed and paid for by ${payer}: the authority put its own key behind this record, though not behind the action it describes.`
          : `Published by ${payer}, not by the account named here.`
      }
    >
      {proved ? "signed by this account" : "publisher's claim"}
    </span>
  );
}

export const FeedTable = ({ rows, matchedHash }: { rows: FeedRow[]; matchedHash?: string | null }) => {
  if (rows.length === 0) return null;

  return (
    <div id="feed" className="overflow-x-auto mt-4">
      <table className="table table-xs whitespace-nowrap">
        <thead>
          <tr>
            <th>#</th>
            <th>Consensus time</th>
            <th>Event / result</th>
            <th>Account</th>
            <th>Reason</th>
            <th title="the account the entry names, and whether the network backs it">Authority</th>
            <th>Document</th>
            <th>Transaction</th>
            <th>Published by</th>
            <th title="sequence · hash chain · transaction">Checks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.sequenceNumber} className="feed-entry" data-sequence={row.sequenceNumber}>
              <td>{row.sequenceNumber}</td>
              <td title={row.consensusTimestamp}>{formatConsensus(row.consensusTimestamp)}</td>
              <td>
                <span className="flex flex-col">
                  <span>{row.entry?.event ?? "(unreadable)"}</span>
                  {row.entry && (
                    <span className={`text-xs ${row.entry.result === "SUCCESS" ? "text-success" : "text-warning"}`}>
                      {row.entry.result}
                    </span>
                  )}
                </span>
              </td>
              <td className="font-mono text-xs">{row.entry?.account ?? "—"}</td>
              <td className="max-w-xs truncate" title={row.entry?.reason ?? undefined}>
                {row.entry?.reason ?? "—"}
              </td>
              <td className="font-mono text-xs" data-authority-proof={row.authorityProof ?? undefined}>
                <span className="flex flex-col">
                  <span>{row.entry?.authority ?? "—"}</span>
                  {row.authorityProof && <AuthorityProof proof={row.authorityProof} payer={row.payerAccountId} />}
                </span>
              </td>
              <td
                className={`font-mono text-xs ${matchedHash && row.entry?.evidence === matchedHash ? "text-success font-bold" : ""}`}
                title={row.entry?.evidence ?? undefined}
                data-evidence={row.entry?.evidence ?? undefined}
              >
                {row.entry?.evidence ? shortHash(row.entry.evidence) : "—"}
              </td>
              <td>
                {row.entry && row.entry.tx !== null ? (
                  <a
                    href={hashscanTransactionUrl(row.entry.tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="link link-primary font-mono text-xs"
                    title={row.entry.tx}
                  >
                    {shortTx(row.entry.tx)}
                  </a>
                ) : row.entry ? (
                  <span className="text-base-content/50" title="Recorded off chain: there is no transaction.">
                    off chain
                  </span>
                ) : (
                  // Not an entry at all. Saying "off chain" here would describe an
                  // unreadable message as a decision the desk meant to record.
                  "\u2014"
                )}
              </td>
              <td>
                <a
                  href={hashscanAccountUrl(row.payerAccountId)}
                  target="_blank"
                  rel="noreferrer"
                  className="link link-primary font-mono text-xs"
                >
                  {row.payerAccountId}
                </a>
              </td>
              <td>
                <span className="flex gap-2 justify-center">
                  <CheckMark ok={row.checks.sequence} label="seq" what="Sequence number follows the previous one" />
                  <CheckMark ok={row.checks.chain} label="chain" what="prev matches the hash of the previous entry" />
                  <CheckMark ok={row.checks.transaction} label="tx" what="Transaction exists with the logged result" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
