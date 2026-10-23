import { shortName, type Stat } from '../portfolio';
import type { Candle } from '../types';
import { WhyCard } from './WhyCard';

interface Props { stats: Stat[]; candles: Record<string, Candle[]>; selected: string; setSelected(id: string): void }

/** Why did each of my own holdings move? (Other stocks and top performers live on the Home page.) */
export default function PortfolioWhy({ stats, candles, selected, setSelected }: Props) {
  const sel = stats.find((s) => s.h.id === selected) ?? stats[0];
  return (
    <section className="pf-box">
      <h3>Why did my investments move?</h3>
      <div className="chips pf-chips">
        {stats.map((s) => <button key={s.h.id} className={sel?.h.id === s.h.id ? 'on' : ''} onClick={() => setSelected(s.h.id)}>{shortName(s.h.inst)}</button>)}
      </div>
      {sel && <WhyCard key={sel.h.id} inst={sel.h.inst} candles={candles[sel.h.inst.id]} />}
      <p className="small">Looking for other stocks, top performers or ideas? They are on the Home page.</p>
    </section>
  );
}
