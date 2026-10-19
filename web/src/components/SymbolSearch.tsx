import { useEffect, useRef, useState } from 'react';
import { searchInstruments } from '../data';
import type { Instrument } from '../types';

interface Props { current: Instrument; onPick(i: Instrument): void }

export default function SymbolSearch({ current, onPick }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Instrument[]>([]);
  const [busy, setBusy] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    let stale = false;
    const t = setTimeout(async () => {
      const r = await searchInstruments(text);
      if (!stale) { setItems(r); setHi(0); setBusy(false); }
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [text, open]);

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
        placeholder="Search stocks, crypto, forex…"
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
          {items.map((i, n) => (
            <li key={i.source + i.id} className={n === hi ? 'hi' : ''} onMouseEnter={() => setHi(n)} onMouseDown={() => pick(i)}>
              <b>{i.id}</b><span className="small">{i.name}</span><em>{i.kind === 'CRYPTO' || i.kind === 'CRYPTOCURRENCY' ? 'CRYPTO' : i.kind}</em>
            </li>
          ))}
          {!items.length && <li className="small">{busy ? 'Searching…' : 'No results. Stock search needs the dev server (npm run dev).'}</li>}
        </ul>
      )}
    </div>
  );
}
