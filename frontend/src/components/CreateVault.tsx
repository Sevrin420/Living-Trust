"use client";

import { useState } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress } from "viem";
import { FACTORY_ADDRESS, FACTORY_ABI } from "@/config/contracts";

export function CreateVault() {
  const { address } = useAccount();
  const chainId = useChainId();

  const [controller, setController] = useState(address ?? "");
  const [yieldReceiver, setYieldReceiver] = useState("");

  const factoryAddress = FACTORY_ADDRESS[chainId];
  const isDeployed = factoryAddress !== "0x0000000000000000000000000000000000000000";

  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const isValid =
    isAddress(controller) &&
    isAddress(yieldReceiver) &&
    controller !== "0x0000000000000000000000000000000000000000" &&
    yieldReceiver !== "0x0000000000000000000000000000000000000000";

  function handleCreate() {
    if (!isValid || !isDeployed) return;
    writeContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: "createVault",
      args: [controller as `0x${string}`, yieldReceiver as `0x${string}`],
    });
  }

  return (
    <section className="card-gold-border rounded-xl p-6 space-y-5">
      <h2 className="text-lg font-semibold text-white">Create New Vault</h2>

      {!isDeployed && (
        <div className="text-yellow-400 text-sm bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-4 py-3">
          Factory not yet deployed on this network. Run{" "}
          <code className="font-mono">npm run deploy:avax</code> and update{" "}
          <code className="font-mono">config/contracts.ts</code>.
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-white/60 font-medium">
            Controller (Trustee)
          </label>
          <input
            className="pharaoh-input"
            placeholder="0x… wallet that manages the vault"
            value={controller}
            onChange={(e) => setController(e.target.value)}
          />
          <p className="text-xs text-white/35">
            This wallet can stake, unstake, and claim yield. Defaults to your connected wallet.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-white/60 font-medium">
            Yield Receiver (Beneficiary)
          </label>
          <input
            className="pharaoh-input"
            placeholder="0x… wallet that receives all claimed yield"
            value={yieldReceiver}
            onChange={(e) => setYieldReceiver(e.target.value)}
          />
          <p className="text-xs text-white/35">
            All claimed rewards are forwarded here automatically.
          </p>
        </div>
      </div>

      <button
        className="btn-gold px-6 py-2.5 text-sm w-full sm:w-auto"
        disabled={!isValid || !isDeployed || isPending || isConfirming}
        onClick={handleCreate}
      >
        {isPending
          ? "Confirm in wallet…"
          : isConfirming
          ? "Creating vault…"
          : "Create Vault"}
      </button>

      {isSuccess && (
        <p className="text-green-400 text-sm">
          Vault created! It will appear in the list below.
        </p>
      )}

      {error && (
        <p className="text-red-400 text-sm">
          {(error as Error).message.slice(0, 120)}
        </p>
      )}
    </section>
  );
}
