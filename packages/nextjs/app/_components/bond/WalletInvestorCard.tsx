"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import * as chains from "viem/chains";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import type { InvestorView } from "~~/types/ats";
import { clientBondAbi } from "~~/utils/ats/clientBondAbi";
import { decodeAtsErrorName } from "~~/utils/ats/decodeError";

type Props = {
  bondAddress: string | null;
  investors: InvestorView[];
  addingWallet: boolean;
  onAddWalletInvestor: (address: string) => Promise<void>;
  onLogActivity: (action: string, result: string, txHash?: string) => Promise<void>;
  onTransferred: () => Promise<unknown>;
};

export const WalletInvestorCard = ({
  bondAddress,
  investors,
  addingWallet,
  onAddWalletInvestor,
  onLogActivity,
  onTransferred,
}: Props) => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("100");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const myInvestor = useMemo(
    () => (address ? investors.find(i => i.address.toLowerCase() === address.toLowerCase()) : undefined),
    [address, investors],
  );

  const onCorrectChain = chainId === chains.hederaTestnet.id;

  let stateMessage: string;
  let showAddButton = false;
  let showTransfer = false;

  if (!isConnected || !address) {
    stateMessage = "Connect your wallet to add it as an investor.";
  } else if (!onCorrectChain) {
    stateMessage = "Switch MetaMask to Hedera testnet to continue.";
  } else if (!bondAddress) {
    stateMessage = "Issue a bond first, then add your wallet as an investor.";
  } else if (!myInvestor) {
    stateMessage = "Add your wallet as an investor to continue.";
    showAddButton = true;
  } else if (myInvestor.approved === null || myInvestor.balance === null) {
    stateMessage = "The network could not be read just now, so your wallet's state is unknown. Try again shortly.";
  } else if (!myInvestor.approved) {
    stateMessage = "Wait for the issuer to approve your wallet before you can receive bonds.";
  } else if (myInvestor.balance <= 0) {
    stateMessage = "Your wallet is approved. Wait for the issuer to issue bonds to it before you can transfer.";
  } else {
    stateMessage = "You hold bonds. You can transfer them to another approved address.";
    showTransfer = true;
  }

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (!bondAddress || !address) return;

    const amount = Number(transferAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setTransferError("Amount must be a positive whole number.");
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(transferTo)) {
      setTransferError("Enter a valid recipient EVM address.");
      return;
    }

    setTransferring(true);
    setTransferError(null);
    try {
      const hash = await writeContractAsync({
        address: bondAddress as `0x${string}`,
        abi: clientBondAbi,
        functionName: "transfer",
        args: [transferTo as `0x${string}`, BigInt(amount)],
        chain: chains.hederaTestnet,
        account: address,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      await onLogActivity(`Transfer ${amount} to ${transferTo}`, "SUCCESS", hash);
      await onTransferred();
      setTransferTo("");
    } catch (error) {
      const errorName = decodeAtsErrorName(error);
      await onLogActivity(`Transfer ${amount} to ${transferTo}`, errorName);
      setTransferError(errorName);
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <div>
          <h2 className="card-title text-lg">Your wallet</h2>
          <p className="text-sm text-base-content/60 m-0">
            Connect MetaMask on Hedera testnet to hold and transfer the bond yourself.
          </p>
        </div>

        <p id="wallet-state" className="text-sm">
          {stateMessage}
        </p>

        {showAddButton ? (
          <button
            id="add-wallet-investor"
            type="button"
            className="btn btn-sm btn-primary self-start"
            disabled={addingWallet}
            onClick={() => address && onAddWalletInvestor(address)}
          >
            {addingWallet ? <span className="loading loading-spinner loading-xs" aria-hidden /> : null}
            Add my wallet as an investor
          </button>
        ) : null}

        {showTransfer ? (
          <form id="wallet-transfer" onSubmit={handleTransfer} className="flex flex-col gap-2">
            <label className="form-control flex flex-col gap-1">
              <span className="label-text text-sm font-medium">Recipient address</span>
              <input
                id="transfer-to"
                className="input input-bordered input-sm w-full"
                value={transferTo}
                onChange={e => setTransferTo(e.target.value)}
                disabled={transferring}
                placeholder="0x..."
              />
            </label>
            <label className="form-control flex flex-col gap-1">
              <span className="label-text text-sm font-medium">Amount</span>
              <input
                id="transfer-amount"
                type="number"
                min={1}
                step={1}
                className="input input-bordered input-sm w-full"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
                disabled={transferring}
              />
            </label>
            <button
              id="transfer-submit"
              type="submit"
              className="btn btn-sm btn-primary self-start"
              disabled={transferring}
            >
              {transferring ? <span className="loading loading-spinner loading-xs" aria-hidden /> : null}
              Transfer
            </button>
            {transferError ? <p className="text-error text-sm">{transferError}</p> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
};
