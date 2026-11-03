"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ActionResult, PreviewResult, ReserveSnapshot } from "~~/types/reserve";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `The desk answered ${response.status}.`);
  return body;
}

/** The whole page is this one poll: the chain is read on the server and refreshed every few seconds. */
export function useReserveState() {
  return useQuery({
    queryKey: ["reserve-state"],
    queryFn: () => getJson<ReserveSnapshot>("/api/reserve/state"),
    refetchInterval: query => (query.state.data?.setup.running ? 1_500 : 4_000),
    placeholderData: keepPreviousData,
  });
}

export function usePreview(amount: string, holder: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["reserve-preview", amount, holder],
    queryFn: () =>
      getJson<PreviewResult>(
        `/api/reserve/preview?amount=${encodeURIComponent(amount)}&holder=${encodeURIComponent(holder ?? "")}`,
      ),
    enabled,
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
  });
}

/** POSTs to a desk route. A route refusing the request becomes a result like any other refusal. */
export async function post(path: string, body?: Record<string, unknown>): Promise<ActionResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await response.json().catch(() => ({}))) as Partial<ActionResult> & { error?: string };
    if (!response.ok || json.error) {
      return { ok: false, result: "Refused", message: json.error ?? `The desk answered ${response.status}.` };
    }
    return json as ActionResult;
  } catch {
    return { ok: false, result: "Unreachable", message: "The desk could not be reached." };
  }
}

export const hashscan = {
  contract: (idOrAddress: string) => `https://hashscan.io/testnet/contract/${idOrAddress}`,
  account: (idOrAddress: string) => `https://hashscan.io/testnet/account/${idOrAddress}`,
  transaction: (hash: string) => `https://hashscan.io/testnet/transaction/${hash}`,
};
