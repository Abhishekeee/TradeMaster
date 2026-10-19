import type { Candle } from './types';

export type Pt = { time: number; value: number };

function emaValues(v: number[], p: number): number[] {
  const k = 2 / (p + 1);
  const out: number[] = new Array(v.length);
  let e = v[0];
  for (let i = 0; i < v.length; i++) { e = i === 0 ? v[0] : v[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

/** Wilder's RSI. The first `period` bars are left out because the value is not meaningful yet. */
export function rsiSeries(c: Candle[], period = 14): Pt[] {
  const out: Pt[] = [];
  if (c.length <= period) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) { const d = c[i].close - c[i - 1].close; if (d >= 0) g += d; else l -= d; }
  g /= period; l /= period;
  out.push({ time: c[period].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  for (let i = period + 1; i < c.length; i++) {
    const d = c[i].close - c[i - 1].close;
    g = (g * (period - 1) + Math.max(d, 0)) / period;
    l = (l * (period - 1) + Math.max(-d, 0)) / period;
    out.push({ time: c[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  }
  return out;
}

export function macdSeries(c: Candle[], fast = 12, slow = 26, sig = 9) {
  const closes = c.map((k) => k.close);
  const f = emaValues(closes, fast), s = emaValues(closes, slow);
  const macd = closes.map((_, i) => f[i] - s[i]);
  const signal = emaValues(macd, sig);
  const start = slow; // drop the warm-up bars
  const line: Pt[] = [], sigl: Pt[] = [], hist: (Pt & { color: string })[] = [];
  for (let i = start; i < c.length; i++) {
    const h = macd[i] - signal[i];
    line.push({ time: c[i].time, value: macd[i] });
    sigl.push({ time: c[i].time, value: signal[i] });
    hist.push({ time: c[i].time, value: h, color: h >= 0 ? '#26a69a99' : '#ef535099' });
  }
  return { line, signal: sigl, hist };
}

/** Bollinger Bands: simple average of the last `period` closes, plus/minus `k` standard deviations. */
export function bollinger(c: Candle[], period = 20, k = 2) {
  const mid: Pt[] = [], up: Pt[] = [], lo: Pt[] = [];
  let sum = 0, sumSq = 0;
  for (let i = 0; i < c.length; i++) {
    const x = c[i].close;
    sum += x; sumSq += x * x;
    if (i >= period) { const y = c[i - period].close; sum -= y; sumSq -= y * y; }
    if (i >= period - 1) {
      const m = sum / period;
      const sd = Math.sqrt(Math.max(0, sumSq / period - m * m));
      mid.push({ time: c[i].time, value: m });
      up.push({ time: c[i].time, value: m + k * sd });
      lo.push({ time: c[i].time, value: m - k * sd });
    }
  }
  return { mid, up, lo };
}

/** Volume-weighted average price. Restarts every UTC day on intraday charts; on daily and weekly charts it runs over the whole range. */
export function vwapSeries(c: Candle[]): Pt[] {
  const out: Pt[] = [];
  const intraday = c.length > 2 && c[1].time - c[0].time < 86400;
  let day = -1, pv = 0, vol = 0;
  for (const k of c) {
    const d = Math.floor(k.time / 86400);
    if (intraday && d !== day) { day = d; pv = 0; vol = 0; }
    const typical = (k.high + k.low + k.close) / 3;
    pv += typical * (k.volume || 1);
    vol += k.volume || 1;
    out.push({ time: k.time, value: pv / vol });
  }
  return out;
}
