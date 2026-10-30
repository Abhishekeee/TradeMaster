import { useState } from 'react';
import { scoreLabel } from '../engine/patterns.js';
import Backtest from './Backtest';
import { cls, word, type Analysis, type BacktestResult, type MtfRow, type Signal } from '../types';

interface Props {
  analysis: Analysis; symbol: string; tf: string; sel: string | null; signals: Signal[];
  onSelect(id: string): void; onTf(tf: string): void; scan(): Promise<MtfRow[]>; onSetup(): void;
  backtest(h: number, min: number, onProgress: (p: number) => void): Promise<BacktestResult | null>;
}

export default function Panel({ analysis: r, symbol, tf, sel, signals, onSelect, onTf, scan, backtest, onSetup }: Props) {
  const [rows, setRows] = useState<MtfRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const top = r.charts[0], cd = r.candles[0];
  const s = [...r.charts, ...r.candles].find((x) => x.id === sel);
  const recent = signals.slice(-8).reverse();
  return (
    <aside className="panel">
      <h3>Closest chart pattern · {symbol} {tf}</h3>
      <div className="card click" onClick={() => onSelect(top.id)}>
        <div className="big">{top.name} <span className={`badge ${cls(top.eff)}`}>{word(top.eff)}</span></div>
        <div className="small">{top.score}% match · {scoreLabel(top.score)}</div>
        <div className="bar"><i className={cls(top.eff)} style={{ width: `${top.score}%` }} /></div>
      </div>
      <div className="card click" onClick={() => onSelect(cd.id)}>
        <div className="small">Closest candlestick</div>
        <b>{cd.name}</b> <span className={`badge ${cls(cd.eff)}`}>{word(cd.eff)}</span> <span className="small">{cd.score}%</span>
      </div>
      <h3>Overall bias</h3>
      <div className="card">
        <div className={`big ${cls(r.bias / 100)}`}>{r.label} <span className="small">({r.bias > 0 ? '+' : ''}{r.bias})</span></div>
        <div className="gauge"><i style={{ left: `${(r.bias + 100) / 2}%` }} /></div>
        <ul>{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      {s && (<>
        <h3>Selected: {s.name}</h3>
        <div className="card">
          <span className={`badge ${cls(s.eff)}`}>{word(s.eff)}</span> <span className="small">{s.score}% match</span>
          <p>{s.desc}</p>
          <p className="small"><b>Confirmation:</b> {s.confirm}</p>
          {s.kind === 'chart' && Math.abs(s.eff) >= 0.1 && <button className="act" onClick={onSetup}>Trade this setup (paper) →</button>}
        </div>
      </>)}
      <h3>Recent candle signals</h3>
      <div className="card">
        {recent.length ? (
          <table><tbody>{recent.map((x) => (
            <tr key={x.time + x.id}>
              <td>{new Date(x.time * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              <td>{x.name}</td>
              <td className={cls(x.bias)}>{x.bias > 0 ? 'BUY' : x.bias < 0 ? 'SELL' : 'WAIT'}</td>
            </tr>))}</tbody></table>
        ) : <span className="small">None yet</span>}
      </div>
      <h3>All timeframes</h3>
      <button className="act" disabled={busy} onClick={async () => { setBusy(true); setRows(await scan()); setBusy(false); }}>
        {busy ? 'Scanning…' : 'Scan closest pattern on every timeframe'}
      </button>
      {rows && (
        <div className="card" style={{ marginTop: 8 }}>
          <table><tbody>
            <tr><th>TF</th><th>Closest</th><th>%</th><th>Bias</th></tr>
            {rows.map((x) => x.top ? (
              <tr key={x.label} className="link" onClick={() => onTf(x.label)}>
                <td>{x.label}</td><td>{x.top}</td><td>{x.score}</td><td className={cls((x.bias ?? 0) / 100)}>{x.verdict}</td>
              </tr>) : <tr key={x.label}><td>{x.label}</td><td colSpan={3}>n/a</td></tr>)}
          </tbody></table>
        </div>
      )}
      <Backtest symbol={symbol} tf={tf} run={backtest} />
      <p className="disc">Pattern matching is heuristic and for education only, not financial advice. Closeness % shows how well recent price action fits each textbook shape.</p>
    </aside>
  );
}
