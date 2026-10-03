# Mandate

**Chargebacks for AI agents.** Give your agent a budget, not your keys.

Mandate is a non-custodial payment vault on [Arbitrum](https://arbitrum.io) that lets autonomous agents spend money without the usual all-or-nothing trust. You fund a *mandate* with hard limits. Every payment the agent proposes waits in a *veto window* before it settles, and until that window closes you can reverse it with one transaction.

> Built for [Arbitrum Open House Singapore](https://openhouse.arbitrum.io/), Online Buildathon, 2026.

---

## The problem

Agents are learning to shop, book travel, buy compute and pay for APIs. The payment options available to them today are all bad:

| Option | What goes wrong |
| --- | --- |
| Give the agent a hot wallet | One prompt injection or leaked key drains everything in it. |
| Approve every purchase by hand | You become the bottleneck, and the agent is no longer autonomous. |
| Rely on spending limits alone | Limits cap the damage but never undo it, and a bad payment is final. |

Cards solved this for humans with chargebacks. Stablecoin rails have nothing equivalent, and software that spends on your behalf needs it more than people do.

## How Mandate works

1. **Fund a mandate.** The owner escrows a budget and sets a per-purchase cap, an expiry, a veto window and, optionally, an allowlist of merchants.
2. **The agent proposes.** The agent calls `spend(mandateId, merchant, amount, memo)`. The contract checks every rule, reserves the funds and starts the veto window. The agent never holds the money.
3. **The owner has the final say.** Inside the window the owner can `veto` (funds return to the mandate) or `approve` (settle immediately). The interface flags unusual payments: first-time merchants, amounts near the cap, bursts and previously vetoed merchants.
4. **Settlement is permissionless.** Once the window passes, anyone can call `release` to pay the merchant. No keeper, no dependency on the owner being online.

The worst case for a compromised agent is bounded by the budget, the cap and a single window. The owner can also `revoke` a mandate (refunding everything not already in flight) or `rotateAgent` to swap a leaked key.

## Features

- **Budget and per-purchase cap**, enforced on-chain and counting funds already in flight.
- **Veto windows** from one minute to seven days.
- **Merchant allowlists** that make any other recipient revert.
- **Instant revoke** with an immediate refund of the free balance. Vetoes on a revoked mandate refund straight to the owner.
- **Agent key rotation** that leaves pending payments and funds untouched.
- **On-chain memos** so every payment carries the agent's stated reason.
- **Merchant reputation counters** (released, vetoed, volume) readable by anyone.
- **Any ERC-20 stablecoin**, including USDG and USDC.

## Deployments

Live on **Arbitrum Sepolia** (chain ID 421614):

| Contract | Address |
| --- | --- |
| MandateVault | [`0x6Ef26EA309C444942ae2af1C692D168c72097D98`](https://sepolia.arbiscan.io/address/0x6Ef26EA309C444942ae2af1C692D168c72097D98) |
| MockUSDG (test token with faucet) | [`0x522044D3806C93e23686901Fe56518c9090F68B5`](https://sepolia.arbiscan.io/address/0x522044D3806C93e23686901Fe56518c9090F68B5) |

## Repository layout

```
contracts/   MandateVault.sol (core), MockUSDG.sol (testnet token with faucet)
test/        Hardhat test suite for the vault
scripts/     Deployment script
web/         React + TypeScript + Vite application (landing page, dashboard, live and demo modes)
```

## Interface

The web app has two modes:

- **Interactive demo.** A faithful in-browser simulation of the vault with two agents spending in real time. It shows veto countdowns, allowlist rejections and risk flags without needing a wallet.
- **Arbitrum.** Connects an injected wallet (MetaMask, Rabby and others) to the deployed contract. Create mandates, act as the agent for testing, veto, approve, top up, rotate keys and revoke.

## Running it

Requirements: Node.js 20 or later.

```bash
# contracts
npm install
npm test

# web app
cd web
npm install
npm run dev
```

### Deploying the contracts

```bash
cp .env.example .env        # add DEPLOYER_PRIVATE_KEY
npm run deploy:sepolia
```

The script deploys `MandateVault` (plus `MockUSDG` unless `TOKEN_ADDRESS` is set) and writes `web/.env.production.local` so the app points at the new deployment. To use a real stablecoin on Arbitrum One, set `TOKEN_ADDRESS` and run `npm run deploy:one`.

### Deploying the web app

The `web` folder is a standard Vite project and deploys to Vercel, Netlify or any static host.

```bash
cd web
npm run build
```

Set `VITE_VAULT_ADDRESS`, `VITE_TOKEN_ADDRESS`, `VITE_CHAIN_ID` and `VITE_DEPLOY_BLOCK` in the host's environment to enable the on-chain mode. Without them the app runs the interactive demo and shows a clear notice in the on-chain tab.

## Integrating an agent

The agent only ever needs gas and the `spend` function. Funds stay in the vault.

```ts
import { getContract, parseUnits } from "viem";

const vault = getContract({ address: MANDATE_VAULT, abi, client });

await vault.write.spend([
  mandateId,
  merchant,
  parseUnits("42.50", 6),
  "A100 hours for fine-tune #14",
]);
```

## Security model

- The vault has **no owner, no admin keys and no upgrade path**.
- State-changing functions are guarded against reentrancy and use `SafeERC20`.
- A payment can only be vetoed before `releaseAt` and only settled after it, except for an owner `approve`.
- Fee-on-transfer and rebasing tokens are not supported.
- The contract has not been independently audited. Treat it as hackathon-grade code and use small amounts.

## Testing

```bash
npm test
```

The suite covers escrow on creation, parameter validation, window enforcement, veto and early approval, cap and budget accounting with funds in flight, allowlists, expiry, revoke semantics, key rotation, top-ups and indexing.

## Roadmap

- Merchant dashboard with incoming payments and settlement previews.
- Policy modules: velocity limits, category rules and co-signers for large payments.
- Session-key and smart-account integrations so the agent's wallet needs no gas at all.
- Notifications through push and messaging apps when a flagged payment enters its window.
- Cross-agent reputation built from released and vetoed history.

## License

MIT. See [LICENSE](LICENSE).
