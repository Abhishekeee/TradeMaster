import type { DayRange } from './data';

/** Small allowance for tick rounding, so a price a paisa off the day's low is not called impossible. */
const slack = (p: number) => Math.max(0.01, p * 0.0001);

export type Why = 'ok' | 'before' | 'closed' | 'outside';
/** `gap` is how far the price was from the day's range (always positive); `edge` is which end it missed: the stock stayed above (`low`) or below (`high`) the price. */
export interface DayCheck { why: Why; low?: number; high?: number; close?: number; first?: string; gap?: number; edge?: 'low' | 'high' }

const inRange = (d: DayRange, price: number) => price >= d.low - slack(price) && price <= d.high + slack(price);

/** Could `price` have been paid on `iso`? A day only counts if the market was open and the price lay between that day's low and high. */
export function checkDay(days: DayRange[], price: number, iso: string): DayCheck {
  if (!days.length) return { why: 'ok' };
  if (iso < days[0].date) return { why: 'before', first: days[0].date };
  const d = days.find((x) => x.date === iso);
  if (!d) return { why: 'closed' };
  return inRange(d, price) ? { why: 'ok', low: d.low, high: d.high, close: d.close } : price < d.low ? { why: 'outside', low: d.low, high: d.high, close: d.close, gap: d.low - price, edge: 'low' } : { why: 'outside', low: d.low, high: d.high, close: d.close, gap: price - d.high, edge: 'high' };
}

/** The nearest the stock ever came to a price it never reached: the day, the edge of that day's range, and how far off it was. */
export interface Nearest { date: string; value: number; gap: number; edge: 'low' | 'high' }

/**
 * Did any day's range contain this price? Catches typos (an extra zero, a price from another stock) before the date question.
 * Being inside the overall low-to-high is not enough: a stock can jump over a price (a split, a gap), so it must have traded there on some day.
 */
export function everTraded(days: DayRange[], price: number): { ok: boolean; low: number; high: number; nearest?: Nearest } {
  let low = Infinity, high = 0, best: Nearest | undefined;
  for (const d of days) {
    if (d.low < low) low = d.low;
    if (d.high > high) high = d.high;
    if (inRange(d, price)) return { ok: true, low, high };
    const edge = price < d.low ? 'low' : 'high';
    const gap = edge === 'low' ? d.low - price : price - d.high;
    if (!best || gap < best.gap) best = { date: d.date, value: edge === 'low' ? d.low : d.high, gap, edge };
  }
  for (const d of days) { if (d.low < low) low = d.low; if (d.high > high) high = d.high; }
  return { ok: !days.length, low, high, nearest: best };
}

/** The days nearest to `iso` on which the price was really reached (with each day's close), so the person can pick one of those instead. */
export function nearestDays(days: DayRange[], price: number, iso: string, n = 5): DayRange[] {
  const t = Date.parse(iso + 'T00:00:00Z');
  return days.filter((d) => inRange(d, price))
    .map((d) => ({ d, gap: Math.abs(Date.parse(d.date + 'T00:00:00Z') - t) }))
    .sort((a, b) => a.gap - b.gap).slice(0, n).map((x) => x.d).sort((a, b) => b.date.localeCompare(a.date));
}

/** Every day between two dates (inclusive) on which the price was really reached, newest first. */
export function reachedDays(days: DayRange[], price: number, from: string, to: string): DayRange[] {
  return days.filter((d) => d.date >= from && d.date <= to && inRange(d, price)).sort((a, b) => b.date.localeCompare(a.date));
}
