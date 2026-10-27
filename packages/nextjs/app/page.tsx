"use client";

import type { NextPage } from "next";
import { SecurityDesk } from "~~/app/_components/security/SecurityDesk";

const Home: NextPage = () => {
  return (
    <div className="flex flex-col grow w-full max-w-6xl mx-auto px-5 py-8 gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold m-0">A transfer agent&apos;s desk for a permissioned security</h1>
        <p className="text-base-content/70 m-0 max-w-3xl">
          A permissioned security is a token whose compliance rules — who may hold it, who may be frozen, who may be
          wiped, whether it is paused — are <strong>keys on the token itself</strong>, enforced by the Hedera network,
          not by contract code. Every admin action here needs <strong>two of three</strong> compliance officers, because
          each key is a 2-of-3 threshold key and one signature is never enough.
        </p>
        <p className="text-sm text-base-content/60 m-0 max-w-3xl">
          The network enforces the two signatures. The <em>separation</em> is a demo: this desk holds Officers 1 and 2,
          so it can produce both. In production those keys live with different people, or in different custody — that is
          what turns a rule the network enforces into a control over the people who use it.
        </p>
      </header>

      <SecurityDesk />
    </div>
  );
};

export default Home;
