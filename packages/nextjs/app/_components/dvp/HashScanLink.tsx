const HASHSCAN_TESTNET = "https://hashscan.io/testnet";

type HashScanLinkProps = {
  /** The `id` attribute the checker looks for, e.g. "security-token-id". Omit for a repeated row where an id would collide. */
  htmlId?: string;
  /** The Hedera id to display and link, e.g. "0.0.1234". */
  hederaId: string;
  kind: "account" | "token" | "schedule" | "transaction" | "topic";
  /** Overrides the displayed text (the href always uses `hederaId`) — for a shortened transaction id. */
  label?: string;
};

/** A Hedera id rendered as text and linked to its HashScan testnet page. */
export const HashScanLink = ({ htmlId, hederaId, kind, label }: HashScanLinkProps) => (
  <a
    id={htmlId}
    href={`${HASHSCAN_TESTNET}/${kind}/${encodeURIComponent(hederaId)}`}
    target="_blank"
    rel="noreferrer"
    className="link"
  >
    {label ?? hederaId}
  </a>
);

/** Shortens a Hedera transaction id like "0.0.1234@1690000000.123456789" for inline display. */
export const shortenTxId = (txId: string): string =>
  txId.length <= 24 ? txId : `${txId.slice(0, 14)}…${txId.slice(-6)}`;
