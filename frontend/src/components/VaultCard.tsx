"use client";

import { useState } from "react";
import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { parseUnits } from "viem";
import { VAULT_ABI } from "@/config/contracts";
import { fmt, shortAddr, formatDate } from "@/lib/format";

interface VaultInfo {
  vault: `0x${string}`;
  creator: `0x${string}`;
  controller: `0x${string}`;
  yieldReceiver: `0x${string}`;
  createdAt: bigint;
}

interface VaultCardProps {
  info: VaultInfo;
}

type Action = "stakeAll" | "unstakeAll" | "claimYield";

export function VaultCard({ info }: VaultCardProps) {
  const { address } = useAccount();
  const isController = address?.toLowerCase() === info.controller.toLowerCase();

  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [expanded, setExpanded] = useState(false);

  const contract = { address: info.vault, abi: VAULT_ABI } as const;

  const { data: reads, refetch } = useReadContracts({
    contracts: [
      { ...contract, functionName: "stakedBalance" },
      { ...contract, functionName: "unstakedBalance" },
      { ...contract, functionName: "getRewardTokens" },
    ],
  });

  const staked = reads?.[0]?.result as bigint | undefined;
  const unstaked = reads?.[1]?.result as bigint | undefined;
  const rewardTokens = reads?.[2]?.result as `0x${string}`[] | undefined;

  const { writeContract, data: txHash, isPending, variables } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  function sendTx(action: Action) {
    if (action === "unstakeAll") {
      writeContract({ ...contract, functionName: "unstakeAll" });
    } else if (action === "stakeAll") {
      writeContract({ ...contract, functionName: "stakeAll" });
    } else {
      writeContract({ ...contract, functionName: "claimYield" });
    }
  }

  function handleUnstakeCustom() {
    if (!unstakeAmount) return;
    try {
      const parsed = parseUnits(unstakeAmount, 18);
      writeContract({ ...contract, functionName: "unstake", args: [parsed] });
    } catch {
      // invalid input
    }
  }

  if (isSuccess) refetch();

  function copyAddr(addr: string) {
    navigator.clipboard.writeText(addr);
  }

  return (
    <div className="card-gold-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gold-400">{shortAddr(info.vault)}</span>
            <button
              className="text-white/30 hover:text-white/70 text-xs transition-colors"
              onClick={(e) => { e.stopPropagation(); copyAddr(info.vault); }}
              title="Copy vault address"
            >
              ⎘
            </button>
            {isController && (
              <span className="text-xs bg-gold-500/15 text-gold-400 border border-gold-500/25 rounded px-1.5 py-0.5">
                Controller
              </span>
            )}
          </div>
          <p className="text-xs text-white/35">Created {formatDate(info.createdAt)}</p>
        </div>

        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-xs text-white/40">Staked</p>
            <p className="text-sm font-semibold text-white">{fmt(staked)} xPHAR</p>
          </div>
          <div>
            <p className="text-xs text-white/40">Unstaked</p>
            <p className="text-sm font-semibold text-white">{fmt(unstaked)} xPHAR</p>
          </div>
          <span className="text-white/30 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gold-500/10 px-5 py-4 space-y-4">
          {/* Addresses */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {(
              [
                ["Creator", info.creator],
                ["Controller", info.controller],
                ["Yield Receiver", info.yieldReceiver],
              ] as [string, string][]
            ).map(([label, addr]) => (
              <div key={label} className="space-y-0.5">
                <p className="text-white/40">{label}</p>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-white/80">{shortAddr(addr)}</span>
                  <button
                    className="text-white/25 hover:text-white/60 transition-colors"
                    onClick={() => copyAddr(addr)}
                    title="Copy"
                  >
                    ⎘
                  </button>
                </div>
              </div>
            ))}
          </div>

          {rewardTokens && rewardTokens.length > 0 && (
            <div className="text-xs text-white/40">
              Reward tokens: {rewardTokens.map((t) => shortAddr(t)).join(", ")}
            </div>
          )}

          {/* Actions (controller only) */}
          {isController ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-gold px-4 py-2 text-xs"
                  disabled={isPending || isConfirming || !unstaked || unstaked === 0n}
                  onClick={() => sendTx("stakeAll")}
                >
                  Stake All
                </button>
                <button
                  className="btn-gold px-4 py-2 text-xs"
                  disabled={isPending || isConfirming || !staked || staked === 0n}
                  onClick={() => sendTx("claimYield")}
                >
                  Claim Yield
                </button>
                <button
                  className="btn-outline px-4 py-2 text-xs"
                  disabled={isPending || isConfirming || !staked || staked === 0n}
                  onClick={() => sendTx("unstakeAll")}
                >
                  Unstake All
                </button>
              </div>

              {/* Custom unstake amount */}
              <div className="flex gap-2 items-center">
                <input
                  className="pharaoh-input text-sm"
                  style={{ maxWidth: 180 }}
                  placeholder="Amount to unstake"
                  value={unstakeAmount}
                  onChange={(e) => setUnstakeAmount(e.target.value)}
                />
                <button
                  className="btn-outline px-4 py-2 text-xs whitespace-nowrap"
                  disabled={!unstakeAmount || isPending || isConfirming}
                  onClick={handleUnstakeCustom}
                >
                  Unstake
                </button>
              </div>

              {(isPending || isConfirming) && (
                <p className="text-gold-400 text-xs animate-pulse">
                  {isPending ? "Confirm in wallet…" : "Transaction confirming…"}
                </p>
              )}
              {isSuccess && (
                <p className="text-green-400 text-xs">Transaction confirmed.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-white/35 italic">
              Connect the controller wallet to manage this vault.
            </p>
          )}

          {/* Deposit hint */}
          <div className="bg-gold-500/5 border border-gold-500/15 rounded-lg px-4 py-3 text-xs text-white/50 space-y-1">
            <p className="font-medium text-white/70">To deposit xPHAR:</p>
            <p>
              Send xPHAR directly to{" "}
              <span className="font-mono text-gold-400">{info.vault}</span>, then the controller
              calls <em>Stake All</em>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
