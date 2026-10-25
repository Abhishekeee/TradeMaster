import { useEffect, useRef, useState } from 'react';
import type { FeedStatus } from '../data';
import { fmt, TF_SEC } from '../types';

interface Props {
  status: FeedStatus; demo: boolean; px: number | null; ch: number | null;
  lastTick: number; candleTime: number | null; tf: string; unit?: string; approx?: string;
  symbol?: string; name?: string; kind?: string; tfLabel?: string; leading?: React.ReactNode;
}

const TEXT: Record<FeedStatus, string> = { live: 'LIVE', connecting: 'CONNECTING', polling: 'RECONNECTING', closed: 'MARKET CLOSED', off: '' };

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return d ? `${d}d ${p(h)}h` : h ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

export default function LiveBar({ status, demo, px, ch, lastTick, candleTime, tf, unit, approx, symbol, name, kind, tfLabel, leading }: Props) {
  const [now, setNow] = useState(Date.now());
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; n: number } | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // flash the price green/red on every change
  useEffect(() => {
    if (px === null) return;
    if (prev.current !== null && px !== prev.current) setFlash((f) => ({ dir: px > (prev.current as number) ? 'up' : 'down', n: (f?.n ?? 0) + 1 }));
    prev.current = px;
  }, [px]);

  const age = Math.max(0, Math.round((now - lastTick) / 1000));
  const stale = status === 'live' && lastTick > 0 && age > 12; // socket still open but silent
  const left = candleTime !== null ? candleTime + TF_SEC[tf] - now / 1000 : null;
  const showClock = !demo && (status === 'live' || status === 'polling') && left !== null && left >= 0;

  return (
    <div className="price">
      {symbol && (
        <span className="sym">
          {leading}
          <span className="symtxt">
            <b>{name && name !== symbol ? name : symbol}</b>
            <small>{[symbol, kind ? kind.charAt(0) + kind.slice(1).toLowerCase() : '', tfLabel ? tfLabel + ' chart' : ''].filter(Boolean).join(' · ')}</small>
          </span>
        </span>
      )}
      <span key={flash?.n ?? 0} className={flash ? `flash-${flash.dir}` : ''}>{px !== null ? fmt(px) : '–'}</span>
      {unit && px !== null && <span className="small">{unit}</span>}
      {ch !== null && <span id="chg" className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(2)}%</span>}
      {approx && <span className="small" title="Converted at the live exchange rate">{approx}</span>}
      {demo
        ? <span className="livebadge off">DEMO DATA</span>
        : status !== 'off' && (
          <span className={`livebadge ${stale ? 'polling' : status}`} title={lastTick ? `Last update ${age}s ago` : ''}>
            <i className="pulse" />{stale ? 'DELAYED' : TEXT[status]}{(status === 'live' || stale) && lastTick ? <span className="age"> · {age < 2 ? 'now' : `${age}s`}</span> : null}
          </span>
        )}
      {showClock && <span className="small" title="Time until this candle closes">⏱ {clock(left as number)}</span>}
    </div>
  );
}
