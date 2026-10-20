import { useState } from 'react';
import type { Cur } from '../fx';
import { fmtPrice, levelForAmount } from './LevelEditor';

interface Props {
  kind: 'sl' | 'tp';
  entry: number | null;
  value: string;                          // the level, as a price (the source of truth)
  onChange(v: string): void;
  result(level: number): number | null;   // money (USD, after fees) if this level is hit
  cur: Cur;
  invested: number;                       // amount being invested, in the display currency (for the quick chips)
}

/** Profit target or loss limit entered as money. The price level is worked out for you. */
export default function MoneyLevel({ kind, entry, value, onChange, result, cur, invested }: Props) {
  const isSl = kind === 'sl';
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const n = value.trim() === '' ? null : parseFloat(value);
  const money = n !== null && Number.isFinite(n) && entry ? result(n) : null;
  const derived = money !== null && (isSl ? money < 0 : money > 0) ? String(Math.round(Math.abs(cur.fromUSD(money)) * 100) / 100) : '';
  const enabled = !!entry && invested > 0;

  const set = (s: string) => {
    setText(s);
    if (s.trim() === '') { onChange(''); return; }
    const a = parseFloat(s);
    if (!Number.isFinite(a) || a <= 0) return;
    const lvl = levelForAmount(isSl ? -cur.toUSD(a) : cur.toUSD(a), entry, result);
    if (lvl !== null) onChange(fmtPrice(lvl));
  };
  const chips = isSl ? [0.5, 1, 2, 5] : [1, 2, 5, 10];

  return (
    <div className={`mlvl ${kind}`}>
      <label>
        <span>{isSl ? 'Stop if I lose' : 'Sell when I make'}</span>
        <span className="igroup"><em>{cur.code}</em>
          <input inputMode="decimal" placeholder={enabled ? 'none' : 'enter amount first'} disabled={!enabled}
            value={typing ? text : derived}
            onFocus={() => { setText(derived); setTyping(true); }} onBlur={() => setTyping(false)}
            onChange={(e) => set(e.target.value)} aria-label={isSl ? 'Loss limit' : 'Profit target'} /></span>
      </label>
      {enabled && (
        <div className="lvl-chips">
          {chips.map((p) => <button key={p} type="button" onClick={() => { setTyping(false); set(String(Math.round(invested * p) / 100)); }}>{p}%</button>)}
        </div>
      )}
    </div>
  );
}
