import { useState } from 'react';
import type { BacktestResult, BtStat } from '../types';

interface Props { symbol: string; tf: string; run(horizon: number, minScore: number, onProgress: (p: number) => void): Promise<BacktestResult> }

const edgeCls = (e: number, n: number) => (n < 15 ? 'neu' : e >= 5 ? 'up' : e <= -5 ? 'down' : 'neu');

function Row({ s }: { s: BtStat }) {
  return (
    <tr>
      <td>{s.name}</td>
      <td>{s.n}</td>
      <td>{s.n ? `${s.winRate.toFixed(0)}%` : '–'}</td>
      <td className={edgeCls(s.edge, s.n)}>{s.n ? `${s.edge > 0 ? '+' : ''}${s.edge.toFixed(0)}` : '–'}</td>
      <td className={s.avgRet >= 0 ? 'up' : 'down'}>{s.n ? `${s.avgRet.toFixed(2)}%` : '–'}</td>
    </tr>
  );
}

function Table({ rows }: { rows: BtStat[] }) {
  return (
    <table>
      <tbody>
        <tr><th>Signal</th><th>Trades</th><th>Win</th><th title="Win rate minus what a blind guess in the same direction would score">Edge</th><th>Avg</th></tr>
        {rows.map((s) => <Row key={s.name} s={s} />)}
      </tbody>
    </table>
  );
}

export default function Backtest({ symbol, tf, run }: Props) {
  const [horizon, setHorizon] = useState(20);
  const [minScore, setMinScore] = useState(55);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState<BacktestResult | null>(null);

  const go = async () => {
    setBusy(true); setPct(0);
    const r = await run(horizon, minScore, setPct);
    setRes(r); setBusy(false);
  };

  const verdict = res && (res.closest.n < 15
    ? 'Too few trades to judge. Try a lower minimum score or a smaller timeframe.'
    : res.closest.edge >= 5
      ? 'Closest-pattern calls beat a blind guess on this sample. Check other symbols and timeframes before trusting it.'
      : res.closest.edge <= -5
        ? 'Closest-pattern calls did worse than a blind guess on this sample.'
        : 'Closest-pattern calls were about as good as a coin flip on this sample.');

  return (
    <>
      <h3>Backtest · how accurate were the calls?</h3>
      <div className="card">
        <div className="small">Replays up to ~1000 past candles of {symbol} {tf}. At each point it sees only earlier candles, makes the call, then checks the price later.</div>
        <div className="btctl">
          <label>Check after
            <select value={horizon} onChange={(e) => setHorizon(+e.target.value)}>
              {[10, 20, 50].map((h) => <option key={h} value={h}>{h} candles</option>)}
            </select>
          </label>
          <label>Min match
            <select value={minScore} onChange={(e) => setMinScore(+e.target.value)}>
              {[45, 55, 65, 75].map((h) => <option key={h} value={h}>{h}%</option>)}
            </select>
          </label>
        </div>
        <button className="act" disabled={busy} onClick={go}>{busy ? `Running… ${Math.round(pct * 100)}%` : 'Run backtest'}</button>
      </div>

      {res && (<>
        <div className="card">
          <b>Verdict:</b> {verdict}
          <div className="small" style={{ marginTop: 6 }}>
            In this period price rose in {res.baseUp.toFixed(0)}% of {res.H}-candle windows (the baseline a blind buyer gets).
            Edge = win rate minus that baseline for the same direction. Candle signals are judged after {res.Hc} candles.
          </div>
        </div>
        <div className="card">
          <Table rows={[{ ...res.closest, name: 'Closest chart pattern' }, { ...res.bias, name: 'Overall bias (±25+)' }]} />
        </div>
        <h3>By chart pattern</h3>
        <div className="card">{res.charts.length ? <Table rows={res.charts} /> : <span className="small">No pattern reached {res.minScore}%.</span>}</div>
        <h3>By candlestick signal</h3>
        <div className="card">{res.candles.length ? <Table rows={res.candles} /> : <span className="small">No signals.</span>}</div>
        <h3>Latest backtest calls</h3>
        <div className="card">
          <table><tbody>
            {res.recent.map((r, i) => (
              <tr key={i}>
                <td>{new Date(r.time * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                <td>{r.name}</td>
                <td className={r.dir > 0 ? 'up' : 'down'}>{r.dir > 0 ? 'BUY' : 'SELL'}</td>
                <td className={r.win ? 'up' : 'down'}>{r.win ? 'Right' : 'Wrong'} {r.ret.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody></table>
        </div>
        <p className="small">Small samples (under ~30 trades) are noise. Past results don't guarantee future results.</p>
      </>)}
    </>
  );
}
