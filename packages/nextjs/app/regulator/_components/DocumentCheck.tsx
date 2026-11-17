"use client";

import { DocumentHashField } from "~~/app/_components/audit/DocumentHashField";
import type { FeedRow } from "~~/services/hcsAudit/verify";

type DocumentCheckProps = {
  rows: FeedRow[];
  hash: string | null;
  onHash: (hash: string | null) => void;
};

/**
 * Checks a document the regulator already holds against the trail.
 *
 * This is the other half of the evidence hash, and the only place it pays off. The
 * topic carries a hash of a KYC file or a board minute, which on its own tells a
 * reader nothing. Hand the same file to this page and it is hashed here, in the
 * browser, and compared: a match says the entry was written about *this* document,
 * and a document produced later cannot match an entry already on the topic.
 *
 * Still nothing leaves the browser, and this page has no server to send it to.
 */
export const DocumentCheck = ({ rows, hash, onHash }: DocumentCheckProps) => {
  const matches = hash ? rows.filter(row => row.entry?.evidence === hash) : [];

  return (
    <div className="flex flex-col gap-2 border-t border-base-300 pt-4">
      <h3 className="font-bold text-sm m-0">Check a document against this trail</h3>
      <DocumentHashField
        id="feed-document"
        label="Document"
        hint="Hashed in your browser and compared with every entry's evidence hash. Nothing is uploaded."
        disabled={false}
        hash={hash}
        onHash={onHash}
      />
      {hash && (
        <span id="document-verdict" className={`text-sm ${matches.length > 0 ? "text-success" : "text-warning"}`}>
          {matches.length > 0
            ? `Matches ${matches.length === 1 ? "entry" : "entries"} ${matches.map(m => `#${m.sequenceNumber}`).join(", ")}.`
            : "No entry on this topic carries this document's hash."}
        </span>
      )}
    </div>
  );
};
