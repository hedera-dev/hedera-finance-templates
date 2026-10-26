import type { PrivateKey, PublicKey } from "@hiero-ledger/sdk";
import type { AuditEntry, EntryFields, Publisher } from "~~/services/hcsAudit/types";
import { ZERO_HASH } from "~~/services/hcsAudit/types";

/**
 * An entry whose action has already happened on chain, waiting to reach the topic.
 *
 * It carries no `prev`: that is read from `desk.lastHash` at the moment it is
 * published, inside the serialized flush, so two entries can never be built on
 * the same `prev`.
 */
export type QueuedEntry = {
  fields: EntryFields;
  /**
   * The id the Issuer's own submission uses. Fixed across retries, so a resubmit
   * after a lost response is refused as a duplicate instead of publishing twice.
   */
  transactionId: string | null;
  /** Set while a HashPack publisher holds this entry to sign; see `_lib/publish`. */
  wallet: WalletReservation | null;
  /** The entry as it reached the topic, with the `prev` it was actually chained at. */
  published: AuditEntry | null;
};

/**
 * An entry handed to a wallet to sign and pay for. The exact transaction id the
 * server froze into it is the only id that can confirm it, and the exact bytes
 * are what must appear on the topic before the chain advances.
 */
export type WalletReservation = {
  accountId: string;
  transactionId: string;
  entry: AuditEntry;
  bytes: Uint8Array;
};

export type Desk = {
  topicId: string | null;
  tokenId: string | null;
  holderAccountId: string | null;
  holderKey: PrivateKey | null;
  outsiderAccountId: string | null;
  outsiderKey: PrivateKey | null;
  lastHash: string;
  publishers: Publisher[];
  /** Wallet keys currently in the topic's submit key, so authorising a second one keeps the first. */
  walletPublisherKeys: { accountId: string; publicKey: PublicKey }[];
  /** Entries not yet on the topic, oldest first. Published in order, retried until they land. */
  entries: QueuedEntry[];
  /** Serializes publishing so the `prev` chain never races itself. */
  publishQueue: Promise<void>;
};

function freshDesk(): Desk {
  return {
    topicId: null,
    tokenId: null,
    holderAccountId: null,
    holderKey: null,
    outsiderAccountId: null,
    outsiderKey: null,
    lastHash: ZERO_HASH,
    publishers: [],
    walletPublisherKeys: [],
    entries: [],
    publishQueue: Promise.resolve(),
  };
}

// Stashed on globalThis so Next.js dev-mode module reloads (HMR) reuse the
// same in-memory desk instead of silently resetting it on every edit.
// Surviving a server restart is explicitly not required.
const globalForDesk = globalThis as unknown as { __hcsAuditDesk?: Desk };

export function getDesk(): Desk {
  if (!globalForDesk.__hcsAuditDesk) {
    globalForDesk.__hcsAuditDesk = freshDesk();
  }
  return globalForDesk.__hcsAuditDesk;
}

/** Running setup again starts a fresh trail. */
export function resetDesk(): Desk {
  globalForDesk.__hcsAuditDesk = freshDesk();
  return globalForDesk.__hcsAuditDesk;
}

export function requireSetUp(
  desk: Desk,
): asserts desk is Desk & { topicId: string; tokenId: string; holderAccountId: string } {
  if (!desk.topicId || !desk.tokenId || !desk.holderAccountId) {
    throw new Error("Run setup before performing actions.");
  }
}
