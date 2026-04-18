import { formatUnits } from "viem";

export function fmt(value: bigint | undefined, decimals = 18, digits = 4): string {
  if (value === undefined) return "—";
  const num = parseFloat(formatUnits(value, decimals));
  if (num === 0) return "0";
  if (num < 0.0001) return "< 0.0001";
  return num.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatDate(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
