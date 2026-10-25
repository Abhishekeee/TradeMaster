import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts';
import Nav from './Nav';
import AccountMenu from './AccountMenu';
import { useTheme } from '../theme';
import { COUNTRIES, PERIODS, PERIOD_NAME, periodStart, priceSeries, rebased, statsOf, useWorld, type Country, type Period, type Stats } from '../world';

const COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#17becf', '#8c6bb1', '#d6616b'];
const colorOf = (sym: string) => (sym === '^NSEI' ? '#ff9933' : COLORS[(COUNTRIES.findIndex((c) => c.sym === sym) + 3) % COLORS.length]);
const THEMES = { dark: { bg: 'rgba(0,0,0,0)', text: '#9096b8', grid: 'rgba(255,255,255,0.05)' }, light: { bg: 'rgba(0,0,0,0)', text: '#5a6082', grid: 'rgba(30,34,80,0.08)' } };
const KEY = 'tm-world';
const DEFAULT_SEL = ['^NSEI', '^GSPC', '^FTSE', '^GDAXI', '^N225', '000001.SS', '^HSI'];

const pc = (n: number | null, d = 1) => (n === null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`);
const tone = (n: number | null) => (n === null || Math.abs(n) < 0.05 ? '' : n > 0 ? 'up' : 'down');
const heat = (n: number | null) => (n === null ? undefined : { background: `${n >= 0 ? 'rgba(38,166,154,' : 'rgba(239,83,80,'}${Math.min(Math.abs(n) / 30, 1) * 0.4})` });
const cc = (c: Country) => <span className="wd-cc">{c.code}</span>;
const label = (c: Country) => (c.sym === '^GSPC' || c.sym === '^IXIC' || c.sym === '^DJI' ? c.name : c.country);

interface Line { sym: string; color: string; data: { time: number; value: number }[] }

/** Several countries on one chart, each shown as % gain since the period began. */
function WorldChart({ lines, highlight, theme, onHover }: { lines: Line[]; highlight: string | null; theme: 'dark' | 'light'; onHover(h: { time: number; v: Record<string, number> } | null): void }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>();
  const map = useRef(new Map<ISeriesApi<'Line'>, string>());
  const series = useRef(new Map<string, ISeriesApi<'Line'>>());
  const hover = useRef(onHover);
  hover.current = onHover;

  useEffect(() => {
    const t = THEMES[theme];
    const ch = createChart(box.current!, {
      autoSize: true,
      layout: { background: { color: t.bg }, textColor: t.text },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.grid }, timeScale: { borderColor: t.grid, rightOffset: 2 },
      crosshair: { mode: 0 },
      localization: { priceFormatter: (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%` },
    });
    chart.current = ch;
    ch.subscribeCrosshairMove((p) => {
      if (!p.time || !p.point) { hover.current(null); return; }
      const v: Record<string, number> = {};
      p.seriesData.forEach((d, s) => { const id = map.current.get(s as ISeriesApi<'Line'>); const val = (d as { value?: number }).value; if (id && typeof val === 'number') v[id] = val; });
      hover.current({ time: p.time as number, v });
    });
    return () => { ch.remove(); chart.current = undefined; map.current.clear(); series.current.clear(); };
  }, [theme]);

  useEffect(() => {
    const ch = chart.current;
    if (!ch) return;
    series.current.forEach((s) => ch.removeSeries(s));
    series.current.clear(); map.current.clear();
    lines.forEach((l, i) => {
      const s = ch.addLineSeries({ color: l.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: '' });
      s.setData(l.data.map((d) => ({ time: d.time as Time, value: d.value })));
      if (i === 0) s.createPriceLine({ price: 0, color: THEMES[theme].text, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      series.current.set(l.sym, s); map.current.set(s, l.sym);
    });
    ch.timeScale().fitContent();
  }, [lines, theme]);

  useEffect(() => { series.current.forEach((s, id) => s.applyOptions({ lineWidth: highlight === id ? 4 : 2 })); }, [highlight, lines]);

  return <div ref={box} className="wd-chart" />;
}

type SortKey = 'country' | 'day' | 'm1' | 'm3' | 'm6' | 'ytd' | 'y1' | 'fromHigh' | 'swing';

export default function World() {
  const [theme, flip] = useTheme();
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }, []);
  const [period, setPeriod] = useState<Period>(PERIODS.includes(saved.period) ? saved.period : 'YTD');
  const [usd, setUsd] = useState<boolean>(!!saved.usd);
  const [sel, setSel] = useState<string[]>(Array.isArray(saved.sel) && saved.sel.length ? saved.sel : DEFAULT_SEL);
  const [sort, setSort] = useState<SortKey>('ytd');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [hover, setHover] = useState<{ time: number; v: Record<string, number> } | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const { candles, fx, done, total, updated, loading } = useWorld(usd);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ period, usd, sel })); } catch { /* ignore */ } }, [period, usd, sel]);

  const rows = useMemo(() => COUNTRIES.map((c) => {
    const s = priceSeries(candles[c.sym], c.ccy, usd, fx);
    return { c, s, st: s ? statsOf(s) : null };
  }), [candles, fx, usd]);
  const wait = usd && COUNTRIES.some((c) => c.ccy !== 'USD' && !fx[c.ccy]) && Object.keys(fx).length < 5;

  const last = rows.reduce((m, r) => Math.max(m, r.s?.[r.s.length - 1]?.time ?? 0), 0);
  const start = last ? periodStart(period, last) : 0;
  const pkey = ({ '1M': 'm1', '3M': 'm3', '6M': 'm6', YTD: 'ytd', '1Y': 'y1' } as const)[period];

  // every market trades at its own hour, so put all lines on shared calendar days (holidays carry the last value forward)
  const lines: Line[] = useMemo(() => {
    const day = (t: number) => Math.floor(t / 86400) * 86400;
    const raw = rows.filter((r) => sel.includes(r.c.sym) && r.s).map((r) => {
      const m = new Map<number, number>();
      rebased(r.s!, start).forEach((p) => m.set(day(p.time), p.value));
      return { sym: r.c.sym, m };
    });
    const days = [...new Set(raw.flatMap((x) => [...x.m.keys()]))].sort((a, b) => a - b);
    return raw.map((x) => {
      const first = Math.min(...x.m.keys());
      let prev: number | null = null;
      const data: { time: number; value: number }[] = [];
      for (const d of days) {
        if (x.m.has(d)) prev = x.m.get(d)!;
        if (prev !== null && d >= first) data.push({ time: d, value: prev });
      }
      return { sym: x.sym, color: colorOf(x.sym), data };
    });
  }, [rows, sel, start]);
  const lastVals = useMemo(() => Object.fromEntries(lines.map((l) => [l.sym, l.data[l.data.length - 1]?.value ?? 0])), [lines]);
  const legend = [...lines].map((l) => ({ l, v: hover?.v[l.sym] ?? lastVals[l.sym] })).sort((a, b) => b.v - a.v);

  const ranked = rows.filter((r) => r.st).map((r) => ({ ...r, ret: r.st![pkey] as number | null })).sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9));
  const india = ranked.findIndex((r) => r.c.sym === '^NSEI');
  const best = ranked[0], worst = ranked[ranked.length - 1];
  const avg = ranked.length ? ranked.reduce((a, r) => a + (r.ret ?? 0), 0) / ranked.length : null;

  const table = useMemo(() => {
    const val = (r: (typeof rows)[number]) => (sort === 'country' ? r.c.country : (r.st?.[sort as keyof Stats] as number | null | undefined) ?? -1e9);
    return [...rows].filter((r) => r.st).sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }, [rows, sort, dir]);

  const toggle = (sym: string) => setSel((s) => (s.includes(sym) ? s.filter((x) => x !== sym) : [...s, sym]));
  const pick = (f: (r: (typeof ranked)[number], i: number) => boolean) => setSel(ranked.filter(f).map((r) => r.c.sym));
  const th = (k: SortKey, text: string, cls = 'r') => (
    <th className={`${cls} wd-sort ${sort === k ? 'on' : ''}`} onClick={() => { if (sort === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(k); setDir(k === 'country' ? 1 : -1); } }}>{text}{sort === k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</th>
  );
  const openChart = (c: Country) => {
    try { localStorage.setItem('tm', JSON.stringify({ ...JSON.parse(localStorage.getItem('tm') || '{}'), inst: { id: c.sym, name: `${c.name} · ${c.country}`, source: 'yahoo', kind: 'INDEX' }, market: 'ALL' })); } catch { /* ignore */ }
    location.hash = '#/charts';
  };
  const when = hover ? new Date(hover.time * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <>
      <header className="topbar">
        <a className="logo" href="#/" title="Home" style={{ textDecoration: 'none', color: 'inherit' }}>Trade<b>Master</b></a>
        <Nav page="world" />
        <button className="theme" title="Toggle light / dark mode" onClick={flip}>{theme === 'dark' ? '☀' : '🌙'}</button>
        <span className="small pf-upd">{loading ? `Loading markets… ${done}/${total}` : updated ? `Updated ${new Date(updated).toLocaleTimeString()}` : ''}</span>
        <AccountMenu />
      </header>

      <main className="pf">
        <section className="pf-box">
          <h3>How the world's stock markets are doing</h3>
          {best && worst && best.ret !== null && worst.ret !== null ? (
            <ul>
              <li>Over {PERIOD_NAME[period]}, the best market is <b>{cc(best.c)} {label(best.c)}</b> (<b className={tone(best.ret)}>{pc(best.ret)}</b>) and the weakest is <b>{cc(worst.c)} {label(worst.c)}</b> (<b className={tone(worst.ret)}>{pc(worst.ret)}</b>).</li>
              {india >= 0 && ranked[india].ret !== null && <li><span className="wd-cc">IN</span> India's Nifty 50 is <b className={tone(ranked[india].ret)}>{pc(ranked[india].ret)}</b>, ranking <b>#{india + 1} of {ranked.length}</b>{avg !== null ? `, ${ranked[india].ret! >= avg ? 'ahead of' : 'behind'} the average of ${pc(avg)}` : ''}.</li>}
              <li>{usd ? 'Shown in US dollars, so currency moves are included: a market can look strong at home and weak in dollars.' : 'Shown in each country\'s own currency. Switch to US dollars to compare them fairly.'}</li>
            </ul>
          ) : <p className="small">Loading…</p>}

          <div className="wd-controls">
            <div className="seg">{PERIODS.map((p) => <button key={p} className={p === period ? 'on' : ''} onClick={() => setPeriod(p)}>{p}</button>)}</div>
            <div className="seg">
              <button className={!usd ? 'on' : ''} onClick={() => setUsd(false)}>Local currency</button>
              <button className={usd ? 'on' : ''} onClick={() => setUsd(true)}>US dollars</button>
            </div>
            <span className="wd-quick small">Show:
              <button className="mini" onClick={() => setSel(DEFAULT_SEL)}>Main markets</button>
              <button className="mini" onClick={() => setSel(['^NSEI', '^GSPC'])}>India vs US</button>
              <button className="mini" onClick={() => pick((_, i) => i < 5)}>Top 5</button>
              <button className="mini" onClick={() => pick((_, i) => i >= ranked.length - 5)}>Bottom 5</button>
              {(['Asia', 'Europe', 'Americas'] as const).map((r) => <button key={r} className="mini" onClick={() => pick((x) => x.c.region === r || x.c.sym === '^NSEI')}>{r}</button>)}
              <button className="mini" onClick={() => setSel(COUNTRIES.map((c) => c.sym))}>All</button>
              <button className="mini" onClick={() => setSel([])}>None</button>
            </span>
          </div>

          <div className="wd-wrap">
            <div className="wd-chartbox">
              {lines.length ? <WorldChart lines={lines} highlight={hot} theme={theme} onHover={setHover} /> : <div className="wd-chart wd-empty small">{wait ? 'Loading currency rates…' : 'Pick some countries below, or use a quick choice above.'}</div>}
              <p className="small wd-hint">Hover the chart to compare every line on a day.</p>
            </div>
            <div className="wd-legend">
              <div className="small wd-when">{when ?? `Latest · ${PERIOD_NAME[period]}`}</div>
              {legend.map(({ l, v }) => {
                const c = COUNTRIES.find((x) => x.sym === l.sym)!;
                return (
                  <div key={l.sym} className={`wd-leg ${hot === l.sym ? 'hot' : ''}`} onMouseEnter={() => setHot(l.sym)} onMouseLeave={() => setHot(null)} onClick={() => toggle(l.sym)} title="Click to hide">
                    <i style={{ background: l.color }} /><span>{cc(c)} {label(c)}</span><b className={tone(v)}>{pc(v)}</b>
                  </div>
                );
              })}
              {!legend.length && <p className="small">Nothing selected.</p>}
            </div>
          </div>
        </section>

        <section className="pf-box">
          <h3>Every market, side by side</h3>
          <p className="small">Click a row to plot it. Click a heading to sort.</p>
          <div className="pf-scroll">
            <table className="pf-table wd-table">
              <thead><tr><th></th>{th('country', 'Country', 'l')}<th>Index</th><th className="r">Level</th>{th('day', 'Today')}{th('m1', '1 month')}{th('m3', '3 months')}{th('m6', '6 months')}{th('ytd', 'This year')}{th('y1', '1 year')}{th('fromHigh', 'From 1-yr high')}{th('swing', 'Ups & downs')}<th></th></tr></thead>
              <tbody>
                {table.map(({ c, st }) => {
                  const s = st!;
                  const on = sel.includes(c.sym);
                  return (
                    <tr key={c.sym} className={`link ${c.sym === '^NSEI' ? 'wd-india' : ''}`} onClick={() => toggle(c.sym)} onMouseEnter={() => on && setHot(c.sym)} onMouseLeave={() => setHot(null)}>
                      <td><span className="wd-dot" style={{ background: on ? colorOf(c.sym) : 'transparent', borderColor: colorOf(c.sym) }} /></td>
                      <td><b>{cc(c)} {c.country}</b></td>
                      <td className="small">{c.name}</td>
                      <td className="r">{(() => { const lv = candles[c.sym]?.[candles[c.sym].length - 1]?.close ?? s.level; return lv.toLocaleString(undefined, { maximumFractionDigits: lv > 1000 ? 0 : 2 }); })()}</td>
                      <td className={`r ${tone(s.day)}`} style={heat((s.day ?? 0) * 8)}>{pc(s.day, 2)}</td>
                      {(['m1', 'm3', 'm6', 'ytd', 'y1'] as const).map((k) => <td key={k} className={`r ${tone(s[k])} ${k === pkey ? 'wd-cur' : ''}`} style={heat(s[k])}>{pc(s[k])}</td>)}
                      <td className={`r ${tone(s.fromHigh)}`}>{pc(s.fromHigh)}</td>
                      <td className="r">{s.swing === null ? '–' : `${s.swing.toFixed(0)}%`}</td>
                      <td className="r"><button className="mini" title="Open this index on the Charts page" onClick={(e) => { e.stopPropagation(); openChart(c); }}>Chart</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small">"Ups &amp; downs" is how much the index typically swings in a year. "From 1-yr high" shows how far it sits below its best level of the last year. Index figures are price levels without dividends. Past performance does not predict the future.</p>
        </section>
      </main>
    </>
  );
}
