"use client";

import { useState } from "react";
import { useReadContract, useAccount, useChainId } from "wagmi";
import { FACTORY_ADDRESS, FACTORY_ABI } from "@/config/contracts";
import { VaultCard } from "./VaultCard";

type Tab = "mine" | "all";

interface VaultInfo {
  vault: `0x${string}`;
  creator: `0x${string}`;
  controller: `0x${string}`;
  yieldReceiver: `0x${string}`;
  createdAt: bigint;
}

export function VaultList() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [tab, setTab] = useState<Tab>("mine");

  const factoryAddress = FACTORY_ADDRESS[chainId];
  const isDeployed = factoryAddress !== "0x0000000000000000000000000000000000000000";

  const { data: myVaults, isLoading: loadingMine } = useReadContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "getVaultsByController",
    args: address ? [address] : undefined,
    query: { enabled: isConnected && isDeployed && tab === "mine" && !!address },
  });

  const { data: allVaults, isLoading: loadingAll } = useReadContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "getAllVaults",
    query: { enabled: isDeployed && tab === "all" },
  });

  const vaults = (tab === "mine" ? myVaults : allVaults) as VaultInfo[] | undefined;
  const isLoading = tab === "mine" ? loadingMine : loadingAll;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Vaults</h2>

        <div className="flex rounded-lg overflow-hidden border border-gold-500/20 text-sm">
          {(["mine", "all"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 transition-colors ${
                tab === t
                  ? "bg-gold-500/20 text-gold-400"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "mine" ? "My Vaults" : "All Vaults"}
            </button>
          ))}
        </div>
      </div>

      {!isDeployed ? (
        <div className="card-gold-border rounded-xl p-6 text-center text-white/40 text-sm">
          Factory not deployed on this network.
        </div>
      ) : tab === "mine" && !isConnected ? (
        <div className="card-gold-border rounded-xl p-6 text-center text-white/40 text-sm">
          Connect your wallet to see vaults you control.
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="card-gold-border rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : !vaults || vaults.length === 0 ? (
        <div className="card-gold-border rounded-xl p-6 text-center text-white/40 text-sm">
          {tab === "mine"
            ? "No vaults where you are the controller yet."
            : "No vaults have been created yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {vaults.map((v) => (
            <VaultCard key={v.vault} info={v} />
          ))}
        </div>
      )}
    </section>
  );
}
