"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header() {
  return (
    <header className="border-b border-gold-500/10 bg-pharaoh-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Ankh icon as SVG */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-gold-500">
            <circle cx="14" cy="8" r="4.5" stroke="currentColor" strokeWidth="2" />
            <line x1="14" y1="12.5" x2="14" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="8" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="font-bold text-lg tracking-tight text-white">
            Living<span className="text-gold-500">Trust</span>
          </span>
        </div>

        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus="avatar"
        />
      </div>
    </header>
  );
}
