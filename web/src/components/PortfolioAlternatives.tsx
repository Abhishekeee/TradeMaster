import { useMemo } from 'react';
import { shortName, type Stat } from '../portfolio';
import { SIGNAL_LABEL, SIGNAL_TONE, type Call, type Insights } from '../portfolioInsights';
import { bestAlternatives, useAlternatives, type Alt } from '../portfolioAlternatives';
import type { Instrument } from '../types';

interface Props {
  stats: Stat[]; calls: Map<string, Call>; ins: Insights; ccy: string;
  watch: { list: Instrument[]; has(id: string): boolean; toggle(i: Instrument): void };
  onChart(i: Instrument): void; selected: string; setSelected(id: string): void;
}

const pc = (n: number | null, d = 1) => (n === null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`);
const tone = (n: number | null) => (n === null || Math.abs(n) < 0.05 ? '' : n > 0 ? 'up' : 'down');
const FLAGGED = ['SELL', 'TRIM', 'REVIEW'];

function Row({ a, base, watch, onChart }: { a: Alt; base: Stat | null; watch: Props['watch']; onChart(i: Instrument): void }) {
  const better = base && a.r1y !== null && base.r1y !== null ? a.r1y - base.r1y : null;
  return (
    <tr>
      <td>
        <b>{shortName(a.inst)}</b> <span className="chip">{a.kind}</span>
        <div className="small pf-why">{a.why.slice(0, 3).join(' ')}</div>
      </td>
      <td className={`r ${tone(a.r1y)}`}>{pc(a.r1y)}{better !== null && <div className="small">{better >= 0 ? '+' : '−'}{Math.abs(better).toFixed(0)} pts vs yours</div>}</td>
      <td className={`r ${tone(a.r3yAnn)}`}>{pc(a.r3yAnn)}</td>
      <td className={`r ${tone(a.alpha1)}`}>{a.alpha1 === null ? '–' : `${a.alpha1 >= 0 ? '+' : '−'}${Math.abs(a.alpha1).toFixed(1)}`}</td>
      <td className="r down">{a.maxDD === null ? '–' : `−${Math.abs(a.maxDD).toFixed(0)}%`}</td>
      <td>{a.debt ? 'Low risk' : a.stat.trend}</td>
      <td>{a.corr === null ? '–' : a.corr < 0.35 ? 'Very different' : a.corr < 0.6 ? 'Somewhat different' : 'Similar to yours'}</td>
      <td className="r">
        {a.inst.source !== 'mf' && <button className="mini" onClick={() => onChart(a.inst)}>Chart</button>}{' '}
        {a.inst.source !== 'mf' && <button className="mini" title="Add to your watchlist on the Charts page" onClick={() => watch.toggle(a.inst)}>{watch.has(a.inst.id) ? '★ Watching' : '☆ Watch'}</button>}
      </td>
    </tr>
  );
}

export default function PortfolioAlternatives({ stats, calls, ins, ccy, watch, onChart, selected, setSelected }: Props) {
  const held = useMemo(() => new Set(stats.map((s) => s.h.inst.id)), [stats]);
  const { alts, prog } = useAlternatives(ccy, watch.list, held, ins.series);

  const flagged = stats.filter((s) => FLAGGED.includes(calls.get(s.h.id)?.signal ?? ''));
  const rest = stats.filter((s) => !flagged.includes(s));
  const sel = selected === 'new' ? null : stats.find((s) => s.h.id === selected) ?? flagged[0] ?? null;
  const mode = selected === 'new' ? 'new' : sel ? 'replace' : 'new';
  const call = sel ? calls.get(sel.h.id) : undefined;

  const head = (
    <tr><th>Option</th><th className="r">1 year</th><th className="r">Per year, 3 yrs</th><th className="r">Vs index (1 yr)</th><th className="r">Worst fall</th><th>Trend</th><th>Fit with your mix</th><th></th></tr>
  );
  const table = (list: Alt[], base: Stat | null) => (
    <div className="pf-scroll"><table className="pf-table pf-alt"><thead>{head}</thead><tbody>
      {list.map((a) => <Row key={a.inst.id} a={a} base={base} watch={watch} onChart={onChart} />)}
    </tbody></table></div>
  );

  return (
    <section className="pf-box">
      <h3>Where could the money go instead?</h3>
      <p className="small">Pick a holding you are thinking of selling. We compare it with a shortlist of popular stocks, ETFs and mutual funds (plus anything on your watchlist) using the same rules as the rest of this page, and show the ones that did better and still look healthy.</p>
      <label className="small pf-sort" style={{ marginLeft: 0 }}>Replacing{' '}
        <select value={mode === 'new' ? 'new' : sel!.h.id} onChange={(e) => setSelected(e.target.value)}>
          {flagged.length > 0 && <optgroup label="Flagged by the action plan">{flagged.map((s) => <option key={s.h.id} value={s.h.id}>{shortName(s.h.inst)} ({SIGNAL_LABEL[calls.get(s.h.id)!.signal]})</option>)}</optgroup>}
          {rest.length > 0 && <optgroup label="Other holdings">{rest.map((s) => <option key={s.h.id} value={s.h.id}>{shortName(s.h.inst)}</option>)}</optgroup>}
          <option value="new">Ideas for new money (no sale)</option>
        </select>
      </label>

      {sel && (
        <div className="pf-say neu" style={{ marginTop: 10 }}>
          <b>{shortName(sel.h.inst)}</b>: last year {pc(sel.r1y)}{sel.alpha !== null && <>, {sel.alpha >= 0 ? 'ahead of' : 'behind'} {sel.benchName} by {Math.abs(sel.alpha).toFixed(1)} pts</>}, {sel.debt ? 'a low-risk fund' : `trend: ${sel.trend.toLowerCase()}`}.
          {call && <> Suggestion: <span className={`badge ${SIGNAL_TONE[call.signal]}`}>{SIGNAL_LABEL[call.signal].toUpperCase()}</span></>}
        </div>
      )}

      {!alts ? <p className="small">Checking {prog[1] > 1 ? prog[1] : 'about 30'} options… {prog[0]}/{prog[1] > 1 ? prog[1] : '…'}</p> : (<>
        {mode === 'replace' && sel && (() => {
          const list = bestAlternatives(alts, sel.debt, 6);
          return list.length ? table(list, sel) : <p className="small">None of the shortlist clearly beats it right now. That is a fair reason to hold, or to look beyond this shortlist.</p>;
        })()}
        {mode === 'new' && (<>
          <h4 className="pf-subh">Stocks, ETFs and equity funds</h4>
          {table(bestAlternatives(alts, false, 6), null)}
          {alts.some((a) => a.debt) && <><h4 className="pf-subh">Lower-risk bond funds</h4>{table(bestAlternatives(alts, true, 3), null)}</>}
        </>)}
        <p className="small">Checked {alts.length} options. We skip anything in a down-trend, rank the rest on beating the index over 1 and 3 years, how deep the falls were, and how differently it moves from your mix, and warn when a price already looks stretched. <b>Past winners often stop winning, and selling can trigger tax and fees.</b> Use this as a shortlist to research, not an instruction.</p>
      </>)}
    </section>
  );
}
