"use client";

import { useEffect, useState } from "react";
import { useTopicMessages } from "~~/hooks/hcsAudit/useTopicMessages";
import { type FeedResult, verifyFeed } from "~~/services/hcsAudit/verify";

const EMPTY: FeedResult = { status: "EMPTY", rows: [] };

/** Reads a topic from the mirror node and re-derives + checks the trail itself. */
export function useRegulatorFeed(topicId: string | null) {
  const { messages, error: mirrorError, loading } = useTopicMessages(topicId, 5000);
  const [result, setResult] = useState<FeedResult>(EMPTY);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVerifying(true);
    verifyFeed(messages)
      .then(r => {
        if (!cancelled) setResult(r);
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messages]);

  return { result, loading: loading || verifying, error: mirrorError };
}
