import { useEffect, useMemo, useRef, useState } from 'react';
import { searchInstruments } from '../data';
import { CATEGORIES, MARKETS, inMarket, type MarketId } from '../markets';
import type { Instrument } from '../types';

interface Props { current: Instrument; onPick(i: Instrument): void; market?: MarketId; onMarket?(m: MarketId): void }

/** What to suggest before anything is typed: the best-known names of the chosen market. */
function suggestions(m: MarketId): Instrument[] {
  const get = (id: string, n: number) => CATEGORIES.find((c) => c.id === id)?.items.slice(0, n) ?? [];
  switch (m) {
    case 'IN': return [...get('idxin', 3), ...get('in', 12)];
    case 'US': return [...get('us', 12), ...get('idxus', 3)];
    case 'CRYPTO': return get('crypto', 10);
    case 'GLOBAL': return [...get('com', 4), ...get('fx', 4), ...get('idx', 4)];
    default: return get('crypto', 8);
  }
}

export default function SymbolSearch({ current, onPick, market = 'ALL', onMarket }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<Instrument[]>([]);
  const [busy, setBusy] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!text.trim() && market !== 'ALL') { setRaw(suggestions(market)); setBusy(false); setHi(0); return; }
    setBusy(true);
    let stale = false;
    const t = setTimeout(async () => {
      const r = await searchInstruments(text, market === 'ALL' ? 10 : 25);
      if (!stale) { setRaw(r); setHi(0); setBusy(false); }
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [text, open, market]);

  // results outside the chosen market are tucked away, with one click to look everywhere
  const items = useMemo(() => {
    const keep = raw.filter((i) => inMarket(i, market));
    return market === 'IN' ? [...keep.filter((i) => i.id.endsWith('.NS')), ...keep.filter((i) => !i.id.endsWith('.NS'))] : keep;
  }, [raw, market]);
  const hidden = raw.length - items.length;
  const label = MARKETS.find((m) => m.id === market)?.label ?? '';

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (i: Instrument) => { onPick(i); setOpen(false); setText(''); };

  return (
    <div className="symsearch" ref={box}>
      <input
        value={open ? text : current.id}
        placeholder={market === 'IN' ? 'Search Indian stocks, e.g. Reliance, TCS…' : market === 'ALL' ? 'Search stocks, crypto, forex…' : `Search ${label}…`}
        spellCheck={false}
        aria-label="Search symbol"
        onFocus={(e) => { setOpen(true); setText(''); e.target.select(); }}
        onClick={(e) => { if (!open) { setOpen(true); setText(''); (e.target as HTMLInputElement).select(); } }}
        onChange={(e) => { setOpen(true); setText(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && items[hi]) { e.preventDefault(); pick(items[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul className="sresults">
          {!text.trim() && market !== 'ALL' && items.length > 0 && <li className="small sres-head">{label}: top names. Type to search for any other.</li>}
          {items.map((i, n) => (
            <li key={i.source + i.id} className={n === hi ? 'hi' : ''} onMouseEnter={() => setHi(n)} onMouseDown={() => pick(i)}>
              <b>{i.id.replace(/\.NS$/, '')}</b><span className="small">{i.name}</span><em>{i.kind === 'CRYPTO' || i.kind === 'CRYPTOCURRENCY' ? 'CRYPTO' : i.kind}</em>
            </li>
          ))}
          {!items.length && <li className="small">{busy ? 'Searching…' : `No ${label} results${raw.length ? '.' : '. Stock search needs the dev server (npm run dev).'}`}</li>}
          {hidden > 0 && onMarket && !busy && (
            <li className="sres-more" onMouseDown={() => { onMarket('ALL'); }}>{hidden} more result{hidden > 1 ? 's' : ''} in other markets. <b>Search all markets</b></li>
          )}
        </ul>
      )}
    </div>
  );
}
