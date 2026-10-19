import { cls, type Analysis } from '../types';

interface Props {
  analysis: Analysis; tab: 'chart' | 'candle'; setTab(t: 'chart' | 'candle'): void;
  bias: string; setBias(b: string): void; sort: 'score' | 'name'; setSort(s: 'score' | 'name'): void;
  q: string; setQ(q: string): void; sel: string | null; onSelect(id: string): void;
}

export default function Menu(p: Props) {
  const all = p.tab === 'chart' ? p.analysis.charts : p.analysis.candles;
  const topId = all[0].id;
  let list = all.filter((x) => (p.bias === 'all' || x.bias === +p.bias) && x.name.toLowerCase().includes(p.q));
  if (p.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <aside className="menu" aria-label="Pattern menu">
      <div className="tabs">
        <button className={p.tab === 'chart' ? 'on' : ''} onClick={() => p.setTab('chart')}>Chart Patterns</button>
        <button className={p.tab === 'candle' ? 'on' : ''} onClick={() => p.setTab('candle')}>Candlestick</button>
      </div>
      <input placeholder="Search patterns…" value={p.q} onChange={(e) => p.setQ(e.target.value.toLowerCase())} aria-label="Search patterns" />
      <div className="chips">
        {[['all', 'All'], ['1', 'Bullish'], ['-1', 'Bearish'], ['0', 'Neutral']].map(([v, l]) => (
          <button key={v} className={p.bias === v ? 'on' : ''} onClick={() => p.setBias(v)}>{l}</button>
        ))}
        <button onClick={() => p.setSort(p.sort === 'score' ? 'name' : 'score')}>Sort: {p.sort === 'score' ? 'closeness' : 'A–Z'}</button>
      </div>
      <ul id="plist">
        {list.map((x) => (
          <li key={x.id} className={x.id === p.sel ? 'sel' : ''} onClick={() => p.onSelect(x.id)}>
            <div className="row">
              <span className="pname">{x.name}{x.id === topId && x.score >= 30 && <span className="tag">CLOSEST</span>}</span>
              <span className="pct"><span className={cls(x.bias)}>{x.bias > 0 ? '▲' : x.bias < 0 ? '▼' : '◆'}</span> {x.score}%</span>
            </div>
            <div className="bar"><i className={cls(x.eff)} style={{ width: `${x.score}%` }} /></div>
          </li>
        ))}
        {!list.length && <li className="small">No match</li>}
      </ul>
    </aside>
  );
}
