import { proto } from "@hiero-ledger/proto";
import { PublicKey } from "@hiero-ledger/sdk";

/** The mirror node's `_type` tag for a simple (non-threshold) account or token key. */
export type MirrorKeyType = "ED25519" | "ECDSA_SECP256K1" | "ProtobufEncoded";

export type MirrorKey = { _type: MirrorKeyType; key: string } | null | undefined;

/** Turns a simple mirror-node key (ED25519 or ECDSA, raw hex, no DER) into an SDK PublicKey. */
export function publicKeyFromMirrorKey(mirrorKey: MirrorKey): PublicKey | null {
  if (!mirrorKey) return null;
  const bytes = Buffer.from(mirrorKey.key, "hex");
  if (mirrorKey._type === "ED25519") return PublicKey.fromBytesED25519(bytes);
  if (mirrorKey._type === "ECDSA_SECP256K1") return PublicKey.fromBytesECDSA(bytes);
  return null;
}

/**
 * Decodes a mirror-node token key field and reports whether it is a threshold KeyList with the
 * given threshold and key count. Tokens created by this desk report every key this way — the
 * mirror node tags a KeyList/ThresholdKey as `"_type": "ProtobufEncoded"` and gives the raw
 * protobuf `Key` message bytes, so this decodes the actual structure rather than assuming it.
 */
export function isThresholdKey(mirrorKey: MirrorKey, threshold: number, total: number): boolean {
  if (!mirrorKey || mirrorKey._type !== "ProtobufEncoded") return false;
  try {
    const decoded = proto.Key.decode(Buffer.from(mirrorKey.key, "hex"));
    const thresholdKey = decoded.thresholdKey;
    return thresholdKey?.threshold === threshold && (thresholdKey?.keys?.keys?.length ?? 0) === total;
  } catch {
    return false;
  }
}
