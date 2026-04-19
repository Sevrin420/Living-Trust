"use client";

import { useState } from "react";
import {
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useSendTransaction,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { VAULT_ABI, ERC20_ABI, PHAR_ADDRESS } from "@/config/contracts";
import { fmt, shortAddr, formatDate } from "@/lib/format";

interface VaultInfo {
  vault: `0x${string}`;
  creator: `0x${string}`;
  controller: `0x${string}`;
  yieldReceiver: `0x${string}`;
  createdAt: bigint;
}

type Panel = "position" | "deposit" | "auto";

export function VaultCard({ info }: { info: VaultInfo }) {
  const { address } = useAccount();
  const isController = address?.toLowerCase() === info.controller.toLowerCase();

  const [expanded,     setExpanded]     = useState(false);
  const [panel,        setPanel]        = useState<Panel>("position");
  const [pharInput,    setPharInput]    = useState("");
  const [intervalDays, setIntervalDays] = useState("30");
  const [refundAvax,   setRefundAvax]   = useState("0");
  const [depositAvax,  setDepositAvax]  = useState("");
  const [withdrawAmt,  setWithdrawAmt]  = useState("");
  const [withdrawTo,   setWithdrawTo]   = useState("");

  const contract = { address: info.vault, abi: VAULT_ABI } as const;

  const { data: reads, refetch } = useReadContracts({
    contracts: [
      { ...contract, functionName: "positionSummary" },         // 0
      { ...contract, functionName: "autoHarvestEnabled" },      // 1
      { ...contract, functionName: "harvestInterval" },         // 2
      { ...contract, functionName: "gasRefund" },               // 3
      { ...contract, functionName: "avaxBalance" },             // 4
      { ...contract, functionName: "nextHarvestAt" },           // 5
      // PHAR balance + allowance for deposit panel
      {
        address: PHAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      } as const,                                               // 6
      {
        address: PHAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: address ? [address, info.vault] : undefined,
      } as const,                                               // 7
    ],
  });

  type PositionTuple = { staked: bigint; pending: bigint; cost: bigint; rewardTok: string };
  const position      = reads?.[0]?.result as PositionTuple | undefined;
  const autoEnabled   = reads?.[1]?.result as boolean   | undefined;
  const harvestIntSec = reads?.[2]?.result as bigint    | undefined;
  const gasRefundWei  = reads?.[3]?.result as bigint    | undefined;
  const avaxBal       = reads?.[4]?.result as bigint    | undefined;
  const nextHarvest   = reads?.[5]?.result as bigint    | undefined;
  const pharBalance   = reads?.[6]?.result as bigint    | undefined;
  const pharAllowance = reads?.[7]?.result as bigint    | undefined;

  const now        = BigInt(Math.floor(Date.now() / 1000));
  const harvestDue = nextHarvest !== undefined && now >= nextHarvest;
  const hasPending = position !== undefined && position.pending > BigInt(0);

  let pharInputWei = BigInt(0);
  try { pharInputWei = parseEther(pharInput || "0"); } catch { /* invalid input */ }
  const needsApproval = pharAllowance !== undefined && pharInputWei > BigInt(0) && pharAllowance < pharInputWei;

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { sendTransaction, isPending: isSending } = useSendTransaction();

  if (isSuccess) { refetch(); }

  const busy = isPending || isConfirming || isSending;

  function write(fn: string, args: unknown[] = []) {
    writeContract({ ...contract, functionName: fn as never, args: args as never });
  }

  function handleDepositPhar() {
    if (pharInputWei === BigInt(0)) return;
    if (needsApproval) {
      writeContract({
        address: PHAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [info.vault, pharInputWei],
      });
    } else {
      write("depositPhar", [pharInputWei]);
      setPharInput("");
    }
  }

  function handleDepositAvax() {
    if (!depositAvax) return;
    try {
      sendTransaction({ to: info.vault, value: parseEther(depositAvax) });
      setDepositAvax("");
    } catch { /* invalid */ }
  }

  function handleSetInterval() {
    const d = parseFloat(intervalDays);
    if (isNaN(d) || d < 1) return;
    write("setHarvestInterval", [BigInt(Math.round(d * 86400))]);
  }

  function handleWithdrawPrincipal() {
    if (!withdrawAmt || !withdrawTo) return;
    try {
      write("withdrawPrincipal", [parseEther(withdrawAmt), withdrawTo as `0x${string}`]);
      setWithdrawAmt(""); setWithdrawTo("");
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

  const panels: Panel[] = ["position", "deposit", "auto"];
  const panelLabel: Record<Panel, string> = {
    position: "Position",
    deposit:  "Deposit PHAR",
    auto:     "Auto-Harvest",
  };

  return (
    <div className="card-gold-border rounded-xl overflow-hidden">

      {/* ── Summary row ────────────────────────────────────────────────────── */}
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
            >⎘</button>
            {isController && (
              <span className="text-xs bg-gold-500/15 text-gold-400 border border-gold-500/25 rounded px-1.5 py-0.5">
                Controller
              </span>
            )}
            {autoEnabled && (
              <span className={`text-xs border rounded px-1.5 py-0.5 ${harvestDue ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                {harvestDue ? "Harvest due" : "Auto ✓"}
              </span>
            )}
            {hasPending && !autoEnabled && (
              <span className="text-xs bg-gold-500/15 text-gold-400 border border-gold-500/25 rounded px-1.5 py-0.5">
                Rewards ready
              </span>
            )}
          </div>
          <p className="text-xs text-white/35">Created {formatDate(info.createdAt)}</p>
        </div>

        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-xs text-white/40">Pending</p>
            <p className={`text-sm font-semibold ${hasPending ? "text-green-400" : "text-white/50"}`}>
              {position ? fmt(position.pending) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-white/40">Staked xPHAR</p>
            <p className="text-sm font-semibold text-white">
              {position ? fmt(position.staked) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-white/40">AVAX</p>
            <p className="text-sm text-white/60">{avaxBal !== undefined ? fmt(avaxBal, 18, 3) : "—"}</p>
          </div>
          <span className="text-white/30 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* ── Expanded ───────────────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gold-500/10 px-5 py-4 space-y-5">

          {/* Address grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {([ ["Creator", info.creator], ["Controller", info.controller], ["Yield Receiver", info.yieldReceiver] ] as [string, string][]).map(([label, addr]) => (
              <div key={label} className="space-y-0.5">
                <p className="text-white/40">{label}</p>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-white/80">{shortAddr(addr)}</span>
                  <button className="text-white/25 hover:text-white/60 transition-colors" onClick={() => copyAddr(addr)} title="Copy">⎘</button>
                </div>
              </div>
            ))}
          </div>

          {/* Panel tabs (controller only) */}
          {isController && (
            <div className="flex rounded-lg overflow-hidden border border-gold-500/15 text-xs w-fit">
              {panels.map((p) => (
                <button
                  key={p}
                  onClick={() => setPanel(p)}
                  className={`px-3 py-1.5 transition-colors ${panel === p ? "bg-gold-500/20 text-gold-400" : "text-white/40 hover:text-white/60"}`}
                >
                  {panelLabel[p]}
                </button>
              ))}
            </div>
          )}

          {/* ── Position panel ── */}
          {(!isController || panel === "position") && (
            <div className="space-y-4">
              {position && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {([
                    ["Staked xPHAR",     fmt(position.staked)],
                    ["Principal",        fmt(position.cost)],
                    ["Pending Rewards",  fmt(position.pending), hasPending ? "text-green-400" : ""],
                  ] as [string, string, string?][]).map(([label, val, cls]) => (
                    <div key={label} className="bg-white/3 rounded-lg px-3 py-2.5">
                      <p className="text-xs text-white/40 mb-0.5">{label}</p>
                      <p className={`text-sm font-semibold ${cls ?? "text-white"}`}>{val}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Controller harvest actions */}
              {isController && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-gold px-4 py-2 text-xs"
                      disabled={busy || !hasPending}
                      onClick={() => write("harvestGains")}
                    >
                      Harvest Rewards
                    </button>
                    <button
                      className="btn-outline px-4 py-2 text-xs"
                      disabled={busy || !position || position.staked === BigInt(0)}
                      onClick={() => write("withdrawAll", [address!])}
                    >
                      Withdraw All
                    </button>
                  </div>

                  {/* Partial withdraw */}
                  <div className="space-y-2">
                    <p className="text-xs text-white/50 font-medium">Withdraw Principal (xPHAR)</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="pharaoh-input text-sm"
                        style={{ maxWidth: 160 }}
                        placeholder="xPHAR amount"
                        value={withdrawAmt}
                        onChange={(e) => setWithdrawAmt(e.target.value)}
                      />
                      <input
                        className="pharaoh-input text-sm"
                        style={{ maxWidth: 260 }}
                        placeholder="Recipient 0x…"
                        value={withdrawTo}
                        onChange={(e) => setWithdrawTo(e.target.value)}
                      />
                      <button
                        className="btn-outline px-4 py-2 text-xs"
                        disabled={busy || !withdrawAmt || !withdrawTo}
                        onClick={handleWithdrawPrincipal}
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Non-controller: trigger auto-harvest */}
              {!isController && (
                <>
                  {autoEnabled && harvestDue && hasPending && (
                    <div className="space-y-2">
                      <p className="text-xs text-green-400">
                        Auto-harvest is due — trigger it to send rewards to the beneficiary.
                        {gasRefundWei !== undefined && gasRefundWei > BigInt(0) && (
                          <> You earn <strong>{fmt(gasRefundWei, 18, 4)} AVAX</strong>.</>
                        )}
                      </p>
                      <button className="btn-gold px-4 py-2 text-xs" disabled={busy} onClick={() => write("autoHarvestGains")}>
                        Trigger Auto-Harvest
                      </button>
                    </div>
                  )}
                  {autoEnabled && !harvestDue && nextHarvest && (
                    <p className="text-xs text-white/40">Next auto-harvest in {formatCountdown(nextHarvest)}.</p>
                  )}
                  {!autoEnabled && (
                    <p className="text-xs text-white/35 italic">Auto-harvest not enabled for this vault.</p>
                  )}
                </>
              )}

              {busy     && <p className="text-gold-400 text-xs animate-pulse">{isPending ? "Confirm in wallet…" : "Confirming…"}</p>}
              {isSuccess && <p className="text-green-400 text-xs">Done.</p>}
            </div>
          )}

          {/* ── Deposit PHAR panel (controller only) ── */}
          {isController && panel === "deposit" && (
            <div className="space-y-4">
              <div className="bg-gold-500/5 border border-gold-500/15 rounded-lg px-4 py-3 text-xs text-white/60 space-y-1">
                <p className="text-white/70 font-medium">How it works</p>
                <p>Send PHAR → vault converts to xPHAR (50% slashing penalty) → stakes directly in Pharaoh&apos;s auto-voting gauge → rewards go to your beneficiary.</p>
                <p className="text-gold-400/80">Example: 100 PHAR → 50 xPHAR staked in the auto-voting gauge.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">PHAR Amount</label>
                <div className="flex gap-2 items-center">
                  <input
                    className="pharaoh-input text-sm"
                    style={{ maxWidth: 200 }}
                    placeholder="0.0"
                    type="number"
                    min="0"
                    value={pharInput}
                    onChange={(e) => setPharInput(e.target.value)}
                  />
                  {pharBalance !== undefined && (
                    <button
                      className="text-xs text-gold-400/70 hover:text-gold-400 transition-colors"
                      onClick={() => setPharInput(formatEther(pharBalance))}
                    >
                      Max ({fmt(pharBalance)} PHAR)
                    </button>
                  )}
                </div>
                {pharInputWei > BigInt(0) && (
                  <p className="text-xs text-white/40">
                    ≈ <span className="text-gold-400">{fmt(pharInputWei / BigInt(2))} xPHAR</span> principal after 50% conversion
                  </p>
                )}
              </div>

              <button
                className="btn-gold px-6 py-2 text-sm"
                disabled={busy || pharInputWei === BigInt(0)}
                onClick={handleDepositPhar}
              >
                {needsApproval ? "Approve PHAR (Step 1 / 2)" : "Deposit PHAR (Step 2 / 2)"}
              </button>

              {busy     && <p className="text-gold-400 text-xs animate-pulse">{isPending ? "Confirm in wallet…" : "Confirming…"}</p>}
              {isSuccess && (
                <p className="text-green-400 text-xs">
                  {needsApproval ? "Approved — now click Deposit PHAR." : "Deposited successfully!"}
                </p>
              )}
            </div>
          )}

          {/* ── Auto-Harvest panel (controller only) ── */}
          {isController && panel === "auto" && (
            <div className="space-y-4">
              {/* Status banner */}
              <div className={`rounded-lg px-4 py-3 text-xs border ${autoEnabled ? "bg-green-500/10 border-green-500/20 text-green-300" : "bg-white/5 border-white/10 text-white/50"}`}>
                Auto-harvest is <strong>{autoEnabled ? "ENABLED" : "DISABLED"}</strong>.
                {autoEnabled && nextHarvest && (
                  <> Next harvest in <strong>{formatCountdown(nextHarvest)}</strong>.
                    {gasRefundWei !== undefined && gasRefundWei > BigInt(0) && (
                      <> Bounty: <strong>{fmt(gasRefundWei, 18, 4)} AVAX</strong>.</>
                    )}
                  </>
                )}
              </div>

              {/* Enable / Disable */}
              <div className="flex gap-2">
                <button className="btn-gold px-4 py-2 text-xs"    disabled={busy || autoEnabled === true}  onClick={() => write("setAutoHarvestEnabled", [true])}>Enable</button>
                <button className="btn-outline px-4 py-2 text-xs" disabled={busy || autoEnabled === false} onClick={() => write("setAutoHarvestEnabled", [false])}>Disable</button>
              </div>

              {/* Interval */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Harvest Interval (days)</label>
                <div className="flex gap-2">
                  <input className="pharaoh-input text-sm" style={{ maxWidth: 130 }} type="number" min="1" step="1" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
                  <button className="btn-outline px-3 py-2 text-xs" disabled={busy} onClick={handleSetInterval}>Set</button>
                </div>
                {harvestIntSec !== undefined && (
                  <p className="text-xs text-white/35">Currently: {(Number(harvestIntSec) / 86400).toFixed(0)} days</p>
                )}
              </div>

              {/* Gas bounty */}
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 font-medium">Keeper Bounty (AVAX)</label>
                <div className="flex gap-2">
                  <input className="pharaoh-input text-sm" style={{ maxWidth: 130 }} type="number" min="0" step="0.01" value={refundAvax} onChange={(e) => setRefundAvax(e.target.value)} />
                  <button className="btn-outline px-3 py-2 text-xs" disabled={busy} onClick={() => { try { write("setGasRefund", [parseEther(refundAvax)]); } catch { /* */ } }}>Set</button>
                </div>
                <p className="text-xs text-white/35">AVAX paid to whoever triggers the auto-harvest. Set 0 to disable bounty (anyone can still call it).</p>
              </div>

              {/* AVAX balance + top-up */}
              <div className="bg-gold-500/5 border border-gold-500/15 rounded-lg px-4 py-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Vault AVAX balance</span>
                  <span className="text-gold-400 font-semibold">{avaxBal !== undefined ? fmt(avaxBal, 18, 4) : "—"} AVAX</span>
                </div>
                <div className="flex gap-2">
                  <input className="pharaoh-input text-sm" style={{ maxWidth: 130 }} placeholder="0.5" value={depositAvax} onChange={(e) => setDepositAvax(e.target.value)} />
                  <button className="btn-gold px-3 py-2 text-xs" disabled={!depositAvax || isSending} onClick={handleDepositAvax}>Deposit AVAX</button>
                </div>
              </div>

              {/* Chainlink hint */}
              <div className="text-xs text-white/35 space-y-0.5">
                <p className="text-white/50 font-medium">Chainlink Automation (optional)</p>
                <p>Register this vault at <span className="text-gold-400/70">automation.chain.link</span>. The vault&apos;s <code className="font-mono">checkUpkeep</code> / <code className="font-mono">performUpkeep</code> are already implemented.</p>
              </div>

              {busy     && <p className="text-gold-400 text-xs animate-pulse">{isPending ? "Confirm in wallet…" : "Confirming…"}</p>}
              {isSuccess && <p className="text-green-400 text-xs">Saved.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
