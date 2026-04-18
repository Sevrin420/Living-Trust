"use client";

import { Header } from "@/components/Header";
import { CreateVault } from "@/components/CreateVault";
import { VaultList } from "@/components/VaultList";
import { useAccount } from "wagmi";

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-10 space-y-12">
        {/* Hero */}
        <section className="text-center space-y-4 pt-4">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-gold-500">xPHAR</span> Living Trusts
          </h1>
          <p className="text-white/60 max-w-xl mx-auto text-base leading-relaxed">
            Deploy non-custodial vaults that stake your xPHAR on{" "}
            <span className="text-gold-400">Pharaoh Exchange</span>, claim yield automatically,
            and forward it to any designated wallet — controlled by a trustee of your choice.
          </p>
        </section>

        {/* How it works */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: "01",
              title: "Create a Vault",
              desc: "Set a controller (trustee) and a yield receiver (beneficiary). The creator wallet doesn't need to be either.",
            },
            {
              step: "02",
              title: "Deposit xPHAR",
              desc: "Send xPHAR directly to the vault address. The controller then stakes it in Pharaoh's gauge to start earning.",
            },
            {
              step: "03",
              title: "Claim & Forward",
              desc: "The controller calls Claim Yield at any time. All accumulated rewards are sent straight to the beneficiary wallet.",
            },
          ].map((item) => (
            <div key={item.step} className="card-gold-border rounded-xl p-5 space-y-2">
              <span className="text-gold-500 font-mono text-sm">{item.step}</span>
              <h3 className="font-semibold text-white">{item.title}</h3>
              <p className="text-white/55 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </section>

        {/* Create vault form */}
        {isConnected ? (
          <CreateVault />
        ) : (
          <div className="card-gold-border rounded-xl p-8 text-center">
            <p className="text-white/50">Connect your wallet to create or manage vaults.</p>
          </div>
        )}

        {/* Vault list */}
        <VaultList />
      </main>

      <footer className="text-center text-white/25 text-xs py-6">
        Living Trust · Powered by Pharaoh Exchange on Avalanche
      </footer>
    </div>
  );
}
