import Floating, { inFloat } from './Floating';
import { useEffect, useRef, useState } from 'react';

interface Props { tf: string; setTf(t: string): void }

const GROUPS: [string, [string, string][]][] = [
  ['Minutes', [['1m', '1 minute'], ['5m', '5 minutes'], ['15m', '15 minutes'], ['30m', '30 minutes']]],
  ['Hours', [['1h', '1 hour'], ['4h', '4 hours']]],
  ['Days', [['1D', '1 day'], ['1W', '1 week']]],
  ['Months', [['1M', '1 month'], ['3M', '3 months (quarter)'], ['6M', '6 months (half-year)'], ['1Y', '1 year']]],
];
const NAME: Record<string, string> = Object.fromEntries(GROUPS.flatMap(([, l]) => l));
const DEFAULT_FAV = ['5m', '15m', '1h', '1D'];

const loadFav = (): string[] => {
  try { const f = JSON.parse(localStorage.getItem('tm-tf-fav') || ''); if (Array.isArray(f) && f.every((x) => x in NAME)) return f; } catch { /* ignore */ }
  return DEFAULT_FAV;
};

/** TradingView-style interval picker: favourites on the bar, every interval in a grouped menu (star one to pin it). */
export default function Timeframe({ tf, setTf }: Props) {
  const [open, setOpen] = useState(false);
  const [fav, setFav] = useState<string[]>(loadFav);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !inFloat(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  // let a digit-less shortcut work too: press 1-7 while not typing to jump between intervals
  const toggle = (t: string) => {
    const n = fav.includes(t) ? fav.filter((x) => x !== t) : [...fav, t];
    setFav(n);
    try { localStorage.setItem('tm-tf-fav', JSON.stringify(n)); } catch { /* ignore */ }
  };
  const order = GROUPS.flatMap(([, l]) => l.map(([t]) => t));
  const bar = order.filter((t) => fav.includes(t) || t === tf);

  return (
    <div className="tfbar" ref={box} data-tour="tf">
      <div className="seg">
        {bar.map((t) => <button key={t} className={t === tf ? 'on' : ''} onClick={() => setTf(t)} title={NAME[t]}>{t}</button>)}
        <button className="tfmore" onClick={() => setOpen(!open)} aria-label="All intervals" title="All intervals">▾</button>
      </div>
      {open && (
        <Floating anchor={box} className="popover tfmenu" width={220} align="right">
          {GROUPS.map(([g, items]) => (
            <div key={g}>
              <div className="hud-k tfhead">{g}</div>
              {items.map(([t, label]) => (
                <div key={t} className={`tfitem ${t === tf ? 'on' : ''}`} onClick={() => { setTf(t); setOpen(false); }}>
                  <span>{label}</span>
                  <button className={fav.includes(t) ? 'on' : ''} title={fav.includes(t) ? 'Remove from the bar' : 'Pin to the bar'} onClick={(e) => { e.stopPropagation(); toggle(t); }}>{fav.includes(t) ? '★' : '☆'}</button>
                </div>
              ))}
            </div>
          ))}
        </Floating>
      )}
    </div>
  );
}
