"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionRequest, ActionResult, PreviewResult, Snapshot } from "~~/types/repo";

const POLL_MS = 1_000;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `The server answered ${response.status}.`);
  return body;
}

async function postJson<T>(url: string, payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `The server answered ${response.status}.`);
  return body;
}

/**
 * Follows the desk once a second. The last good snapshot stays on screen while a refresh is in flight or
 * fails: a refresh that has not landed never blanks a value that already had a number.
 */
export function useDesk(walletAddress: string | undefined) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const inFlight = useRef(false);
  const wallet = useRef(walletAddress);
  wallet.current = walletAddress;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const query = wallet.current ? `?wallet=${wallet.current}` : "";
      setSnapshot(await getJson<Snapshot>(`/api/desk/state${query}`));
      setOffline(null);
    } catch (error) {
      setOffline(error instanceof Error ? error.message : "The desk could not be reached.");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const startSetup = useCallback(async () => {
    await postJson("/api/desk/setup");
    await refresh();
  }, [refresh]);

  const act = useCallback(
    async (request: ActionRequest): Promise<ActionResult> => {
      try {
        return await postJson<ActionResult>("/api/desk/action", request);
      } catch (error) {
        return {
          ok: false,
          result: "Failed",
          message: error instanceof Error ? error.message : "The request failed.",
        };
      } finally {
        void refresh();
      }
    },
    [refresh],
  );

  return { snapshot, offline, refresh, startSetup, act };
}

/** The repo contract's pre-flight answer for the amount typed, refreshed as it changes and as the clock runs. */
export function usePreview(amount: string, enabled: boolean) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const latest = useRef(amount);
  latest.current = amount;

  useEffect(() => {
    if (!enabled) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const result = await getJson<PreviewResult>(`/api/desk/preview?amount=${encodeURIComponent(latest.current)}`);
        if (!cancelled) setPreview(result);
      } catch {
        // keep the last good answer on screen
      } finally {
        running = false;
      }
    };
    const debounce = setTimeout(() => void run(), 250);
    const timer = setInterval(() => void run(), 2_000);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(timer);
    };
  }, [amount, enabled]);

  return preview;
}
