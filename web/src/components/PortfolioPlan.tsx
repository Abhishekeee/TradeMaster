import { useState } from 'react';
import StockLink from './StockLink';
import Info from './Info';
import type { Plan, Stat } from '../portfolio';
import { shortName } from '../portfolio';
import { HORIZON_LABEL, planLine, planStatus, todayIso, type PlanStatus } from '../portfolioPlan';
import type { Call } from '../portfolioInsights';

export type PlanMap = Map<string, PlanStatus>;

/** Dashboard block: how the money is split by holding period, and what each plan needs from you right now. */
export function PlanCheck({ rows, plans, value, onOpen }: { rows: Stat[]; plans: PlanMap; value: (s: Stat) => number; onOpen(id: string): void }) {
  const planned = rows.filter((s) => s.h.plan);
  const missing = rows.length - planned.length;
  const total = rows.reduce((a, s) => a + value(s), 0) || 1;
  const buckets = (['short', 'date', 'long'] as const).map((k) => {
    const items = planned.filter((s) => s.h.plan!.horizon === k);
    return { k, items, pct: (items.reduce((a, s) => a + value(s), 0) / total) * 100 };
  });
  const noPlanPct = (rows.filter((s) => !s.h.plan).reduce((a, s) => a + value(s), 0) / total) * 100;
  const order = { down: 0, neu: 1, up: 2 };
  const attention = planned.flatMap((s) => { const st = plans.get(s.h.id); return st ? [{ s, st }] : []; }).filter(({ s, st }) => st.tone !== 'up' || (s.h.plan!.horizon === 'date' && st.daysLeft !== null && st.daysLeft <= 60))
    .sort((a, b) => order[a.st.tone] - order[b.st.tone]);
  const dated = planned.filter((s) => s.h.plan!.horizon === 'date' && s.h.plan!.until).sort((a, b) => a.h.plan!.until!.localeCompare(b.h.plan!.until!));

  return (
    <section className="pf-box plc">
      <h3>Your plan check<Info width={300}><p>How your money is split by how long you plan to hold each stock (short term, long term, until a date), and which holdings need a decision now.</p><p>A holding shows up in the list when it hit your profit target, reached your loss limit, is near its date, or needs a closer look.</p></Info></h3>
      {!planned.length ? (
        <p className="small">You have not told us how long you will hold anything. Open a holding and set a plan to get advice that fits you.</p>
      ) : (
        <div className="plc-grid">
          <div>
            <div className="plc-bar" role="img" aria-label="Money by holding period">
              {buckets.filter((b) => b.pct > 0).map((b) => <i key={b.k} className={`h-${b.k}`} style={{ width: `${b.pct}%` }} title={`${HORIZON_LABEL[b.k]} ${b.pct.toFixed(0)}%`} />)}
              {noPlanPct > 0 && <i className="h-none" style={{ width: `${noPlanPct}%` }} title="No plan yet" />}
            </div>
            <div className="plc-key">
              {buckets.filter((b) => b.items.length).map((b) => <span key={b.k}><i className={`h-${b.k}`} />{HORIZON_LABEL[b.k]} {b.pct.toFixed(0)}%<small> · {b.items.length}</small></span>)}
              {missing > 0 && <span><i className="h-none" />No plan yet {noPlanPct.toFixed(0)}%<small> · {missing}</small></span>}
            </div>
            {dated.length > 0 && (
              <div className="plc-dates">
                <span className="ov-k">Coming up</span>
                {dated.slice(0, 4).map((s) => {
                  const d = plans.get(s.h.id)?.daysLeft ?? 0;
                  return <button key={s.h.id} onClick={() => onOpen(s.h.id)}><b>{shortName(s.h.inst)}</b><span>{d < 0 ? `${-d}d ago` : d === 0 ? 'today' : `in ${d}d`}</span></button>;
                })}
              </div>
            )}
          </div>
          <div className="plc-list">
            {attention.length === 0 && <div className="plc-ok">Every holding is on track with your plan.</div>}
            {attention.slice(0, 6).map(({ s, st }) => (
              <button key={s.h.id} className={`plc-item ${st.tone}`} onClick={() => onOpen(s.h.id)}>
                <span className={`badge ${st.tone}`}>{st.label.toUpperCase()}</span>
                <b><StockLink inst={s.h.inst}>{shortName(s.h.inst)}</StockLink></b>
                <small>{st.headline}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {missing > 0 && planned.length > 0 && <p className="small plc-miss">{missing} holding{missing > 1 ? 's have' : ' has'} no plan yet. Open {missing > 1 ? 'them' : 'it'} below and set one for tailored advice.</p>}
    </section>
  );
}

/** Inside a holding: the plan, how it is going, what to do, and a way to change it. */
export function PlanCard({ s, call, onSave }: { s: Stat; call?: Call; onSave(p: Plan | undefined): void }) {
  const plan = s.h.plan;
  const [edit, setEdit] = useState(false);
  if (!plan || edit) return <PlanEditor start={plan} onDone={(p) => { onSave(p); setEdit(false); }} onCancel={plan ? () => setEdit(false) : undefined} />;
  const st = planStatus(s, plan, call);
  return (
    <div className={`plan-card ${st.tone}`}>
      <div className="plan-head">
        <span className={`badge ${st.tone}`}>{st.label.toUpperCase()}</span>
        <b>Your plan</b><Info width={300}><p>The badge compares your plan (how long, profit target, loss limit) with how this stock is doing now. The bars show how far you are towards your target and your loss limit.</p><p>It is a prompt to decide, not an order to buy or sell.</p></Info>
        <button className="mini" onClick={() => setEdit(true)}>Change</button>
      </div>
      <div className="small plan-line">{planLine(plan)}</div>
      <p className="plan-say">{st.headline}</p>
      {(st.toTarget !== null || st.toLoss !== null) && (
        <div className="plan-meters">
          {st.toTarget !== null && <div><span className="small">Towards your +{plan.target}% goal</span><div className="plan-m"><i className="up" style={{ width: `${Math.min(100, st.toTarget)}%` }} /></div></div>}
          {st.toLoss !== null && <div><span className="small">Towards your −{plan.loss}% limit</span><div className="plan-m"><i className="down" style={{ width: `${Math.min(100, st.toLoss)}%` }} /></div></div>}
        </div>
      )}
      {st.daysLeft !== null && plan.horizon === 'date' && <div className="small">{st.daysLeft < 0 ? `${-st.daysLeft} days past your date` : `${st.daysLeft} days to go`}{st.heldDays !== null ? ` · held ${st.heldDays} days` : ''}</div>}
      {st.tips.length > 0 && <ul className="plan-tips">{st.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </div>
  );
}

function PlanEditor({ start, onDone, onCancel }: { start?: Plan; onDone(p: Plan): void; onCancel?(): void }) {
  const [horizon, setHorizon] = useState<Plan['horizon']>(start?.horizon ?? 'long');
  const [until, setUntil] = useState(start?.until ?? '');
  const [purpose, setPurpose] = useState<Plan['purpose'] | ''>(start?.purpose ?? '');
  const [target, setTarget] = useState(start?.target ? String(start.target) : '');
  const [loss, setLoss] = useState(start?.loss ? String(start.loss) : '');
  const ok = horizon !== 'date' || until > todayIso();
  return (
    <div className="plan-card neu plan-edit">
      <div className="plan-head"><b>{start ? 'Change your plan' : 'How long will you hold this?'}</b></div>
      <div className="qa-choices">
        {(['short', 'long', 'date'] as const).map((k) => (
          <button key={k} className={`qa-choice ${horizon === k ? 'on' : ''}`} onClick={() => setHorizon(k)}><b>{HORIZON_LABEL[k]}</b><small>{k === 'short' ? 'Under a year' : k === 'long' ? 'A year or more' : 'I need it by a day'}</small></button>
        ))}
      </div>
      {horizon === 'date' && <label className="fld">Sell on<input type="date" value={until} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} /></label>}
      <div className="plan-grid">
        <label className="fld">Purpose<select value={purpose} onChange={(e) => setPurpose(e.target.value as Plan['purpose'] | '')}>
          <option value="">Not sure</option><option value="growth">Grow my wealth</option><option value="income">Earn dividends</option><option value="quick">Quick profit</option><option value="safe">Keep it safe</option>
        </select></label>
        <label className="fld">Book profit at (%)<input type="number" min="0" value={target} placeholder="e.g. 30" onChange={(e) => setTarget(e.target.value)} /></label>
        <label className="fld">Rethink at a loss of (%)<input type="number" min="0" value={loss} placeholder="e.g. 15" onChange={(e) => setLoss(e.target.value)} /></label>
      </div>
      <div className="pf-row">
        <button className="mini on" disabled={!ok} onClick={() => onDone({ horizon, until: horizon === 'date' ? until : undefined, purpose: purpose || undefined, target: +target > 0 ? +target : undefined, loss: +loss > 0 ? +loss : undefined, calm: start?.calm })}>Save plan</button>
        {onCancel && <button className="mini" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
