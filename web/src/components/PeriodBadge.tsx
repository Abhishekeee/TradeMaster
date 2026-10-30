import { fmt } from '../types';
import { moveText, type PeriodChange } from '../periodChange';
import Info from './Info';

/** The timeframe's comparison as a pill in the chart's top row (beside Forming / Bias / Candle): change, amount, and the earlier price. */
export default function PeriodBadge({ period, day, tf, px }: { period: PeriodChange | null; day: number | null; tf: string; px: number | null }) {
  if (!period || (tf === '1D' && day !== null)) return null;   // on 1D "1 day ago" is the same number as today's change
  const up = period.pct >= 0;
  const since = new Date(period.time * 1000).toLocaleString([], tf === '1D' || period.label.includes('ago') && !/min|hour/.test(period.label) ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="hud-per" title={`Compared with the price one ${tf} earlier${period.label === 'since listing' ? ' (the first price it ever traded at)' : ''}: ${fmt(period.from)} at ${since}.`}>
      <b className={up ? 'up' : 'down'}>{up ? '▲' : '▼'} {Math.abs(period.pct).toFixed(2)}%{px !== null ? ` (${moveText(px, period.from)})` : ''}</b>
      <span className="small">{period.label === 'since listing' ? 'since listing' : 'vs ' + period.label} · {fmt(period.from)}</span>
      <Info><p><b>{tf} comparison.</b> The price now against the price one {tf} earlier. The number after the dot is that earlier price.</p><p>It changes with the timeframe: 5m compares with 5 minutes ago, 1h with an hour ago, 1D a day ago, 1W a week ago, 1M a month ago.</p><span className="ex">Today's change (top of the page) always compares with yesterday's close, whatever the timeframe.</span></Info>
    </div>
  );
}
