import type { Adapter, Blocked, CreateInput, Mandate, Payment, Snapshot } from "./types";

const nowSec = () => Math.floor(Date.now() / 1000);

function addr(seed: string) {
  let h = 2166136261;
  let out = "0x";
  for (let i = 0; out.length < 42; i++) {
    h = Math.imul(h ^ (seed.charCodeAt(i % seed.length) + i), 16777619) >>> 0;
    out += (h & 0xf).toString(16) + ((h >>> 8) & 0xf).toString(16);
  }
  return out.slice(0, 42);
}

const M = (name: string) => ({ name, address: addr(name) });
const lambda = M("Lambda GPU Cloud");
const arxiv = M("Semantic Scholar API");
const hf = M("Hugging Face Pro");
const notion = M("Notion Team");
const sk = M("Skyline Airways");
const lodge = M("Harbor & Pine Hotels");
const ride = M("Metro Rail Pass");
const rogue = M("tokn-airdrop.xyz");

interface Idea {
  m: { name: string; address: string };
  memo: string;
  min: number;
  max: number;
  bad?: boolean;
}

const CATALOG: Record<string, Idea[]> = {
  "1": [
    { m: lambda, memo: "A100 hours for fine-tuning run #14", min: 38, max: 74 },
    { m: arxiv, memo: "Bulk citation graph export, 2.1M edges", min: 12, max: 29 },
    { m: hf, memo: "Inference endpoint, 24h", min: 18, max: 41 },
    { m: notion, memo: "Seat for new research collaborator", min: 8, max: 16 },
    { m: rogue, memo: "URGENT: claim bonus credits before they expire", min: 92, max: 118, bad: true },
  ],
  "2": [
    { m: sk, memo: "SFO → SIN, Oct 22, economy flex", min: 380, max: 560 },
    { m: lodge, memo: "3 nights near Marina Bay, refundable", min: 310, max: 520 },
    { m: ride, memo: "Singapore 3-day tourist pass", min: 22, max: 34 },
    { m: rogue, memo: "Premium lounge upgrade (limited offer)", min: 140, max: 320, bad: true },
  ],
};

const rnd = (a: number, b: number) => Math.round((a + Math.random() * (b - a)) * 100) / 100;
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function createDemoAdapter(): Adapter {
  const t0 = nowSec();
  const owner = addr("demo-owner");
  let seq = 100;
  const listeners = new Set<() => void>();

  const mandates: Mandate[] = [
    {
      id: "1",
      owner,
      agent: addr("atlas"),
      agentName: "Atlas",
      purpose: "Research assistant: papers, datasets and compute credits",
      budget: 500,
      spent: 0,
      reserved: 0,
      perTxCap: 120,
      vetoWindow: 40,
      expiry: t0 + 7 * 86400,
      revoked: false,
      allowlist: [],
      allowlistOnly: false,
    },
    {
      id: "2",
      owner,
      agent: addr("voyager"),
      agentName: "Voyager",
      purpose: "Travel concierge: flights and hotels for the Singapore trip",
      budget: 1800,
      spent: 0,
      reserved: 0,
      perTxCap: 600,
      vetoWindow: 55,
      expiry: t0 + 14 * 86400,
      revoked: false,
      allowlist: [sk, lodge, ride].map((x) => ({ address: x.address, name: x.name })),
      allowlistOnly: true,
    },
  ];

  const payments: Payment[] = [];
  const blocked: Blocked[] = [];

  const history = (mid: string, m: Idea["m"], memo: string, amount: number, minsAgo: number, status: Payment["status"]) => {
    const createdAt = t0 - minsAgo * 60;
    payments.push({
      id: String(++seq),
      mandateId: mid,
      merchant: m.address,
      merchantName: m.name,
      amount,
      createdAt,
      releaseAt: createdAt + 40,
      status,
      memo,
    });
    const md = mandates.find((x) => x.id === mid)!;
    if (status === "released") md.spent += amount;
  };
  history("1", lambda, "A100 hours for fine-tuning run #13", 61.2, 190, "released");
  history("1", hf, "Inference endpoint, 24h", 24.5, 140, "released");
  history("1", rogue, "Claim bonus credits (limited time)", 99, 96, "vetoed");
  history("1", arxiv, "Dataset licence: CORE-2026", 18, 61, "released");
  history("2", ride, "Singapore 3-day tourist pass", 27, 75, "released");

  let snap: Snapshot = build();

  function build(): Snapshot {
    return {
      mandates: mandates.map((m) => ({ ...m, allowlist: [...m.allowlist] })),
      payments: [...payments].sort((a, b) => b.createdAt - a.createdAt),
      blocked: [...blocked].sort((a, b) => b.at - a.at).slice(0, 12),
      now: nowSec(),
      symbol: "USDG",
      configured: true,
      account: owner,
      balance: 2500,
    };
  }
  const emit = () => {
    snap = build();
    listeners.forEach((l) => l());
  };

  const avail = (m: Mandate) => Math.round((m.budget - m.spent - m.reserved) * 100) / 100;
  const byId = (id: string) => mandates.find((m) => m.id === id)!;
  const pay = (id: string) => payments.find((p) => p.id === id)!;

  function propose(mid: string, merchant: { name: string; address: string }, amount: number, memo: string, simulated: boolean) {
    const m = byId(mid);
    const reject = (reason: string) => {
      if (!simulated) throw new Error(reason);
      blocked.push({ id: String(++seq), mandateId: mid, agentName: m.agentName, merchantName: merchant.name, amount, reason, at: nowSec() });
      emit();
    };
    if (m.revoked || nowSec() >= m.expiry) return reject("Mandate is no longer active");
    if (amount > m.perTxCap) return reject(`Over the ${m.perTxCap} per-purchase cap`);
    if (amount > avail(m)) return reject("Over remaining budget");
    if (m.allowlistOnly && !m.allowlist.some((a) => a.address.toLowerCase() === merchant.address.toLowerCase()))
      return reject("Merchant is not on the allowlist");
    const createdAt = nowSec();
    m.reserved += amount;
    payments.push({
      id: String(++seq),
      mandateId: mid,
      merchant: merchant.address,
      merchantName: merchant.name,
      amount,
      createdAt,
      releaseAt: createdAt + m.vetoWindow,
      status: "pending",
      memo,
    });
    emit();
  }

  function settle(p: Payment) {
    const m = byId(p.mandateId);
    p.status = "released";
    m.reserved = Math.max(0, m.reserved - p.amount);
    m.spent += p.amount;
  }

  function simulate(mid: string) {
    const m = byId(mid);
    if (m.revoked || nowSec() >= m.expiry) return;
    const open = payments.filter((p) => p.mandateId === mid && p.status === "pending").length;
    if (open >= 3) return;
    const idea = pick(CATALOG[mid] ?? CATALOG["1"]);
    const chance = idea.bad ? 0.35 : 1;
    if (Math.random() > chance) return simulate(mid);
    propose(mid, idea.m, rnd(idea.min, Math.min(idea.max, m.perTxCap + (idea.bad ? 40 : 0))), idea.memo, true);
  }

  // Settlement clock and agent behaviour.
  let tick = 0;
  setInterval(() => {
    tick++;
    const t = nowSec();
    payments.forEach((p) => {
      if (p.status === "pending" && t >= p.releaseAt) settle(p);
    });
    if (tick % 13 === 0) mandates.forEach((m) => simulate(m.id));
    emit();
  }, 1000);
  setTimeout(() => simulate("1"), 600);
  setTimeout(() => simulate("2"), 2500);

  const busy = async () => new Promise((r) => setTimeout(r, 350));

  return {
    mode: "demo",
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot: () => snap,
    async createMandate(i: CreateInput) {
      await busy();
      const agentName = i.agentName?.trim() || "New agent";
      mandates.push({
        id: String(mandates.length + 1),
        owner,
        agent: i.agent && /^0x[a-fA-F0-9]{40}$/.test(i.agent) ? i.agent : addr(agentName + Date.now()),
        agentName,
        purpose: i.purpose,
        budget: i.budget,
        spent: 0,
        reserved: 0,
        perTxCap: i.perTxCap,
        vetoWindow: i.vetoWindow,
        expiry: nowSec() + i.expiryDays * 86400,
        revoked: false,
        allowlist: i.merchants.map((a) => ({ address: a, name: a.slice(0, 8) })),
        allowlistOnly: i.merchants.length > 0,
      });
      CATALOG[String(mandates.length)] = CATALOG["1"];
      emit();
    },
    async veto(id) {
      await busy();
      const p = pay(id);
      if (p.status !== "pending" || nowSec() >= p.releaseAt) throw new Error("The veto window has closed");
      const m = byId(p.mandateId);
      p.status = "vetoed";
      m.reserved = Math.max(0, m.reserved - p.amount);
      if (m.revoked) m.budget -= p.amount;
      emit();
    },
    async approve(id) {
      await busy();
      const p = pay(id);
      if (p.status === "pending") settle(p);
      emit();
    },
    async release(id) {
      const p = pay(id);
      if (p.status === "pending" && nowSec() >= p.releaseAt) settle(p);
      emit();
    },
    async revoke(id) {
      await busy();
      const m = byId(id);
      m.revoked = true;
      m.budget = m.spent + m.reserved;
      emit();
    },
    async topUp(id, amount) {
      await busy();
      byId(id).budget += amount;
      emit();
    },
    async rotateAgent(id, a) {
      await busy();
      const m = byId(id);
      m.agent = a;
      emit();
    },
    async spend(mid, merchant, amount, memo) {
      propose(mid, { name: merchant.slice(0, 8), address: merchant }, amount, memo, false);
    },
    simulateAgent: simulate,
  };
}
