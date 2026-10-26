"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { NextPage } from "next";
import { FeedTable } from "~~/app/regulator/_components/FeedTable";
import { useRegulatorFeed } from "~~/hooks/hcsAudit/useRegulatorFeed";

const RegulatorContent = () => {
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");

  useEffect(() => {
    const fromQuery = searchParams.get("topic");
    if (fromQuery) setTopic(fromQuery);
  }, [searchParams]);

  const { result, error } = useRegulatorFeed(topic || null);

  return (
    <div className="w-full max-w-5xl mx-auto px-5 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Regulator feed</h1>
        <p className="text-sm text-base-content/70 m-0">
          Reads the audit topic straight from the public Hedera mirror node and re-derives every check itself: this page
          needs nothing from the issuer&apos;s server, no key, and no account.
        </p>
      </div>

      <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300 flex flex-col gap-4">
        <div className="flex flex-col gap-1 max-w-sm">
          <label htmlFor="regulator-topic" className="text-xs font-medium text-base-content/70">
            Topic id
          </label>
          <input
            id="regulator-topic"
            type="text"
            placeholder="0.0.xxxxxx"
            className="input input-sm input-bordered"
            value={topic}
            onChange={e => setTopic(e.target.value.trim())}
          />
        </div>

        {topic && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span id="feed-status" className="font-bold">
              {result.status}
            </span>
            <span>
              <span id="feed-count">{result.rows.length}</span> entries
            </span>
            {result.status === "BROKEN" && result.brokenAt && (
              <span className="text-error">
                First failure at sequence {result.brokenAt.sequenceNumber}: {result.brokenAt.reason}
              </span>
            )}
            {error && <span className="text-error">{error}</span>}
          </div>
        )}

        <FeedTable rows={result.rows} />
      </div>
    </div>
  );
};

const RegulatorPage: NextPage = () => {
  return (
    <div className="flex items-center flex-col grow">
      <Suspense>
        <RegulatorContent />
      </Suspense>
    </div>
  );
};

export default RegulatorPage;
