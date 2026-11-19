"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as dvp from "~~/services/hedera/dvpClient";
import type { AuditEntrySnapshot, MarketSnapshot } from "~~/services/hedera/types";

const POLL_INTERVAL_MS = 4000;

/** The server's market, its audit log and whether an operator is configured, kept fresh for both views. */
export function useMarket() {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntrySnapshot[]>([]);
  const [auditTopicId, setAuditTopicId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [operatorConfigured, setOperatorConfigured] = useState(false);

  const refresh = useCallback(() => {
    dvp
      .fetchMarket()
      .then(m => {
        setMarket(m);
        setLoaded(true);
        if (m) {
          dvp
            .fetchAuditLog()
            .then(({ entries, topicId }) => {
              setAuditEntries(entries);
              setAuditTopicId(topicId);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    dvp
      .fetchConfig()
      .then(cfg => setOperatorConfigured(cfg.operatorConfigured))
      .finally(() => setConfigLoaded(true));
    refresh();
  }, [refresh]);

  // Every page refreshes the market, the trades list and the audit log on its own every few
  // seconds, so two browsers on the same app see each other's actions without reloading.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const id = setInterval(() => refreshRef.current(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return { market, setMarket, loaded, auditEntries, auditTopicId, configLoaded, operatorConfigured };
}
