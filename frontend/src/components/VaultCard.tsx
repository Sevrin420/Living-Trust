"use client";

import { useState } from "react";
import {
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useSendTransaction,
} from "wagmi";
import { parseEther, parseUnits, formatEther } from "viem";
import { VAULT_ABI } from "@/config/contracts";
import { fmt, shortAddr, formatDate } from "@/lib/format";

interface VaultInfo {
  vault: `0x${string}`;
  creator: `0x${string}`;
  controller: `0x${string}`;
  yieldReceiver: `0x${string}`;
  createdAt: bigint;
}

type Panel = "operations" | "autoClaim";

export function VaultCard({ info }: { info: VaultInfo }) {
  const { address } = useAccount();
  const isController = address?.toLowerCase() === info.controller.toLowerCase();

  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<Panel>("operations");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [intervalDays, setIntervalDays] = useState("7");
  const [refundAvax, setRefundAvax] = useState("0.05");
  const [depositAvax, setDepositAvax] = useState("");

  const contract = { address: info.vault, abi: VAULT_ABI } as const;

  const { data: reads, refetch } = useReadContracts({
    contracts: [
      { ...contract, functionName: "stakedBalance" },
      { ...contract, functionName: "unstakedBalance" },
      { ...contract, functionName: "autoClaimEnabled" },
      { ...contract, functionName: "claimInterval" },
      { ...contract, functionName: "lastClaimAt" },
      { ...contract, functionName: "nextClaimAt" },
      { ...contract, functionName: "gasRefund" },
      { ...contract, functionName: "avaxBalance" },
      { ...contract, functionName: "getRewardTokens" },
    ],
  });

  const staked = reads?.[0]?.result as bigint | undefined;
  const unstaked = reads?.[1]?.result as bigint | undefined;
  const autoEnabled = reads?.[2]?.result as boolean | undefined;
  const claimInterval = reads?.[3]?.result as bigint | undefined;
  const lastClaim = reads?.[4]?.result as bigint | undefined;
  const nextClaim = reads?.[5]?.result as bigint | undefined;
  const gasRefundWei = reads?.[6]?.result as bigint | undefined;
  const avaxBal = reads?.[7]?.result as bigint | undefined;
  const rewardTokens = reads?.[8]?.result as `0x${string}`[] | undefined;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isDue = nextClaim !== undefined && now >= nextClaim;

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { sendTransaction, isPending: isSending } = useSendTransaction();

  if (isSuccess) refetch();

  const busy = isPending || isConfirming || isSending;

  function write(fn: string, args: unknown[] = []) {
    writeContract({ ...contract, functionName: fn as any, args: args as any });
  }

  function handleDepositAvax() {
    if (!depositAvax) return;
    try {
      sendTransaction({ to: info.vault, value: parseEther(depositAvax) });
      setDepositAvax("");
    } catch { /* invalid */ }
  }

  function handleSetInterval() {
    const days = parseFloat(intervalDays);
    if (isNaN(days) || days < 0.042) return; // min ~1 hour
    write("setClaimInterval", [BigInt(Math.round(days * 86400))]);
  }

  function handleSetRefund() {
    try {
      write("setGasRefund", [parseEther(refundAvax)]);
    } catch { /* invalid */ }
  }

  function handleUnstakeCustom() {
    if (!unstakeAmount) return;
    try {
      write("unstake", [parseUnits(unstakeAmount, 18)]);
      setUnstakeAmount("");
    } catch { /* invalid */ }
  }

  function copyAddr(addr: string) {
    navigator.clipboard.writeText(addr);
  }

  function formatCountdown(ts: bigint): string {
    const diff = Number(ts) - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "Now";
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return (
    <div className="card-gold-border rounded-xl overflow-hidden">
      {/* Summary row */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
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
            {autoEnabled && (
              <span className={`text-xs border rounded px-1.5 py-0.5 ${isDue ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                {isDue ? "Claim due" : "Auto ✓"}
              </span>
            )}
          </div>
          <p className="text-xs text-white/35">Created {formatDate(info.createdAt)}</p>
        </div>

        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-xs text-white/40">Staked</p>
            <p className="text-sm font-semibold text-white">{fmt(staked)} xPHAR</p>
          </div>
          <div>
            <p className="text-xs text-white/40">AVAX (gas)</p>
            <p className="text-sm font-semibold text-white">{avaxBal !== undefined ? fmt(avaxBal, 18, 3) : "—"}</p>
          </div>
          <span className="text-white/30 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-gold-500/10 px-5 py-4 space-y-4">
          {/* Address grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {([["Creator", info.creator], ["Controller", info.controller], ["Yield Receiver", info.yieldReceiver]] as [string, string][]).map(([label, addr]) => (
              <div key={label} className="space-y-0.5">
                <p className="text-white/40">{label}</p>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-white/80">{shortAddr(addr)}</span>
                  <button className="text-white/25 hover:text-white/60 transition-colors" onClick={() => copyAddr(addr)} title="Copy">⎘</button>
                </div>
              </div>
            ))}
          </div>

          {/* Panel tabs */}
          {isController && (
            <div className="flex rounded-lg overflow-hidden border border-gold-500/15 text-xs w-fit">
              {(["operations", "autoClaim"] as Panel[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPanel(p)}
                  className={`px-3 py-1.5 transition-colors ${panel === p ? "bg-gold-500/20 text-gold-400" : "text-white/40 hover:text-white/60"}`}
                >
                  {p === "operations" ? "Operations" : "Auto-Claim"}
                </button>
              ))}
            </div>
          )}

          {/* ── Operations panel ── */}
          {(!isController || panel === "operations") && (
            <div className="space-y-3">
              {isController ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-gold px-4 py-2 text-xs" disabled={busy || !unstaked || unstaked === 0n} onClick={() => write("stakeAll")}>
                      Stake All
                    </button>
                    <button className="btn-gold px-4 py-2 text-xs" disabled={busy || !staked || staked === 0n} onClick={() => write("claimYield")}>
                      Claim Yield
                    </button>
                    <button className="btn-outline px-4 py-2 text-xs" disabled={busy || !staked || staked === 0n} onClick={() => write("unstakeAll")}>
                      Unstake All
                    </button>
                  </div>

                  <div className="flex gap-2 items-center">
                    <input
                      className="pharaoh-input text-sm"
                      style={{ maxWidth: 180 }}
                      placeholder="xPHAR amount"
                      value={unstakeAmount}
                      onChange={(e) => setUnstakeAmount(e.target.value)}
                    />
                    <button className="btn-outline px-4 py-2 text-xs whitespace-nowrap" disabled={!unstakeAmount || busy} onClick={handleUnstakeCustom}>
                      Unstake
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Public auto-claim trigger */}
                  {autoEnabled && isDue && (
                    <div className="space-y-2">
                      <p className="text-xs text-green-400">Weekly claim is due — trigger it and earn {gasRefundWei !== undefined ? fmt(gasRefundWei, 18, 4) : "?"} AVAX.</p>
                      <button className="btn-gold px-4 py-2 text-xs" disabled={busy} onClick={() => write("autoClaimYield")}>
                        Trigger Auto-Claim (earn bounty)
                      </button>
                    </div>
                  )}
                  {autoEnabled && !isDue && nextClaim && (
                    <p className="text-xs text-white/40">Next auto-claim in {formatCountdown(nextClaim)}.</p>
                  )}
                  {!autoEnabled && (
                    <p className="text-xs text-white/35 italic">Auto-claim not enabled for this vault.</p>
                  )}
                </>
              )}

              {(busy) && (
                <p className="text-gold-400 text-xs animate-pulse">
                  {isPending ? "Confirm in wallet…" : "Confirming…"}
                </p>
              )}
              {isSuccess && <p className="text-green-400 text-xs">Done.</p>}
            </div>
          )}

          {/* ── Auto-Claim panel (controller only) ── */}
          {isController && panel === "autoClaim" && (
            <div className="space-y-4">
              {/* Status banner */}
              <div className={`rounded-lg px-4 py-3 text-xs border ${autoEnabled ? "bg-green-500/10 border-green-500/20 text-green-300" : "bg-white/5 border-white/10 text-white/50"}`}>
                Auto-claim is <strong>{autoEnabled ? "ENABLED" : "DISABLED"}</strong>.
                {autoEnabled && nextClaim && (
                  <> Next claim in <strong>{formatCountdown(nextClaim)}</strong>. Bounty: <strong>{gasRefundWei !== undefined ? fmt(gasRefundWei, 18, 4) : "?"} AVAX</strong>.</>
                )}
              </div>

              {/* Enable / disable toggle */}
              <div className="flex gap-2">
                <button
                  className="btn-gold px-4 py-2 text-xs"
                  disabled={busy || autoEnabled === true}
                  onClick={() => write("setAutoClaimEnabled", [true])}
                >
                  Enable
                </button>
                <button
                  className="btn-outline px-4 py-2 text-xs"
                  disabled={busy || autoEnabled === false}
                  onClick={() => write("setAutoClaimEnabled", [false])}
                >
                  Disable
                </button>
              </div>

              {/* Interval */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Claim Interval (days)</label>
                <div className="flex gap-2">
                  <input
                    className="pharaoh-input text-sm"
                    style={{ maxWidth: 140 }}
                    type="number"
                    min="0.042"
                    step="1"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                  />
                  <button className="btn-outline px-3 py-2 text-xs" disabled={busy} onClick={handleSetInterval}>
                    Set
                  </button>
                </div>
                {claimInterval !== undefined && (
                  <p className="text-xs text-white/35">Currently: {(Number(claimInterval) / 86400).toFixed(1)} days</p>
                )}
              </div>

              {/* Gas bounty */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Bounty per Claim (AVAX)</label>
                <div className="flex gap-2">
                  <input
                    className="pharaoh-input text-sm"
                    style={{ maxWidth: 140 }}
                    type="number"
                    min="0"
                    step="0.01"
                    value={refundAvax}
                    onChange={(e) => setRefundAvax(e.target.value)}
                  />
                  <button className="btn-outline px-3 py-2 text-xs" disabled={busy} onClick={handleSetRefund}>
                    Set
                  </button>
                </div>
                <p className="text-xs text-white/35">
                  Paid to whoever triggers the weekly auto-claim. Cover the full gas cost to attract keepers.
                </p>
              </div>

              {/* AVAX balance + deposit */}
              <div className="bg-gold-500/5 border border-gold-500/15 rounded-lg px-4 py-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Vault AVAX balance</span>
                  <span className="text-gold-400 font-semibold">{avaxBal !== undefined ? fmt(avaxBal, 18, 4) : "—"} AVAX</span>
                </div>
                <p className="text-xs text-white/35">
                  The vault holds AVAX to pay bounties. Send AVAX directly to{" "}
                  <span className="font-mono text-gold-400/80">{shortAddr(info.vault)}</span>{" "}
                  or use the field below.
                </p>
                <div className="flex gap-2">
                  <input
                    className="pharaoh-input text-sm"
                    style={{ maxWidth: 140 }}
                    placeholder="0.5"
                    value={depositAvax}
                    onChange={(e) => setDepositAvax(e.target.value)}
                  />
                  <button className="btn-gold px-3 py-2 text-xs" disabled={!depositAvax || busy} onClick={handleDepositAvax}>
                    Deposit AVAX
                  </button>
                </div>
              </div>

              {/* Chainlink hint */}
              <div className="text-xs text-white/35 space-y-0.5">
                <p className="text-white/50 font-medium">Chainlink Automation (optional)</p>
                <p>
                  Register this vault at <span className="text-gold-400/70">automation.chain.link</span> for
                  guaranteed execution by the Chainlink network. The vault's{" "}
                  <code className="font-mono">checkUpkeep</code> /{" "}
                  <code className="font-mono">performUpkeep</code> functions are already implemented.
                  Fund the upkeep registration with LINK on Avalanche.
                </p>
              </div>

              {(busy) && <p className="text-gold-400 text-xs animate-pulse">{isPending ? "Confirm in wallet…" : "Confirming…"}</p>}
              {isSuccess && <p className="text-green-400 text-xs">Saved.</p>}
            </div>
          )}

          {/* Deposit hint */}
          <div className="bg-gold-500/5 border border-gold-500/15 rounded-lg px-4 py-3 text-xs text-white/50 space-y-1">
            <p className="font-medium text-white/70">To deposit xPHAR:</p>
            <p>
              Send xPHAR to{" "}
              <button className="font-mono text-gold-400 hover:underline" onClick={() => copyAddr(info.vault)}>
                {info.vault}
              </button>{" "}
              then the controller clicks <em>Stake All</em>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
