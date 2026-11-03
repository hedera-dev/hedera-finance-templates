"use client";

import type { ReactNode } from "react";

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

export function HashLink({
  id,
  href,
  children,
  className = "",
}: {
  id?: string;
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      id={id}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`link link-primary font-mono text-xs break-all ${className}`}
    >
      {children}
    </a>
  );
}

/** A labelled value. The value is always something readable: callers pass `unavailable`, never nothing. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-xs uppercase tracking-wide text-base-content/60">{label}</dt>
      <dd className="m-0 text-sm font-medium break-words min-w-0">{children}</dd>
    </div>
  );
}

export const UNAVAILABLE = "unavailable";
export const orUnavailable = (value: string | null | undefined) => (value ? value : UNAVAILABLE);

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`loading loading-spinner loading-xs ${className}`} aria-hidden />;
}

export const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;
export const shortAddress = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`;
