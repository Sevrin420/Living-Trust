"use client";

import { Header }      from "@/components/Header";
import { CreateVault } from "@/components/CreateVault";
import { VaultList }   from "@/components/VaultList";
import { useAccount }  from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Create a Trust Vault",
    desc:  "Set a controller (trustee) who manages the vault and a yield receiver (beneficiary) who receives monthly gains. The creator doesn't need to be either.",
  },
  {
    step: "02",
    title: "Deposit PHAR",
    desc:  "Send PHAR to the vault. It is automatically converted to xPHAR (50% lock-in) and deposited into Pharaoh's P33 auto-compounding vault.",
  },
  {
    step: "03",
    title: "Harvest Gains Monthly",
    desc:  "As the xPHAR-per-share ratio grows, the vault skims only the appreciation above your original principal and forwards it to the beneficiary wallet.",
  },
];

export default function Home() {
  const { isConnected, address } = useAccount();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {!isConnected ? (
        /* ── Landing page ─────────────────────────────────────────────────── */
        <main className="flex-1 flex flex-col items-center px-4">
          {/* Hero */}
          <section className="flex flex-col items-center text-center gap-6 pt-24 pb-16 max-w-2xl">
            {/* Ankh mark */}
            <div className="w-16 h-16 flex items-center justify-center rounded-full bg-gold-500/10 border border-gold-500/20">
              <svg width="36" height="36" viewBox="0 0 28 28" fill="none" className="text-gold-500">
                <circle cx="14" cy="8" r="4.5" stroke="currentColor" strokeWidth="2" />
                <line x1="14" y1="12.5" x2="14" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="8"  y1="17"  x2="20" y2="17"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>

            <div className="space-y-3">
              <h1 className="text-5xl font-bold tracking-tight leading-tight">
                <span className="text-gold-500">xPHAR</span> Living Trusts
              </h1>
              <p className="text-white/60 text-lg leading-relaxed">
                Non-custodial yield vaults on{" "}
                <span className="text-gold-400">Pharaoh Exchange</span>. Deposit PHAR,
                auto-compound inside P33, and stream gains to any beneficiary wallet — forever.
              </p>
            </div>

            <div className="pt-2">
              <ConnectButton label="Connect Wallet to Get Started" />
            </div>

            <p className="text-xs text-white/25">Avalanche C-Chain · Non-custodial · Powered by Pharaoh V3</p>
          </section>

          {/* How it works */}
          <section className="w-full max-w-4xl pb-20">
            <h2 className="text-center text-sm font-semibold text-white/40 uppercase tracking-widest mb-6">
              How it works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step} className="card-gold-border rounded-xl p-5 space-y-2">
                  <span className="text-gold-500 font-mono text-sm">{item.step}</span>
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p className="text-white/55 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      ) : (
        /* ── Dashboard ────────────────────────────────────────────────────── */
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 space-y-8">

          {/* Welcome bar */}
          <section className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Dashboard</h1>
              <p className="text-xs text-white/40 mt-0.5">
                Connected as{" "}
                <span className="font-mono text-gold-400/80">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
              </p>
            </div>
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
          </section>

          {/* Create vault */}
          <CreateVault />

          {/* Vault list */}
          <VaultList />
        </main>
      )}

      <footer className="text-center text-white/20 text-xs py-6">
        Living Trust · Pharaoh Exchange · Avalanche
      </footer>
    </div>
  );
}
