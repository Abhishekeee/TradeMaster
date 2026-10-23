import { useEffect, useMemo, useState } from 'react';
import { shortName, type Stat } from '../portfolio';
import { explain, type Explanation } from '../explain';
import { scanLargeCaps, useAlternatives, type Alt, type Scan } from '../portfolioAlternatives';
import { ago } from '../news';
import type { Insights } from '../portfolioInsights';
import type { Candle, Instrument } from '../types';

interface Props {
  stats: Stat[]; ccy: string; ins: Insights; candles: Record<string, Candle[]>;
  watch: { list: Instrument[]; has(id: string): boolean; toggle(i: Instrument): void };
  selected: string; setSelected(id: string): void; onChart(i: Instrument): void;
}

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

function WinnerRow({ rank, name, id, ret, vsIdx, held, inst, open, toggle, onChart, watch, extra }: {
  rank: number; name: string; id: string; ret: number; vsIdx: number | null; held: boolean; inst: Instrument; open: boolean; toggle(): void;
  onChart(i: Instrument): void; watch: Props['watch']; extra?: string;
}) {
  return (
    <>
      <tr>
        <td className="small">{rank}</td>
        <td><b>{name.split(' - ')[0].replace(/\.(NS|BO)$/, '')}</b>{held && <span className="chip pf-own">you own this</span>}<div className="small pf-nm" title={id}>{extra ?? id.replace(/\.(NS|BO)$/, '')}</div></td>
        <td className={`r ${tone(ret)}`}><b>{pc(ret)}</b></td>
        <td className={`r ${tone(vsIdx)}`}>{vsIdx === null ? '–' : `${vsIdx >= 0 ? '+' : '−'}${Math.abs(vsIdx).toFixed(0)} pts`}</td>
        <td className="r">
          <button className={`mini ${open ? 'on' : ''}`} onClick={toggle}>Why?</button>{' '}
          {inst.source !== 'mf' && <button className="mini" onClick={() => onChart(inst)}>Chart</button>}{' '}
          {inst.source !== 'mf' && !held && <button className="mini" onClick={() => watch.toggle(inst)}>{watch.has(inst.id) ? '★' : '☆'}</button>}
        </td>
      </tr>
      {open && <tr className="pf-detail"><td colSpan={5}><WhyCard inst={inst} /></td></tr>}
    </>
  );
}

export default function PortfolioWhy({ stats, ccy, ins, candles, watch, selected, setSelected, onChart }: Props) {
  const held = useMemo(() => new Set(stats.map((s) => s.h.inst.id)), [stats]);
  const hasStocks = stats.some((s) => s.h.inst.source !== 'mf');
  const hasFunds = stats.some((s) => s.h.inst.source === 'mf' && !s.debt);
  const hasDebt = stats.some((s) => s.h.inst.source === 'mf' && s.debt);
  const sel = stats.find((s) => s.h.id === selected) ?? stats[0];
  const [scan, setScan] = useState<Scan | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { alts } = useAlternatives(ccy, watch.list, held, ins.series, hasFunds || hasDebt);

  useEffect(() => {
    if (!hasStocks) return;
    let dead = false;
    scanLargeCaps(ccy, held).then((r) => { if (!dead) setScan(r); });
    return () => { dead = true; };
  }, [ccy, [...held].join(), hasStocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const funds = (debt: boolean, n: number): Alt[] => (alts ?? []).filter((a) => a.inst.source === 'mf' && a.debt === debt && a.r1y !== null).sort((a, b) => (b.r1y as number) - (a.r1y as number)).slice(0, n);
  const heldFunds = (debt: boolean) => stats.filter((s) => s.h.inst.source === 'mf' && s.debt === debt);

  return (
    <>
      <section className="pf-box">
        <h3>Why did my investments move?</h3>
        <div className="chips pf-chips">
          {stats.map((s) => <button key={s.h.id} className={sel?.h.id === s.h.id ? 'on' : ''} onClick={() => setSelected(s.h.id)}>{shortName(s.h.inst)}</button>)}
        </div>
        {sel && <WhyCard key={sel.h.id} inst={sel.h.inst} candles={candles[sel.h.inst.id]} />}
      </section>

      <section className="pf-box">
        <h3>Top performers this year, and why</h3>
        <p className="small">Picked to match what you own. Press <b>Why?</b> on any row to see what drove it.</p>

        {hasStocks && (<>
          <h4 className="pf-subh">Large companies ({scan ? `best of ${scan.total} widely held` : 'loading…'})</h4>
          {scan && Object.keys(scan.rank).length > 0 && (
            <p className="small">Where yours rank: {stats.filter((s) => scan.rank[s.h.inst.id]).map((s) => { const r = scan.rank[s.h.inst.id]; return <span key={s.h.id} className="chip pf-own" style={{ marginRight: 6 }}>{shortName(s.h.inst)} #{r.pos} of {r.of} ({pc(r.ret1y, 0)})</span>; })}</p>
          )}
          {scan && <div className="pf-scroll"><table className="pf-table pf-alt">
            <thead><tr><th>#</th><th>Company</th><th className="r">1 year</th><th className="r">Vs {scan.benchName}</th><th></th></tr></thead>
            <tbody>{scan.top.map((w, i) => (
              <WinnerRow key={w.inst.id} rank={i + 1} name={w.name} id={w.inst.id} ret={w.ret1y} vsIdx={scan.bench !== null ? w.ret1y - scan.bench : null} held={w.held} inst={w.inst}
                open={open === w.inst.id} toggle={() => setOpen(open === w.inst.id ? null : w.inst.id)} onChart={onChart} watch={watch} />
            ))}</tbody>
          </table></div>}
        </>)}

        {[[false, 'Equity mutual funds', hasFunds], [true, 'Bond funds', hasDebt]].map(([debt, title, show]) => show && (
          <div key={String(debt)}>
            <h4 className="pf-subh">{title as string} {alts ? '(from a shortlist of popular funds)' : '(loading…)'}</h4>
            {alts && heldFunds(debt as boolean).length > 0 && (
              <p className="small">Yours: {heldFunds(debt as boolean).map((s) => <span key={s.h.id} className="chip pf-own" style={{ marginRight: 6 }}>{shortName(s.h.inst)} {pc(s.r1y)}</span>)}</p>
            )}
            {alts && funds(debt as boolean, 4).length === 0 && <p className="small">The mutual fund shortlist covers India only. Choose the India market to see it.</p>}
            {alts && funds(debt as boolean, 4).length > 0 && <div className="pf-scroll"><table className="pf-table pf-alt">
              <thead><tr><th>#</th><th>Fund</th><th className="r">1 year</th><th className="r">Vs the index</th><th></th></tr></thead>
              <tbody>{funds(debt as boolean, 4).map((a, i) => (
                <WinnerRow key={a.inst.id} rank={i + 1} name={a.inst.name} id={a.inst.id} ret={a.r1y as number} vsIdx={a.alpha1} held={false} inst={a.inst}
                  open={open === a.inst.id} toggle={() => setOpen(open === a.inst.id ? null : a.inst.id)} onChart={onChart} watch={watch} extra={a.inst.name.split(' - ').slice(1).join(' · ')} />
              ))}</tbody>
            </table></div>}
          </div>
        ))}
        <p className="small">Last year's winners are not a promise of next year's. Use them to understand what has been working and why, not as a buy list.</p>
      </section>
    </>
  );
}
