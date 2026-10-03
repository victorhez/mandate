import { useState } from "react";
import type { Adapter } from "../lib/types";
import { isAddr } from "../lib/format";
import { run } from "../lib/store";

const WINDOWS = [
  { l: "1 min", v: 60 },
  { l: "10 min", v: 600 },
  { l: "1 hour", v: 3600 },
  { l: "24 hours", v: 86400 },
];

export function CreateModal({ adapter, account, symbol, onClose }: { adapter: Adapter; account?: string; symbol: string; onClose: () => void }) {
  const live = adapter.mode === "live";
  const [purpose, setPurpose] = useState("");
  const [agent, setAgent] = useState("");
  const [agentName, setAgentName] = useState("");
  const [budget, setBudget] = useState("250");
  const [cap, setCap] = useState("50");
  const [win, setWin] = useState(live ? 600 : 60);
  const [days, setDays] = useState("7");
  const [merchants, setMerchants] = useState("");
  const [saving, setSaving] = useState(false);

  const list = merchants.split(/[\s,]+/).filter(Boolean);
  const err =
    !purpose.trim() ? "Describe what the agent is for."
    : live && !isAddr(agent) ? "Enter the agent's wallet address."
    : !(+budget > 0) ? "Budget must be above zero."
    : !(+cap > 0) || +cap > +budget ? "Per-purchase cap must be above zero and no more than the budget."
    : !(+days > 0) ? "Expiry must be at least one day."
    : list.some((a) => !isAddr(a)) ? "Every allowlisted merchant must be a valid address."
    : purpose.length > 140 ? "Purpose is limited to 140 characters."
    : "";

  async function submit() {
    setSaving(true);
    await run("Mandate created", () =>
      adapter.createMandate({ agent: agent.trim(), agentName, purpose: purpose.trim(), budget: +budget, perTxCap: +cap, vetoWindow: win, expiryDays: +days, merchants: list }),
    );
    setSaving(false);
    onClose();
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Create mandate">
        <h3>New mandate</h3>
        <p>Fund an agent with a bounded budget. You can top up, rotate its key, or revoke at any time.</p>
        <label className="field">
          <span>What is this agent for?</span>
          <input value={purpose} maxLength={140} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Book flights and hotels for the Singapore trip" autoFocus />
        </label>
        <div className="two">
          <label className="field">
            <span>{live ? "Agent wallet address" : "Agent name"}</span>
            {live ? (
              <input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" className="mono" />
            ) : (
              <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Atlas" />
            )}
            {live && account && <small><a href="#" onClick={(e) => (e.preventDefault(), setAgent(account))} style={{ color: "var(--lime)" }}>Use my own wallet</a> to test as both owner and agent.</small>}
          </label>
          <label className="field">
            <span>Expires in (days)</span>
            <input value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value)} />
          </label>
        </div>
        <div className="two">
          <label className="field">
            <span>Total budget ({symbol})</span>
            <input value={budget} inputMode="decimal" onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="field">
            <span>Per-purchase cap ({symbol})</span>
            <input value={cap} inputMode="decimal" onChange={(e) => setCap(e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span>Veto window</span>
          <div className="presets">
            {WINDOWS.map((w) => (
              <button key={w.v} className={win === w.v ? "btn sm primary" : ""} onClick={() => setWin(w.v)}>{w.l}</button>
            ))}
          </div>
          <small>Every payment waits this long before the merchant can be paid. Longer is safer, shorter is faster.</small>
        </div>
        <label className="field">
          <span>Allowed merchants (optional)</span>
          <textarea rows={2} value={merchants} onChange={(e) => setMerchants(e.target.value)} placeholder="Leave empty to allow any merchant, or paste addresses separated by commas" className="mono" />
        </label>
        {err && <div className="why" style={{ marginBottom: 12 }}>{err}</div>}
        <div className="actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!!err || saving} onClick={submit}>{saving ? "Creating…" : `Fund ${budget || 0} ${symbol}`}</button>
        </div>
      </div>
    </div>
  );
}
