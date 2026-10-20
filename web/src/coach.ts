import type { Closed } from './paper';
import type { Candle } from './types';

export interface Coaching { tone: 'good' | 'bad' | 'flat'; text: string; tip?: string }

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function emaLast(c: Candle[], n: number): number {
  const k = 2 / (n + 1);
  let e = c[0].close;
  for (let i = 1; i < c.length; i++) e = c[i].close * k + e * (1 - k);
  return e;
}

function atrOf(c: Candle[]): number {
  const t = c.slice(-31);
  const tr: number[] = [];
  for (let i = 1; i < t.length; i++) tr.push(Math.max(t[i].high - t[i].low, Math.abs(t[i].high - t[i - 1].close), Math.abs(t[i].low - t[i - 1].close)));
  return mean(tr);
}

/** Candle size that suits a trade of this length and age, and the data the feeds can actually supply. */
export function coachTimeframe(h: Closed): string {
  const dur = h.exitTime - h.time, age = Date.now() - h.time;
  if (dur < 3 * 3600e3 && age < 2 * 86400e3) return '5m';
  if (dur < 3 * 86400e3 && age < 40 * 86400e3) return '1h';
  return '1D';
}

/**
 * Explains a closed trade in plain words. Rules read the trade and the chart around it: was there a stop, did the price
 * go the right way first, was the trade against the trend, was the stop too close. It is not a language model.
 */
export function coachTrade(h: Closed, candles: Candle[] | null): Coaching {
  const d = h.side === 'long' ? 1 : -1;
  const won = h.pnl > 0;
  const flat = Math.abs(h.pnl) <= 0.25 * (h.fees ?? 0);   // result is a rounding error next to the fees
  const hit = h.reason;
  const found: string[] = [];

  let atr = 0, mfe = 0, trend = 0, chase = false, recovered = false, ranOn = false;
  if (candles && candles.length > 60) {
    const ei = candles.findIndex((k) => k.time * 1000 > h.time) - 1;
    const xi = candles.findIndex((k) => k.time * 1000 > h.exitTime) - 1;
    const exitIdx = xi < 0 ? candles.length - 1 : xi;
    if (ei >= 40) {
      const before = candles.slice(0, ei + 1), during = candles.slice(ei, exitIdx + 1), after = candles.slice(exitIdx + 1, exitIdx + 1 + Math.max(10, during.length));
      atr = atrOf(before);
      const e50 = emaLast(before.slice(-120), 50), e20 = emaLast(before.slice(-120), 20), last = before[before.length - 1].close;
      trend = e20 > e50 && last > e50 ? 1 : e20 < e50 && last < e50 ? -1 : 0;
      mfe = d > 0 ? Math.max(...during.map((k) => k.high)) - h.entry : h.entry - Math.min(...during.map((k) => k.low));
      const move10 = (last - before[before.length - 11].close) * d;
      chase = atr > 0 && move10 > 3 * atr;
      if (after.length) {
        recovered = d > 0 ? Math.max(...after.map((k) => k.high)) >= h.entry : Math.min(...after.map((k) => k.low)) <= h.entry;
        const best = d > 0 ? Math.max(...after.map((k) => k.high)) - h.exit : h.exit - Math.min(...after.map((k) => k.low));
        ranOn = atr > 0 && best > atr;
      }
    }
  }

  if (!won && !flat) {
    const stopDist = h.sl !== undefined ? Math.abs(h.entry - h.sl) : null;
    if (h.sl === undefined && !h.trail) found.push('You had no stop loss, so the loss kept growing. Always set a stop.');
    if ((h.gross ?? 0) > 0) found.push('You were right, but fees ate the profit. Aim for a bigger target.');
    if (hit === 'stop' && stopDist !== null && atr > 0 && stopDist < atr) found.push(recovered ? 'Your stop was too close. Price came back after you were out. Give it more room.' : 'Your stop was too close. Normal price swings hit it. Give it more room.');
    if (atr > 0 && (mfe >= atr || (h.tp !== undefined && mfe >= 0.5 * Math.abs(h.tp - h.entry)))) found.push('It was in profit first, then turned. Take profit earlier, or move your stop up.');
    if (trend * d < 0) found.push('You traded against the trend. Trade with it, or wait.');
    if (chase) found.push('You entered after a big move (chasing). Wait for a small pullback.');
    if (h.eq && h.eq > 0 && -h.pnl / h.eq > 0.03) found.push('Your bet was too big for your account. Risk about 1% per trade.');
    if (hit === 'manual' && recovered) found.push('You sold in fear. Price came back. Trust your plan.');
    if (!found.length) found.push('The market went against you. It happens. Keep losses small and move on.');
    return { tone: 'bad', text: found[0], tip: found[1] };
  }

  if (flat) return { tone: 'flat', text: 'Almost flat. No harm done.' };

  const text = hit === 'target' ? 'Great! Your target was hit. You followed your plan.'
    : hit === 'stop' ? 'Good! Your stop locked in a profit.'
      : 'Good! You took profit and kept it.';
  const tip = trend * d > 0 ? 'You traded with the trend. Keep doing this.'
    : hit === 'manual' && ranOn ? 'Price went higher after, but a profit is a profit.'
      : undefined;
  return { tone: 'good', text, tip };
}
