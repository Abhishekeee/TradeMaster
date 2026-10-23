import { shortName, type Stat, type Summary } from '../portfolio';
import { SIGNAL_LABEL, SIGNAL_TONE, type Call, type Grade, type Insights, type Signal } from '../portfolioInsights';

interface Props {
  stats: Stat[]; sum: Summary; ins: Insights; calls: Map<string, Call>;
  money(n: number): string; signed(n: number): string; onOpen(id: string): void;
}

const pc = (n: number | null, d = 1) => (n === null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`);
const tone = (n: number | null) => (n === null || Math.abs(n) < 0.05 ? '' : n > 0 ? 'up' : 'down');
const GRADE_TONE: Record<Grade, string> = { A: 'up', B: 'up', C: 'neu', D: 'down' };

export function Grades({ ins, sum }: { ins: Insights; sum: Summary }) {
  const g = ins.grades;
  const rows: [string, Grade, string][] = [
    ['Returns', g.returns, ins.r12 !== null && ins.b12 !== null ? `Last 12 months: your mix ${pc(ins.r12)} vs ${ins.benchName} ${pc(ins.b12)}` : 'Not enough history to compare with the market yet'],
    ['Risk', g.risk, ins.vol !== null ? `Swings about ${ins.vol.toFixed(0)}% a year${ins.maxDD !== null ? `; worst fall in the last year was ${Math.abs(ins.maxDD).toFixed(0)}%` : ''}` : 'Not enough history yet'],
    ['Spread', g.spread, `Like holding ${ins.effN.toFixed(1)} equal-sized investments${ins.corr !== null ? `; your stocks move ${ins.corr > 0.6 ? 'very much' : ins.corr > 0.35 ? 'fairly' : 'only a little'} together` : ''}`],
    ['Momentum', g.momentum, `Health score ${sum.health}/100: holdings rated "performing well" count fully, "steady" ones half, "underperforming" none`],
  ];
  return (
    <section className="pf-box pf-grades">
      <div className="pf-grade-main">
        <div className={`pf-grade ${GRADE_TONE[g.overall]}`}>{g.overall}</div>
        <div>
          <div className="small">Portfolio report card</div>
          <b className="pf-style">{ins.style.name}</b>
          <div className="small">{ins.style.blurb}</div>
        </div>
      </div>
      <div className="pf-grade-list">
        {rows.map(([name, gr, why]) => (
          <div key={name} className="pf-grade-row">
            <span className={`pf-gchip ${GRADE_TONE[gr]}`}>{gr}</span>
            <div><b>{name}</b><div className="small">{why}</div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

const GROUPS: { title: string; sigs: Signal[]; tone: string; empty: string }[] = [
  { title: 'Buy more', sigs: ['BUY'], tone: 'up', empty: 'Nothing looks like a clear add right now.' },
  { title: 'Hold', sigs: ['HOLD'], tone: 'neu', empty: 'Nothing to simply hold.' },
  { title: 'Trim or sell', sigs: ['TRIM', 'SELL'], tone: 'down', empty: 'No sell or trim signals. Good.' },
  { title: 'Review', sigs: ['REVIEW'], tone: 'neu', empty: 'Nothing needs a second look.' },
];
const CONF_RANK = { High: 2, Medium: 1, Low: 0 };

export function ActionPlan({ stats, calls, onOpen }: Pick<Props, 'stats' | 'calls' | 'onOpen'>) {
  return (
    <section className="pf-box">
      <h3>Action plan: what to do with each holding</h3>
      <div className="pf-plan">
        {GROUPS.map((gr) => {
          const items = stats.filter((s) => calls.get(s.h.id) && gr.sigs.includes(calls.get(s.h.id)!.signal))
            .sort((a, b) => CONF_RANK[calls.get(b.h.id)!.conf] - CONF_RANK[calls.get(a.h.id)!.conf]);
          return (
            <div key={gr.title} className="pf-plan-col">
              <h4 className={gr.tone}>{gr.title} ({items.length})</h4>
              {items.length ? items.map((s) => {
                const c = calls.get(s.h.id)!;
                return (
                  <div key={s.h.id} className="pf-mini" onClick={() => onOpen(s.h.id)}>
                    <div className="row"><b>{shortName(s.h.inst)}</b><span><span className={`badge ${SIGNAL_TONE[c.signal]}`}>{SIGNAL_LABEL[c.signal].toUpperCase()}</span> <span className="small">{c.conf}</span></span></div>
                    <div className="small">{c.why}</div>
                  </div>
                );
              }) : <p className="small">{gr.empty}</p>}
            </div>
          );
        })}
      </div>
      <p className="small">"Confidence" says how many signals agree (trend, strength against the market, momentum, and the chart-pattern AI for stocks). It is not the chance of making money.</p>
    </section>
  );
}

export function Signature({ stats, sum, ins, money, signed, onOpen }: Omit<Props, 'calls'>) {
  const t = ins.twin;
  const maxAbs = Math.max(1, ...ins.contrib.map((c) => Math.abs(c.amt)));
  const worst = ins.stress[1];
  return (
    <section className="pf-box">
      <h3>Signature stats</h3>
      <div className="pf-sig">
        <div className="pf-sc">
          <h4>If you had just bought the index</h4>
          {t ? (<>
            <div className={`pf-big ${tone(t.mine - t.index)}`}>{signed(t.mine - t.index)}</div>
            <p className="small">You {t.mine >= t.index ? 'made' : 'lost'} {money(Math.abs(t.mine - t.index))} {t.mine >= t.index ? 'more' : 'less'} than putting the same money into {ins.benchName} on the same days. Yours is worth {money(t.mine)}; the index would be {money(t.index)}.
              {t.covered < t.of && ` (Only ${t.covered} of ${t.of} holdings have buy dates, so the rest are left out.)`}</p>
          </>) : <p className="small">Add buy dates to your stocks (click a row, then "Date") to see how you compare with simply buying {ins.benchName}.</p>}
          {ins.r12 !== null && ins.b12 !== null && <p className="small">Last 12 months, today's mix: <b className={tone(ins.r12)}>{pc(ins.r12)}</b> vs {ins.benchName} <b className={tone(ins.b12)}>{pc(ins.b12)}</b>.</p>}
        </div>

        <div className="pf-sc">
          <h4>If the market falls</h4>
          {ins.stress.map((x) => (
            <div key={x.shock} className="row"><span>Market {x.shock}%</span><b className="down">{signed(x.loss)}</b></div>
          ))}
          <p className="small">Estimated from how strongly each holding moved with {ins.benchName} over the last year{ins.beta !== null ? ` (your overall beta is ${ins.beta.toFixed(2)}: ${ins.beta > 1.1 ? 'more jumpy than the market' : ins.beta < 0.9 ? 'calmer than the market' : 'about as jumpy as the market'})` : ''}. A {Math.abs(worst.shock)}% drop would cost about {money(Math.abs(worst.loss))}. A guide, not a promise.</p>
        </div>

        <div className="pf-sc">
          <h4>Biggest fall in the last year</h4>
          <div className="pf-big down">{ins.maxDD === null ? '–' : `−${Math.abs(ins.maxDD).toFixed(1)}%`}</div>
          <p className="small">{ins.maxDD === null ? 'Needs about a year of price history.' : `If you had held today's mix all year, it would have dropped as much as this from its peak${ins.vol !== null ? `, and typical yearly swings are about ${ins.vol.toFixed(0)}%` : ''}. Ask yourself whether you could sit through that.`}</p>
        </div>

        <div className="pf-sc">
          <h4>How spread out you really are</h4>
          <div className="pf-big">{ins.effN.toFixed(1)} <span className="small">of {stats.length} holdings</span></div>
          <p className="small">Counting by how much money is in each, it is like owning {ins.effN.toFixed(1)} equal-sized investments.{ins.corr !== null && ` Your stocks move together ${(ins.corr * 100).toFixed(0)}% of the time on average${ins.corr > 0.6 ? ', so one bad day tends to hit most of them' : ''}.`} {stats.length < 2 ? '' : sum.sorted[0].weight > 40 ? `${shortName(sum.sorted[0].h.inst)} alone is ${sum.sorted[0].weight.toFixed(0)}%.` : ''}</p>
        </div>

        <div className="pf-sc pf-wide">
          <h4>Who is carrying you, and who is dragging</h4>
          {ins.contrib.map(({ s, amt }) => (
            <div key={s.h.id} className="pf-contrib" onClick={() => onOpen(s.h.id)}>
              <span className="pf-cn">{shortName(s.h.inst)}</span>
              <div className="pf-cbar"><i className={amt >= 0 ? 'up' : 'down'} style={{ width: `${(Math.abs(amt) / maxAbs) * 100}%` }} /></div>
              <b className={tone(amt)}>{signed(amt)}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
