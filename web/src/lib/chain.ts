import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  parseAbiItem,
  parseUnits,
  formatUnits,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import type { Adapter, CreateInput, Mandate, Payment, Snapshot } from "./types";
import { short } from "./format";

const ABI = parseAbi([
  "function createMandate(address agent, address token, uint128 budget, uint128 perTxCap, uint64 vetoWindow, uint64 expiry, string purpose, address[] merchants) returns (uint256)",
  "function topUp(uint256 id, uint128 amount)",
  "function rotateAgent(uint256 id, address newAgent)",
  "function revoke(uint256 id)",
  "function spend(uint256 id, address merchant, uint128 amount, string memo) returns (uint256)",
  "function veto(uint256 paymentId)",
  "function approve(uint256 paymentId)",
  "function release(uint256 paymentId)",
  "function mandatesOfOwner(address) view returns (uint256[])",
  "function mandatesOfAgent(address) view returns (uint256[])",
  "function paymentsOfMandate(uint256) view returns (uint256[])",
  "function getMandate(uint256) view returns ((address owner, address agent, address token, uint128 budget, uint128 spent, uint128 reserved, uint128 perTxCap, uint64 vetoWindow, uint64 expiry, bool revoked, bool allowlistOnly, string purpose))",
  "function getPayment(uint256) view returns ((uint256 mandateId, address merchant, uint128 amount, uint64 createdAt, uint64 releaseAt, uint8 status, string memo))",
  "function merchantAllowed(uint256, address) view returns (bool)",
]);

const ERC20 = parseAbi([
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function faucet()",
]);

const SET_EVENT = parseAbiItem("event MerchantSet(uint256 indexed id, address indexed merchant, bool allowed)");

const env = import.meta.env;
const VAULT = (env.VITE_VAULT_ADDRESS ?? "") as Address;
const TOKEN = (env.VITE_TOKEN_ADDRESS ?? "") as Address;
const CHAIN_ID = Number(env.VITE_CHAIN_ID ?? 421614);
const DEPLOY_BLOCK = BigInt(env.VITE_DEPLOY_BLOCK ?? 0);
const CHAIN: Chain = CHAIN_ID === 42161 ? arbitrum : arbitrumSepolia;

export const liveConfigured = Boolean(VAULT && TOKEN);
export const explorerBase = CHAIN.blockExplorers?.default.url ?? "https://sepolia.arbiscan.io";
export const vaultAddress = VAULT;
export const chainName = CHAIN.name;

type Eth = { request(a: { method: string; params?: unknown[] }): Promise<unknown>; on?(e: string, cb: (...a: any[]) => void): void };
const eth = () => (window as unknown as { ethereum?: Eth }).ethereum;

export function createLiveAdapter(): Adapter {
  const pub = createPublicClient({ chain: CHAIN, transport: http() });
  const listeners = new Set<() => void>();
  let decimals = 6;
  let symbol = "USDG";
  let account: Address | undefined;
  let wrongChain = false;
  let busy: string | undefined;
  let loaded: Pick<Snapshot, "mandates" | "payments" | "balance"> = { mandates: [], payments: [], balance: undefined };
  let snap: Snapshot = build();

  function build(): Snapshot {
    return {
      ...loaded,
      blocked: [],
      now: Math.floor(Date.now() / 1000),
      symbol,
      account,
      busy,
      wrongChain,
      configured: liveConfigured,
    };
  }
  const emit = () => {
    snap = build();
    listeners.forEach((l) => l());
  };
  const num = (v: bigint) => Number(formatUnits(v, decimals));
  const units = (n: number) => parseUnits(String(n), decimals);

  const wallet = () => {
    const e = eth();
    if (!e) throw new Error("No wallet found. Install MetaMask or Rabby to use live mode.");
    return createWalletClient({ chain: CHAIN, transport: custom(e as never) });
  };

  async function checkChain() {
    const id = (await eth()?.request({ method: "eth_chainId" })) as string | undefined;
    wrongChain = id ? parseInt(id, 16) !== CHAIN_ID : false;
  }

  async function refresh() {
    if (!liveConfigured || !account) return emit();
    try {
      const [ownerIds, agentIds, bal] = await Promise.all([
        pub.readContract({ address: VAULT, abi: ABI, functionName: "mandatesOfOwner", args: [account] }),
        pub.readContract({ address: VAULT, abi: ABI, functionName: "mandatesOfAgent", args: [account] }),
        pub.readContract({ address: TOKEN, abi: ERC20, functionName: "balanceOf", args: [account] }),
      ]);
      const ids = [...new Set([...ownerIds, ...agentIds].map((x) => x.toString()))];
      const mandates: Mandate[] = [];
      const payments: Payment[] = [];
      await Promise.all(
        ids.map(async (sid) => {
          const id = BigInt(sid);
          const [m, pids, logs] = await Promise.all([
            pub.readContract({ address: VAULT, abi: ABI, functionName: "getMandate", args: [id] }),
            pub.readContract({ address: VAULT, abi: ABI, functionName: "paymentsOfMandate", args: [id] }),
            pub.getLogs({ address: VAULT, event: SET_EVENT, args: { id }, fromBlock: DEPLOY_BLOCK }).catch(() => []),
          ]);
          const merchants = [...new Set(logs.map((l) => l.args.merchant as Address))];
          const flags = await Promise.all(
            merchants.map((a) => pub.readContract({ address: VAULT, abi: ABI, functionName: "merchantAllowed", args: [id, a] })),
          );
          mandates.push({
            id: sid,
            owner: m.owner,
            agent: m.agent,
            agentName: short(m.agent),
            purpose: m.purpose,
            budget: num(m.budget),
            spent: num(m.spent),
            reserved: num(m.reserved),
            perTxCap: num(m.perTxCap),
            vetoWindow: Number(m.vetoWindow),
            expiry: Number(m.expiry),
            revoked: m.revoked,
            allowlistOnly: m.allowlistOnly,
            allowlist: merchants.filter((_, i) => flags[i]).map((a) => ({ address: a, name: short(a) })),
          });
          const ps = await Promise.all(pids.map((pid) => pub.readContract({ address: VAULT, abi: ABI, functionName: "getPayment", args: [pid] }).then((p) => ({ pid, p }))));
          ps.forEach(({ pid, p }) =>
            payments.push({
              id: pid.toString(),
              mandateId: sid,
              merchant: p.merchant,
              merchantName: short(p.merchant),
              amount: num(p.amount),
              createdAt: Number(p.createdAt),
              releaseAt: Number(p.releaseAt),
              status: (["pending", "released", "vetoed"] as const)[p.status],
              memo: p.memo,
            }),
          );
        }),
      );
      mandates.sort((a, b) => Number(b.id) - Number(a.id));
      payments.sort((a, b) => b.createdAt - a.createdAt);
      loaded = { mandates, payments, balance: num(bal) };
    } catch (e) {
      console.error("refresh failed", e);
    }
    emit();
  }

  async function init() {
    if (!liveConfigured) return;
    try {
      [decimals, symbol] = await Promise.all([
        pub.readContract({ address: TOKEN, abi: ERC20, functionName: "decimals" }).then(Number),
        pub.readContract({ address: TOKEN, abi: ERC20, functionName: "symbol" }),
      ]);
    } catch {
      /* keep defaults */
    }
    const e = eth();
    if (e) {
      const accs = (await e.request({ method: "eth_accounts" })) as Address[];
      account = accs[0];
      await checkChain();
      e.on?.("accountsChanged", (a: Address[]) => {
        account = a[0];
        loaded = { mandates: [], payments: [], balance: undefined };
        void refresh();
      });
      e.on?.("chainChanged", () => void checkChain().then(refresh));
    }
    await refresh();
  }
  void init();
  setInterval(() => {
    if (account && !busy) void refresh();
    else emit();
  }, 5000);
  setInterval(emit, 1000);

  async function tx<T extends Hex | undefined>(label: string, run: (a: Address) => Promise<T>) {
    if (!account) throw new Error("Connect your wallet first");
    busy = label;
    emit();
    try {
      await switchChain();
      const hash = await run(account);
      if (hash) await pub.waitForTransactionReceipt({ hash });
    } finally {
      busy = undefined;
      await checkChain();
      await refresh();
    }
  }

  async function switchChain() {
    await checkChain();
    if (!wrongChain) return;
    const hex = `0x${CHAIN_ID.toString(16)}`;
    try {
      await eth()?.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch {
      await eth()?.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: CHAIN.name,
            nativeCurrency: CHAIN.nativeCurrency,
            rpcUrls: [CHAIN.rpcUrls.default.http[0]],
            blockExplorerUrls: [explorerBase],
          },
        ],
      });
    }
    await checkChain();
  }

  const write = (a: Address, address: Address, abi: typeof ABI | typeof ERC20, functionName: string, args: unknown[]) =>
    wallet().writeContract({ account: a, address, abi: abi as never, functionName: functionName as never, args: args as never });

  return {
    mode: "live",
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot: () => snap,
    async connect() {
      const e = eth();
      if (!e) throw new Error("No wallet found. Install MetaMask or Rabby to use live mode.");
      const accs = (await e.request({ method: "eth_requestAccounts" })) as Address[];
      account = accs[0];
      await switchChain();
      await refresh();
    },
    async faucet() {
      await tx("Requesting test funds", (a) => write(a, TOKEN, ERC20, "faucet", []));
    },
    async createMandate(i: CreateInput) {
      const agent = (i.agent || account) as Address;
      const budget = units(i.budget);
      await tx("Approving token", (a) => write(a, TOKEN, ERC20, "approve", [VAULT, budget]));
      await tx("Creating mandate", (a) =>
        write(a, VAULT, ABI, "createMandate", [
          agent,
          TOKEN,
          budget,
          units(i.perTxCap),
          BigInt(i.vetoWindow),
          BigInt(Math.floor(Date.now() / 1000) + i.expiryDays * 86400),
          i.purpose,
          i.merchants as Address[],
        ]),
      );
    },
    veto: (id) => tx("Vetoing payment", (a) => write(a, VAULT, ABI, "veto", [BigInt(id)])),
    approve: (id) => tx("Approving payment", (a) => write(a, VAULT, ABI, "approve", [BigInt(id)])),
    release: (id) => tx("Releasing payment", (a) => write(a, VAULT, ABI, "release", [BigInt(id)])),
    revoke: (id) => tx("Revoking mandate", (a) => write(a, VAULT, ABI, "revoke", [BigInt(id)])),
    async topUp(id, amount) {
      const v = units(amount);
      await tx("Approving token", (a) => write(a, TOKEN, ERC20, "approve", [VAULT, v]));
      await tx("Topping up", (a) => write(a, VAULT, ABI, "topUp", [BigInt(id), v]));
    },
    rotateAgent: (id, agent) => tx("Rotating agent key", (a) => write(a, VAULT, ABI, "rotateAgent", [BigInt(id), agent])),
    spend: (id, merchant, amount, memo) =>
      tx("Submitting payment", (a) => write(a, VAULT, ABI, "spend", [BigInt(id), merchant, units(amount), memo])),
  };
}
