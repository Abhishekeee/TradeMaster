import { useEffect, useMemo, useRef, useState } from 'react';
import Nav from './Nav';
import SymbolSearch from './SymbolSearch';
import PortfolioImport from './PortfolioImport';
import { CURRENCIES, makeCurrency, useFx } from '../fx';
import { currencyOf, fetchCandles, fetchLivePrices, fundInst, searchFunds, type FundHit } from '../data';
import { analyse, benchmarkFor, shortName, summarise, usePortfolioData, usePortfolios, type NewLot, type Stat, type Verdict } from '../portfolio';
import { ActionPlan, Grades, Signature } from './PortfolioInsights';
import { MARKETS, loadMarket, saveMarket, type MarketId } from '../markets';
import { SIGNAL_LABEL, SIGNAL_TONE, computeInsights, decide, type Ai, type Call } from '../portfolioInsights';
import PortfolioNews from './PortfolioNews';
import PortfolioDeep from './PortfolioDeep';
import PortfolioWhy from './PortfolioWhy';
import { useDeep } from '../portfolioDeep';
import { runAnalysis } from '../engine/client';
import { advise } from '../engine/patterns.js';
import type { Advice, Instrument } from '../types';

const nfCache = new Map<string, Intl.NumberFormat>();
/** A price in the currency the stock trades in (Yahoo quotes London stocks in pence). */
function native(ccy: string, v: number): string {
  if (ccy === 'GBp' || ccy === 'GBX') return `${v.toFixed(2)}p`;
  let nf = nfCache.get(ccy);
  if (!nf) { try { nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy }); } catch { nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }); } nfCache.set(ccy, nf); }
  return nf.format(v);
}
const sgn = (n: number | null, d = 1) => (n === null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`);
const tone = (n: number | null) => (n === null || Math.abs(n) < 0.05 ? '' : n > 0 ? 'up' : 'down');
const VERDICT: Record<Verdict, [string, string]> = { good: ['Performing well', 'up'], ok: ['Steady', 'neu'], poor: ['Underperforming', 'down'], wait: ['Loading…', 'neu'] };

function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 5) return <span className="small">–</span>;
  const lo = Math.min(...data), hi = Math.max(...data), w = 90, h = 26;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join(' ');
  return <svg className="pf-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden><polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.5" /></svg>;
}

// example holdings: the buy price is set relative to today's price (f) so the example always looks realistic
const SAMPLE: { id: string; name: string; qty: number; f: number; date: string }[] = [
  { id: 'RELIANCE.NS', name: 'Reliance Industries', qty: 20, f: 0.85, date: '2025-02-10' },
  { id: 'TCS.NS', name: 'TCS', qty: 8, f: 1.18, date: '2024-11-05' },
  { id: 'HDFCBANK.NS', name: 'HDFC Bank', qty: 30, f: 0.9, date: '2025-01-20' },
  { id: 'INFY.NS', name: 'Infosys', qty: 15, f: 1.12, date: '2025-03-03' },
  { id: 'ITC.NS', name: 'ITC', qty: 60, f: 0.97, date: '2024-12-12' },
];

export default function Portfolio() {
  const pf = usePortfolios();
  const holdings = pf.person.holdings;
  const { candles, prices, loading, updated } = usePortfolioData(holdings);
  const fx = useFx();
  const [display, setDisplay] = useState(() => { try { return localStorage.getItem('tm-pf-ccy') || 'INR'; } catch { return 'INR'; } });
  const [open, setOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState<'add' | 'import' | null>(null);
  const [market, setMarketState] = useState<MarketId>(loadMarket);
  const setMarket = (m: MarketId) => { setMarketState(m); saveMarket(m); };
  const [tab, setTab] = useState<'overview' | 'deep' | 'why' | 'news'>('overview');
  const [whyFor, setWhyFor] = useState('');
  const [deepFor, setDeepFor] = useState('');
  const [newsFor, setNewsFor] = useState('all');
  const [sort, setSort] = useState<'weight' | 'pnlPct' | 'alpha' | 'verdict'>('weight');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));

  useEffect(() => {
    let t: 'dark' | 'light' = 'dark';
    try { t = JSON.parse(localStorage.getItem('tm') || '{}').theme === 'light' ? 'light' : 'dark'; } catch { /* ignore */ }
    setTheme(t); document.documentElement.dataset.theme = t;
  }, []);
  const flip = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t); document.documentElement.dataset.theme = t;
    try { localStorage.setItem('tm', JSON.stringify({ ...JSON.parse(localStorage.getItem('tm') || '{}'), theme: t })); } catch { /* ignore */ }
  };
  useEffect(() => { try { localStorage.setItem('tm-pf-ccy', display); } catch { /* ignore */ } }, [display]);

  const ccyKey = holdings.map((h) => h.inst.id).join();
  const stats = useMemo(() => holdings.map((h) => {
    const b = benchmarkFor(currencyOf(h.inst));
    return analyse(h, candles[h.inst.id], prices[h.inst.id], candles[b.id], prices[b.id]);
  }), [holdings, candles, prices]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stats.forEach((s) => fx.ensure(s.ccy)); }, [stats.map((s) => s.ccy).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const conv = (ccy: string) => fx.usdPer(ccy) * fx.perUSD(display);
  const sum = useMemo(() => summarise(stats, conv), [stats, fx.rates, display]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = useMemo(() => makeCurrency(display, 1), [display]);
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money.money(Math.abs(n))}`;

  // second opinion for stocks from the chart-pattern engine used on the Charts page (daily candles)
  const [ai, setAi] = useState<Record<string, Ai & { key: string }>>({});
  const aiRef = useRef(ai);
  aiRef.current = ai;
  useEffect(() => {
    let dead = false;
    (async () => {
      for (const h of holdings) {
        const c = candles[h.inst.id];
        if (h.inst.source === 'mf' || !c || c.length < 60) continue;
        const key = c.length + ':' + c[c.length - 1].time;
        if (aiRef.current[h.inst.id]?.key === key) continue;
        const win = c.slice(-500);
        const { analysis } = await runAnalysis(win, false);
        if (dead || !analysis) continue;
        const adv = advise(win, analysis, null, { tf: '1D' }) as Advice;
        setAi((p) => ({ ...p, [h.inst.id]: { key, action: adv.action, conf: adv.conf, pattern: analysis.charts[0].name, patScore: analysis.charts[0].score } }));
      }
    })();
    return () => { dead = true; };
  }, [candles, holdings]);

  const deep = useDeep(stats, candles);
  const calls = useMemo(() => new Map<string, Call>(stats.map((s) => [s.h.id, decide(s, ai[s.h.inst.id], deep[s.h.id]?.quality)])), [stats, ai, sum, deep]);
  const ins = useMemo(() => computeInsights(stats, sum, candles, prices, conv), [stats, sum, candles, prices]); // eslint-disable-line react-hooks/exhaustive-deps
  const jump = (id: string) => { setOpen(id); setTimeout(() => document.getElementById('pf-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); };

  const rows = useMemo(() => {
    const key = (s: Stat) => (sort === 'weight' ? s.weight : sort === 'pnlPct' ? s.pnlPct : sort === 'alpha' ? s.alpha ?? -1e9 : ({ good: 3, ok: 2, wait: 1, poor: 0 })[s.verdict]);
    return [...stats].sort((a, b) => (sort === 'verdict' ? key(a) - key(b) : key(b) - key(a)));
  }, [stats, sort, ccyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const openChart = (inst: Instrument) => {
    try { localStorage.setItem('tm', JSON.stringify({ ...JSON.parse(localStorage.getItem('tm') || '{}'), inst })); } catch { /* ignore */ }
    location.hash = '#/charts';
  };

  const addSample = async () => {
    const insts = SAMPLE.map((x) => ({ id: x.id, name: x.name, source: 'yahoo', kind: 'EQUITY' }) as Instrument);
    const q = await fetchLivePrices(insts);
    pf.addLots(SAMPLE.map((x, i) => ({ inst: insts[i], qty: x.qty, price: Math.round((q[x.id]?.price ?? 1000) * x.f * 100) / 100, date: x.date })));
  };

  return (
    <>
      <header className="topbar">
        <a className="logo" href="#/" title="Home" style={{ textDecoration: 'none', color: 'inherit' }}>Trade<b>Master</b></a>
        <Nav page="portfolio" />
        <select className="mktsel" value={market} onChange={(e) => setMarket(e.target.value as MarketId)} title={`Market used when searching for a stock to add: ${MARKETS.find((m) => m.id === market)?.hint}`} aria-label="Market">
          {MARKETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <select className="pf-who" value={pf.person.id} onChange={(e) => pf.setActive(e.target.value)} aria-label="Whose portfolio">
          {pf.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="theme" title="Add another person's portfolio" onClick={() => { const n = prompt('Name for the new portfolio (for example a family member):'); if (n !== null) pf.addPerson(n.trim()); }}>+ Person</button>
        <button className="theme" title="Rename this portfolio" onClick={() => { const n = prompt('Rename portfolio:', pf.person.name); if (n && n.trim()) pf.rename(n.trim()); }}>Rename</button>
        {pf.people.length > 1 && <button className="theme" title="Delete this portfolio" onClick={() => { if (confirm(`Delete "${pf.person.name}" and all its holdings?`)) pf.removePerson(); }}>Delete</button>}
        <select className="ccysel" value={display} onChange={(e) => setDisplay(e.target.value)} title="Show totals in this currency">
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <button className="theme" title="Toggle light / dark mode" onClick={flip}>{theme === 'dark' ? '☀' : '🌙'}</button>
        <span className="small pf-upd">{loading ? 'Loading history…' : updated ? `Prices updated ${new Date(updated).toLocaleTimeString()}` : ''}</span>
      </header>

      <main className="pf">
        <div className="pf-actions">
          <button className={`mini ${panel === 'add' ? 'on' : ''}`} onClick={() => setPanel(panel === 'add' ? null : 'add')}>+ Add a stock</button>
          <button className={`mini ${panel === 'import' ? 'on' : ''}`} onClick={() => setPanel(panel === 'import' ? null : 'import')}>⇪ Import from Groww / Zerodha / other app</button>
          {holdings.length > 0 && <button className="mini danger" title="Remove every stock and fund from this portfolio" onClick={() => { if (confirm(`Remove all ${holdings.length} holdings from "${pf.person.name}"? This cannot be undone.`)) { pf.clearHoldings(); setTab('overview'); setOpen(null); } }}>Clear all holdings</button>}
          {holdings.length > 0 && <label className="small pf-sort">Sort by <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="weight">Biggest holding</option><option value="pnlPct">Profit %</option><option value="alpha">Vs market</option><option value="verdict">Needs attention first</option>
          </select></label>}
        </div>
        {panel === 'add' && <AddForm onAdd={(l) => { pf.addLots([l]); }} market={market} setMarket={setMarket} />}
        {panel === 'import' && <PortfolioImport hasHoldings={holdings.length > 0} onImport={(items, replace) => { pf.addLots(items, replace); setPanel(null); }} />}

        {!holdings.length ? (
          <div className="empty pf-empty">
            <h2>Analyse your portfolio</h2>
            <p>Add the stocks you own (quantity, buy price and, if you remember, the buy date) or import them from your broker app.<br />
              You will see which holdings are performing well, which are lagging the market, and a plain-words suggestion for each.</p>
            <div className="pf-row" style={{ justifyContent: 'center' }}>
              <button className="mini on" onClick={() => setPanel('add')}>+ Add a stock</button>
              <button className="mini" onClick={() => setPanel('import')}>⇪ Import from my broker</button>
              <button className="mini" onClick={addSample}>Try with example stocks</button>
            </div>
            <p className="small">Everything stays in this browser. Nothing is uploaded and nothing costs money.</p>
          </div>
        ) : (
          <>
            <div className="pf-tabs">
              <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
              <button className={tab === 'deep' ? 'on' : ''} onClick={() => setTab('deep')}>Deep analysis</button>
              <button className={tab === 'why' ? 'on' : ''} onClick={() => setTab('why')}>Why it moved</button>
              <button className={tab === 'news' ? 'on' : ''} onClick={() => setTab('news')}>News</button>
            </div>
            {tab === 'deep' && <PortfolioDeep stats={rows} deep={deep} calls={calls} ai={ai} selected={deepFor || rows[0]?.h.id || ''} setSelected={setDeepFor} />}
                        {tab === 'why' && <PortfolioWhy stats={rows} candles={candles} selected={whyFor || rows[0]?.h.id || ''} setSelected={setWhyFor} />}
            {tab === 'news' && <PortfolioNews stats={rows} selected={newsFor} setSelected={setNewsFor} />}
            {tab === 'overview' && <>
            <section className="pf-cards">
              <div className="pf-card"><span>Invested</span><b>{money.money(sum.invested)}</b></div>
              <div className="pf-card"><span>Current value</span><b>{money.money(sum.value)}</b></div>
              <div className="pf-card"><span>Total profit / loss</span><b className={tone(sum.pnl)}>{signed(sum.pnl)}</b><em className={tone(sum.pnl)}>{sgn(sum.pnlPct)}</em></div>
              <div className="pf-card"><span>Last session</span><b className={tone(sum.day)}>{signed(sum.day)}</b><em className={tone(sum.day)}>{sgn(sum.dayPct, 2)}</em></div>
              <div className="pf-card"><span>Vs {sum.benchName}</span><b className={tone(sum.alpha)}>{sum.alpha === null ? '–' : `${sum.alpha >= 0 ? '+' : '−'}${Math.abs(sum.alpha).toFixed(1)} pts`}</b><em>{sum.alpha === null ? 'needs price history' : sum.alpha >= 0 ? 'equity part is ahead' : 'equity part is behind'}</em></div>
              <div className="pf-card"><span>Portfolio health</span><b className={sum.health >= 65 ? 'up' : sum.health >= 40 ? 'neu' : 'down'}>{sum.healthLabel}</b><em>{sum.health}/100 by money in good vs poor stocks</em></div>
            </section>

            <Grades ins={ins} sum={sum} />
            <ActionPlan stats={rows} calls={calls} onOpen={jump} />

            <section className="pf-box">
              <h3>What this means</h3>
              <ul>{sum.insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
              <div className="pf-alloc" role="img" aria-label="Share of money in each holding">
                {sum.sorted.map((s, i) => <i key={s.h.id} title={`${shortName(s.h.inst)} ${s.weight.toFixed(1)}%`} style={{ width: `${s.weight}%`, background: `hsl(${(i * 47) % 360} 55% 50%)` }} />)}
              </div>
              <div className="pf-legend">{sum.sorted.map((s, i) => <span key={s.h.id}><i style={{ background: `hsl(${(i * 47) % 360} 55% 50%)` }} />{shortName(s.h.inst)} {s.weight.toFixed(0)}%</span>)}</div>
            </section>

            <Signature stats={stats} sum={sum} ins={ins} money={money.money} signed={signed} onOpen={jump} />

            <section className="pf-box">
              <h3>All holdings</h3>
              <div className="pf-scroll">
                <table className="pf-table pf-main">
                  <thead><tr><th>Stock</th><th className="r">Qty / units</th><th className="r">Avg buy</th><th className="r">Price now</th><th className="r">Value</th><th className="r">Profit / loss</th><th className="r">Vs market</th><th>1 year</th><th>Verdict</th><th>Overall check</th><th>Suggestion</th></tr></thead>
                  <tbody>
                    {rows.map((s) => {
                      const [vt, vc] = VERDICT[s.verdict];
                      const f = conv(s.ccy);
                      return [
                        <tr key={s.h.id} id={'pf-' + s.h.id} className={`link ${open === s.h.id ? 'sel' : ''}`} onClick={() => setOpen(open === s.h.id ? null : s.h.id)}>
                          <td><b>{shortName(s.h.inst)}</b><div className="small pf-nm" title={s.h.inst.name}>{s.isFund ? (s.debt ? 'Debt mutual fund' : 'Mutual fund') : s.h.inst.name.split(' · ')[0]}</div></td>
                          <td className="r">{Number(s.qty.toFixed(3))}</td>
                          <td className="r">{native(s.ccy, s.avg)}</td>
                          <td className="r">{s.price === null ? '–' : native(s.ccy, s.price)}<div className={`small ${tone(s.dayPct)}`}>{sgn(s.dayPct, 2)}</div></td>
                          <td className="r">{money.money(s.value * f)}<div className="small">{s.weight.toFixed(1)}%</div></td>
                          <td className={`r ${tone(s.pnl)}`}>{signed(s.pnl * f)}<div className="small">{sgn(s.pnlPct)}</div></td>
                          <td className={`r ${tone(s.alpha)}`}>{s.alpha === null ? '–' : `${s.alpha >= 0 ? '+' : '−'}${Math.abs(s.alpha).toFixed(1)}`}</td>
                          <td><Spark data={s.spark} up={s.spark.length < 2 || s.spark[s.spark.length - 1] >= s.spark[0]} /></td>
                          <td><span className={`badge ${vc}`}>{vt}</span></td>
                          <td>{deep[s.h.id] && (deep[s.h.id].tech || deep[s.h.id].quality !== null) ? <><span className={`badge ${deep[s.h.id].combined.tone}`}>{deep[s.h.id].combined.label}</span><div className="small">{deep[s.h.id].quality !== null ? `quality ${deep[s.h.id].quality}` : 'chart only'}{deep[s.h.id].tech ? ` · ${deep[s.h.id].tech!.rating}` : ''}</div></> : <span className="small">–</span>}</td>
                          <td>{calls.get(s.h.id) && <><span className={`badge ${SIGNAL_TONE[calls.get(s.h.id)!.signal]}`}>{SIGNAL_LABEL[calls.get(s.h.id)!.signal].toUpperCase()}</span><div className="small">{calls.get(s.h.id)!.conf} confidence</div></>}</td>
                        </tr>,
                        open === s.h.id && <tr key={s.h.id + 'd'} className="pf-detail"><td colSpan={11}><Detail s={s} call={calls.get(s.h.id)} ai={ai[s.h.inst.id]} pf={pf} onChart={() => openChart(s.h.inst)} onDeep={() => { setDeepFor(s.h.id); setTab('deep'); }} onWhy={() => { setWhyFor(s.h.id); setTab('why'); }} onNews={() => { setNewsFor(s.h.id); setTab('news'); }} /></td></tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <p className="small">"Vs market" is how many percentage points the stock gained or lost compared with {sum.benchName} {stats.some((s) => s.alphaBasis === 'since you bought') ? 'since you bought it (or over the last year when no buy date is known)' : 'over the last year'}. Click a row for the reasons and your purchases.</p>
            </section>
            </>}
          </>
        )}
        <p className="disc">This is a rule-based review of price history, not investment advice. It cannot see company results, news, taxes or your goals. Check the facts yourself, or ask a SEBI-registered adviser, before buying or selling.</p>
      </main>
    </>
  );
}

function Detail({ s, call, ai, pf, onChart, onDeep, onWhy, onNews }: { s: Stat; call?: Call; ai?: Ai; pf: ReturnType<typeof usePortfolios>; onChart(): void; onDeep(): void; onWhy(): void; onNews(): void }) {
  const stat = (label: string, v: string, c = '') => <div><span>{label}</span><b className={c}>{v}</b></div>;
  return (
    <div className="pf-det">
      <div className="pf-det-l">
        {call && <div className={`pf-say ${SIGNAL_TONE[call.signal]}`}><b>{SIGNAL_LABEL[call.signal]} ({call.conf.toLowerCase()} confidence).</b> {call.why}</div>}
        <div className={`pf-say ${VERDICT[s.verdict][1]}`}><b>{VERDICT[s.verdict][0]}.</b> {s.action}</div>
        {ai && <div className="pf-say neu"><b>Chart AI:</b> {ai.action === 'WAIT' ? 'no clear setup' : `${ai.action} setup`} ({ai.conf}% confidence). Closest pattern: {ai.pattern} {ai.patScore}%.</div>}
        {s.weight > 25 && <div className="pf-say neu">This is {s.weight.toFixed(0)}% of your portfolio. Avoid putting more into it.</div>}
        <ul>{s.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        <div className="pf-stats">
          {stat('1 month', sgn(s.r1m), tone(s.r1m))}{stat('3 months', sgn(s.r3m), tone(s.r3m))}{stat('1 year', sgn(s.r1y), tone(s.r1y))}
          {stat('Trend', s.trend)}{stat('RSI (14)', s.rsi === null ? '–' : s.rsi.toFixed(0))}{stat('From 1-year high', sgn(s.fromHigh, 0), tone(s.fromHigh))}
        </div>
        <div className="pf-row">
          {!s.isFund && <button className="mini on" onClick={onChart}>Open chart &amp; AI advisor</button>}
          <button className="mini" onClick={onDeep}>Deep analysis</button>
          <button className="mini" onClick={onWhy}>Why did it move?</button>
          <button className="mini" onClick={onNews}>Latest news</button>
          <button className="mini danger" onClick={() => { if (confirm(`Remove ${shortName(s.h.inst)} from this portfolio?`)) pf.removeHolding(s.h.id); }}>Remove {s.isFund ? 'fund' : 'stock'}</button>
        </div>
      </div>
      <div className="pf-det-r">
        <h4>Your purchases</h4>
        {s.h.lots.map((l) => (
          <div className="pf-lot" key={l.id}>
            <label>Qty<input type="number" min="0" value={l.qty} onChange={(e) => pf.setLot(s.h.id, l.id, { qty: Math.max(0, +e.target.value) })} /></label>
            <label>Buy price<input type="number" min="0" step="any" value={l.price} onChange={(e) => pf.setLot(s.h.id, l.id, { price: Math.max(0, +e.target.value) })} /></label>
            <label>Date<input type="date" value={l.date ?? ''} onChange={(e) => pf.setLot(s.h.id, l.id, { date: e.target.value || undefined })} /></label>
            <button className="mini" title="Delete this purchase" onClick={() => pf.removeLot(s.h.id, l.id)}>✕</button>
          </div>
        ))}
        <p className="small">Adding the buy date lets us compare your stock with the market from the day you bought.</p>
      </div>
    </div>
  );
}

function FundSearch({ onPick }: { onPick(h: FundHit): void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FundHit[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 3) { setItems([]); return; }
    let stale = false;
    const t = setTimeout(async () => { const r = await searchFunds(q); if (!stale) setItems(r.slice(0, 30)); }, 300);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);
  return (
    <div className="symsearch">
      <input value={q} placeholder="Type the fund name, e.g. parag parikh flexi" spellCheck={false} style={{ textTransform: 'none' }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && items.length > 0 && (
        <ul className="sresults">
          {items.map((h) => <li key={h.code} onMouseDown={() => { onPick(h); setQ(h.name); setOpen(false); }}><span>{h.name}</span></li>)}
        </ul>
      )}
    </div>
  );
}

function AddForm({ onAdd, market, setMarket }: { onAdd(l: NewLot): void; market: MarketId; setMarket(m: MarketId): void }) {
  const [kind, setKind] = useState<'stock' | 'fund'>('stock');
  const [inst, setInst] = useState<Instrument | null>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [current, setCurrent] = useState('');
  const [date, setDate] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (i: Instrument) => {
    setInst(i); setNow(null);
    const q = (await fetchLivePrices([i]))[i.id];
    if (q) setNow(q.price);
  };
  const switchKind = (k: 'stock' | 'fund') => { setKind(k); setInst(null); setNow(null); setQty(''); setPrice(''); setCurrent(''); };
  const ok = !!inst && !busy && (kind === 'stock' ? +qty > 0 && +price > 0 : +price > 0 && +current > 0);
  const submit = async () => {
    if (!inst || !ok) return;
    if (kind === 'stock') onAdd({ inst, qty: +qty, price: +price, date: date || undefined });
    else {
      // a fund app shows money, not units: units = current value / latest NAV, average NAV = invested / units
      setBusy(true);
      const c = await fetchCandles(inst, '1D', 3);
      setBusy(false);
      if (!c) { alert('Could not load this fund\'s price right now. Try again in a moment.'); return; }
      const units = +current / c[c.length - 1].close;
      onAdd({ inst, qty: units, price: +price / units, date: date || undefined });
    }
    setInst(null); setQty(''); setPrice(''); setCurrent(''); setDate(''); setNow(null);
  };

  return (
    <div className="pf-add">
      <div className="segc" style={{ flexBasis: '100%', margin: 0 }}>
        <button className={kind === 'stock' ? 'on buy' : ''} onClick={() => switchKind('stock')}>Stock / ETF</button>
        <button className={kind === 'fund' ? 'on buy' : ''} onClick={() => switchKind('fund')}>Mutual fund (India)</button>
      </div>
      <label className="fld">{kind === 'stock' ? 'Stock' : 'Fund'}
        {kind === 'stock'
          ? <SymbolSearch current={{ id: inst?.id ?? '', name: '', source: 'yahoo' }} onPick={pick} market={market} onMarket={setMarket} />
          : <FundSearch onPick={(h) => setInst(fundInst(h))} />}
      </label>
      {kind === 'stock' ? <>
        <label className="fld">Quantity<input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 10" /></label>
        <label className="fld">Buy price (per share){now !== null && <em className="pf-hint" onClick={() => setPrice(String(now))}>now {now} · use</em>}<input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 2450" /></label>
      </> : <>
        <label className="fld">Amount invested (₹)<input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 70000" /></label>
        <label className="fld">Current value (₹)<input type="number" min="0" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="e.g. 68000" /></label>
      </>}
      <label className="fld">{kind === 'stock' ? 'Bought on (optional)' : 'First invested on (optional)'}<input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></label>
      <button className="mini buyb pf-addbtn" disabled={!ok} onClick={submit}>{busy ? 'Adding…' : 'Add'}</button>
      <p className="small pf-addnote">{kind === 'stock'
        ? 'Bought the same stock in several lots? Add it again; lots are combined. For US stocks use the plain symbol (AAPL); for India search the company name and pick the one ending in .NS.'
        : 'Both amounts are on the fund\'s page in your app (Invested and Current). Pick the Direct / Growth version that matches yours. The buy date is optional; if you invested through a SIP, leave it blank.'}</p>
    </div>
  );
}
