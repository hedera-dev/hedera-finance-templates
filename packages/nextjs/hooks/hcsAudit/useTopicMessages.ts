"use client";

import { useEffect, useState } from "react";
import { type MirrorTopicMessage, fetchAllTopicMessages } from "~~/services/hcsAudit/mirror";

/**
 * Polls the public mirror node for every message on a topic, newest data
 * arriving roughly every `pollMs`. Used by both the issuer's trail and the
 * regulator's feed — neither depends on this app's server for this.
 */
export function useTopicMessages(topicId: string | null, pollMs = 5000) {
  const [messages, setMessages] = useState<MirrorTopicMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!topicId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const next = await fetchAllTopicMessages(topicId);
        if (cancelled) return;
        setMessages(next);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(poll, pollMs);
        }
      }
    };

    setLoading(true);
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [topicId, pollMs]);

  return { messages, error, loading };
}
