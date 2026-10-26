"use client";

import { hashscanAccountUrl, hashscanTokenUrl, hashscanTopicUrl } from "~~/services/hcsAudit/mirror";

export const DeskIds = ({
  topicId,
  tokenId,
  holderAccountId,
}: {
  topicId: string;
  tokenId: string;
  holderAccountId: string;
}) => {
  return (
    <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300 flex flex-col gap-2 text-sm">
      <div>
        <span className="font-medium">Audit topic: </span>
        <a
          id="topic-id"
          href={hashscanTopicUrl(topicId)}
          target="_blank"
          rel="noreferrer"
          className="link link-primary"
        >
          {topicId}
        </a>
      </div>
      <div>
        <span className="font-medium">Security token: </span>
        <a
          id="token-id"
          href={hashscanTokenUrl(tokenId)}
          target="_blank"
          rel="noreferrer"
          className="link link-primary"
        >
          {tokenId}
        </a>
      </div>
      <div>
        <span className="font-medium">Holder account: </span>
        <a
          id="holder-account-id"
          href={hashscanAccountUrl(holderAccountId)}
          target="_blank"
          rel="noreferrer"
          className="link link-primary"
        >
          {holderAccountId}
        </a>
      </div>
      <div>
        <a id="regulator-link" href={`/regulator?topic=${topicId}`} className="btn btn-outline btn-sm w-fit mt-1">
          Open regulator feed
        </a>
      </div>
    </div>
  );
};
