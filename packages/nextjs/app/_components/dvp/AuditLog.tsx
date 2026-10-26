import { HashScanLink, shortenTxId } from "~~/app/_components/dvp/HashScanLink";
import type { AuditEntrySnapshot } from "~~/services/hedera/types";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

type Props = {
  entries: AuditEntrySnapshot[];
  topicId: string | null;
};

/** The market's HCS audit trail, newest first — read straight from the public mirror node. */
export const AuditLog = ({ entries, topicId }: Props) => (
  <div className="flex flex-col gap-2">
    <p className="text-xs text-base-content/70">
      Anyone can read and independently verify this log from the public mirror node.
      {topicId && (
        <>
          {" "}
          Topic: <HashScanLink htmlId="audit-topic-id" hederaId={topicId} kind="topic" />
        </>
      )}
    </p>
    <ol id="audit-log" className="flex flex-col gap-1 m-0 p-0 list-none text-xs">
      {entries.length === 0 && <li className="text-base-content/70">No audit entries yet.</li>}
      {entries.map(entry => (
        <li key={entry.sequenceNumber} className="audit-entry flex flex-wrap gap-x-2 gap-y-0.5 font-mono">
          <span>#{entry.sequenceNumber}</span>
          <span>{formatDate(entry.consensusTime)}</span>
          <span className="font-semibold">{entry.event}</span>
          <span>
            <HashScanLink hederaId={entry.schedule} kind="schedule" label={entry.schedule} />
          </span>
          <span>{entry.result ?? "—"}</span>
          {entry.tx && (
            <span>
              <HashScanLink hederaId={entry.tx} kind="transaction" label={shortenTxId(entry.tx)} />
            </span>
          )}
        </li>
      ))}
    </ol>
  </div>
);
