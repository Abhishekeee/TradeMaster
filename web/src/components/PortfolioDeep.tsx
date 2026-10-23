import { shortName, type Stat } from '../portfolio';
import type { Deep } from '../portfolioDeep';
import type { Metric, Tone, Vote } from '../analysis';
import type { Ai, Call } from '../portfolioInsights';
import { SIGNAL_LABEL, SIGNAL_TONE } from '../portfolioInsights';

interface Props { stats: Stat[]; deep: Record<string, Deep>; calls: Map<string, Call>; ai: Record<string, Ai>; selected: string; setSelected(id: string): void }

const TONE_CLASS: Record<Tone, string> = { good: 'up', ok: 'neu', bad: 'down', na: '' };
const TONE_WORD: Record<Tone, string> = { good: 'Good', ok: 'OK', bad: 'Weak', na: '' };
const VOTE_CLASS: Record<Vote, string> = { buy: 'up', neutral: 'neu', sell: 'down' };
const RATING_CLASS = (r: string) => (r.includes('Buy') ? 'up' : r.includes('Sell') ? 'down' : 'neu');
const GRADE_CLASS = (g: string) => (g === 'Strong' || g === 'Decent' ? 'up' : g === 'Mixed' ? 'neu' : g === 'Weak' ? 'down' : 'neu');
/** A company's size the way people in that market say it: lakh crore / crore for rupees, millions / billions / trillions otherwise. */
function capText(ccy: string, v: number): string {
  if (ccy === 'INR') return v >= 1e12 ? `₹${(v / 1e12).toFixed(1)} lakh crore` : `₹${Math.round(v / 1e7).toLocaleString('en-IN')} crore`;
  const sym = ccy === 'USD' ? '$' : ccy + ' ';
  return v >= 1e12 ? `${sym}${(v / 1e12).toFixed(2)} trillion` : v >= 1e9 ? `${sym}${(v / 1e9).toFixed(1)} billion` : `${sym}${(v / 1e6).toFixed(0)} million`;
}
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 0 : 2 });

function MetricTable({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="pf-scroll"><table className="pf-table pf-metrics"><tbody>
      {metrics.map((m) => (
        <tr key={m.name}>
          <td><b>{m.name}</b><div className="small">{m.note}</div></td>
          <td className="r">{m.value}</td>
          <td><span className={`badge ${TONE_CLASS[m.tone]}`}>{TONE_WORD[m.tone]}</span></td>
        </tr>
      ))}
    </tbody></table></div>
  );
}

function Meter({ label, value, text, cls, signed }: { label: string; value: number; text: string; cls: string; signed?: boolean }) {
  const pos = signed ? (value + 100) / 2 : value;
  return (
    <div className="pf-meter">
      <div className="row"><span className="small">{label}</span><b className={cls}>{text}</b></div>
      <div className="pf-mbar"><i style={{ left: `${Math.max(2, Math.min(98, pos))}%` }} /></div>
      <div className="pf-mscale small"><span>{signed ? 'Sell' : 'Weak'}</span><span>{signed ? 'Buy' : 'Strong'}</span></div>
    </div>
  );
}

/** Technical and fundamental analysis for one holding at a time, ending in a plain verdict. */
export default function PortfolioDeep({ stats, deep, calls, ai, selected, setSelected }: Props) {
  const s = stats.find((x) => x.h.id === selected) ?? stats[0];
  if (!s) return null;
  const d = deep[s.h.id];
  const call = calls.get(s.h.id);
  const a = ai[s.h.inst.id];
  const t = d?.tech;
  const isEtf = s.h.inst.kind === 'ETF' || (s.h.inst.source === 'yahoo' && s.h.inst.kind !== 'EQUITY');

  return (
    <section className="pf-box">
      <h3>Is it a good one? Technical and fundamental analysis</h3>
      <div className="chips pf-chips">
        {stats.map((x) => <button key={x.h.id} className={s.h.id === x.h.id ? 'on' : ''} onClick={() => setSelected(x.h.id)}>{shortName(x.h.inst)}</button>)}
      </div>

      {!d || (!t && !d.company && !d.fund) ? <p className="small">Waiting for price history…</p> : (<>
        <div className={`pf-say ${d.combined.tone}`}>
          <b>{shortName(s.h.inst)}: {d.combined.label}.</b> {d.combined.text}
          {call && <> Action plan says <span className={`badge ${SIGNAL_TONE[call.signal]}`}>{SIGNAL_LABEL[call.signal].toUpperCase()}</span>.</>}
        </div>

        <div className="pf-meters">
          <Meter label={s.isFund ? 'Fund quality (returns, risk, consistency)' : 'Business quality (the fundamentals)'}
            value={d.quality ?? 0} text={d.quality === null ? (d.ready ? 'Not enough data' : 'Loading…') : `${d.quality}/100`} cls={d.quality === null ? '' : d.quality >= 55 ? 'up' : d.quality >= 40 ? 'neu' : 'down'} />
          {t && <Meter label="Chart timing (technical signals)" value={t.score} signed text={`${t.rating} (${t.score > 0 ? '+' : ''}${t.score})`} cls={RATING_CLASS(t.rating)} />}
        </div>

        <div className="pf-deep-cols">
          {/* ---------------- the chart */}
          <div className="pf-sc">
            <h4>Technical analysis: how the chart looks</h4>
            {t ? (<>
              <div className="row">
                <span className={`badge ${RATING_CLASS(t.rating)}`}>{t.rating.toUpperCase()}</span>
                <span className="small"><b className="up">{t.buy} buy</b> · <b className="neu">{t.neutral} neutral</b> · <b className="down">{t.sell} sell</b></span>
              </div>
              <div className="pf-tally"><i className="up" style={{ flex: t.buy }} /><i className="neu" style={{ flex: t.neutral }} /><i className="down" style={{ flex: t.sell }} /></div>
              <div className="pf-scroll"><table className="pf-table pf-metrics"><tbody>
                {t.indicators.map((i) => (
                  <tr key={i.name}>
                    <td><b>{i.name}</b><div className="small">{i.note}</div></td>
                    <td className="r small">{i.value}</td>
                    <td><span className={`badge ${VOTE_CLASS[i.vote]}`}>{i.vote.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody></table></div>
              {s.price !== null && (
                <p className="small">
                  {t.support !== null && <>Nearest support (a price where it has bounced before): <b>{money(t.support)}</b> ({(((t.support / s.price) - 1) * 100).toFixed(1)}%). </>}
                  {t.resistance !== null && <>Nearest resistance (where it has stalled): <b>{money(t.resistance)}</b> (+{(((t.resistance / s.price) - 1) * 100).toFixed(1)}%). </>}
                  {t.atrPct !== null && <>A typical day moves about {t.atrPct.toFixed(1)}%.</>}
                </p>
              )}
              {a && <p className="small"><b>Chart patterns:</b> closest is <b>{a.pattern}</b> ({a.patScore}% match); the pattern AI says {a.action === 'WAIT' ? 'there is no clear setup' : `${a.action} (${a.conf}% confidence)`}.</p>}
              <p className="small">Technical analysis reads price and volume only. It helps with timing, and says nothing about whether the business is sound.</p>
            </>) : <p className="small">Needs at least 60 days of price history.</p>}
          </div>

          {/* ---------------- the business or fund */}
          <div className="pf-sc">
            {d.company ? (<>
              <h4>Fundamental analysis: how the business looks</h4>
              <div className="row">
                <span className={`badge ${GRADE_CLASS(d.company.grade)}`}>{d.company.grade.toUpperCase()}</span>
                <span className="small">{[d.company.sector, d.company.industry].filter(Boolean).join(' · ')}{d.company.marketCap ? ` · company size ${capText(s.ccy, d.company.marketCap)}` : ''}</span>
              </div>
              {d.company.metrics.length ? <MetricTable metrics={d.company.metrics} /> : <p className="small">No financial data was found for this company.</p>}
              {d.company.strengths.length > 0 && <><h4 className="pf-subh up">Strengths</h4><ul className="small">{d.company.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
              {d.company.concerns.length > 0 && <><h4 className="pf-subh down">Concerns</h4><ul className="small">{d.company.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
              {d.company.street && (
                <p className="small"><b>What analysts say:</b> {d.company.street.rating}{d.company.street.n ? ` (${d.company.street.n} analysts)` : ''}
                  {d.company.street.target ? `, average target ${money(d.company.street.target)}${d.company.street.upside !== null ? ` (${d.company.street.upside >= 0 ? '+' : '−'}${Math.abs(d.company.street.upside).toFixed(0)}% from today)` : ''}` : ''}. Analysts are often optimistic, so treat it as one opinion.</p>
              )}
              <p className="small">Figures come from the latest reports Yahoo Finance holds. Compare P/E and margins with similar companies; banks and finance firms are judged without debt ratios.</p>
            </>) : d.fund ? (<>
              <h4>Fund check-up: how the fund looks</h4>
              <div className="row">
                <span className={`badge ${GRADE_CLASS(d.fund.grade)}`}>{d.fund.grade.toUpperCase()}</span>
                <span className="small">{[d.fund.category, d.fund.house].filter(Boolean).join(' · ')}</span>
              </div>
              {d.fund.metrics.length ? <MetricTable metrics={d.fund.metrics} /> : <p className="small">Not enough NAV history yet.</p>}
              {d.fund.strengths.length > 0 && <><h4 className="pf-subh up">Strengths</h4><ul className="small">{d.fund.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
              {d.fund.concerns.length > 0 && <><h4 className="pf-subh down">Concerns</h4><ul className="small">{d.fund.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
              <p className="small"><b>Not checked:</b> the expense ratio, fund size and who manages it are not available for free. Look at them in your app: a lower expense ratio keeps more of the return, and the same manager for 5+ years is a good sign.</p>
            </>) : (<>
              <h4>Fundamental analysis</h4>
              <p className="small">{isEtf ? 'This is an ETF or index, which holds many companies, so there is no single balance sheet to read. Judge it by the chart, how it has performed and what it holds.' : d.ready ? 'No financial data was found for this symbol.' : 'Loading financial data…'}</p>
            </>)}
          </div>
        </div>
      </>)}
      <p className="small">This is an automatic, rule-based review, not advice. It cannot see news, management quality, taxes or your goals.</p>
    </section>
  );
}
