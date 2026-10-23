import { useEffect, useRef, useState } from 'react';
import { fetchDaily } from './data';
import type { Candle } from './types';

export type Region = 'Asia' | 'Europe' | 'Americas' | 'Other';
export interface Country { sym: string; country: string; code: string; name: string; ccy: string; region: Region }

/** The main stock market index of each major country (Yahoo Finance symbols). */
export const COUNTRIES: Country[] = [
  { sym: '^NSEI', country: 'India', code: 'IN', name: 'Nifty 50', ccy: 'INR', region: 'Asia' },
  { sym: '^GSPC', country: 'United States', code: 'US', name: 'S&P 500', ccy: 'USD', region: 'Americas' },
  { sym: '^IXIC', country: 'United States', code: 'US', name: 'Nasdaq Composite', ccy: 'USD', region: 'Americas' },
  { sym: '^DJI', country: 'United States', code: 'US', name: 'Dow Jones', ccy: 'USD', region: 'Americas' },
  { sym: '^FTSE', country: 'United Kingdom', code: 'UK', name: 'FTSE 100', ccy: 'GBP', region: 'Europe' },
  { sym: '^GDAXI', country: 'Germany', code: 'DE', name: 'DAX', ccy: 'EUR', region: 'Europe' },
  { sym: '^FCHI', country: 'France', code: 'FR', name: 'CAC 40', ccy: 'EUR', region: 'Europe' },
  { sym: '^SSMI', country: 'Switzerland', code: 'CH', name: 'SMI', ccy: 'CHF', region: 'Europe' },
  { sym: '^IBEX', country: 'Spain', code: 'ES', name: 'IBEX 35', ccy: 'EUR', region: 'Europe' },
  { sym: 'FTSEMIB.MI', country: 'Italy', code: 'IT', name: 'FTSE MIB', ccy: 'EUR', region: 'Europe' },
  { sym: '^AEX', country: 'Netherlands', code: 'NL', name: 'AEX', ccy: 'EUR', region: 'Europe' },
  { sym: '^N225', country: 'Japan', code: 'JP', name: 'Nikkei 225', ccy: 'JPY', region: 'Asia' },
  { sym: '000001.SS', country: 'China', code: 'CN', name: 'Shanghai Composite', ccy: 'CNY', region: 'Asia' },
  { sym: '^HSI', country: 'Hong Kong', code: 'HK', name: 'Hang Seng', ccy: 'HKD', region: 'Asia' },
  { sym: '^KS11', country: 'South Korea', code: 'KR', name: 'KOSPI', ccy: 'KRW', region: 'Asia' },
  { sym: '^TWII', country: 'Taiwan', code: 'TW', name: 'TAIEX', ccy: 'TWD', region: 'Asia' },
  { sym: '^STI', country: 'Singapore', code: 'SG', name: 'Straits Times', ccy: 'SGD', region: 'Asia' },
  { sym: '^JKSE', country: 'Indonesia', code: 'ID', name: 'Jakarta Composite', ccy: 'IDR', region: 'Asia' },
  { sym: '^AXJO', country: 'Australia', code: 'AU', name: 'ASX 200', ccy: 'AUD', region: 'Other' },
  { sym: '^GSPTSE', country: 'Canada', code: 'CA', name: 'S&P/TSX', ccy: 'CAD', region: 'Americas' },
  { sym: '^BVSP', country: 'Brazil', code: 'BR', name: 'Bovespa', ccy: 'BRL', region: 'Americas' },
  { sym: '^MXX', country: 'Mexico', code: 'MX', name: 'IPC Mexico', ccy: 'MXN', region: 'Americas' },
  { sym: '^J203.JO', country: 'South Africa', code: 'ZA', name: 'JSE All Share', ccy: 'ZAR', region: 'Other' },
];

export type Period = '1M' | '3M' | '6M' | 'YTD' | '1Y';
export const PERIODS: Period[] = ['1M', '3M', '6M', 'YTD', '1Y'];
export const PERIOD_NAME: Record<Period, string> = { '1M': 'the last month', '3M': 'the last 3 months', '6M': 'the last 6 months', YTD: 'this year so far', '1Y': 'the last 12 months' };

export interface Pt { time: number; v: number }
const DAY = 86400;

/** The moment a period starts, counted back from the most recent data point. */
export function periodStart(p: Period, last: number): number {
  if (p === 'YTD') return Date.UTC(new Date(last * 1000).getUTCFullYear(), 0, 1) / 1000;
  return last - { '1M': 30, '3M': 91, '6M': 182, '1Y': 365 }[p] * DAY;
}

/** % change since the close just before `start` (or the first point we have). */
export function change(s: Pt[], start: number): number | null {
  if (s.length < 2) return null;
  let b = -1;
  for (let i = 0; i < s.length; i++) { if (s[i].time < start) b = i; else break; }
  const base = s[Math.max(b, 0)].v;
  return base ? (s[s.length - 1].v / base - 1) * 100 : null;
}

/** The line to draw: % gain or loss since the period began. */
export function rebased(s: Pt[], start: number): { time: number; value: number }[] {
  let b = -1;
  for (let i = 0; i < s.length; i++) { if (s[i].time < start) b = i; else break; }
  const from = Math.max(b, 0), base = s[from]?.v;
  if (!base) return [];
  return s.slice(from).map((p) => ({ time: p.time, value: (p.v / base - 1) * 100 }));
}

export interface Stats { level: number; day: number | null; m1: number | null; m3: number | null; m6: number | null; ytd: number | null; y1: number | null; fromHigh: number | null; swing: number | null }
export function statsOf(s: Pt[]): Stats | null {
  if (s.length < 20) return null;
  const last = s[s.length - 1];
  const yr = s.slice(-253);
  const hi = Math.max(...yr.map((p) => p.v));
  const r = yr.slice(1).map((p, i) => p.v / yr[i].v - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const swing = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length) * Math.sqrt(252) * 100;
  return {
    level: last.v, day: (last.v / s[s.length - 2].v - 1) * 100,
    m1: change(s, periodStart('1M', last.time)), m3: change(s, periodStart('3M', last.time)), m6: change(s, periodStart('6M', last.time)),
    ytd: change(s, periodStart('YTD', last.time)), y1: change(s, periodStart('1Y', last.time)),
    fromHigh: (last.v / hi - 1) * 100, swing,
  };
}

/** Index levels, or those levels converted to US dollars so countries can be compared fairly. */
export function priceSeries(c: Candle[] | undefined, ccy: string, usd: boolean, fx: Record<string, Candle[]>): Pt[] | null {
  if (!c || c.length < 2) return null;
  if (!usd || ccy === 'USD') return c.map((k) => ({ time: k.time, v: k.close }));
  const rate = fx[ccy];
  if (!rate || !rate.length) return null;
  let j = 0;
  return c.map((k) => { while (j + 1 < rate.length && rate[j + 1].time <= k.time) j++; return { time: k.time, v: k.close / rate[j].close }; });
}

/** Downloads a year of daily closes for every index (and, when dollars are wanted, the currencies), and refreshes them every few minutes. */
export function useWorld(wantFx: boolean) {
  const [candles, setCandles] = useState<Record<string, Candle[]>>({});
  const [fx, setFx] = useState<Record<string, Candle[]>>({});
  const [done, setDone] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [tick, setTick] = useState(0);
  const total = COUNTRIES.length;
  const fxAsked = useRef(false);

  useEffect(() => {
    let dead = false;
    let next = 0, finished = 0;
    const got: Record<string, Candle[]> = {};
    const worker = async () => {
      while (next < COUNTRIES.length) {
        const c = COUNTRIES[next++];
        const d = await fetchDaily(c.sym, '1y');
        if (dead) return;
        if (d) { got[c.sym] = d; setCandles((p) => ({ ...p, [c.sym]: d })); }
        setDone(++finished);
      }
    };
    setDone(0);
    Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]).then(() => { if (!dead) setUpdated(Date.now()); });
    const t = setTimeout(() => setTick((x) => x + 1), 5 * 60000);
    return () => { dead = true; clearTimeout(t); };
  }, [tick]);

  useEffect(() => {
    if (!wantFx || fxAsked.current) return;
    fxAsked.current = true;
    const ccys = [...new Set(COUNTRIES.map((c) => c.ccy))].filter((c) => c !== 'USD');
    ccys.forEach(async (c) => { const d = await fetchDaily(`USD${c}=X`, '1y'); if (d) setFx((p) => ({ ...p, [c]: d })); });
  }, [wantFx]);

  return { candles, fx, done, total, updated, loading: done < total };
}
