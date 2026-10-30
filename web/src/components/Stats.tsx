import { useMemo } from 'react';
import type { Cur } from '../fx';
import type { usePaper } from '../paper';
import type { StrategyResult } from '../types';
import EquityChart from './EquityChart';
import StrategyTester from './StrategyTester';

type Paper = ReturnType<typeof usePaper>;
interface Props {
  paper: Paper; cur: Cur; symbol: string; tf: string;
  runStrategy(target: 'tp1' | 'tp2', minConf: number, onProgress: (p: number) => void): Promise<StrategyResult | null>;
}

const col = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : '');

export default function Stats({ paper, cur, symbol, tf, runStrategy }: Props) {
  const h = paper.acc.history;

  const s = useMemo(() => {
    const trades = [...h].sort((a, b) => a.exitTime - b.exitTime);
    const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0);
    const gw = wins.reduce((x, t) => x + t.pnl, 0), gl = Math.abs(losses.reduce((x, t) => x + t.pnl, 0));
    let run = 0, peak = 0, dd = 0;
    const curve = [{ t: trades[0]?.time ?? 0, v: 0 }];
    trades.forEach((t) => { run += t.pnl; peak = Math.max(peak, run); dd = Math.max(dd, peak - run); curve.push({ t: t.exitTime, v: run }); });
    const by: Record<string, { n: number; pnl: number; w: number }> = {};
    trades.forEach((t) => { const k = t.inst.id; const b = (by[k] = by[k] || { n: 0, pnl: 0, w: 0 }); b.n++; b.pnl += t.pnl; if (t.pnl > 0) b.w++; });
    const longs = trades.filter((t) => t.side === 'long'), shorts = trades.filter((t) => t.side === 'short');
    const wr = (a: typeof trades) => (a.length ? (100 * a.filter((t) => t.pnl > 0).length) / a.length : 0);
    return {
      n: trades.length, winRate: trades.length ? (100 * wins.length) / trades.length : 0,
      pf: gl ? gw / gl : gw ? Infinity : 0,
      avgWin: wins.length ? gw / wins.length : 0, avgLoss: losses.length ? -gl / losses.length : 0,
      expectancy: trades.length ? run / trades.length : 0, total: run, dd, curve,
      best: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0, worst: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
      fees: trades.reduce((x, t) => x + (t.fees ?? 0), 0),
      longN: longs.length, longWR: wr(longs), shortN: shorts.length, shortWR: wr(shorts),
      stops: trades.filter((t) => t.reason === 'stop').length, targets: trades.filter((t) => t.reason === 'target').length,
      by: Object.entries(by).sort((a, b) => b[1].pnl - a[1].pnl),
    };
  }, [h]);

  return (
    <aside className="panel">
      <h3>Your paper-trading performance</h3>
      {s.n === 0 ? (
        <div className="empty">No closed trades yet.<br /><span className="small">Close a position and your statistics will appear here.</span></div>
      ) : (<>
        <div className="card">
          <div className="small">Realized profit curve ({cur.code}, after fees)</div>
          <EquityChart points={s.curve.map((p) => ({ t: p.t, v: cur.fromUSD(p.v) }))} base={0} label={(x) => x.toFixed(0)} />
          <div className="stats">
            <div><span>Total net P&amp;L</span><b className={col(s.total)}>{cur.signed(s.total)}</b></div>
            <div><span>Trades</span><b>{s.n}</b></div>
            <div><span>Win rate</span><b>{s.winRate.toFixed(0)}%</b></div>
            <div><span>Profit factor</span><b className={s.pf >= 1 ? 'up' : 'down'}>{Number.isFinite(s.pf) ? s.pf.toFixed(2) : '∞'}</b></div>
            <div><span>Average win</span><b className="up">{cur.signed(s.avgWin)}</b></div>
            <div><span>Average loss</span><b className="down">{cur.signed(s.avgLoss)}</b></div>
            <div><span>Expectancy per trade</span><b className={col(s.expectancy)}>{cur.signed(s.expectancy)}</b></div>
            <div><span>Largest drawdown</span><b className="down">−{cur.money(s.dd)}</b></div>
            <div><span>Best / worst trade</span><b>{cur.signed(s.best)} / {cur.signed(s.worst)}</b></div>
            <div><span>Fees paid</span><b>{cur.money(s.fees)}</b></div>
            <div><span>Longs</span><b>{s.longN} · {s.longWR.toFixed(0)}% won</b></div>
            <div><span>Shorts</span><b>{s.shortN} · {s.shortWR.toFixed(0)}% won</b></div>
          </div>
          <div className="small" style={{ marginTop: 8 }}>{s.stops} trades ended on a stop, {s.targets} on a target, {s.n - s.stops - s.targets} were closed by hand.</div>
        </div>
        <h3>By symbol</h3>
        <div className="card">
          <table className="hist"><tbody>
            <tr><th>Symbol</th><th>Trades</th><th>Win</th><th>Net P&amp;L</th></tr>
            {s.by.map(([id, b]) => (
              <tr key={id}><td><b>{id}</b></td><td>{b.n}</td><td>{((100 * b.w) / b.n).toFixed(0)}%</td><td className={col(b.pnl)}><b>{cur.signed(b.pnl)}</b></td></tr>
            ))}
          </tbody></table>
        </div>
      </>)}

      <h3>Strategy tester · {symbol} {tf}</h3>
      <StrategyTester symbol={symbol} tf={tf} run={runStrategy} />
    </aside>
  );
}
