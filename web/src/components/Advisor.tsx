import { fmt, TF_SEC, type Advice, type Instrument, type StrategyResult } from '../types';
import { verdictOf } from './StrategyTester';
import Info from './Info';

interface Props {
  advice: Advice | null; inst: Instrument; tf: string; historyReady: boolean; strat: StrategyResult | null;
  /** why there is no verdict: too few candles (a new listing) or the checks could not run */
  unavailable?: 'short' | 'failed' | null; bars?: number; setTf?(tf: string): void;
  showOnChart: boolean; setShowOnChart(v: boolean): void; onSend(): void;
}

/** Smaller timeframes to try when the current one has too little history. */
const smaller = (tf: string) => ['1D', '1h', '30m', '15m', '5m'].filter((x) => x !== tf && (TF_SEC[x] ?? 0) < (TF_SEC[tf] ?? Infinity)).slice(0, 3);

function Unavailable({ why, tf, bars, setTf }: { why: 'short' | 'failed'; tf: string; bars: number; setTf?(tf: string): void }) {
  const alt = smaller(tf);
  return (
    <aside className="panel">
      <div className="adv-hero neu">
        <div style={{ flex: 1 }}>
          <div className="hud-k">AI advisor · {tf}</div>
          <div className="adv-verb neu" style={{ marginTop: 6 }}>NOT YET</div>
          <div className="adv-sub">{why === 'short' ? 'Too little price history to judge' : 'Could not finish the checks'}</div>
        </div>
      </div>
      <p className="small" style={{ margin: '12px 2px' }}>
        {why === 'short'
          ? `This ${tf} chart has only ${bars} candle${bars === 1 ? '' : 's'}, and the advisor needs about 40 to read a trend and test it on the past. That is normal for a newly listed stock or IPO.`
          : 'Something went wrong while testing the setup on past candles. Try again, or switch timeframe.'}
      </p>
      {setTf && alt.length > 0 && (
        <div className="pf-row" style={{ flexWrap: 'wrap' }}>
          <span className="small">{why === 'short' ? 'A smaller timeframe has more candles:' : 'Try:'}</span>
          {alt.map((x) => <button key={x} className="mini" onClick={() => setTf(x)}>{x}</button>)}
        </div>
      )}
      <p className="disc">Rules and statistics, not a prediction. Until enough history exists, judge a new listing by its business, price and news, not by chart patterns.</p>
    </aside>
  );
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

export default function Advisor({ advice: a, unavailable, bars = 0, setTf, inst, tf, historyReady, strat, showOnChart, setShowOnChart, onSend }: Props) {
  if (!a && unavailable) return <Unavailable why={unavailable} tf={tf} bars={bars} setTf={setTf} />;
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
          <div className="hud-k">AI advisor · {tf}<Info width={300}><p><b>The advisor</b> reads the chart with fixed rules, not a crystal ball. It looks at the pattern, the trend, how that same pattern did on this stock before, and what the bigger timeframe says.</p><p><b>Confidence</b> (the ring) is how many of those agree, from 0 to 100%. WAIT means there is no clear edge, which is a fine answer.</p></Info></div>
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
        <div className="rr"><span>Reward : risk<Info width={300}><p><b>Entry</b> is the price now. <b>Stop</b> is where to get out if it goes wrong, which caps your loss. <b>Target 1 and 2</b> are where to book profit.</p><p><b>Reward : risk</b> is how much you could gain for every ₹1 you risk. 2 : 1 means the first target is twice as far away as the stop. Below 1 : 1 is rarely worth taking.</p></Info></span><b>{a.rr.toFixed(1)} : 1</b></div>
        <button className="cta" onClick={onSend}>Send to paper trade →</button>
        <label className="chk" style={{ margin: '10px 2px 4px', fontSize: 12 }}><input type="checkbox" checked={showOnChart} onChange={(e) => setShowOnChart(e.target.checked)} /> Show levels on chart</label>

        {a.option && (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="hud-k">If trading options</div>
            <div className="big" style={{ marginTop: 4 }}><span className={a.option.type === 'CALL' ? 'up' : 'down'}>Buy {a.option.type}</span> <span className="small">≈ {fmt(a.option.strike)} · {a.option.expiry}</span></div>
          </div>
        )}
      </>)}

      <h3 style={{ marginTop: 16 }}>Why<Info><p>The reasons behind the call. A ⚠ item is something that could make it go wrong, so read those too.</p></Info></h3>
      <div className="reasons">{a.reasons.map((r) => <span key={r}>{r}</span>)}{a.warnings.map((w) => <span key={w} className="w" title={w}>⚠ {w.length > 62 ? `${w.slice(0, 60)}…` : w}</span>)}</div>

      <details className="more">
        <summary>Track record of this setup<Info width={300}><p>How this same pattern did on this stock's own history: how many times it showed up and how often the price then moved the right way.</p><p><b>Beat a blind guess</b> means it was right more often than a coin flip would be. <b>Lost to</b> means it was worse.</p></Info></summary>
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
        <summary>Strategy check<Info width={300}><p>Replays the advisor over all the past candles with pretend money, risking 1% on each trade, and compares the result with simply buying and holding.</p><p><b>Profit factor</b> is the total won divided by the total lost. Above 1 it made money; below 1 it lost.</p><span className="ex">Past results do not promise future ones.</span></Info></summary>
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
