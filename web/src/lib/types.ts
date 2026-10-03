export type Status = "pending" | "released" | "vetoed";

export interface Mandate {
  id: string;
  owner: string;
  agent: string;
  agentName: string;
  purpose: string;
  budget: number;
  spent: number;
  reserved: number;
  perTxCap: number;
  vetoWindow: number;
  expiry: number;
  revoked: boolean;
  allowlist: { address: string; name: string }[];
  allowlistOnly: boolean;
}

export interface Payment {
  id: string;
  mandateId: string;
  merchant: string;
  merchantName: string;
  amount: number;
  createdAt: number;
  releaseAt: number;
  status: Status;
  memo: string;
}

export interface Blocked {
  id: string;
  mandateId: string;
  agentName: string;
  merchantName: string;
  amount: number;
  reason: string;
  at: number;
}

export interface Snapshot {
  mandates: Mandate[];
  payments: Payment[];
  blocked: Blocked[];
  now: number;
  symbol: string;
  account?: string;
  balance?: number;
  busy?: string;
  configured: boolean;
  wrongChain?: boolean;
}

export interface CreateInput {
  agent?: string;
  agentName?: string;
  purpose: string;
  budget: number;
  perTxCap: number;
  vetoWindow: number;
  expiryDays: number;
  merchants: string[];
}

export interface Adapter {
  mode: "demo" | "live";
  subscribe(cb: () => void): () => void;
  getSnapshot(): Snapshot;
  connect?(): Promise<void>;
  faucet?(): Promise<void>;
  createMandate(i: CreateInput): Promise<void>;
  veto(paymentId: string): Promise<void>;
  approve(paymentId: string): Promise<void>;
  release(paymentId: string): Promise<void>;
  revoke(mandateId: string): Promise<void>;
  topUp(mandateId: string, amount: number): Promise<void>;
  rotateAgent(mandateId: string, agent: string): Promise<void>;
  spend(mandateId: string, merchant: string, amount: number, memo: string): Promise<void>;
  simulateAgent?(mandateId: string): void;
}
