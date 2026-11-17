"use client";

import { useState } from "react";

/**
 * The three fields that say why an entry exists, in one hook because they have to be
 * *cleared* in one place: a reason or document hash left in the form is attached to
 * the next record too, carrying a court order from a freeze onto the unfreeze after
 * it, onto a topic nobody can rewrite. A panel clears them when a record succeeds,
 * and only then.
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
