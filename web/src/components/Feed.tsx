import type { Adapter, Mandate, Payment, Snapshot } from "../lib/types";
import { ago, dur, risks, short, usd } from "../lib/format";
import { run } from "../lib/store";

export function Ring({ p, now }: { p: Payment; now: number }) {
  if (p.status === "released")
    return (
      <div className="ring">
        <svg width="48" height="48"><circle cx="24" cy="24" r="20" fill="none" stroke="rgba(61,220,151,.35)" strokeWidth="3" /></svg>
        <span className="done">✓</span>
      </div>
    );
  if (p.status === "vetoed")
    return (
      <div className="ring">
        <svg width="48" height="48"><circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,93,108,.4)" strokeWidth="3" /></svg>
        <span className="x">✕</span>
      </div>
    );
  const total = Math.max(1, p.releaseAt - p.createdAt);
  const left = Math.max(0, p.releaseAt - now);
  const C = 2 * Math.PI * 20;
  return (
    <div className="ring" aria-label={`${left} seconds left to veto`}>
      <svg width="48" height="48">
        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3" />
        <circle cx="24" cy="24" r="20" fill="none" stroke="#ffb43a" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / total)} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <span>{dur(left)}</span>
    </div>
  );
}

export function PayRow({
  p, m, all, snap, adapter, canAct, showAgent,
}: {
  p: Payment; m: Mandate; all: Payment[]; snap: Snapshot; adapter: Adapter; canAct: boolean; showAgent?: boolean;
}) {
  const why = p.status === "pending" ? risks(p, m, all) : [];
  const open = p.status === "pending" && snap.now < p.releaseAt;
  const due = p.status === "pending" && !open;
  return (
    <div className={`pay ${p.status}`}>
      <Ring p={p} now={snap.now} />
      <div>
        <h4>
          {p.merchantName}
          {p.status === "pending" && <span className="tag amber">{open ? "In veto window" : "Ready to settle"}</span>}
          {p.status === "released" && <span className="tag green">Settled</span>}
          {p.status === "vetoed" && <span className="tag red">Vetoed</span>}
          {why.length > 0 && <span className="tag gray">Review</span>}
        </h4>
        <p title={p.memo}>
          {showAgent && <>{m.agentName} · </>}
          {p.memo || short(p.merchant)} · {ago(p.createdAt, snap.now)}
        </p>
        {why.length > 0 && <div className="why">⚑ {why.join(" · ")}</div>}
      </div>
      <div className="side">
        <div className="amt">{usd(p.amount)}</div>
        {canAct && open && (
          <div className="btn-row">
            <button className="btn sm ok" onClick={() => run("Payment approved", () => adapter.approve(p.id))}>Approve</button>
            <button className="btn sm danger" onClick={() => run("Payment vetoed, funds returned", () => adapter.veto(p.id))}>Veto</button>
          </div>
        )}
        {due && adapter.mode === "live" && (
          <button className="btn sm" onClick={() => run("Payment released", () => adapter.release(p.id))}>Release</button>
        )}
      </div>
    </div>
  );
}

/** The interactive hero: a real feed running on the in-browser demo vault. */
export function LiveFeed({ adapter }: { adapter: Adapter }) {
  const snap = adapter.getSnapshot();
  const byM = new Map(snap.mandates.map((m) => [m.id, m]));
  const pend = snap.payments.filter((p) => p.status === "pending");
  const rest = snap.payments.filter((p) => p.status !== "pending").slice(0, 2);
  const rows = [...pend.slice(0, 3), ...rest];
  const settled = snap.payments.filter((p) => p.status === "released").reduce((s, p) => s + p.amount, 0);
  const vetoed = snap.payments.filter((p) => p.status === "vetoed").reduce((s, p) => s + p.amount, 0);
  return (
    <div className="device">
      <div className="device-head">
        <span className="dot" />
        <span>Agents are spending right now. Try a veto.</span>
      </div>
      <div className="feed">
        {snap.blocked.slice(0, 1).map((b) => (
          <div className="blockedrow" key={b.id}>
            ⛔ <span><b>Blocked by contract</b> · {b.agentName} tried {usd(b.amount)} at {b.merchantName}: {b.reason.toLowerCase()}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">Waiting for the first agent purchase…</div>}
        {rows.map((p) => {
          const m = byM.get(p.mandateId)!;
          return <PayRow key={p.id} p={p} m={m} all={snap.payments} snap={snap} adapter={adapter} canAct showAgent />;
        })}
      </div>
      <div className="device-foot">
        <span>Settled <b>{usd(settled, 0)}</b></span>
        <span>Vetoed <b>{usd(vetoed, 0)}</b></span>
        <span>Blocked <b>{snap.blocked.length}</b></span>
      </div>
    </div>
  );
}
