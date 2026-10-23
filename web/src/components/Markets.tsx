import { useEffect, useState } from 'react';
import { fetchOptions, fetchQuotes, type OptionChain, type OptionRow } from '../data';
import { MARKETS, categoriesFor, type MarketId } from '../markets';
import { fmt, type Instrument, type Quote } from '../types';
import type { usePaper } from '../paper';
import type { useWatchlist } from '../watchlist';
import NseOptions from './NseOptions';
import Scanner from './Scanner';

interface Props { onPick(i: Instrument, tf?: string): void; onClose(): void; watch: ReturnType<typeof useWatchlist>; paper: ReturnType<typeof usePaper>; market: MarketId; setMarket(m: MarketId): void }

const OPT_TAB = 'options';
const WATCH_TAB = 'watch';
const SCAN_TAB = 'scan';
const UNDERLYINGS = ['AAPL', 'SPY', 'QQQ', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'AMD'];

function OptionsChain({ onPick }: { onPick(i: Instrument): void }) {
  const [sym, setSym] = useState('AAPL');
  const [input, setInput] = useState('AAPL');
  const [date, setDate] = useState<number | undefined>();
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading');
  const [all, setAll] = useState(false);

  useEffect(() => {
    let dead = false;
    setState('loading');
    fetchOptions(sym, date).then((c) => { if (!dead) { setChain(c); setState(c ? 'ok' : 'none'); } });
    return () => { dead = true; };
  }, [sym, date]);

  const open = (r: OptionRow, type: 'C' | 'P') => {
    const exp = new Date(r.expiration * 1000).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
    onPick({ id: r.contractSymbol, name: `${sym} ${exp} ${r.strike} ${type === 'C' ? 'Call' : 'Put'}`, source: 'yahoo', kind: 'OPTION' });
  };

  // join calls and puts by strike
  const strikes = chain ? [...new Set([...chain.calls, ...chain.puts].map((r) => r.strike))].sort((a, b) => a - b) : [];
  const shown = chain && !all && chain.price ? strikes.filter((s) => Math.abs(s - chain.price) / chain.price <= 0.12) : strikes;
  const call = (s: number) => chain?.calls.find((r) => r.strike === s);
  const put = (s: number) => chain?.puts.find((r) => r.strike === s);
  const cell = (r: OptionRow | undefined, type: 'C' | 'P') => r
    ? [<td key="l" className="link" onClick={() => open(r, type)} title="Open chart">{r.lastPrice.toFixed(2)}</td>, <td key="i">{r.impliedVolatility ? `${(r.impliedVolatility * 100).toFixed(0)}%` : '–'}</td>, <td key="v">{r.volume ?? 0}</td>]
    : [<td key="a">–</td>, <td key="b">–</td>, <td key="c">–</td>];

  return (
    <div>
      <div className="mk-bar">
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') { setDate(undefined); setSym(input.trim()); } }} placeholder="Underlying e.g. AAPL" />
        <button className="mini" onClick={() => { setDate(undefined); setSym(input.trim()); }}>Load</button>
        {UNDERLYINGS.map((u) => <button key={u} className="mini" onClick={() => { setInput(u); setDate(undefined); setSym(u); }}>{u}</button>)}
      </div>
      {state === 'loading' && <p className="small">Loading chain…</p>}
      {state === 'none' && <p className="small">No options found for {sym}. Options data covers US-listed stocks and ETFs, and needs the dev server running (npm run dev).</p>}
      {chain && state === 'ok' && (<>
        <div className="mk-bar">
          <label className="small">Expiry
            <select value={chain.date} onChange={(e) => setDate(+e.target.value)}>
              {chain.expirations.map((d) => <option key={d} value={d}>{new Date(d * 1000).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</option>)}
            </select>
          </label>
          <span className="small">{sym} spot <b>{fmt(chain.price)}</b></span>
          <label className="chk"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All strikes</label>
        </div>
        <div className="mk-scroll">
          <table className="chain">
            <thead><tr><th colSpan={3} className="up">CALLS</th><th>Strike</th><th colSpan={3} className="down">PUTS</th></tr>
              <tr><th>Last</th><th>IV</th><th>Vol</th><th /><th>Last</th><th>IV</th><th>Vol</th></tr></thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s} className={chain.price && Math.abs(s - chain.price) / chain.price < 0.006 ? 'atm' : ''}>
                  {cell(call(s), 'C')}
                  <td className="strike"><b>{s}</b></td>
                  {cell(put(s), 'P')}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">Click a price to open that contract's chart. Paper trades on options use the standard 100× contract multiplier.</p>
      </>)}
    </div>
  );
}

export default function Markets({ onPick, onClose, watch, paper, market, setMarket }: Props) {
  const cats = categoriesFor(market);
  const [tab, setTab] = useState(watch.list.length ? WATCH_TAB : cats[0].id);
  const [region, setRegion] = useState<'us' | 'in'>(market === 'US' ? 'us' : market === 'IN' ? 'in' : 'us');
  const showOptions = market === 'IN' || market === 'US' || market === 'ALL';
  // switching market: land on that market's first list, and on its own options
  useEffect(() => {
    setTab((t) => (t === WATCH_TAB || t === SCAN_TAB || (t === OPT_TAB && showOptions) || cats.some((c) => c.id === t) ? t : cats[0].id));
    if (market === 'IN') setRegion('in'); else if (market === 'US') setRegion('us');
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const cat = cats.find((c) => c.id === tab);
  const items = tab === WATCH_TAB ? watch.list : cat?.items;

  useEffect(() => {
    if (!items?.length) return;
    let dead = false;
    fetchQuotes(items).then((q) => { if (!dead) setQuotes((p) => ({ ...p, ...q })); });
    return () => { dead = true; };
  }, [tab, watch.list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mk">
        <div className="mk-head"><b>Markets</b>
          <select className="mktsel" value={market} onChange={(e) => setMarket(e.target.value as MarketId)} aria-label="Market">{MARKETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          <button className="mini" onClick={onClose}>✕ Close</button></div>
        <div className="mk-tabs">
          <button className={tab === WATCH_TAB ? 'on' : ''} onClick={() => setTab(WATCH_TAB)}>★ Watchlist{watch.list.length ? ` (${watch.list.length})` : ''}</button>
          {cats.map((c) => <button key={c.id} className={tab === c.id ? 'on' : ''} onClick={() => setTab(c.id)}>{c.label}</button>)}
          {showOptions && <button className={tab === OPT_TAB ? 'on' : ''} onClick={() => setTab(OPT_TAB)}>Options</button>}
          <button className={tab === SCAN_TAB ? 'on' : ''} onClick={() => setTab(SCAN_TAB)}>🔎 Scanner</button>
        </div>
        <div className="mk-body">
          {tab === SCAN_TAB ? (
            <Scanner watch={watch} market={market} onPick={(i, tf) => { onPick(i, tf); onClose(); }} />
          ) : tab === OPT_TAB ? (
            <>
              {market === 'ALL' && <div className="mk-bar">
                <button className={`mini ${region === 'us' ? 'on' : ''}`} onClick={() => setRegion('us')}>US options</button>
                <button className={`mini ${region === 'in' ? 'on' : ''}`} onClick={() => setRegion('in')}>India options (NSE)</button>
              </div>}
              {region === 'us'
                ? <OptionsChain onPick={(i) => { onPick(i); onClose(); }} />
                : <NseOptions paper={paper} onOpenUnderlying={(i) => { onPick(i); onClose(); }} />}
            </>
          ) : items && items.length ? (
            <table className="mk-list"><tbody>
              {items.map((i) => {
                const q = quotes[i.id];
                return (
                  <tr key={i.id} className="link" onClick={() => { onPick(i); onClose(); }}>
                    <td onClick={(e) => { e.stopPropagation(); watch.toggle(i); }} title="Add / remove from watchlist" style={{ width: 24, cursor: 'pointer' }}>{watch.has(i.id) ? '★' : '☆'}</td>
                    <td><b>{i.id}</b></td><td className="small">{i.name}</td>
                    <td>{q ? fmt(q.price) : '…'}</td>
                    <td className={q ? (q.chg >= 0 ? 'up' : 'down') : ''}>{q ? `${q.chg >= 0 ? '+' : ''}${q.chg.toFixed(2)}%` : ''}</td>
                  </tr>
                );
              })}
            </tbody></table>
          ) : <p className="small">Your watchlist is empty. Click the ☆ next to any symbol, or the ☆ button in the top bar.</p>}
        </div>
        <div className="small" style={{ padding: '6px 12px' }}>Tip: the search box finds any other symbol in this market; pick <b>All markets</b> to search everywhere. Futures use Yahoo symbols (for example ES=F, GC=F).</div>
      </div>
    </div>
  );
}
