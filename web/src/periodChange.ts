import type { Candle } from './types';

/**
 * Each timeframe compares the price now with the price one timeframe ago: a 5m chart against 5 minutes ago, a 1h chart against
 * an hour ago, a daily chart against a day ago, a weekly chart against a week ago, and so on.
 */
export const PERIOD: Record<string, { label: string; secs?: number; days?: number }> = {
  '1m': { label: '1 min ago', secs: 60 },
  '5m': { label: '5 min ago', secs: 300 },
  '15m': { label: '15 min ago', secs: 900 },
  '30m': { label: '30 min ago', secs: 1800 },
  '1h': { label: '1 hour ago', secs: 3600 },
  '4h': { label: '4 hours ago', secs: 14400 },
  '1D': { label: '1 day ago', days: 1 },
  '1W': { label: '1 week ago', days: 7 },
  '1M': { label: '1 month ago', days: 30.4 },
  '3M': { label: '3 months ago', days: 91 },
  '6M': { label: '6 months ago', days: 182 },
  '1Y': { label: '1 year ago', days: 365 },
};

/** The history the comparison price is read from: 1-minute candles for intraday timeframes, daily closes otherwise. */
export const periodSource = (tf: string): '1m' | '1D' | null => (PERIOD[tf] ? (PERIOD[tf].secs ? '1m' : '1D') : null);

export interface PeriodChange { pct: number; from: number; time: number; label: string }

/**
 * `hist` is the source history for the timeframe (see periodSource), oldest first.
 * Intraday: the price at (now − timeframe). After the close, "now" is the last trade, so the comparison still spans real trading.
 * Daily and longer: the close that many days back (the way brokers and TradingView measure it); a stock younger than that
 * is measured from its first traded price and says "since listing".
 */
export function periodChange(tf: string, px: number, hist: Candle[] | null, nowSec = Date.now() / 1000): PeriodChange | null {
  const p = PERIOD[tf];
  if (!p || !(px > 0) || !hist || hist.length < 2) return null;
  const last = hist[hist.length - 1];
  if (p.secs) {
    // After the close the final print (the closing auction) stands alone, minutes after the last continuous trade. Counting back from
    // it would land every short timeframe in the same quiet gap, so count back from the end of continuous trading instead.
    const alone = hist.length > 2 && nowSec - last.time > 120 && last.time - hist[hist.length - 2].time > 300;
    const ref = alone ? hist[hist.length - 2] : last;
    const target = Math.min(nowSec, ref.time + 60) - p.secs;
    let i = hist.length - 1;
    while (i > 0 && hist[i].time > target) i--;
    if (hist[i].time > target) return null;                       // the history does not reach back that far
    const from = hist[i].close;
    return from > 0 ? { pct: ((px - from) / from) * 100, from, time: target, label: p.label } : null;
  }
  const target = last.time - (p.days as number) * 86400;
  let i = hist.length - 1;
  while (i > 0 && hist[i].time > target) i--;
  const short = hist[i].time > target;
  const from = short ? hist[i].open : hist[i].close;
  return from > 0 ? { pct: ((px - from) / from) * 100, from, time: hist[i].time, label: short ? 'since listing' : p.label } : null;
}

/** The price difference as signed text with sensible decimals (+0.05, −21.65, +0.0007), not the long float the quote formatter gives. */
export function moveText(px: number, from: number): string {
  const d = px - from, a = Math.abs(d);
  const dp = px >= 10 ? 2 : px >= 1 ? 3 : px >= 0.01 ? 4 : 6;
  return `${d >= 0 ? '+' : '−'}${a.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
