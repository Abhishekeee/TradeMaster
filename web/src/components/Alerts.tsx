import { useState } from 'react';
import type { useAlerts } from '../alerts';
import { fmt, type Instrument } from '../types';

type AlertsApi = ReturnType<typeof useAlerts>;
interface Props { inst: Instrument; tf: string; price: number | null; api: AlertsApi }

export default function Alerts({ inst, tf, price, api }: Props) {
  const [kind, setKind] = useState<'above' | 'below' | 'pattern'>('above');
  const [level, setLevel] = useState('');
  const [err, setErr] = useState('');
  const active = api.alerts.filter((a) => !a.fired);
  const fired = api.alerts.filter((a) => a.fired);

  const add = () => {
    const v = parseFloat(level);
    if (!(v > 0)) { setErr('Enter a number.'); return; }
    if (kind === 'pattern' && v > 100) { setErr('Match % must be 100 or less.'); return; }
    if (kind === 'above' && price && v <= price) { setErr('Level must be above the current price.'); return; }
    if (kind === 'below' && price && v >= price) { setErr('Level must be below the current price.'); return; }
    api.add({ inst, kind, level: v, tf: kind === 'pattern' ? tf : undefined });
    setErr(''); setLevel('');
  };

  const describe = (a: (typeof active)[number]) => a.kind === 'pattern'
    ? `${a.inst.id} ${a.tf}: any chart pattern ≥ ${a.level}%`
    : `${a.inst.id} ${a.kind === 'above' ? '≥' : '≤'} ${fmt(a.level)}`;

  return (
    <aside className="panel">
      <h3>New alert · {inst.id}</h3>
      <div className="card">
        <div className="small">Current price {price ? fmt(price) : '–'}</div>
        <label className="fld">Alert me when
          <select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setErr(''); }}>
            <option value="above">Price rises to…</option>
            <option value="below">Price falls to…</option>
            <option value="pattern">A chart pattern matches at least… ({tf})</option>
          </select>
        </label>
        <label className="fld">{kind === 'pattern' ? 'Minimum match %' : 'Price level'}
          <input inputMode="decimal" value={level} placeholder={kind === 'pattern' ? 'e.g. 75' : 'e.g. ' + (price ? fmt(price * (kind === 'below' ? 0.98 : 1.02)) : '')} onChange={(e) => setLevel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        </label>
        <button className="act" style={{ marginTop: 8 }} onClick={add}>Create alert</button>
        {err && <div className="small down" style={{ marginTop: 6 }}>{err}</div>}
        <p className="small">You get a sound, a pop-up and a browser notification. Alerts are only checked while this page is open.</p>
      </div>

      <h3>Active ({active.length})</h3>
      <div className="card">
        {active.length ? active.map((a) => (
          <div key={a.id} className="row pos">
            <span>{describe(a)}</span>
            <button className="mini" onClick={() => api.remove(a.id)}>✕</button>
          </div>
        )) : <span className="small">No active alerts.</span>}
      </div>

      {fired.length > 0 && (<>
        <h3>Triggered</h3>
        <div className="card">
          {fired.map((a) => (
            <div key={a.id} className="pos">
              <div className="small">{new Date(a.fired!).toLocaleString()}</div>
              <div>{a.message ?? describe(a)}</div>
            </div>
          ))}
          <button className="mini" onClick={api.clearFired}>Clear triggered</button>
        </div>
      </>)}
    </aside>
  );
}
