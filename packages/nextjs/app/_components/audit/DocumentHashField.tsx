"use client";

import { useEffect, useRef, useState } from "react";
import { sha256Hex } from "~~/services/hcsAudit/entry";

type DocumentHashFieldProps = {
  id: string;
  label: string;
  hint: string;
  disabled: boolean;
  hash: string | null;
  onHash: (hash: string | null) => void;
};

/**
 * Turns a chosen document into the one thing that may be published about it: its
 * SHA-256 hash. The file is digested here and only the digest is lifted into state,
 * so neither the server nor the topic ever sees it — which is what makes it safe to
 * commit a KYC file to a public ledger. Whoever holds the document proves it is the
 * one the entry means by hashing it again; nobody else learns anything.
 */
export const DocumentHashField = ({ id, label, hint, disabled, hash, onHash }: DocumentHashFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setHashing(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      onHash(await sha256Hex(bytes));
      setName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      onHash(null);
      setName(null);
    } finally {
      setHashing(false);
    }
  };

  // The hash is the parent's state, so the field follows it back to empty — its own
  // Clear button and a parent clearing the form after a record take the same path.
  useEffect(() => {
    if (hash !== null) return;
    setName(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [hash]);

  const clear = () => {
    onHash(null);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-base-content/70">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="file-input file-input-sm file-input-bordered w-64"
          disabled={disabled || hashing}
          onChange={e => void pick(e.target.files?.[0])}
        />
        {hashing && <span className="loading loading-spinner loading-xs" />}
        {hash && (
          <button className="btn btn-xs btn-ghost" onClick={clear} disabled={disabled}>
            Clear
          </button>
        )}
      </div>
      {hash && (
        <span className="text-xs font-mono text-base-content/70 break-all" data-document-hash={hash}>
          {name ? `${name}: ` : ""}
          {hash}
        </span>
      )}
      {error && <span className="text-xs text-error">{error}</span>}
      <span className="text-xs text-base-content/60">{hint}</span>
    </div>
  );
};
