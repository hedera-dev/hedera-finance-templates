"use client";

import { useTopicMessages } from "~~/hooks/hcsAudit/useTopicMessages";
import { decodeEntryBase64 } from "~~/services/hcsAudit/entry";
import { formatConsensus, shortTx } from "~~/services/hcsAudit/format";
import { hashscanTransactionUrl } from "~~/services/hcsAudit/mirror";

export const TrailTable = ({ topicId }: { topicId: string | null }) => {
  const { messages, error, loading } = useTopicMessages(topicId);

  if (!topicId) return null;

  const rows = [...messages].reverse();

  return (
    <div className="mt-6">
      <h3 className="font-bold text-lg mb-2">Audit trail</h3>
      {loading && rows.length === 0 && <p className="text-sm text-base-content/60">Loading…</p>}
      {error && <p className="text-sm text-error">{error}</p>}
      {!loading && rows.length === 0 && !error && <p className="text-sm text-base-content/60">No entries yet.</p>}
      <div id="trail" className="overflow-x-auto">
        {rows.length > 0 && (
          <table className="table table-sm whitespace-nowrap">
            <thead>
              <tr>
                <th>#</th>
                <th>Consensus time</th>
                <th>Event</th>
                <th>Account</th>
                <th>Result</th>
                <th>Transaction</th>
                <th>Published by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(msg => {
                const decoded = decodeEntryBase64(msg.message);
                return (
                  <tr key={msg.sequence_number} className="trail-entry" data-sequence={msg.sequence_number}>
                    <td>{msg.sequence_number}</td>
                    <td title={msg.consensus_timestamp}>{formatConsensus(msg.consensus_timestamp)}</td>
                    <td>{decoded?.entry.event ?? "(unreadable)"}</td>
                    <td className="font-mono text-xs">{decoded?.entry.account ?? "—"}</td>
                    <td>{decoded?.entry.result ?? "—"}</td>
                    <td>
                      {decoded ? (
                        <a
                          href={hashscanTransactionUrl(decoded.entry.tx)}
                          target="_blank"
                          rel="noreferrer"
                          className="link link-primary font-mono text-xs"
                          title={decoded.entry.tx}
                        >
                          {shortTx(decoded.entry.tx)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="font-mono text-xs">{msg.payer_account_id}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
