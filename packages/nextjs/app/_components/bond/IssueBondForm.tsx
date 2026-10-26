"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { IssueProgress } from "./IssueProgress";
import type { StepsState } from "./useBondDesk";
import type { IssueBondInput } from "~~/types/ats";
import { validateIsin } from "~~/utils/ats/isin";

const DEFAULTS = {
  name: "Acme Corp 1Y Bond",
  symbol: "ACME1Y",
  isin: "US0378331005",
  faceValue: "1000",
  maturityMonths: "12",
  maxSupply: "1000",
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="form-control flex flex-col gap-1">
    <span className="label-text text-sm font-medium">{label}</span>
    {children}
  </label>
);

type Props = {
  configured: boolean;
  configError?: string;
  issuing: boolean;
  issueError: string | null;
  steps: StepsState;
  onIssue: (input: IssueBondInput) => void;
};

export const IssueBondForm = ({ configured, configError, issuing, issueError, steps, onIssue }: Props) => {
  const [name, setName] = useState(DEFAULTS.name);
  const [symbol, setSymbol] = useState(DEFAULTS.symbol);
  const [isin, setIsin] = useState(DEFAULTS.isin);
  const [faceValue, setFaceValue] = useState(DEFAULTS.faceValue);
  const [maturityMonths, setMaturityMonths] = useState(DEFAULTS.maturityMonths);
  const [maxSupply, setMaxSupply] = useState(DEFAULTS.maxSupply);
  const [isinError, setIsinError] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateIsin(isin);
    if (!check.valid) {
      setIsinError(check.reason);
      return;
    }
    setIsinError(null);
    setShowProgress(true);
    onIssue({
      name,
      symbol,
      isin: isin.trim().toUpperCase(),
      faceValue: Number(faceValue),
      maturityMonths: Number(maturityMonths),
      maxSupply: Number(maxSupply),
    });
  };

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4">
        <div>
          <h2 className="card-title text-lg">Issue a bond</h2>
          <p className="text-sm text-base-content/60 m-0">
            Deploys a tokenised bond from ATS&apos;s audited testnet factory, with you as issuer.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Bond name">
              <input
                id="bond-name"
                className="input input-bordered w-full"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={issuing}
              />
            </Field>
            <Field label="Symbol">
              <input
                id="bond-symbol"
                className="input input-bordered w-full"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                disabled={issuing}
              />
            </Field>
            <Field label="ISIN">
              <input
                id="bond-isin"
                className={`input input-bordered w-full ${isinError ? "input-error" : ""}`}
                value={isin}
                onChange={e => {
                  setIsin(e.target.value);
                  setIsinError(null);
                }}
                disabled={issuing}
              />
            </Field>
            <Field label="Face value (USD)">
              <input
                id="bond-face-value"
                type="number"
                min={1}
                step={1}
                className="input input-bordered w-full"
                value={faceValue}
                onChange={e => setFaceValue(e.target.value)}
                disabled={issuing}
              />
            </Field>
            <Field label="Maturity (months)">
              <input
                id="bond-maturity-months"
                type="number"
                min={1}
                max={120}
                step={1}
                className="input input-bordered w-full"
                value={maturityMonths}
                onChange={e => setMaturityMonths(e.target.value)}
                disabled={issuing}
              />
            </Field>
            <Field label="Max supply">
              <input
                id="bond-max-supply"
                type="number"
                min={1}
                step={1}
                className="input input-bordered w-full"
                value={maxSupply}
                onChange={e => setMaxSupply(e.target.value)}
                disabled={issuing}
              />
            </Field>
          </div>

          {isinError ? <p className="text-error text-sm -mt-1">{isinError}</p> : null}

          {!configured && configError ? (
            <p id="config-error" className="text-error text-sm">
              {configError}
            </p>
          ) : null}

          <button id="issue-bond" type="submit" className="btn btn-primary" disabled={!configured || issuing}>
            {issuing ? <span className="loading loading-spinner loading-sm" aria-hidden /> : null}
            Issue bond
          </button>

          {issueError ? <p className="text-error text-sm">{issueError}</p> : null}
        </form>

        {showProgress ? <IssueProgress steps={steps} /> : null}
      </div>
    </div>
  );
};
