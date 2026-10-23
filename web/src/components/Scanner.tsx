import { useRef, useState } from 'react';
import { fetchCandles } from '../data';
import { runAnalysis } from '../engine/client';
import { advise } from '../engine/patterns.js';
import { categoriesFor, type MarketId } from '../markets';
import type { useWatchlist } from '../watchlist';
import type { Advice, Instrument } from '../types';

interface Row { inst: Instrument; pattern: string; score: number; eff: number; candle: string; candleScore: number; action: Advice['action']; conf: number }
interface Props { watch: ReturnType<typeof useWatchlist>; onPick(i: Instrument, tf: string): void; market?: MarketId }

const TFS = ['15m', '1h', '4h', '1D'];
const col = (x: number) => (x > 0.1 ? 'up' : x < -0.1 ? 'down' : 'neu');

/** Scans a whole list of markets for the best pattern and AI setup right now. */
export default function Scanner({ watch, onPick, market = 'ALL' }: Props) {
  const universes = [...(watch.list.length ? [{ id: 'watch', label: '★ Watchlist', items: watch.list }] : []), ...categoriesFor(market).map((c) => ({ id: c.id, label: c.label, items: c.items }))];
  const [uni, setUni] = useState(universes[0].id);
  const [tf, setTf] = useState('1h');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'all' | 'BUY' | 'SELL'>('all');
  const [sort, setSort] = useState<'score' | 'conf'>('score');
  const [skipped, setSkipped] = useState(0);
  const run = useRef(0);

  const items = (universes.find((u) => u.id === uni) ?? universes[0]).items;

  const scan = async () => {
    const my = ++run.current;
    setBusy(true); setDone(0); setRows([]); setSkipped(0);
    const queue = [...items];
    let finished = 0, miss = 0;
    const worker = async () => {
      for (let inst = queue.shift(); inst; inst = queue.shift()) {
        if (my !== run.current) return;
        try {
          const c = await fetchCandles(inst, tf, 400);
          if (c && c.length >= 60) {
            const { analysis: a } = await runAnalysis(c, false);
            if (a) {
              const ad = advise(c.slice(-500), a, null, { tf }) as Advice;
              const cd = a.candles[0];
              const row: Row = { inst, pattern: a.charts[0].name, score: a.charts[0].score, eff: a.charts[0].eff, candle: cd.name, candleScore: cd.score, action: ad.action, conf: ad.conf };
              if (my === run.current) setRows((r) => [...r, row]);
            } else miss++;
          } else miss++;
        } catch { miss++; }
        finished++;
        if (my === run.current) { setDone(finished); setSkipped(miss); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);   // four at a time
    if (my === run.current) setBusy(false);
  };

  const shown = rows
    .filter((r) => filter === 'all' || r.action === filter)
    .sort((a, b) => (sort === 'score' ? b.score - a.score : b.conf - a.conf));

  return (
    <div>
      <div className="mk-bar">
        <label className="small">Market
          <select value={uni} onChange={(e) => setUni(e.target.value)}>{universes.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
        </label>
        <label className="small">Timeframe
          <select value={tf} onChange={(e) => setTf(e.target.value)}>{TFS.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <button className="mini on" disabled={busy} onClick={scan}>{busy ? `Scanning ${done}/${items.length}…` : `Scan ${items.length} symbols`}</button>
      </div>
      <div className="mk-bar">
        {(['all', 'BUY', 'SELL'] as const).map((f) => <button key={f} className={`mini ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f}</button>)}
        <span className="small">Sort by</span>
        <button className={`mini ${sort === 'score' ? 'on' : ''}`} onClick={() => setSort('score')}>Pattern match</button>
        <button className={`mini ${sort === 'conf' ? 'on' : ''}`} onClick={() => setSort('conf')}>AI confidence</button>
      </div>
      {shown.length ? (
        <div className="mk-scroll">
          <table className="mk-list scan"><tbody>
            <tr className="small"><th>Symbol</th><th>Closest chart pattern</th><th>AI</th></tr>
            {shown.map((r) => (
              <tr key={r.inst.id} className="link" onClick={() => onPick(r.inst, tf)}>
                <td><b>{r.inst.id}</b><div className="small">{r.inst.name}</div></td>
                <td><span className={col(r.eff)}>{r.eff > 0.1 ? '▲' : r.eff < -0.1 ? '▼' : '◆'}</span> {r.pattern} <b>{r.score}%</b><div className="small">Candle: {r.candle} {r.candleScore}%</div></td>
                <td><b className={r.action === 'BUY' ? 'up' : r.action === 'SELL' ? 'down' : 'neu'}>{r.action}</b><div className="small">{r.conf}%</div></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      ) : <p className="small">{busy ? 'Working…' : rows.length ? 'Nothing matches this filter.' : 'Pick a market and timeframe, then scan. The scan downloads recent candles for each symbol and checks every pattern, so it takes a few seconds.'}</p>}
      {skipped > 0 && <p className="small">{skipped} symbol(s) had no usable data and were skipped.</p>}
      <p className="small">A high pattern match is not a prediction. The AI column is the same advisor as on the chart, so read its track record there before acting.</p>
    </div>
  );
}
