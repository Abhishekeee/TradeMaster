import { shortName, type Stat } from '../portfolio';
import type { Alt } from '../portfolioAlternatives';
import type { Instrument } from '../types';

export interface WatchApi { list: Instrument[]; has(id: string): boolean; toggle(i: Instrument): void }

const pc = (n: number | null, d = 1) => (n === null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`);
const tone = (n: number | null) => (n === null || Math.abs(n) < 0.05 ? '' : n > 0 ? 'up' : 'down');

function Row({ a, base, watch, onChart }: { a: Alt; base: Stat | null; watch: WatchApi; onChart(i: Instrument): void }) {
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

export default function AltTable({ list, base, watch, onChart }: { list: Alt[]; base: Stat | null; watch: WatchApi; onChart(i: Instrument): void }) {
  return (
    <div className="pf-scroll"><table className="pf-table pf-alt">
      <thead><tr><th>Option</th><th className="r">1 year</th><th className="r">Per year, 3 yrs</th><th className="r">Vs index (1 yr)</th><th className="r">Worst fall</th><th>Trend</th><th>Fit with your mix</th><th></th></tr></thead>
      <tbody>{list.map((a) => <Row key={a.inst.id} a={a} base={base} watch={watch} onChart={onChart} />)}</tbody>
    </table></div>
  );
}
