"use client";

import { useRef, useState } from "react";
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
 * SHA-256 hash.
 *
 * The file is read and digested here, in the browser, and only the digest is lifted
 * into state. Nothing uploads it, so the server never sees the document and neither
 * does the topic — which is what makes it safe to commit a KYC file or a board
 * minute to a public ledger. Whoever holds the document can prove it is the one the
 * entry refers to by hashing it again; nobody else learns anything from the hash.
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

  const clear = () => {
    onHash(null);
    setName(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
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
