import { useState } from 'react';
import type { StrategyResult } from '../types';
import EquityChart from './EquityChart';

interface Props {
  symbol: string; tf: string;
  run(target: 'tp1' | 'tp2', minConf: number, onProgress: (p: number) => void): Promise<StrategyResult>;
}

const col = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : '');

export function verdictOf(r: StrategyResult) {
  if (r.n < 30) return { cls: 'neu', text: `Only ${r.n} trades, too few to judge. Try a lower minimum confidence or a smaller timeframe.` };
  if (r.profitFactor >= 1.3 && r.avgR > 0) return { cls: 'up', text: 'Profitable after fees in this sample. Check other markets and timeframes before trusting it, because one good sample can be luck.' };
  if (r.profitFactor >= 1) return { cls: 'neu', text: 'Roughly break-even after fees. Not a reliable edge on its own.' };
  return { cls: 'down', text: 'Lost money after fees in this sample. The signals did not beat trading costs here.' };
}

export default function StrategyTester({ symbol, tf, run }: Props) {
  const [target, setTarget] = useState<'tp1' | 'tp2'>('tp1');
  const [minConf, setMinConf] = useState(50);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState<StrategyResult | null>(null);

  const go = async () => {
    setBusy(true); setPct(0);
    setRes(await run(target, minConf, setPct));
    setBusy(false);
  };
  const v = res && verdictOf(res);

  return (
    <>
      <div className="card">
        <div className="small">Replays the AI advisor on up to 1000 past candles of {symbol} {tf}. Each trade uses the advisor's own stop loss and target, with 0.05% fees per side, one trade at a time. If a candle touches both stop and target, the stop is assumed to hit first.</div>
        <div className="btctl">
          <label className="fld" style={{ marginTop: 0 }}>Exit at
            <select value={target} onChange={(e) => setTarget(e.target.value as 'tp1' | 'tp2')}>
              <option value="tp1">Target 1 (1.5× risk)</option>
              <option value="tp2">Target 2 (pattern move)</option>
            </select>
          </label>
          <label className="fld" style={{ marginTop: 0 }}>Min confidence
            <select value={minConf} onChange={(e) => setMinConf(+e.target.value)}>
              {[35, 50, 60, 70].map((c) => <option key={c} value={c}>{c}%</option>)}
            </select>
          </label>
        </div>
        <button className="act" disabled={busy} onClick={go}>{busy ? `Replaying… ${Math.round(pct * 100)}%` : 'Run strategy test'}</button>
      </div>

      {res && v && (<>
        <div className="card">
          <b className={v.cls}>{v.cls === 'up' ? 'Worked here' : v.cls === 'down' ? 'Did not work here' : 'Inconclusive'}</b>
          <div className="small" style={{ marginTop: 4 }}>{v.text}</div>
        </div>
        <div className="card">
          <div className="stats" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
            <div><span>Trades</span><b>{res.n}</b></div>
            <div><span>Win rate</span><b>{res.winRate.toFixed(0)}%</b></div>
            <div><span>Profit factor</span><b className={res.profitFactor >= 1 ? 'up' : 'down'}>{Number.isFinite(res.profitFactor) ? res.profitFactor.toFixed(2) : '∞'}</b></div>
            <div><span>Average result</span><b className={col(res.avgR)}>{res.avgR >= 0 ? '+' : ''}{res.avgR.toFixed(2)} R</b></div>
            <div><span>Return (risking 1%/trade)</span><b className={col(res.returnPct)}>{res.returnPct >= 0 ? '+' : ''}{res.returnPct.toFixed(1)}%</b></div>
            <div><span>Worst drawdown</span><b className="down">−{res.maxDrawdown.toFixed(1)}%</b></div>
            <div><span>Buy &amp; hold same period</span><b className={col(res.buyHold)}>{res.buyHold >= 0 ? '+' : ''}{res.buyHold.toFixed(1)}%</b></div>
            <div><span>Stops / targets hit</span><b>{res.stops} / {res.targets}</b></div>
          </div>
          <div className="small" style={{ marginTop: 8 }}>Account value, starting at 100 (1% risked per trade)</div>
          <EquityChart points={res.curve} base={100} label={(x) => x.toFixed(0)} />
          <div className="small">R = the amount risked per trade. +1 R means the trade made as much as the stop would have lost. Profit factor above 1 means winners outweighed losers after fees.</div>
        </div>
        <h3>Latest simulated trades</h3>
        <div className="card">
          <table className="hist"><tbody>
            <tr><th>Date</th><th>Side</th><th>Exit</th><th>Result</th></tr>
            {res.trades.slice(-12).reverse().map((t) => (
              <tr key={t.time}>
                <td className="small">{new Date(t.time * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                <td className={t.dir > 0 ? 'up' : 'down'}>{t.dir > 0 ? 'Buy' : 'Sell'}</td>
                <td><span className={`chip ${t.reason === 'time' ? '' : t.reason}`}>{t.reason === 'stop' ? 'Stop' : t.reason === 'target' ? 'Target' : 'Timed out'}</span></td>
                <td className={col(t.r)}><b>{t.r >= 0 ? '+' : ''}{t.r.toFixed(2)} R</b></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </>)}
    </>
  );
}
