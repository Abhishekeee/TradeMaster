import { useMemo, useRef, useState } from 'react';
import type { DayRange } from '../data';

const W = 640, H = 230, PAD = { l: 10, r: 10, t: 12, b: 22 };
const RANGES: [string, number][] = [['1Y', 12], ['3Y', 36], ['5Y', 60], ['All', 0]];

const num = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nice = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Tap the day you bought on the stock's price chart. Shows what it really traded at then (not adjusted for later splits),
 * and gives one tap for the low, close or high of that day. If a price was already typed it is drawn as a dashed line, with green
 * ticks on the days that price was reached.
 */
export default function ChartPicker({ days, sym, price, onUse }: { days: DayRange[]; sym: string; price: number; onUse(day: DayRange, price: number): void }) {
  const [range, setRange] = useState('1Y');
  const [hover, setHover] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const win = useMemo(() => {
    const m = RANGES.find(([k]) => k === range)?.[1] ?? 12;
    if (!m) return days;
    const d = new Date(); d.setMonth(d.getMonth() - m);
    const cut = d.toISOString().slice(0, 10);
    return days.filter((x) => x.date >= cut);
  }, [days, range]);

  const geo = useMemo(() => {
    if (win.length < 2) return null;
    let lo = Infinity, hi = 0;
    for (const d of win) { if (d.low < lo) lo = d.low; if (d.high > hi) hi = d.high; }
    if (price > 0) { lo = Math.min(lo, price); hi = Math.max(hi, price); }
    const span = hi - lo || 1;
    const x = (i: number) => PAD.l + (i / (win.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);
    const step = Math.max(1, Math.ceil(win.length / 700));
    let path = '';
    for (let i = 0; i < win.length; i += step) path += `${path ? 'L' : 'M'}${x(i).toFixed(1)},${y(win[i].close).toFixed(1)}`;
    path += `L${x(win.length - 1).toFixed(1)},${y(win[win.length - 1].close).toFixed(1)}`;
    // days the typed price was reached: ticks along the dashed line (at most ~300 so it stays light)
    const ticks: number[] = [];
    if (price > 0) {
      const tol = Math.max(0.01, price * 0.0001);
      const hit = win.map((d, i) => (price >= d.low - tol && price <= d.high + tol ? i : -1)).filter((i) => i >= 0);
      const s2 = Math.max(1, Math.ceil(hit.length / 300));
      hit.forEach((i, k) => { if (k % s2 === 0) ticks.push(i); });
    }
    return { lo, hi, x, y, path, ticks };
  }, [win, price]);

  if (!geo) return <p className="small">Not enough price history to draw a chart yet.</p>;

  const at = (e: { clientX: number }) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return 0;
    const f = (e.clientX - r.left) / r.width * W;
    return Math.max(0, Math.min(win.length - 1, Math.round(((f - PAD.l) / (W - PAD.l - PAD.r)) * (win.length - 1))));
  };
  const shown = sel !== null && win[sel] ? win[sel] : hover !== null ? win[hover] : null;
  const chosen = sel !== null ? win[sel] : null;
  const mid = (a: number, b: number) => (a + b) / 2;

  return (
    <div className="cp">
      <div className="cp-top">
        <span className="small">Tap the day you bought</span>
        <span className="grow" />
        {RANGES.map(([k]) => <button key={k} className={`mini ${k === range ? 'on' : ''}`} onClick={() => { setRange(k); setSel(null); setHover(null); }}>{k}</button>)}
      </div>
      <svg ref={svg} className="cp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price chart: tap a day"
        onPointerMove={(e) => setHover(at(e))} onPointerLeave={() => setHover(null)} onClick={(e) => setSel(at(e))}>
        <text x={W - PAD.r} y={PAD.t + 2} textAnchor="end" className="cp-ax">{sym}{num(geo.hi)}</text>
        <text x={W - PAD.r} y={H - PAD.b - 4} textAnchor="end" className="cp-ax">{sym}{num(geo.lo)}</text>
        <text x={PAD.l} y={H - 5} className="cp-ax">{nice(win[0].date)}</text>
        <text x={W - PAD.r} y={H - 5} textAnchor="end" className="cp-ax">{nice(win[win.length - 1].date)}</text>
        {price > 0 && <>
          <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(price)} y2={geo.y(price)} className="cp-price" />
          {geo.ticks.map((i) => <line key={i} x1={geo.x(i)} x2={geo.x(i)} y1={geo.y(price) - 5} y2={geo.y(price) + 5} className="cp-tick" />)}
          <text x={PAD.l + 2} y={geo.y(price) - 6} className="cp-ax cp-pl">your {sym}{num(price)}</text>
        </>}
        <path d={geo.path} className="cp-line" />
        {shown && (() => { const i = win.indexOf(shown); return <>
          <line x1={geo.x(i)} x2={geo.x(i)} y1={PAD.t} y2={H - PAD.b} className="cp-cross" />
          <line x1={geo.x(i)} x2={geo.x(i)} y1={geo.y(shown.high)} y2={geo.y(shown.low)} className="cp-range" />
          <circle cx={geo.x(i)} cy={geo.y(shown.close)} r="4" className={`cp-dot ${chosen === shown ? 'on' : ''}`} />
        </>; })()}
      </svg>
      <div className="cp-info">
        {shown
          ? <><b>{nice(shown.date)}</b><span>low {sym}{num(shown.low)} · high {sym}{num(shown.high)} · closed {sym}{num(shown.close)}</span></>
          : <span className="small">Move over the chart to see prices, tap to choose a day.</span>}
      </div>
      {chosen && (
        <div className="cp-use">
          <span className="small">What did you pay on {nice(chosen.date)}?</span>
          {([['Low', chosen.low], ['About the middle', mid(chosen.low, chosen.high)], ['Close', chosen.close], ['High', chosen.high]] as [string, number][]).map(([l, v]) => (
            <button key={l} className="qa-chip" onClick={() => onUse(chosen, Number(v.toFixed(2)))}>{l} {sym}{num(v)} · use this</button>
          ))}
        </div>
      )}
    </div>
  );
}
