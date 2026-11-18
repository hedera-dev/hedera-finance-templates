"use client";

import type { ReactNode } from "react";

export const HASHSCAN = "https://hashscan.io/testnet";
export const DASH = "—";
export const UNAVAILABLE = "unavailable";

export function Spinner() {
  return <span className="loading loading-spinner loading-xs" aria-hidden />;
}

/** Every card has a title and a one-sentence caption. */
export function Card({
  title,
  caption,
  children,
  id,
}: {
  title: string;
  caption: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3 p-5">
        <div>
          <h2 className="card-title text-lg">{title}</h2>
          <p className="text-sm text-base-content/70 m-0">{caption}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

/** A labelled value. The id sits on the element whose text is exactly the value. */
export function Stat({
  label,
  id,
  value,
  note,
  mono,
}: {
  label: string;
  id: string;
  value: ReactNode;
  note?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs uppercase tracking-wide text-base-content/60">{label}</span>
      <span id={id} className={`text-base font-semibold break-all ${mono ? "font-mono text-sm" : ""}`}>
        {value}
      </span>
      {note ? <span className="text-xs text-base-content/60">{note}</span> : null}
    </div>
  );
}

export function Link({ id, href, children }: { id: string; href: string; children: ReactNode }) {
  return (
    <a id={id} href={href} target="_blank" rel="noreferrer" className="link link-primary font-mono text-sm break-all">
      {children}
    </a>
  );
}

export const contractLink = (contractId: string) => `${HASHSCAN}/contract/${contractId}`;
export const tokenLink = (tokenId: string) => `${HASHSCAN}/token/${tokenId}`;
export const accountLink = (address: string) => `${HASHSCAN}/account/${address}`;
export const txLink = (hash: string) => `${HASHSCAN}/transaction/${hash}`;

/** A value that was read: shown as read, or as the fallback when it could not be. Never empty. */
export const show = (value: string | null | undefined, fallback: string = DASH) =>
  value === null || value === undefined || value === "" ? fallback : value;

export const localTime = (ms: number | null | undefined) =>
  ms === null || ms === undefined || !Number.isFinite(ms) ? DASH : new Date(ms).toLocaleString();
