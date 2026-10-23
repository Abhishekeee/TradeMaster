import type { Candle } from './types';
import type { FundamentalsRaw, FundMeta } from './data';
import { bollinger, macdSeries, rsiSeries } from './indicators';
import { levels } from './engine/patterns.js';

export type Tone = 'good' | 'ok' | 'bad' | 'na';
export interface Metric { name: string; value: string; tone: Tone; note: string }

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : 0);
const f1 = (n: number) => n.toFixed(1);
const sgn = (n: number, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`;
const pts = (t: Tone): number | null => (t === 'good' ? 100 : t === 'ok' ? 55 : t === 'bad' ? 15 : null);

/* ================================================================ technical analysis */
export type Vote = 'buy' | 'sell' | 'neutral';
export interface Indicator { name: string; value: string; vote: Vote; note: string }
export type TechRating = 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
export interface Technical {
  rating: TechRating; score: number; buy: number; sell: number; neutral: number;
  indicators: Indicator[]; support: number | null; resistance: number | null; range52: number | null; atrPct: number | null;
}

/** Reads the chart the way a trader's screen does: a dozen standard indicators, each voting buy / neutral / sell. */
export function technical(c: Candle[]): Technical | null {
  if (c.length < 60) return null;
  const closes = c.map((k) => k.close);
  const price = closes[closes.length - 1];
  const out: Indicator[] = [];
  const add = (name: string, value: string, vote: Vote, note: string) => out.push({ name, value, vote, note });
  const smaAt = (n: number, back = 0) => (closes.length >= n + back ? mean(closes.slice(closes.length - n - back, closes.length - back)) : null);

  for (const n of [20, 50, 200]) {
    const m = smaAt(n);
    if (m === null) continue;
    const d = pct(price, m);
    add(`Price vs ${n}-day average`, `${sgn(d)} (${m.toFixed(2)})`, d > 1 ? 'buy' : d < -1 ? 'sell' : 'neutral',
      n === 20 ? (d > 0 ? 'Above its short-term average: short-term strength.' : 'Below its short-term average: short-term weakness.')
        : n === 50 ? (d > 0 ? 'Above its medium-term average: the trend is healthy.' : 'Below its medium-term average: the trend is weak.')
          : (d > 0 ? 'Above its long-term average: the long-term trend is up.' : 'Below its long-term average: the long-term trend is down.'));
  }

  // golden / death cross: the 50-day average crossing the 200-day average
  if (closes.length >= 230) {
    const diff = (back: number) => (smaAt(50, back) as number) - (smaAt(200, back) as number);
    const now = diff(0);
    let crossed: number | null = null;
    for (let b = 1; b <= 40; b++) { if (Math.sign(diff(b)) !== Math.sign(now)) { crossed = b; break; } }
    add('50-day vs 200-day average', now > 0 ? 'Golden cross state' : 'Death cross state', now > 0 ? 'buy' : 'sell',
      crossed !== null ? `The 50-day average crossed ${now > 0 ? 'above' : 'below'} the 200-day about ${crossed} trading days ago, a classic ${now > 0 ? 'bullish' : 'bearish'} signal.`
        : now > 0 ? 'The 50-day average is above the 200-day: a long-term uptrend.' : 'The 50-day average is below the 200-day: a long-term downtrend.');
  }

  const mc = macdSeries(c.slice(-200));
  if (mc.hist.length > 12) {
    const h = mc.hist.map((x) => x.value);
    const now = h[h.length - 1];
    let cr: number | null = null;
    for (let b = 1; b <= 10; b++) { if (Math.sign(h[h.length - 1 - b]) !== Math.sign(now)) { cr = b; break; } }
    add('MACD', `${mc.line[mc.line.length - 1].value.toFixed(2)} vs signal ${mc.signal[mc.signal.length - 1].value.toFixed(2)}`, now > 0 ? 'buy' : 'sell',
      cr !== null ? `Just crossed ${now > 0 ? 'up' : 'down'} (${cr} days ago): momentum is turning ${now > 0 ? 'positive' : 'negative'}.` : now > 0 ? 'Momentum is positive.' : 'Momentum is negative.');
  }

  const rs = rsiSeries(c.slice(-200));
  const rsi = rs.length ? rs[rs.length - 1].value : null;
  if (rsi !== null) add('RSI (14)', rsi.toFixed(0), rsi <= 30 ? 'buy' : rsi >= 70 ? 'sell' : 'neutral',
    rsi <= 30 ? 'Oversold: it has fallen hard and often bounces.' : rsi >= 70 ? 'Overbought: it has risen fast and may cool off.' : 'In the normal range (30–70): no extreme.');

  const bb = bollinger(c.slice(-120));
  if (bb.mid.length) {
    const i = bb.mid.length - 1;
    const pb = (price - bb.lo[i].value) / ((bb.up[i].value - bb.lo[i].value) || 1);
    add('Bollinger Bands', `${(pb * 100).toFixed(0)}% of the way up the band`, pb < 0.1 ? 'buy' : pb > 0.9 ? 'sell' : 'neutral',
      pb < 0.1 ? 'Touching the lower band: stretched down.' : pb > 0.9 ? 'Touching the upper band: stretched up.' : 'Inside the bands: nothing unusual.');
  }

  if (closes.length > 70) {
    const r3 = pct(price, closes[closes.length - 64]);
    add('3-month momentum', sgn(r3), r3 > 5 ? 'buy' : r3 < -8 ? 'sell' : 'neutral', r3 > 5 ? 'Clearly rising over three months.' : r3 < -8 ? 'Clearly falling over three months.' : 'Fairly flat over three months.');
  }

  const vol = c.slice(-60).reduce((s, k) => s + k.volume, 0);
  if (vol > 0 && c.length > 80) {
    let obv = 0;
    const o: number[] = [];
    c.slice(-80).forEach((k, i, a) => { if (i) obv += Math.sign(k.close - a[i - 1].close) * k.volume; o.push(obv); });
    const up = o[o.length - 1] > mean(o.slice(-20)) && o[o.length - 1] > o[o.length - 21];
    const dn = o[o.length - 1] < mean(o.slice(-20)) && o[o.length - 1] < o[o.length - 21];
    add('Volume trend (OBV)', up ? 'Rising' : dn ? 'Falling' : 'Flat', up ? 'buy' : dn ? 'sell' : 'neutral',
      up ? 'More volume on up days than down days: buyers are in control.' : dn ? 'More volume on down days: sellers are in control.' : 'Buying and selling volume look balanced.');
  }

  const yr = c.slice(-252);
  const hi = Math.max(...yr.map((k) => k.high)), lo = Math.min(...yr.map((k) => k.low));
  const range52 = hi > lo ? ((price - lo) / (hi - lo)) * 100 : null;
  if (range52 !== null) add('52-week range', `${range52.toFixed(0)}% of the way from low to high`, range52 > 70 ? 'buy' : range52 < 25 ? 'sell' : 'neutral',
    range52 > 70 ? 'Trading near its yearly high: strong.' : range52 < 25 ? 'Trading near its yearly low: weak.' : 'Somewhere in the middle of its yearly range.');

  const tr = c.slice(-15).map((k, i, a) => (i ? Math.max(k.high - k.low, Math.abs(k.high - a[i - 1].close), Math.abs(k.low - a[i - 1].close)) : 0)).slice(1);
  const atrPct = tr.length && price ? (mean(tr) / price) * 100 : null;

  let support: number | null = null, resistance: number | null = null;
  try {
    const lv = (levels(c.slice(-300)) as { price: number; touches: number }[]).map((l) => l.price);
    support = Math.max(-Infinity, ...lv.filter((p) => p < price * 0.995));
    resistance = Math.min(Infinity, ...lv.filter((p) => p > price * 1.005));
    if (!isFinite(support)) support = null;
    if (!isFinite(resistance)) resistance = null;
  } catch { /* levels need more history */ }

  const buy = out.filter((i) => i.vote === 'buy').length, sell = out.filter((i) => i.vote === 'sell').length, neutral = out.length - buy - sell;
  const score = out.length ? Math.round(((buy - sell) / out.length) * 100) : 0;
  const rating: TechRating = score >= 50 ? 'Strong Buy' : score >= 15 ? 'Buy' : score > -15 ? 'Neutral' : score > -50 ? 'Sell' : 'Strong Sell';
  return { rating, score, buy, sell, neutral, indicators: out, support, resistance, range52, atrPct };
}

/* ================================================================ fundamentals of a company */
export interface Fundamental {
  score: number | null; grade: 'Strong' | 'Decent' | 'Mixed' | 'Weak' | 'Unknown';
  metrics: Metric[]; strengths: string[]; concerns: string[];
  sector?: string; industry?: string; marketCap?: number;
  street?: { rating: string; target: number | null; upside: number | null; n: number | null };
}

const num = (x: unknown): number | null => {
  if (typeof x === 'number' && isFinite(x)) return x;
  const r = (x as { raw?: unknown } | null | undefined)?.raw;
  return typeof r === 'number' && isFinite(r) ? r : null;
};

export function fundamentals(raw: FundamentalsRaw, price: number | null): Fundamental {
  const q = (raw.quote ?? {}) as Record<string, unknown>;
  const sm = (raw.summary ?? {}) as Record<string, Record<string, unknown>>;
  const fin = sm.financialData ?? {}, ks = sm.defaultKeyStatistics ?? {}, prof = sm.assetProfile ?? {};
  const sector = prof.sector as string | undefined;
  const bank = sector === 'Financial Services';
  const m: (Metric & { cat: 'val' | 'prof' | 'health' | 'growth' })[] = [];
  const add = (cat: 'val' | 'prof' | 'health' | 'growth', name: string, value: string, tone: Tone, note: string) => m.push({ cat, name, value, tone, note });

  const pe = num(q.trailingPE), fpe = num(q.forwardPE), pb = num(q.priceToBook), peg = num(ks.pegRatio);
  if (pe !== null) add('val', 'P/E (price vs yearly profit)', f1(pe) + '×', pe <= 0 ? 'bad' : pe < 15 ? 'good' : pe < 35 ? 'ok' : 'bad',
    pe < 15 ? 'Cheap compared with its profit. Check it is not cheap for a reason.' : pe < 35 ? 'A fair price for its profit. Compare with similar companies.' : 'Expensive: you pay a lot for each rupee of profit, so it needs strong growth.');
  else if (q.epsTrailingTwelveMonths !== undefined && (num(q.epsTrailingTwelveMonths) ?? 1) <= 0) add('val', 'P/E (price vs yearly profit)', 'n/a', 'bad', 'The company lost money over the last year, so there is no P/E.');
  if (fpe !== null && pe !== null && pe > 0) add('val', 'Forward P/E', f1(fpe) + '×', fpe < pe * 0.92 ? 'good' : fpe > pe * 1.05 ? 'bad' : 'ok',
    fpe < pe * 0.92 ? 'Lower than today\'s P/E: analysts expect profit to grow.' : fpe > pe * 1.05 ? 'Higher than today\'s P/E: analysts expect profit to shrink.' : 'Close to today\'s P/E: little change expected.');
  if (pb !== null) add('val', 'P/B (price vs net worth)', f1(pb) + '×', bank ? (pb < 1 ? 'ok' : pb < 3.5 ? 'good' : 'ok') : pb < 3 ? 'good' : pb < 7 ? 'ok' : 'bad',
    pb < 1.5 ? 'Priced close to the company\'s book value.' : pb < 4 ? 'A moderate premium to its book value.' : 'A large premium to book value; the market expects strong returns.');
  if (peg !== null && peg > 0) add('val', 'PEG (P/E vs growth)', f1(peg), peg < 1 ? 'good' : peg < 2 ? 'ok' : 'bad', peg < 1 ? 'Growth is cheap for the price.' : peg < 2 ? 'Fairly priced for its growth.' : 'Expensive for its growth.');

  const roe = num(fin.returnOnEquity), pm = num(fin.profitMargins), om = num(fin.operatingMargins);
  if (roe !== null) add('prof', 'Return on equity (ROE)', f1(roe * 100) + '%', roe * 100 >= (bank ? 12 : 15) ? 'good' : roe * 100 >= (bank ? 8 : 8) ? 'ok' : 'bad',
    roe * 100 >= 15 ? 'Earns a high return on shareholders\' money.' : roe * 100 >= 8 ? 'An average return on shareholders\' money.' : 'Earns little on shareholders\' money.');
  if (pm !== null) add('prof', 'Profit margin', f1(pm * 100) + '%', pm * 100 >= 15 ? 'good' : pm * 100 >= 7 ? 'ok' : 'bad',
    pm * 100 >= 15 ? 'Keeps a large share of each sale as profit.' : pm * 100 >= 7 ? 'A normal margin.' : 'A thin margin: a small cost rise can wipe out profit.');
  if (om !== null && !bank) add('prof', 'Operating margin', f1(om * 100) + '%', om * 100 >= 15 ? 'good' : om * 100 >= 8 ? 'ok' : 'bad', 'Profit from the core business before interest and tax.');

  const de = num(fin.debtToEquity), cr = num(fin.currentRatio);
  if (de !== null && !bank) add('health', 'Debt to equity', f1(de / 100) + '×', de < 50 ? 'good' : de < 150 ? 'ok' : 'bad',
    de < 50 ? 'Little debt compared with its own money.' : de < 150 ? 'A manageable amount of debt.' : 'Heavily borrowed: risky if profits fall or rates rise.');
  if (cr !== null && !bank) add('health', 'Current ratio', f1(cr), cr >= 1.5 ? 'good' : cr >= 1 ? 'ok' : 'bad',
    cr >= 1.5 ? 'Plenty of short-term cash and assets to pay its bills.' : cr >= 1 ? 'Can just cover its short-term bills.' : 'Short-term bills exceed short-term assets.');

  const rg = num(fin.revenueGrowth), eg = num(fin.earningsGrowth);
  if (rg !== null) add('growth', 'Sales growth (latest quarter, yearly)', sgn(rg * 100), rg * 100 >= 10 ? 'good' : rg >= 0 ? 'ok' : 'bad', rg >= 0.1 ? 'Sales are growing well.' : rg >= 0 ? 'Sales are growing slowly.' : 'Sales are shrinking.');
  if (eg !== null) add('growth', 'Profit growth (latest quarter, yearly)', sgn(eg * 100), eg * 100 >= 10 ? 'good' : eg >= 0 ? 'ok' : 'bad', eg >= 0.1 ? 'Profit is growing well.' : eg >= 0 ? 'Profit is growing slowly.' : 'Profit is falling.');

  const dy = num(q.dividendYield);
  if (dy !== null && dy > 0) add('growth', 'Dividend yield', f1(dy) + '%', dy >= 1.5 ? 'good' : 'ok', 'Cash paid to shareholders each year as a share of the price.');

  const cats: Record<string, number[]> = { val: [], prof: [], health: [], growth: [] };
  m.forEach((x) => { const p = pts(x.tone); if (p !== null && x.name !== 'Dividend yield') cats[x.cat].push(p); });
  const W = { val: 0.3, prof: 0.3, health: 0.15, growth: 0.25 } as const;
  let tw = 0, ts = 0;
  (Object.keys(cats) as (keyof typeof W)[]).forEach((k) => { if (cats[k].length) { tw += W[k]; ts += W[k] * mean(cats[k]); } });
  const enough = m.filter((x) => x.tone !== 'na').length >= 3;
  const score = enough && tw ? Math.round(ts / tw) : null;
  const grade: Fundamental['grade'] = score === null ? 'Unknown' : score >= 70 ? 'Strong' : score >= 55 ? 'Decent' : score >= 40 ? 'Mixed' : 'Weak';

  const strengths = m.filter((x) => x.tone === 'good').map((x) => `${x.name}: ${x.value}. ${x.note}`).slice(0, 4);
  const concerns = m.filter((x) => x.tone === 'bad').map((x) => `${x.name}: ${x.value}. ${x.note}`).slice(0, 4);

  const tgt = num(fin.targetMeanPrice), n = num(fin.numberOfAnalystOpinions);
  const rec = (q.averageAnalystRating as string | undefined)?.replace(/^[\d.]+\s*-\s*/, '') ?? (fin.recommendationKey as string | undefined)?.replace('_', ' ');
  const street = rec ? { rating: rec.replace(/\b\w/g, (x) => x.toUpperCase()), target: tgt, upside: tgt && price ? pct(tgt, price) : null, n } : undefined;

  return { score, grade, metrics: m, strengths, concerns, sector, industry: prof.industry as string | undefined, marketCap: num(q.marketCap) ?? undefined, street };
}

/** Latest sales growth, profit growth and margin as fractions (null when Yahoo has none). */
export function growthOf(raw: FundamentalsRaw): { sales: number | null; profit: number | null; margin: number | null; sector?: string; industry?: string } {
  const sm = (raw.summary ?? {}) as Record<string, Record<string, unknown>>;
  const fin = sm.financialData ?? {}, prof = sm.assetProfile ?? {};
  return { sales: num(fin.revenueGrowth), profit: num(fin.earningsGrowth), margin: num(fin.profitMargins), sector: prof.sector as string | undefined, industry: prof.industry as string | undefined };
}

/* ================================================================ a mutual fund, from its NAV history */
export interface FundCheck { score: number | null; grade: 'Strong' | 'Decent' | 'Mixed' | 'Weak' | 'Unknown'; metrics: Metric[]; strengths: string[]; concerns: string[]; category: string | null; house: string | null }

const cagr = (c: Candle[], years: number) => { const n = Math.round(years * 252); return c.length > n + 5 ? ((c[c.length - 1].close / c[c.length - 1 - n].close) ** (1 / years) - 1) * 100 : null; };
const dret = (c: Candle[]) => c.slice(1).map((k, i) => k.close / c[i].close - 1);

export function fundCheck(c: Candle[], bc: Candle[] | undefined, meta: FundMeta | null, debt: boolean): FundCheck {
  const m: Metric[] = [];
  const add = (name: string, value: string, tone: Tone, note: string) => m.push({ name, value, tone, note });
  const r1 = cagr(c, 1), r3 = cagr(c, 3), r5 = cagr(c, 5);
  const b1 = bc ? cagr(bc, 1) : null, b3 = bc ? cagr(bc, 3) : null, b5 = bc ? cagr(bc, 5) : null;

  if (debt) {
    if (r1 !== null) add('1-year return', sgn(r1), r1 >= 7 ? 'good' : r1 >= 5 ? 'ok' : 'bad', r1 >= 7 ? 'A good year for a low-risk fund.' : r1 >= 5 ? 'Around what a bank fixed deposit pays.' : 'Below what a bank fixed deposit pays.');
    if (r3 !== null) add('3-year return, per year', sgn(r3), r3 >= 7 ? 'good' : r3 >= 5.5 ? 'ok' : 'bad', 'Steady yearly return over three years.');
    if (r5 !== null) add('5-year return, per year', sgn(r5), r5 >= 7 ? 'good' : r5 >= 5.5 ? 'ok' : 'bad', 'Steady yearly return over five years.');
  } else {
    if (r1 !== null) add('1-year return', `${sgn(r1)}${b1 !== null ? ` (index ${sgn(b1)})` : ''}`, b1 !== null ? (r1 > b1 + 2 ? 'good' : r1 > b1 - 2 ? 'ok' : 'bad') : r1 > 8 ? 'good' : 'ok', b1 !== null ? (r1 > b1 ? 'Beat the index this year.' : 'Behind the index this year.') : 'Return over the last year.');
    if (r3 !== null) add('3-year return, per year', `${sgn(r3)}${b3 !== null ? ` (index ${sgn(b3)})` : ''}`, b3 !== null ? (r3 > b3 + 1 ? 'good' : r3 > b3 - 1 ? 'ok' : 'bad') : 'ok', b3 !== null ? (r3 > b3 ? 'Beat the index over three years: not just a lucky year.' : 'Behind the index over three years.') : 'Yearly return over three years.');
    if (r5 !== null) add('5-year return, per year', `${sgn(r5)}${b5 !== null ? ` (index ${sgn(b5)})` : ''}`, b5 !== null ? (r5 > b5 + 1 ? 'good' : r5 > b5 - 1 ? 'ok' : 'bad') : 'ok', b5 !== null ? (r5 > b5 ? 'Beat the index over five years.' : 'Behind the index over five years.') : 'Yearly return over five years.');
  }

  const last3 = c.slice(-756), rr = dret(last3);
  if (rr.length > 100) {
    const vol = sd(rr) * Math.sqrt(252) * 100;
    add('Ups and downs (volatility)', f1(vol) + '% a year', debt ? (vol < 2 ? 'good' : vol < 4 ? 'ok' : 'bad') : (vol < 14 ? 'good' : vol < 20 ? 'ok' : 'bad'),
      vol < 14 ? 'Calm: smaller swings than most funds.' : vol < 20 ? 'Typical swings for this kind of fund.' : 'Bumpy: expect big swings.');
    let peak = last3[0].close, dd = 0;
    last3.forEach((k) => { peak = Math.max(peak, k.close); dd = Math.min(dd, k.close / peak - 1); });
    add('Worst fall (last 3 years)', `−${Math.abs(dd * 100).toFixed(1)}%`, debt ? (dd > -0.02 ? 'good' : dd > -0.05 ? 'ok' : 'bad') : (dd > -0.2 ? 'good' : dd > -0.32 ? 'ok' : 'bad'),
      'How far the fund fell from a peak at its worst. Ask whether you could sit through that.');
    if (r3 !== null) {
      const sharpe = (r3 - 6.5) / vol;
      add('Return per unit of risk', f1(sharpe), sharpe >= 0.8 ? 'good' : sharpe >= 0.3 ? 'ok' : 'bad',
        sharpe >= 0.8 ? 'Rewards you well for the risk taken.' : sharpe >= 0.3 ? 'An average reward for the risk.' : 'Poor reward for the risk. (Sharpe ratio, assuming a 6.5% safe return.)');
    }
  }

  if (bc && !debt && c.length > 300) {
    const times = c.slice(-756).map((k) => k.time);
    let j = 0;
    const bl: number[] = [];
    for (const t of times) { while (j + 1 < bc.length && bc[j + 1].time <= t) j++; bl.push(bc[j].close); }
    // monthly blocks: daily NAVs and index closes are dated a day apart, which would distort a daily comparison
    const fl = c.slice(-756).map((k) => k.close);
    const upF: number[] = [], upB: number[] = [], dnF: number[] = [], dnB: number[] = [];
    for (let i = 21; i < fl.length; i += 21) {
      const fr = fl[i] / fl[i - 21] - 1, br = bl[i] / bl[i - 21] - 1;
      if (br > 0) { upB.push(br); upF.push(fr); } else if (br < 0) { dnB.push(br); dnF.push(fr); }
    }
    if (upB.length >= 8 && dnB.length >= 8) {
      const up = (mean(upF) / mean(upB)) * 100, dn = (mean(dnF) / mean(dnB)) * 100;
      add('Captures of market rises / falls', `${up.toFixed(0)}% / ${dn.toFixed(0)}%`, dn > 0 && up / dn >= 1.15 ? 'good' : dn > 105 || (dn > 0 && up / dn < 0.9) ? 'bad' : 'ok',
        dn > 0 && up / dn >= 1.15 ? 'Keeps more of the market\'s gains than of its falls: the ideal mix.' : dn > 105 || (dn > 0 && up / dn < 0.9) ? 'Gives up more in falls than it earns in rises.' : 'Moves broadly with the market.');
    }
    // how often a 1-year holding beat the index
    const win: boolean[] = [];
    for (let i = 252; i < c.length; i += 21) {
      const t = c[i].time, t0 = c[i - 252].time;
      const bAt = (tt: number) => { let k = 0; while (k + 1 < bc.length && bc[k + 1].time <= tt) k++; return bc[k].close; };
      win.push(c[i].close / c[i - 252].close > bAt(t) / bAt(t0));
    }
    if (win.length >= 12) {
      const w = (win.filter(Boolean).length / win.length) * 100;
      add('Beat the index over 1 year', `${w.toFixed(0)}% of the time`, w >= 60 ? 'good' : w >= 40 ? 'ok' : 'bad', 'Of all the 1-year periods in its history, how often an investor in this fund did better than an index investor.');
    }
  }
  if (debt) {
    const win: number[] = [];
    for (let i = 252; i < c.length; i += 21) win.push(c[i].close / c[i - 252].close - 1);
    if (win.length >= 12) { const w = (win.filter((x) => x > 0.05).length / win.length) * 100; add('1-year periods above 5%', `${w.toFixed(0)}% of the time`, w >= 80 ? 'good' : w >= 55 ? 'ok' : 'bad', 'How steadily it has beaten a typical fixed deposit.'); }
  }

  const sc = m.map((x) => pts(x.tone)).filter((x): x is number => x !== null);
  const score = sc.length >= 3 ? Math.round(mean(sc)) : null;
  const grade: FundCheck['grade'] = score === null ? 'Unknown' : score >= 70 ? 'Strong' : score >= 55 ? 'Decent' : score >= 40 ? 'Mixed' : 'Weak';
  return {
    score, grade, metrics: m,
    strengths: m.filter((x) => x.tone === 'good').map((x) => `${x.name}: ${x.value}. ${x.note}`).slice(0, 4),
    concerns: m.filter((x) => x.tone === 'bad').map((x) => `${x.name}: ${x.value}. ${x.note}`).slice(0, 4),
    category: meta?.category ?? null, house: meta?.house ?? null,
  };
}

/* ================================================================ quality (the business) x timing (the chart) */
export interface Combined { label: 'Looks good' | 'Average' | 'Looks weak'; tone: 'up' | 'neu' | 'down'; text: string; quality: number | null; timing: number | null }

/** Fundamentals say whether it is worth owning; the chart says whether now is a good time. */
export function combine(quality: number | null, timing: number | null, isFund: boolean): Combined {
  const t = timing ?? 0;
  const tg = t >= 25 ? 'good' : t <= -25 ? 'weak' : 'mid';
  const unit = isFund ? 'fund' : 'business';
  if (quality === null) {
    return tg === 'good' ? { label: 'Looks good', tone: 'up', text: 'The chart is strong. We could not read enough about the finances to judge the ' + unit + ' itself.', quality, timing }
      : tg === 'weak' ? { label: 'Looks weak', tone: 'down', text: 'The chart is weak, and there is not enough financial data to balance it.', quality, timing }
        : { label: 'Average', tone: 'neu', text: 'The chart is neutral and there is not enough financial data to judge the ' + unit + '.', quality, timing };
  }
  const qt = quality >= 70 ? 'strong' : quality >= 55 ? 'decent' : quality >= 40 ? 'average' : 'weak';
  const text: Record<string, string> = {
    'strong-good': `A strong ${unit} with a strong chart. Attractive to hold, and reasonable to add to.`,
    'strong-mid': `A strong ${unit}, and the chart is neutral. Good to hold; adding gradually is reasonable.`,
    'strong-weak': `A strong ${unit}, but the chart is weak right now. Hold, and wait for the chart to improve before adding.`,
    'decent-good': `A decent ${unit} with a strong chart. Reasonable to hold, and to add to carefully.`,
    'decent-mid': `A decent ${unit} and a neutral chart. Hold.`,
    'decent-weak': `A decent ${unit}, but the chart is weak. Hold and watch; avoid adding until the chart improves.`,
    'average-good': `An average ${unit} with a strong chart. Fine while the trend lasts, but not a long-term standout.`,
    'average-mid': `Nothing stands out, good or bad. Hold if you have a reason to.`,
    'average-weak': `An average ${unit} with a weak chart. Consider reducing.`,
    'weak-good': `Weak finances, but the price is rising. Risky: momentum can reverse quickly.`,
    'weak-mid': `Weak finances and no help from the chart. Consider whether you still want it.`,
    'weak-weak': `Weak finances and a weak chart. Consider exiting.`,
  };
  const key = `${qt}-${tg}`;
  const avg = quality * 0.6 + ((t + 100) / 2) * 0.4;
  return { label: avg >= 62 ? 'Looks good' : avg >= 42 ? 'Average' : 'Looks weak', tone: avg >= 62 ? 'up' : avg >= 42 ? 'neu' : 'down', text: text[key], quality, timing };
}
