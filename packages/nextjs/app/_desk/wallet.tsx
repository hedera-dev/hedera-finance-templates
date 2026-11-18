"use client";

import { useCallback, useState } from "react";
import { Card, Spinner } from "./ui";
import { parseAbi } from "viem";
import { hederaTestnet } from "viem/chains";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import {
  GRACE_SECONDS,
  HOLD_EXPIRY_MARGIN_SECONDS,
  MAX_PLEDGE_BILLS,
  PARTITION,
  SECONDS_PER_DAY,
  TERM_DAYS,
} from "~~/services/repo/constants";
import type { ActionRequest, ActionResult, DeskView } from "~~/types/repo";

const holdAbi = parseAbi([
  "struct Hold { uint256 amount; uint256 expirationTimestamp; address escrow; address to; bytes data; }",
  "function createHoldByPartition(bytes32 _partition, Hold _hold) returns (bool success_, uint256 holdId_)",
]);

/** What to do next, in one sentence. */
export function walletSentence(input: { connected: boolean; onTestnet: boolean; desk: DeskView | null }): string {
  if (!input.connected) return "Connect MetaMask to borrow.";
  if (!input.onTestnet) return "Switch MetaMask to Hedera testnet.";
  const { desk } = input;
  if (!desk) return "Set up the desk, then add your wallet as the borrower.";
  if (!desk.wallet?.added) return "Add your wallet as the borrower.";
  if (desk.borrower.kind === "wallet" && desk.position.pledged && desk.position.pledged !== "0") {
    return "Your pledge is on the bill. Borrow against it.";
  }
  return "Pledge your bills: choose My wallet as the borrower, then press Pledge bills as collateral.";
}

/** Signs the pledge in the learner's own wallet, then lets the desk verify it on the bill. */
export function useWalletPledge(desk: DeskView | null, act: (request: ActionRequest) => Promise<ActionResult>) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: hederaTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState(false);

  const pledge = useCallback(
    async (amountText: string): Promise<ActionResult> => {
      const fail = (result: string, message: string): ActionResult => ({ ok: false, result, message });
      if (!desk || !address || !publicClient) return fail("NotReady", "Connect a wallet and set up the desk first.");
      if (!/^\d{1,3}$/.test(amountText.trim()) || BigInt(amountText) < 1n || BigInt(amountText) > MAX_PLEDGE_BILLS) {
        return fail("BadAmount", `Enter a whole number of bills from 1 to ${MAX_PLEDGE_BILLS}.`);
      }
      setPending(true);
      try {
        const hold = {
          amount: BigInt(amountText),
          expirationTimestamp: BigInt(
            // The term is in demo days; everything added to it is real seconds. Same arithmetic as the server pledge.
            Math.floor(Date.now() / 1000) +
              TERM_DAYS * Number(SECONDS_PER_DAY) +
              GRACE_SECONDS +
              HOLD_EXPIRY_MARGIN_SECONDS,
          ),
          escrow: desk.encumbrance.escrow.address as `0x${string}`,
          to: desk.operator as `0x${string}`,
          data: "0x" as const,
        };
        const args = [PARTITION, hold] as const;
        const simulated = await publicClient.simulateContract({
          account: address,
          address: desk.bill.address as `0x${string}`,
          abi: holdAbi,
          functionName: "createHoldByPartition",
          args,
          gas: 480_000n,
        });
        const holdId = simulated.result[1];
        const hash = await writeContractAsync({
          address: desk.bill.address as `0x${string}`,
          abi: holdAbi,
          functionName: "createHoldByPartition",
          args,
          gas: 480_000n,
          chainId: hederaTestnet.id,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          return { ...fail("Reverted", "The pledge was mined and reverted."), txHash: hash };
        const registered = await act({ type: "register-wallet-pledge", address, holdId: holdId.toString() });
        return { ...registered, txHash: hash };
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        if (/reject|denied/i.test(text)) return fail("UserRejected", "You declined the transaction in your wallet.");
        return fail("Failed", text.split("\n")[0].slice(0, 240));
      } finally {
        setPending(false);
      }
    },
    [act, address, desk, publicClient, writeContractAsync],
  );

  return { pledge, pending };
}

export function WalletCard({
  desk,
  busy,
  onAdd,
  mode,
  setMode,
}: {
  desk: DeskView | null;
  busy: string | null;
  onAdd: (address: string) => void;
  mode: "demo" | "wallet";
  setMode: (mode: "demo" | "wallet") => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const connected = isConnected && Boolean(address);
  const onTestnet = chainId === hederaTestnet.id;
  const added = Boolean(desk?.wallet?.added);

  return (
    <Card
      title="Your wallet as the borrower"
      caption="The one transaction here that belongs to you: encumbering your own asset without handing it over."
    >
      <p id="wallet-state" className="m-0 text-sm font-medium">
        {walletSentence({ connected, onTestnet, desk })}
      </p>
      {connected && !onTestnet ? (
        <button
          type="button"
          className="btn btn-sm btn-outline w-fit"
          onClick={() => switchChain({ chainId: hederaTestnet.id })}
        >
          Switch to Hedera testnet
        </button>
      ) : null}
      {connected ? (
        <div className="flex flex-col gap-2">
          <button
            id="add-wallet-borrower"
            type="button"
            className="btn btn-sm btn-primary w-fit"
            disabled={!desk || added || busy !== null}
            onClick={() => address && onAdd(address)}
          >
            {busy === "add-wallet" ? <Spinner /> : null}
            Add my wallet as the borrower
          </button>
          {added && desk?.wallet ? (
            <p className="m-0 text-xs text-base-content/70">
              Your wallet holds {desk.wallet.balance ?? "—"} free and {desk.wallet.held ?? "—"} pledged bills.
            </p>
          ) : null}
          {added ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="borrower-mode" className="text-sm font-medium">
                Borrower the pledge is made by
              </label>
              <select
                id="borrower-mode"
                className="select select-bordered select-sm w-fit"
                value={mode}
                onChange={event => setMode(event.target.value === "wallet" ? "wallet" : "demo")}
              >
                <option value="demo">Demo borrower (signed on the server)</option>
                <option value="wallet">My wallet (signed in MetaMask)</option>
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="m-0 text-xs text-base-content/70">
        There is no login. The operator key sits in <code>.env.local</code> on this machine, so a password would be
        guarded by a secret anyone able to run code here already holds; routes that sign accept same-origin requests
        only. Anyone able to run code on this machine can spend the operator account, and adding a wallet is taken on
        trust, because no signature proves the address belongs to whoever asked.
      </p>
    </Card>
  );
}
