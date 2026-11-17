"use client";

import { useState } from "react";

/**
 * The three fields that say why an entry exists: reason, authority, evidence.
 *
 * They live in one hook because they have to be *cleared* in one place. A reason or
 * a document hash left behind in the form is attached to the next record too — a
 * court order silently carried from a freeze onto the unfreeze that followed it,
 * published to a topic nobody can rewrite. So a panel clears the context as soon as
 * a record succeeds, and only then.
 */
export function useEntryContext() {
  const [reason, setReason] = useState("");
  const [authority, setAuthority] = useState("");
  const [evidence, setEvidence] = useState<string | null>(null);

  return {
    reason,
    setReason,
    authority,
    setAuthority,
    evidence,
    setEvidence,
    /** The three as a record payload carries them: trimmed, and absent when empty. */
    payload: () => ({
      reason: reason.trim() || undefined,
      authority: authority.trim() || undefined,
      evidence: evidence ?? undefined,
    }),
    clear: () => {
      setReason("");
      setAuthority("");
      setEvidence(null);
    },
  };
}
