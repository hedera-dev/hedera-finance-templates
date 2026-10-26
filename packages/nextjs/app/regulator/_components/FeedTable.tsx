"use client";

import { formatConsensus, shortTx } from "~~/services/hcsAudit/format";
import { hashscanAccountUrl, hashscanTransactionUrl } from "~~/services/hcsAudit/mirror";
import type { FeedRow } from "~~/services/hcsAudit/verify";

/** One labelled mark per check, e.g. "seq ✓"; the title spells out what failed. */
function CheckMark({ ok, label, what }: { ok: boolean; label: string; what: string }) {
  return (
    <span className={ok ? "text-success" : "text-error"} title={`${what}: ${ok ? "passed" : "failed"}`}>
      <span className="sr-only">{label} </span>
      {ok ? "✓" : "✕"}
    </span>
  );
}

export const FeedTable = ({ rows }: { rows: FeedRow[] }) => {
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
              <td>
                {row.entry ? (
                  <a
                    href={hashscanTransactionUrl(row.entry.tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="link link-primary font-mono text-xs"
                    title={row.entry.tx}
                  >
                    {shortTx(row.entry.tx)}
                  </a>
                ) : (
                  "—"
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
