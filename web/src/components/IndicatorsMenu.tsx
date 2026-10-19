import { useEffect, useRef, useState } from 'react';

export interface Toggles { sig: boolean; e20: boolean; e50: boolean; vol: boolean; sr: boolean; bb: boolean; vwap: boolean; rsi: boolean; macd: boolean }
interface Props { tg: Toggles; setTg(t: Toggles): void }

const ITEMS: [keyof Toggles, string, string][] = [
  ['sig', 'Candle signals', 'Buy / sell arrows on candlestick patterns'],
  ['e20', 'EMA 20', 'Fast moving average'],
  ['e50', 'EMA 50', 'Slow moving average'],
  ['vol', 'Volume', 'Volume bars under the chart'],
  ['bb', 'Bollinger Bands', '20-period average with 2 standard deviation bands'],
  ['vwap', 'VWAP', 'Volume-weighted average price (resets daily on intraday charts)'],
  ['sr', 'Support / resistance', 'Levels price has reacted to at least twice'],
  ['rsi', 'RSI (14) panel', 'Momentum below the chart, 70 / 30 lines'],
  ['macd', 'MACD panel', 'Trend momentum below the chart'],
];

export default function IndicatorsMenu({ tg, setTg }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const on = Object.values(tg).filter(Boolean).length;
  return (
    <div className="popwrap" ref={box}>
      <button className="theme" onClick={() => setOpen(!open)} title="Chart overlays">ƒx Indicators <span className="small">{on}</span> ▾</button>
      {open && (
        <div className="popover">
          {ITEMS.map(([k, label, hint]) => (
            <label key={k} className="popitem" title={hint}>
              <input type="checkbox" checked={tg[k]} onChange={(e) => setTg({ ...tg, [k]: e.target.checked })} />
              <span>{label}<em className="small">{hint}</em></span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
