import { LiveFeed } from "./Feed";
import { demo, useSnapshot } from "../lib/store";
import { usd } from "../lib/format";

const REPO = "https://github.com/victorhez/mandate";

function Hero({ go }: { go: () => void }) {
  useSnapshot(demo);
  return (
    <div className="wrap hero">
      <div>
        <span className="eyebrow"><b>NEW</b> Agentic commerce, with an undo button</span>
        <h1>Give your agent a <em>budget</em>, not your keys.</h1>
        <p className="lead">
          Mandate is a spending leash for AI agents on Arbitrum. Every payment waits in a <b>veto window</b>. If your agent is wrong, hacked or just confused, you claw the money back with one tap.
        </p>
        <div className="cta">
          <button className="btn primary lg" onClick={go}>Open the app →</button>
          <a className="btn lg" href="#how">How it works</a>
        </div>
        <div className="proof">
          <div><strong>0</strong>keys with custody of your funds</div>
          <div><strong>1 tap</strong>to reverse any pending payment</div>
          <div><strong>&lt; 1¢</strong>per payment on Arbitrum</div>
        </div>
      </div>
      <LiveFeed adapter={demo} />
    </div>
  );
}

const PROBLEMS = [
  { i: "01", t: "A hot wallet is all or nothing", d: "To let an agent pay for things today, you hand it a key. One prompt injection and everything in that wallet is gone." },
  { i: "02", t: "Approval prompts kill autonomy", d: "The safe alternative is clicking Approve on every purchase. At that point you are the agent and the agent is a typist." },
  { i: "03", t: "On-chain payments are final", d: "Cards have chargebacks. Stablecoins do not. Nobody has built the missing grace period for software that spends on your behalf." },
];

const STEPS = [
  { t: "Fund a mandate", d: "Set a budget, a per-purchase cap, an expiry and, optionally, the merchants your agent may pay. Funds are escrowed in the vault." },
  { t: "Agent proposes", d: "The agent submits a payment with a memo explaining why. The contract checks every rule before accepting it." },
  { t: "Veto window", d: "The money is held for the window you chose. Anything unusual is flagged. Approve to speed it up, or veto to take it back." },
  { t: "Settles on its own", d: "If you do nothing, anyone can trigger settlement once the window closes. No keeper, no trust, no waiting on you." },
];

const GUARDS = [
  ["$", "Budget and cap", "Hard limits enforced by the contract, counting money already in flight."],
  ["◷", "Veto windows", "From one minute to a week. The worst case is bounded by what fits in one window."],
  ["✓", "Merchant allowlists", "Restrict an agent to the vendors it should ever need. Everything else reverts."],
  ["⟲", "Key rotation", "Suspect a leaked agent key? Swap it without touching pending payments or funds."],
  ["⏻", "Instant revoke", "Stop all new spending and get the free balance refunded in one transaction."],
  ["⚑", "Smart flags", "First-time merchants, near-cap amounts and bursts are surfaced before you decide."],
  ["❝", "Memos on-chain", "Every payment carries the agent's stated reason, giving you an audit trail."],
  ["∞", "Permissionless settle", "Anyone can finalize a payment after its window, so merchants never depend on you."],
];

export function Landing({ go }: { go: () => void }) {
  const snap = useSnapshot(demo);
  const vetoed = snap.payments.filter((p) => p.status === "vetoed").reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <Hero go={go} />

      <section id="problem">
        <div className="wrap">
          <div className="kicker">The problem</div>
          <h2>We are about to hand software our wallets.</h2>
          <p className="sub">Agents are learning to shop, book, subscribe and trade. The payment rails they use were built for humans who read before they click.</p>
          <div className="grid3">
            {PROBLEMS.map((p) => (
              <div className="card" key={p.i}>
                <div className="ico red">{p.i}</div>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how">
        <div className="wrap">
          <div className="kicker">How it works</div>
          <h2>Autonomy with a grace period.</h2>
          <p className="sub">Four steps, one contract, no custodian. Your agent keeps its speed and you keep the final say.</p>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="step" key={s.t}>
                <div className="n">STEP 0{i + 1}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
                <div className="bar" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="guardrails">
        <div className="wrap">
          <div className="kicker">Guardrails</div>
          <h2>Every limit lives on-chain, not in a prompt.</h2>
          <p className="sub">A system prompt is a suggestion. A smart contract is a rule. Mandate enforces your boundaries where the agent cannot argue with them.</p>
          <div className="grid4">
            {GUARDS.map(([i, t, d]) => (
              <div className="card" key={t}>
                <div className="ico">{i}</div>
                <h3 style={{ fontSize: 18 }}>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="compare">
        <div className="wrap">
          <div className="kicker">Why not just…</div>
          <h2>The options today are all compromises.</h2>
          <div className="cmp">
            <table>
              <thead>
                <tr><th></th><th>Hot wallet</th><th>Approve everything</th><th>Spending limits only</th><th className="hl">Mandate</th></tr>
              </thead>
              <tbody>
                <tr><td>Agent acts autonomously</td><td className="yes">Yes</td><td className="no">No</td><td className="yes">Yes</td><td className="hl yes">Yes</td></tr>
                <tr><td>Bounded loss if compromised</td><td className="no">No</td><td className="yes">Yes</td><td className="meh">Per-period only</td><td className="hl yes">Budget, cap and window</td></tr>
                <tr><td>Can reverse a bad payment</td><td className="no">Never</td><td className="meh">Before sending</td><td className="no">Never</td><td className="hl yes">Until the window ends</td></tr>
                <tr><td>Merchant can trust settlement</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="hl yes">Yes, permissionless</td></tr>
                <tr><td>On-chain audit trail with reasons</td><td className="no">No</td><td className="no">No</td><td className="no">No</td><td className="hl yes">Memo on every payment</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="build">
        <div className="wrap">
          <div className="kicker">For builders</div>
          <h2>Three lines to put your agent on a leash.</h2>
          <p className="sub">Works with any agent framework, any wallet and any ERC-20 stablecoin. The agent only ever calls <span className="mono" style={{ color: "var(--text)" }}>spend</span>.</p>
          <div className="split">
            <pre className="code"><span className="c">{"// Your agent's wallet only holds gas. Funds stay in the vault."}</span>{"\n"}
<span className="k">const</span> vault = <span className="f">getContract</span>({"{ address: MANDATE_VAULT, abi, client }"});{"\n\n"}
<span className="c">{"// Propose a purchase. It reserves funds and starts the veto window."}</span>{"\n"}
<span className="k">await</span> vault.write.<span className="f">spend</span>([{"\n  "}mandateId,{"\n  "}merchant,{"\n  "}<span className="f">parseUnits</span>(<span className="s">"42.50"</span>, <span className="s">6</span>),{"\n  "}<span className="s">"A100 hours for fine-tune #14"</span>,{"\n"}]);{"\n\n"}
<span className="c">{"// Anyone can settle once the window passes."}</span>{"\n"}
<span className="k">await</span> vault.write.<span className="f">release</span>([paymentId]);</pre>
            <div className="facts">
              <div className="fact"><b>Network</b><span>Arbitrum One and Sepolia. Gas on payments costs a fraction of a cent.</span></div>
              <div className="fact"><b>Token</b><span>Any standard ERC-20 stablecoin, including USDG and USDC.</span></div>
              <div className="fact"><b>Custody</b><span>Non-custodial. Funds sit in one vault contract with no admin keys and no upgrade path. Unaudited, so use small amounts.</span></div>
              <div className="fact"><b>Verified</b><span>13 contract tests cover caps, windows, allowlists, revoke and key rotation.</span></div>
              <div className="fact"><b>This session</b><span>{usd(vetoed, 0)} of questionable agent spending vetoed in the demo above.</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="final">
          <h2>Let your agents spend. Keep the veto.</h2>
          <p className="sub">Try the live demo in your browser, or connect a wallet and run a mandate on Arbitrum.</p>
          <div className="cta">
            <button className="btn primary lg" onClick={go}>Open the app →</button>
            <a className="btn lg" href={REPO} target="_blank" rel="noreferrer">View on GitHub</a>
          </div>
        </div>
        <footer>
          <span>© 2026 Mandate · MIT licensed · Built for Arbitrum Open House Singapore</span>
          <span style={{ display: "flex", gap: 22 }}>
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://arbitrum.io" target="_blank" rel="noreferrer">Arbitrum</a>
          </span>
        </footer>
      </div>
    </>
  );
}
