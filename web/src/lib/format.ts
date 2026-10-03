import type { Mandate, Payment } from "./types";

export const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export const usd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export function dur(sec: number) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60 ? ` ${sec % 60}s` : ""}`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60) ? ` ${Math.floor((sec % 3600) / 60)}m` : ""}`;
  return `${Math.floor(sec / 86400)}d${Math.floor((sec % 86400) / 3600) ? ` ${Math.floor((sec % 86400) / 3600)}h` : ""}`;
}

export function ago(ts: number, now: number) {
  const d = now - ts;
  return d < 5 ? "just now" : `${dur(d)} ago`;
}

/** Plain-language reasons a payment deserves a second look. */
export function risks(p: Payment, m: Mandate, all: Payment[]): string[] {
  const out: string[] = [];
  const mine = all.filter((x) => x.mandateId === p.mandateId);
  const seen = mine.some((x) => x.merchant === p.merchant && x.createdAt < p.createdAt && x.status !== "vetoed");
  if (!seen) out.push("First payment to this merchant");
  if (p.amount >= m.perTxCap * 0.8) out.push("Close to the per-purchase cap");
  if (mine.filter((x) => x.createdAt <= p.createdAt && p.createdAt - x.createdAt < 120).length >= 4) out.push("Burst of payments");
  if (all.some((x) => x.merchant === p.merchant && x.status === "vetoed")) out.push("You vetoed this merchant before");
  return out;
}

export const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s.trim());
