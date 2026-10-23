import { useEffect, useState } from 'react';
import { explain, type Explanation } from '../explain';
import { ago } from '../news';
import type { Candle, Instrument } from '../types';

const pc = (n: number | null, d = 1) => (n === null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`);
const tone = (n: number | null) => (n === null || Math.abs(n) < 0.05 ? '' : n > 0 ? 'up' : 'down');
const moodOf = (t: number) => (t > 0.3 ? ['mostly good news', 'up'] : t < -0.3 ? ['mostly bad news', 'down'] : ['mixed news', 'neu']);

/** Bars for one period: stock, its sector and the market side by side. */
function Compare({ e }: { e: Explanation }) {
  const max = Math.max(1, ...e.rows.flatMap((r) => [r.stock, r.sector, r.market]).map((v) => Math.abs(v ?? 0)));
  const cell = (v: number | null) => v === null ? <td className="r small">–</td> : (
    <td><div className="pf-cmp"><i className={tone(v)} style={{ width: `${(Math.abs(v) / max) * 100}%` }} /><b className={tone(v)}>{pc(v)}</b></div></td>
  );
  return (
    <div className="pf-scroll"><table className="pf-table pf-compare">
      <thead><tr><th></th><th>This one</th><th>{e.sectorName ?? 'Sector'}</th><th>{e.marketName}</th></tr></thead>
      <tbody>{e.rows.map((r) => <tr key={r.label}><td>{r.label}</td>{cell(r.stock)}{e.sectorName ? cell(r.sector) : <td className="small">no sector index</td>}{cell(r.market)}</tr>)}</tbody>
    </table></div>
  );
}

/** Why did this move? Market vs sector vs the company, what the business is doing, and what the news is about. */
export function WhyCard({ inst, candles }: { inst: Instrument; candles?: Candle[] }) {
  const [e, setE] = useState<Explanation | null | undefined>(undefined);
  useEffect(() => {
    let dead = false;
    setE(undefined);
    explain(inst, candles).then((r) => { if (!dead) setE(r); }).catch(() => { if (!dead) setE(null); });
    return () => { dead = true; };
  }, [inst.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (e === undefined) return <p className="small">Looking at the market, the sector and the latest headlines…</p>;
  if (e === null) return <p className="small">Could not load the data for this one. Try again in a moment.</p>;
  const label = { market: 'Market-driven', sector: 'Sector-driven', stock: 'Company-specific', rates: 'Interest-rate driven', unknown: 'Unclear' }[e.driver];
  return (
    <div className="pf-why-card">
      <div className={`pf-say ${e.s1 === null ? 'neu' : e.s1 >= 0 ? 'up' : 'down'}`}><b>{label}.</b> {e.headline}</div>
      <Compare e={e} />
      {e.notes.length > 0 && <p className="small">{e.notes.join(' ')}</p>}

      {e.business.length > 0 && (<><h4 className="pf-subh">What the business is doing</h4><ul>{e.business.map((b, i) => <li key={i}>{b}</li>)}</ul></>)}

      <h4 className="pf-subh">What the news has been about (last 6 weeks)</h4>
      {e.themes.length ? e.themes.map((t) => {
        const [m, mc] = moodOf(t.tone);
        return (
          <div key={t.id} className="pf-theme">
            <div className="row"><b>{t.label}</b><span><span className={`chip pf-mood ${mc}`}>{m}</span> <span className="small">{t.items.length} headline{t.items.length > 1 ? 's' : ''}</span></span></div>
            <div className="small">{t.effect}</div>
            <ul className="pf-news pf-news-sm">{t.items.slice(0, 2).map((n) => (
              <li key={n.link}><a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a> <span className="small">{n.source}{n.time ? ` · ${ago(n.time)}` : ''}</span></li>
            ))}</ul>
          </div>
        );
      }) : <p className="small">No clear theme in the recent headlines. Moves without news are often about money flows or market mood.</p>}

      {e.moves.length > 0 && (<>
        <h4 className="pf-subh">Biggest one-day moves in the last 3 months, and the news around them</h4>
        {e.moves.map((m) => (
          <div key={m.time} className="pf-theme">
            <div className="row"><b>{new Date(m.time * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</b><b className={tone(m.pct)}>{pc(m.pct)}</b></div>
            {m.news.length ? <ul className="pf-news pf-news-sm">{m.news.map((n) => <li key={n.link}><a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a> <span className="small">{n.source}</span></li>)}</ul>
              : <p className="small">No headline found for those days. It may have moved with the whole market.</p>}
          </div>
        ))}
      </>)}
      <p className="small">These are likely reasons, pieced together from sector and market data, company financials and headlines. Prices rarely move for one reason, and headlines show what was being talked about, not proof of cause.</p>
    </div>
  );
}
