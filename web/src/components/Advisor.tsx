import { fmt, type Advice, type Instrument, type StrategyResult } from '../types';
import { verdictOf } from './StrategyTester';

interface Props {
  advice: Advice | null; inst: Instrument; tf: string; historyReady: boolean; strat: StrategyResult | null;
  showOnChart: boolean; setShowOnChart(v: boolean): void; onSend(): void;
}

const cls = (a: Advice['action']) => (a === 'BUY' ? 'up' : a === 'SELL' ? 'down' : 'neu');
const pct = (a: number, b: number) => `${a >= b ? '+' : '−'}${Math.abs(((a - b) / b) * 100).toFixed(2)}%`;

export default function Advisor({ advice: a, inst, tf, historyReady, strat, showOnChart, setShowOnChart, onSend }: Props) {
  if (!a) return <aside className="panel"><p className="small">Waiting for enough price history to analyse…</p></aside>;
  const isOpt = inst.kind === 'OPTION';
  const verb = a.action === 'BUY' ? (isOpt ? 'BUY' : 'BUY / LONG') : a.action === 'SELL' ? (isOpt ? 'SELL' : 'SELL / SHORT') : 'WAIT';

  return (
    <aside className="panel">
      <h3>AI advisor · {inst.id} {tf}</h3>
      <div className={`card advcard ${cls(a.action)}`}>
        <div className={`advbig ${cls(a.action)}`}>{verb}</div>
        <div className="small">{a.action === 'WAIT' ? 'No clear edge right now' : a.setup ? `Setup: ${a.setup}` : 'Setup: trend and candle signals'}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="small">Confidence</span>
          <b>{a.conf}% · {a.level}</b>
        </div>
        <div className="bar"><i className={a.conf >= 70 ? 'up' : a.conf >= 50 ? 'neu' : 'down'} style={{ width: `${a.conf}%` }} /></div>
      </div>

      {a.action !== 'WAIT' && a.sl !== null && a.tp1 !== null && a.tp2 !== null && (<>
        <h3>Trade plan</h3>
        <div className="card">
          <table className="kv"><tbody>
            <tr><td>Entry (market)</td><td>{fmt(a.entry)}</td></tr>
            <tr><td>Stop loss</td><td className="down">{fmt(a.sl)} <span className="small">({pct(a.sl, a.entry)})</span></td></tr>
            <tr><td>Target 1 (1.5R)</td><td className="up">{fmt(a.tp1)} <span className="small">({pct(a.tp1, a.entry)})</span></td></tr>
            <tr><td>Target 2</td><td className="up">{fmt(a.tp2)} <span className="small">({pct(a.tp2, a.entry)})</span></td></tr>
            <tr><td>Reward : risk (T2)</td><td>{a.rr.toFixed(1)} : 1</td></tr>
          </tbody></table>
          <label className="chk" style={{ marginTop: 8 }}><input type="checkbox" checked={showOnChart} onChange={(e) => setShowOnChart(e.target.checked)} /> Draw these levels on the chart</label>
          <button className="act" style={{ marginTop: 8 }} onClick={onSend}>Send to paper ticket →</button>
        </div>

        {a.option && (
          <>
            <h3>If trading options</h3>
            <div className="card">
              <div className="big"><span className={a.option.type === 'CALL' ? 'up' : 'down'}>Buy {a.option.type}</span> <span className="small">≈ {fmt(a.option.strike)} strike</span></div>
              <div className="small">Expiry: {a.option.expiry}</div>
              <p className="small">{a.option.note}</p>
            </div>
          </>
        )}
      </>)}

      <h3>Why</h3>
      <div className="card">
        <ul>{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>

      <h3>Track record of this setup</h3>
      <div className="card">
        {a.history ? (
          <>
            <b>{a.history.name}</b> on {inst.id} {tf}: {a.history.n} past trades, <b>{a.history.winRate.toFixed(0)}%</b> won
            <div className={a.history.edge >= 3 ? 'up' : a.history.edge <= -3 ? 'down' : 'neu'}>
              {a.history.edge >= 3 ? 'Beat' : a.history.edge <= -3 ? 'Lost to' : 'About equal to'} a blind guess ({a.history.edge > 0 ? '+' : ''}{a.history.edge.toFixed(0)} points)
            </div>
          </>
        ) : <span className="small">{historyReady ? 'This pattern has not appeared enough times in the loaded history.' : 'Checking the past performance of this pattern…'}</span>}
      </div>

      <h3>Strategy check on this chart</h3>
      <div className="card">
        {strat ? (() => {
          const v = verdictOf(strat);
          return (<>
            <b className={v.cls}>{strat.n} past trades: profit factor {Number.isFinite(strat.profitFactor) ? strat.profitFactor.toFixed(2) : '∞'}, {strat.returnPct >= 0 ? '+' : ''}{strat.returnPct.toFixed(1)}% vs {strat.buyHold >= 0 ? '+' : ''}{strat.buyHold.toFixed(1)}% buy &amp; hold</b>
            <div className="small" style={{ marginTop: 4 }}>{v.text} See the Stats tab to test other settings.</div>
          </>);
        })() : <span className="small">Replaying the advisor on past candles…</span>}
      </div>

      {a.warnings.length > 0 && (<>
        <h3>Watch out</h3>
        <div className="card warn"><ul>{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
      </>)}

      <p className="disc">
        This advisor is rules and statistics, not a language model or a crystal ball. It combines pattern match, trend, RSI, candle signals and swing levels, then lowers its confidence when the same pattern lost money here in the past. Stop and target levels come from swing structure and recent volatility. No setup wins every time. Test it in paper trading first and risk only what you can afford to lose.
      </p>
    </aside>
  );
}
