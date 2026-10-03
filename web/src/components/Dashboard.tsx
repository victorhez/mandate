import { useEffect, useState } from "react";
import type { Adapter, Mandate } from "../lib/types";
import { demo, live, run, useSnapshot } from "../lib/store";
import { dur, isAddr, short, usd } from "../lib/format";
import { PayRow } from "./Feed";
import { CreateModal } from "./CreateModal";
import { chainName, explorerBase, liveConfigured, vaultAddress } from "../lib/chain";

function MandateCard({ m, on, onClick, now }: { m: Mandate; on: boolean; onClick: () => void; now: number }) {
  const sp = (m.spent / m.budget) * 100 || 0;
  const rs = (m.reserved / m.budget) * 100 || 0;
  const expired = now >= m.expiry;
  return (
    <button className={`mcard ${on ? "on" : ""}`} onClick={onClick}>
      <h4>
        <span>{m.agentName}</span>
        {m.revoked ? <span className="tag red">Revoked</span> : expired ? <span className="tag gray">Expired</span> : <span className="tag green">Active</span>}
      </h4>
      <p>{m.purpose}</p>
      <div className="meter"><i className="sp" style={{ width: `${sp}%` }} /><i className="rs" style={{ width: `${rs}%` }} /></div>
      <div className="mrow"><span>{usd(m.budget - m.spent - m.reserved, 0)} left</span><span>of {usd(m.budget, 0)}</span></div>
    </button>
  );
}

function Detail({ m, adapter }: { m: Mandate; adapter: Adapter }) {
  const snap = useSnapshot(adapter);
  const [form, setForm] = useState<"" | "topup" | "rotate">("");
  const [val, setVal] = useState("");
  const [sm, setSm] = useState({ merchant: "", amount: "", memo: "" });
  const owner = !!snap.account && snap.account.toLowerCase() === m.owner.toLowerCase();
  const isAgent = !!snap.account && snap.account.toLowerCase() === m.agent.toLowerCase();
  const pays = snap.payments.filter((p) => p.mandateId === m.id);
  const avail = m.budget - m.spent - m.reserved;
  const active = !m.revoked && snap.now < m.expiry;

  useEffect(() => { setForm(""); setVal(""); }, [m.id]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>{m.purpose}</h3>
          <div className="chips">
            <span className="tag blue mono">Agent {m.agentName === short(m.agent) ? m.agentName : `${m.agentName} · ${short(m.agent)}`}</span>
            <span className="tag gray">Cap {usd(m.perTxCap, 0)}</span>
            <span className="tag gray">Window {dur(m.vetoWindow)}</span>
            <span className="tag gray">{snap.now >= m.expiry ? "Expired" : `Expires in ${dur(m.expiry - snap.now)}`}</span>
            <span className="tag gray">{m.allowlistOnly ? `${m.allowlist.length || "Restricted"} merchant${m.allowlist.length === 1 ? "" : "s"} allowed` : "Any merchant"}</span>
          </div>
        </div>
        {owner && !m.revoked && (
          <div className="actions">
            <button className="btn sm" onClick={() => setForm(form === "topup" ? "" : "topup")}>Top up</button>
            <button className="btn sm" onClick={() => setForm(form === "rotate" ? "" : "rotate")}>Rotate key</button>
            <button className="btn sm danger" onClick={() => run("Mandate revoked, remaining budget refunded", () => adapter.revoke(m.id))}>Revoke</button>
          </div>
        )}
      </div>

      {form && (
        <div className="note" style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="mono"
            style={{ flex: 1, minWidth: 200, background: "var(--bg-2)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", font: "inherit" }}
            placeholder={form === "topup" ? `Amount in ${snap.symbol}` : "New agent address 0x…"}
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <button
            className="btn primary sm"
            disabled={form === "topup" ? !(+val > 0) : !isAddr(val)}
            onClick={() =>
              run(form === "topup" ? "Budget topped up" : "Agent key rotated", async () => {
                if (form === "topup") await adapter.topUp(m.id, +val);
                else await adapter.rotateAgent(m.id, val.trim());
                setForm(""); setVal("");
              })
            }
          >
            {form === "topup" ? "Add funds" : "Rotate"}
          </button>
        </div>
      )}

      <div className="stats">
        <div className="stat"><small>Budget</small><b>{usd(m.budget)}</b></div>
        <div className="stat"><small>Settled</small><b style={{ color: "var(--green)" }}>{usd(m.spent)}</b></div>
        <div className="stat"><small>Held in veto window</small><b style={{ color: "var(--amber)" }}>{usd(m.reserved)}</b></div>
        <div className="stat"><small>Available to agent</small><b>{usd(avail)}</b></div>
      </div>

      {adapter.mode === "demo" && active && (
        <>
          <div className="sect-title"><span>Agent console</span></div>
          <div className="note" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 220 }}>Agents buy on their own every few seconds. Nudge {m.agentName} to act now, or watch the contract refuse a bad request.</span>
            <button className="btn sm" onClick={() => adapter.simulateAgent?.(m.id)}>Make {m.agentName} buy something</button>
          </div>
        </>
      )}
      {adapter.mode === "live" && isAgent && active && (
        <>
          <div className="sect-title"><span>Agent console · connected wallet is the agent</span></div>
          <div className="note" style={{ display: "grid", gap: 10 }}>
            <input className="mono" style={fld} placeholder="Merchant address 0x…" value={sm.merchant} onChange={(e) => setSm({ ...sm, merchant: e.target.value })} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input style={{ ...fld, width: 130 }} placeholder={`Amount ${snap.symbol}`} value={sm.amount} onChange={(e) => setSm({ ...sm, amount: e.target.value })} />
              <input style={{ ...fld, flex: 1, minWidth: 180 }} placeholder="What is this for? (stored on-chain)" value={sm.memo} maxLength={280} onChange={(e) => setSm({ ...sm, memo: e.target.value })} />
              <button className="btn primary sm" disabled={!isAddr(sm.merchant) || !(+sm.amount > 0)} onClick={() => run("Payment submitted, veto window started", () => adapter.spend(m.id, sm.merchant.trim(), +sm.amount, sm.memo))}>Submit payment</button>
            </div>
          </div>
        </>
      )}

      <div className="sect-title"><span>Payments · {pays.length}</span><span style={{ textTransform: "none", letterSpacing: 0 }}>Pending payments settle automatically once the window closes</span></div>
      <div className="feed" style={{ minHeight: 0 }}>
        {pays.length === 0 && <div className="note">No payments yet. When the agent proposes one it will appear here with a countdown.</div>}
        {pays.map((p) => <PayRow key={p.id} p={p} m={m} all={snap.payments} snap={snap} adapter={adapter} canAct={owner} />)}
      </div>

      {m.allowlist.length > 0 && (
        <>
          <div className="sect-title"><span>Allowed merchants</span></div>
          <div className="chips">{m.allowlist.map((a) => <span key={a.address} className="tag gray mono" title={a.address}>{a.name}</span>)}</div>
        </>
      )}
    </div>
  );
}
const fld: React.CSSProperties = { background: "var(--bg-2)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", font: "inherit", fontSize: 14 };

export function Dashboard({ initialMode = "demo" }: { initialMode?: "demo" | "live" }) {
  const [mode, setMode] = useState<"demo" | "live">(initialMode);
  const adapter = mode === "demo" ? demo : live();
  const snap = useSnapshot(adapter);
  const [sel, setSel] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const cur = snap.mandates.find((m) => m.id === sel) ?? snap.mandates[0];

  return (
    <div className="app wrap">
      {snap.busy && <div className="busybar" />}
      <div className="app-top">
        <h2>Mandates</h2>
        <div className="seg" role="tablist">
          <button className={mode === "demo" ? "on" : ""} onClick={() => setMode("demo")}>Interactive demo</button>
          <button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>{chainName}</button>
        </div>
        <div className="spacer" />
        {mode === "live" && snap.account && snap.balance !== undefined && <span className="bal">{usd(snap.balance)} {snap.symbol}</span>}
        {mode === "live" && snap.account && adapter.faucet && <button className="btn sm" onClick={() => run("Test funds received", () => adapter.faucet!())}>Get test {snap.symbol}</button>}
        {mode === "live" && !snap.account && snap.configured && <button className="btn primary" onClick={() => run("Wallet connected", () => adapter.connect!())}>Connect wallet</button>}
        {mode === "live" && snap.account && <span className="bal">{short(snap.account)}</span>}
        {(mode === "demo" || snap.account) && <button className="btn primary" onClick={() => setCreating(true)}>+ New mandate</button>}
      </div>

      {mode === "demo" && (
        <div className="note" style={{ marginBottom: 20 }}>
          This is a faithful simulation of the on-chain vault running in your browser. Nothing here touches real funds. Switch to <b style={{ color: "var(--text)" }}>{chainName}</b> to use the deployed contract with your own wallet.
        </div>
      )}
      {mode === "live" && !snap.configured && (
        <div className="note big">
          <h4>Contract address not configured in this build</h4>
          Set <span className="mono">VITE_VAULT_ADDRESS</span> and <span className="mono">VITE_TOKEN_ADDRESS</span> to point the app at a deployment on {chainName}.
        </div>
      )}
      {mode === "live" && snap.configured && snap.wrongChain && <div className="note" style={{ marginBottom: 20 }}>Your wallet is on a different network. You will be asked to switch to {chainName} when you transact.</div>}
      {mode === "live" && snap.configured && !snap.account && (
        <div className="note big">
          <h4>Connect a wallet to continue</h4>
          Mandate runs fully on-chain at <a className="mono" style={{ color: "var(--lime)" }} href={`${explorerBase}/address/${vaultAddress}`} target="_blank" rel="noreferrer">{short(vaultAddress)}</a>. Create a mandate, point an agent key at it, and keep the veto.
        </div>
      )}

      {(mode === "demo" || (liveConfigured && snap.account)) && (
        <div className="layout">
          <div className="side-col">
            {snap.mandates.length === 0 && <div className="note">No mandates yet. Create one to give an agent a budget.</div>}
            {snap.mandates.map((m) => <MandateCard key={m.id} m={m} on={cur?.id === m.id} onClick={() => setSel(m.id)} now={snap.now} />)}
          </div>
          {cur ? <Detail key={mode + cur.id} m={cur} adapter={adapter} /> : <div className="note big"><h4>Nothing selected</h4>Create your first mandate to get started.</div>}
        </div>
      )}
      {creating && <CreateModal adapter={adapter} account={snap.account} symbol={snap.symbol} onClose={() => setCreating(false)} />}
    </div>
  );
}
