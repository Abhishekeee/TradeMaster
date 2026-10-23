import { useEffect, useState } from 'react';
import { CATEGORIES } from './markets';
import { fetchYearChanges } from './data';
import { analyse, benchmarkFor, dailyCandles, resolveFund, type Stat } from './portfolio';
import { align, corr, rets } from './portfolioInsights';
import type { Candle, Instrument } from './types';

export type AltKind = 'Stock' | 'ETF' | 'Mutual fund';
export interface Alt {
  inst: Instrument; kind: AltKind; debt: boolean; stat: Stat;
  r1y: number | null; r3yAnn: number | null; alpha1: number | null; alpha3: number | null;
  vol: number | null; maxDD: number | null; corr: number | null; score: number; why: string[];
}

const y = (id: string, name: string, kind = 'ETF'): Instrument => ({ id, name, source: 'yahoo', kind });
// A fixed shortlist of well-known, liquid choices (plus the user's own watchlist). It is a starting point, not the whole market.
const IN_ETFS = [y('NIFTYBEES.NS', 'Nifty 50 ETF'), y('JUNIORBEES.NS', 'Nifty Next 50 ETF'), y('BANKBEES.NS', 'Bank Nifty ETF'), y('ITBEES.NS', 'Nifty IT ETF'),
  y('MID150BEES.NS', 'Nifty Midcap 150 ETF'), y('GOLDBEES.NS', 'Gold ETF'), y('SILVERBEES.NS', 'Silver ETF'), y('MON100.NS', 'Nasdaq 100 ETF')];
const US_ETFS = [y('SPY', 'S&P 500 ETF'), y('QQQ', 'Nasdaq 100 ETF'), y('VTI', 'Total US Market ETF'), y('SCHD', 'US Dividend ETF'), y('GLD', 'Gold ETF')];
const IN_FUNDS: { label: string; debt: boolean }[] = [
  { label: 'Parag Parikh Flexi Cap Fund Direct Growth', debt: false }, { label: 'UTI Nifty 50 Index Fund Direct Growth', debt: false },
  { label: 'HDFC Flexi Cap Fund Direct Growth', debt: false }, { label: 'Nippon India Small Cap Fund Direct Growth', debt: false },
  { label: 'SBI Contra Fund Direct Growth', debt: false }, { label: 'Mirae Asset Large Cap Fund Direct Growth', debt: false },
  { label: 'Axis Midcap Fund Direct Growth', debt: false }, { label: 'Canara Robeco Large Cap Fund Direct Growth', debt: false },
  { label: 'ICICI Prudential Corporate Bond Fund Direct Growth', debt: true }, { label: 'HDFC Corporate Bond Fund Direct Growth', debt: true },
  { label: 'Kotak Corporate Bond Fund Direct Growth', debt: true }, { label: 'Aditya Birla Sun Life Corporate Bond Fund Direct Growth', debt: true },
  { label: 'Nippon India Short Term Fund Direct Growth', debt: true },
];

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function annual(c: Candle[], years: number): number | null {
  const n = Math.round(years * 252);
  if (c.length <= n + 5) return null;
  return ((c[c.length - 1].close / c[c.length - 1 - n].close) ** (1 / years) - 1) * 100;
}

/** Downloads history for the shortlist and scores each with the same rules used for the user's own holdings. */
export async function loadAlternatives(ccy: string, watch: Instrument[], held: Set<string>, series: { times: number[]; values: number[] } | null, onProgress: (done: number, total: number) => void): Promise<Alt[]> {
  const bench = benchmarkFor(ccy);
  const bc = await dailyCandles(bench);
  if (!bc) return [];
  const bAnn1 = annual(bc, 1), bAnn3 = annual(bc, 3);
  const pr = series ? rets(series.values) : null;

  type Job = { inst?: Instrument; label?: string; kind: AltKind; debt: boolean };
  const jobs: Job[] = [];
  if (ccy === 'INR') {
    CATEGORIES.find((c) => c.id === 'in')!.items.slice(0, 20).forEach((i) => jobs.push({ inst: i, kind: 'Stock', debt: false }));
    IN_ETFS.forEach((i) => jobs.push({ inst: i, kind: 'ETF', debt: false }));
    IN_FUNDS.forEach((f) => jobs.push({ label: f.label, kind: 'Mutual fund', debt: f.debt }));
  } else {
    CATEGORIES.find((c) => c.id === 'us')!.items.filter((i) => i.kind !== 'ETF').forEach((i) => jobs.push({ inst: i, kind: 'Stock', debt: false }));
    US_ETFS.forEach((i) => jobs.push({ inst: i, kind: 'ETF', debt: false }));
  }
  watch.forEach((i) => { if (!jobs.some((j) => j.inst?.id === i.id)) jobs.push({ inst: i, kind: i.kind === 'ETF' ? 'ETF' : 'Stock', debt: false }); });

  const out: Alt[] = [];
  let next = 0, done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      try {
        let inst = j.inst;
        if (!inst) { const f = await resolveFund({ label: j.label!, qty: 0, price: 0 }); inst = f?.inst; }
        if (!inst || held.has(inst.id)) continue;
        const c = await dailyCandles(inst);
        if (!c || c.length < 300) continue;
        const last = c[c.length - 1].close;
        const stat = analyse({ id: 'alt', inst, lots: [{ id: 'x', qty: 1, price: last }] }, c, undefined, bc, undefined);
        const debt = j.debt || stat.debt;
        const closes = c.slice(-253).map((k) => k.close);
        const r = rets(closes);
        const m = r.reduce((a, b) => a + b, 0) / (r.length || 1);
        const vol = r.length > 40 ? Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length) * Math.sqrt(252) * 100 : null;
        let peak = closes[0], dd = 0;
        closes.forEach((v) => { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); });
        const r1y = stat.r1y, r3yAnn = annual(c, 3);
        const alpha1 = r1y !== null && bAnn1 !== null ? r1y - bAnn1 : null;
        const alpha3 = r3yAnn !== null && bAnn3 !== null ? r3yAnn - bAnn3 : null;
        const cr = series && pr ? corr(rets(align(series.times, c)), pr) : null;

        let score: number;
        const why: string[] = [];
        if (debt) {
          score = (r1y ?? -99) - 0.4 * (vol ?? 5);
          if (r1y !== null) why.push(`Returned ${r1y.toFixed(1)}% over the last year with low swings (${(vol ?? 0).toFixed(1)}% a year).`);
        } else {
          const stretched = (stat.rsi ?? 0) >= 72 || (stat.ext50 ?? 0) > 20;
          score = 0.5 * clamp(alpha1 ?? -20, -20, 30) + 0.8 * clamp(alpha3 ?? 0, -10, 20)
            + (stat.trend === 'Uptrend' ? 5 : stat.trend === 'Downtrend' ? -8 : 0)
            + (dd * 100 > -20 ? 3 : dd * 100 < -35 ? -4 : 0) - (stretched ? 6 : 0) + (cr !== null && cr < 0.5 ? 3 : 0);
          if (alpha1 !== null) why.push(`${alpha1 >= 0 ? 'Beat' : 'Trailed'} ${bench.name} by ${Math.abs(alpha1).toFixed(1)} points over the last year.`);
          if (alpha3 !== null) why.push(alpha3 >= 0 ? `Ahead of the index by ${alpha3.toFixed(1)} points a year over 3 years, so it is not just a one-year run.` : `Behind the index by ${Math.abs(alpha3).toFixed(1)} points a year over 3 years.`);
          if (stat.trend === 'Uptrend') why.push('Price is in an uptrend.');
          if (dd * 100 > -20) why.push(`Its worst fall in the last year was a milder ${Math.abs(dd * 100).toFixed(0)}%.`);
          if (cr !== null && cr < 0.5) why.push('Moves differently from your current mix, which helps spread risk.');
          if (stretched) why.push('Warning: the price already looks stretched after a big run.');
          if ((r1y ?? 0) > 50) why.push('Warning: up a lot in a year. Big winners often cool off.');
        }
        out.push({ inst, kind: j.kind, debt, stat, r1y, r3yAnn, alpha1, alpha3, vol, maxDD: dd * 100, corr: cr, score, why });
      } catch { /* skip this candidate */ }
      finally { onProgress(++done, jobs.length); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  return out;
}

let memo: { key: string; at: number; alts: Alt[] } | null = null;
export const altKey = (ccy: string, held: Set<string>, watch: Instrument[]) => ccy + '|' + [...held].sort().join() + '|' + watch.map((i) => i.id).sort().join();

/** The shortlist, downloaded once and shared by the Alternatives and Winners tabs. */
export function useAlternatives(ccy: string, watch: Instrument[], held: Set<string>, series: { times: number[]; values: number[] } | null, enabled = true) {
  const key = altKey(ccy, held, watch);
  const [alts, setAlts] = useState<Alt[] | null>(memo && memo.key === key && Date.now() - memo.at < 15 * 60000 ? memo.alts : null);
  const [prog, setProg] = useState<[number, number]>([0, 1]);
  useEffect(() => {
    if (alts || !enabled) return;
    let dead = false;
    loadAlternatives(ccy, watch, held, series, (d, t) => { if (!dead) setProg([d, t]); }).then((r) => {
      if (dead) return;
      memo = { key, at: Date.now(), alts: r };
      setAlts(r);
    });
    return () => { dead = true; };
  }, [key, alts, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { alts, prog };
}

/* ---------------------------------------------------------------- this year's best performers among widely held large companies */
export const IN_LARGE = ['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA', 'TITAN',
  'ULTRACEMCO', 'BAJFINANCE', 'WIPRO', 'NESTLEIND', 'HCLTECH', 'POWERGRID', 'NTPC', 'ONGC', 'M&M', 'TATASTEEL', 'JSWSTEEL', 'ADANIENT', 'ADANIPORTS', 'COALINDIA', 'BAJAJFINSV', 'TECHM', 'GRASIM',
  'CIPLA', 'DRREDDY', 'EICHERMOT', 'HEROMOTOCO', 'BRITANNIA', 'APOLLOHOSP', 'DIVISLAB', 'HINDALCO', 'INDUSINDBK', 'BPCL', 'TATACONSUM', 'SBILIFE', 'HDFCLIFE', 'SHRIRAMFIN', 'TRENT', 'BEL', 'HAL',
  'JIOFIN', 'VEDL', 'DLF', 'IRCTC', 'PIDILITIND', 'SIEMENS', 'TVSMOTOR', 'CHOLAFIN', 'BAJAJ-AUTO', 'GAIL', 'IOC', 'PNB', 'BANKBARODA', 'LUPIN', 'MUTHOOTFIN', 'GODREJCP', 'HAVELLS', 'ABB'].map((s) => s + '.NS');
export const US_LARGE = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'NFLX', 'JPM', 'BAC', 'DIS', 'KO', 'WMT', 'XOM', 'PFE', 'BA', 'INTC', 'UBER', 'COIN', 'AVGO', 'ORCL', 'CRM', 'V', 'MA', 'UNH', 'LLY', 'COST', 'PEP', 'CVX', 'ADBE', 'QCOM', 'MRK', 'ABBV', 'HD', 'PG', 'JNJ', 'CAT', 'GE', 'GS'];

export interface Winner { inst: Instrument; name: string; ret1y: number; held: boolean }
export interface Scan { top: Winner[]; rank: Record<string, { pos: number; of: number; ret1y: number }>; total: number; bench: number | null; benchName: string }

/** One batch request for every company's 1-year change, ranked. */
export async function scanLargeCaps(ccy: string, held: Set<string>, n = 6): Promise<Scan> {
  const bench = benchmarkFor(ccy);
  const got = await fetchYearChanges([bench.id, ...(ccy === 'INR' ? IN_LARGE : US_LARGE)]);
  const benchRet = got[bench.id]?.chg1y ?? null;
  delete got[bench.id];
  const all: Winner[] = Object.entries(got).map(([id, q]) => ({ inst: { id, name: q.name, source: 'yahoo' as const, kind: 'EQUITY' }, name: q.name, ret1y: q.chg1y, held: held.has(id) })).sort((a, b) => b.ret1y - a.ret1y);
  const rank: Scan['rank'] = {};
  all.forEach((w, i) => { if (w.held) rank[w.inst.id] = { pos: i + 1, of: all.length, ret1y: w.ret1y }; });
  return { top: all.slice(0, n), rank, total: all.length, bench: benchRet, benchName: bench.name };
}

/** Best candidates: equity picks must beat the index on at least one horizon and not be in a down-trend. */
export function bestAlternatives(alts: Alt[], debt: boolean, n: number): Alt[] {
  return alts
    .filter((a) => a.debt === debt)
    .filter((a) => debt ? (a.r1y ?? -1) > 0 : a.stat.trend !== 'Downtrend' && ((a.alpha1 ?? -1) > 0 || (a.alpha3 ?? -1) > 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
