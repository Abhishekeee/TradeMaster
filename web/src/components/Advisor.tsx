import { fmt, type Advice, type Instrument, type StrategyResult } from '../types';
import { verdictOf } from './StrategyTester';

interface Props {
  advice: Advice | null; inst: Instrument; tf: string; historyReady: boolean; strat: StrategyResult | null;
  showOnChart: boolean; setShowOnChart(v: boolean): void; onSend(): void;
}

const cls = (a: Advice['action']) => (a === 'BUY' ? 'up' : a === 'SELL' ? 'down' : 'neu');
const pct = (a: number, b: number) => `${a >= b ? '+' : '−'}${Math.abs(((a - b) / b) * 100).toFixed(2)}%`;

function Ring({ value }: { value: number }) {
  const r = 38, c = 2 * Math.PI * r;
  return (
    <div className="ring" title="How sure the advisor is">
      <svg viewBox="0 0 90 90"><circle className="trk" cx="45" cy="45" r={r} /><circle className="val" cx="45" cy="45" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, value)) / 100)} /></svg>
      <b>{value}<small>%</small></b>
    </div>
  );
}

export default function Advisor({ advice: a, inst, tf, historyReady, strat, showOnChart, setShowOnChart, onSend }: Props) {
  if (!a) return (
    <aside className="panel" aria-busy="true">
      <div className="adv-hero">
        <div style={{ flex: 1, position: 'relative' }}>
          <div className="hud-k">AI advisor · {tf}</div>
          <div className="sk" style={{ width: 120, height: 30, marginTop: 8 }} />
          <div className="sk" style={{ width: 170, height: 12, marginTop: 12 }} />
        </div>
        <div className="ring"><svg viewBox="0 0 90 90"><circle className="trk" cx="45" cy="45" r="38" /><circle className="val spin" cx="45" cy="45" r="38" strokeDasharray="60 180" /></svg></div>
      </div>
      <div className="ladder">{[0, 1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 40, borderRadius: 12, animationDelay: `${i * 0.12}s` }} />)}</div>
      <p className="small" style={{ textAlign: 'center' }}>Reading the chart, checking past results and the bigger trend…</p>
    </aside>
  );
  const isOpt = inst.kind === 'OPTION';
  const verb = a.action === 'BUY' ? (isOpt ? 'BUY' : 'BUY') : a.action === 'SELL' ? (isOpt ? 'SELL' : 'SELL') : 'WAIT';
  const plan = a.action !== 'WAIT' && a.sl !== null && a.tp1 !== null && a.tp2 !== null;

  return (
    <aside className="panel">
      <div className={`adv-hero ${cls(a.action)}`}>
        <div style={{ flex: 1, position: 'relative' }}>
          <div className="hud-k">AI advisor · {tf}</div>
          <div className={`adv-verb ${cls(a.action)}`} style={{ marginTop: 6 }}>{verb}</div>
          <div className="adv-sub">{a.action === 'WAIT' ? 'No clear edge right now' : `${a.level} confidence${a.setup ? ` · ${a.setup}` : ''}`}</div>
        </div>
        <Ring value={a.conf} />
      </div>

      {plan && (<>
        <div className="ladder">
          <div className="rung tp"><span>Target 2</span><b>{fmt(a.tp2 as number)}</b><em>{pct(a.tp2 as number, a.entry)}</em></div>
          <div className="rung tp"><span>Target 1</span><b>{fmt(a.tp1 as number)}</b><em>{pct(a.tp1 as number, a.entry)}</em></div>
          <div className="rung en"><span>Entry</span><b>{fmt(a.entry)}</b><em style={{ color: 'var(--mute)' }}>now</em></div>
          <div className="rung sl"><span>Stop</span><b>{fmt(a.sl as number)}</b><em>{pct(a.sl as number, a.entry)}</em></div>
        </div>
        <div className="rr"><span>Reward : risk</span><b>{a.rr.toFixed(1)} : 1</b></div>
        <button className="cta" onClick={onSend}>Send to paper trade →</button>
        <label className="chk" style={{ margin: '10px 2px 4px', fontSize: 12 }}><input type="checkbox" checked={showOnChart} onChange={(e) => setShowOnChart(e.target.checked)} /> Show levels on chart</label>

        {a.option && (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="hud-k">If trading options</div>
            <div className="big" style={{ marginTop: 4 }}><span className={a.option.type === 'CALL' ? 'up' : 'down'}>Buy {a.option.type}</span> <span className="small">≈ {fmt(a.option.strike)} · {a.option.expiry}</span></div>
          </div>
        )}
      </>)}

      <h3 style={{ marginTop: 16 }}>Why</h3>
      <div className="reasons">{a.reasons.map((r) => <span key={r}>{r}</span>)}{a.warnings.map((w) => <span key={w} className="w" title={w}>⚠ {w.length > 62 ? `${w.slice(0, 60)}…` : w}</span>)}</div>

      <details className="more">
        <summary>Track record of this setup</summary>
        <div>
          {a.history ? (<>
            <b>{a.history.name}</b> on {inst.id} {tf}: {a.history.n} past trades, <b>{a.history.winRate.toFixed(0)}%</b> won
            <div className={a.history.edge >= 3 ? 'up' : a.history.edge <= -3 ? 'down' : 'neu'}>
              {a.history.edge >= 3 ? 'Beat' : a.history.edge <= -3 ? 'Lost to' : 'About equal to'} a blind guess ({a.history.edge > 0 ? '+' : ''}{a.history.edge.toFixed(0)} pts)
            </div>
          </>) : <span className="small">{historyReady ? 'Not enough past examples of this pattern here.' : 'Checking past performance…'}</span>}
        </div>
      </details>

      <details className="more">
        <summary>Strategy check</summary>
        <div>
          {strat ? (() => {
            const v = verdictOf(strat);
            return (<>
              <b className={v.cls}>{strat.n} trades · profit factor {Number.isFinite(strat.profitFactor) ? strat.profitFactor.toFixed(2) : '∞'} · {strat.returnPct >= 0 ? '+' : ''}{strat.returnPct.toFixed(1)}% vs {strat.buyHold >= 0 ? '+' : ''}{strat.buyHold.toFixed(1)}% buy &amp; hold</b>
              <div className="small" style={{ marginTop: 4 }}>{v.text}</div>
            </>);
          })() : <span className="small">Replaying the advisor on past candles…</span>}
        </div>
      </details>

      {a.warnings.length > 0 && (
        <details className="more">
          <summary>All warnings ({a.warnings.length})</summary>
          <div><ul style={{ margin: 0, paddingLeft: 16 }}>{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
        </details>
      )}

      <p className="disc">Rules and statistics, not a prediction. Practise in paper trading first.</p>
    </aside>
  );
}
