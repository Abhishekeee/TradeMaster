import type { Candle } from './types';
import { benchmarkFor, closeOn, type Stat, type Summary } from './portfolio';

/* ---------------------------------------------------------------- one clear call per holding */
export type Signal = 'BUY' | 'HOLD' | 'BOOK' | 'SELL' | 'REVIEW';
export type Level = 'Low' | 'Medium' | 'High';
export interface Call { signal: Signal; conf: Level; why: string }
/** Second opinion from the chart-pattern engine that powers the Charts page (stocks only). */
export interface Ai { action: 'BUY' | 'SELL' | 'WAIT'; conf: number; pattern: string; patScore: number }

export const SIGNAL_LABEL: Record<Signal, string> = { BUY: 'Buy more', HOLD: 'Hold', BOOK: 'Book profit', SELL: 'Sell', REVIEW: 'Review' };
export const SIGNAL_TONE: Record<Signal, string> = { BUY: 'up', HOLD: 'neu', BOOK: 'neu', SELL: 'down', REVIEW: 'neu' };
const LEVELS: Level[] = ['Low', 'Medium', 'High'];
const bump = (l: Level, d: number): Level => LEVELS[Math.max(0, Math.min(2, LEVELS.indexOf(l) + d))];

/**
 * Turns the analysis of one holding into Buy more / Hold / Book profit / Sell / Review. The rules are deliberately cautious:
 * selling needs a weak chart AND trailing the market AND a down-trend; buying needs a strong chart that is not stretched
 * and a position that is not already large. Price history only, so it is a prompt to think, not advice.
 */
export function decide(s: Stat, ai?: Ai | null, quality?: number | null): Call {
  if (s.verdict === 'wait') return { signal: 'HOLD', conf: 'Low', why: 'Waiting for price history.' };
  if (s.debt) {
    return s.verdict === 'poor'
      ? { signal: 'REVIEW', conf: 'Medium', why: 'Low return for a bond fund. Compare with similar funds or a bank fixed deposit.' }
      : { signal: 'HOLD', conf: 'Medium', why: s.verdict === 'good' ? 'Steady returns from a low-risk fund.' : 'Fine as the safe part of your money.' };
  }
  const stretched = (s.rsi ?? 0) >= 75 || (s.ext50 ?? 0) > 25;
  let c: Call;
  if (s.verdict === 'poor') {
    const deep = s.trend === 'Downtrend' && (s.pnlPct <= -10 || (s.alpha !== null && s.alpha < -15));
    if (deep) {
      c = {
        signal: 'SELL', conf: s.fromHigh !== null && s.fromHigh < -30 && (s.r3m ?? 0) < -8 ? 'High' : 'Medium',
        why: s.pnlPct > 0 ? 'The trend has turned down and it is trailing the market. Book the profit while you still have it.'
          : 'Weak chart, trailing the market and in a loss. Waiting to break even rarely works for a stock like this; consider exiting.',
      };
    } else if (s.trend === 'Downtrend' && s.pnlPct > 0) c = { signal: 'SELL', conf: 'Low', why: 'In profit, but the trend has turned down. Consider booking it.' };
    else c = { signal: 'REVIEW', conf: 'Medium', why: 'Lagging the market. Watch it closely and sell if it breaks lower.' };
  } else if (s.weight > 30 && !s.isFund) {
    c = { signal: 'BOOK', conf: 'Medium', why: `It is ${s.weight.toFixed(0)}% of your portfolio. Booking part of the profit spreads the risk, even though it is doing fine.` };
  } else if (s.verdict === 'good' && stretched) {
    c = { signal: 'BOOK', conf: 'Medium', why: 'Doing very well, but the price looks stretched. Consider booking part of the profit.' };
  } else if (s.verdict === 'good' && s.trend === 'Uptrend' && s.weight < 20 && (s.rsi ?? 50) < 68) {
    c = { signal: 'BUY', conf: (s.alpha ?? 0) > 10 && (s.r3m ?? 0) > 5 ? 'High' : 'Medium', why: 'Strong trend, beating the market and not stretched. There is room to add.' };
  } else if (s.rsi !== null && s.rsi <= 35 && s.above200 && (s.fromHigh ?? 0) < -15) {
    c = { signal: 'BUY', conf: 'Low', why: 'A pullback inside a long-term uptrend (still above its 200-day average). Could be a chance to add.' };
  } else {
    c = { signal: 'HOLD', conf: 'Medium', why: s.verdict === 'good' ? 'Doing well, and already a big part of your money, so hold.' : 'No strong reason to act either way.' };
  }

  // the business behind the price: a weak chart on strong finances is a reason to look, not to run
  if (quality !== null && quality !== undefined) {
    if (c.signal === 'SELL' && quality >= 70) c = { signal: 'REVIEW', conf: 'Medium', why: `The chart is weak, but the ${s.isFund ? 'fund' : 'business'} looks strong (quality ${quality}/100). Hold unless something about it has changed.` };
    else if (c.signal === 'SELL' && quality < 40) c = { ...c, conf: bump(c.conf, 1), why: c.why + ` Weak finances (quality ${quality}/100) add to the concern.` };
    else if (c.signal === 'BUY' && quality < 40) c = { signal: 'HOLD', conf: 'Low', why: `The chart looks good, but the finances are weak (quality ${quality}/100), so do not add.` };
    else if (c.signal === 'BUY' && quality >= 70) c = { ...c, conf: bump(c.conf, 1), why: c.why + ` Strong finances (quality ${quality}/100) back it up.` };
  }

  if (ai && !s.isFund) {
    const aiDir = ai.action === 'BUY' ? 1 : ai.action === 'SELL' ? -1 : 0;
    const dir = c.signal === 'BUY' ? 1 : c.signal === 'SELL' || c.signal === 'BOOK' ? -1 : 0;
    if (dir !== 0 && aiDir === dir) c = { ...c, conf: bump(c.conf, 1), why: c.why + ' The chart-pattern AI agrees.' };
    else if (dir === 0 && aiDir === -1 && ai.conf >= 60 && s.trend === 'Downtrend') c = { signal: 'REVIEW', conf: 'Low', why: c.why + ' The chart-pattern AI sees a bearish setup and the trend is down, so keep a close eye on it.' };
    else if (dir !== 0 && aiDir === -dir) {
      c = c.signal === 'BUY'
        ? { signal: 'HOLD', conf: 'Low', why: 'Looks good on the numbers, but the chart-pattern AI sees a bearish setup. Wait.' }
        : { signal: 'REVIEW', conf: 'Low', why: c.why + ' The chart-pattern AI sees a bullish setup, so it is not clear-cut.' };
    }
  }
  return c;
}

/* ---------------------------------------------------------------- numbers from price history */
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
export const rets = (v: number[]) => v.slice(1).map((x, i) => (v[i] ? x / v[i] - 1 : 0));
function beta(r: number[], b: number[]): number | null {
  const n = Math.min(r.length, b.length);
  if (n < 40) return null;
  const x = r.slice(-n), y = b.slice(-n), mx = mean(x), my = mean(y);
  let cov = 0, vr = 0;
  for (let i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); vr += (y[i] - my) ** 2; }
  return vr ? cov / vr : null;
}
export function corr(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 40) return null;
  const x = a.slice(-n), y = b.slice(-n), mx = mean(x), my = mean(y);
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  return vx && vy ? c / Math.sqrt(vx * vy) : null;
}

/** Closing price of `c` on each of `times` (the last close on or before that day). */
export function align(times: number[], c: Candle[]): number[] {
  const out: number[] = [];
  let j = 0;
  for (const t of times) {
    while (j + 1 < c.length && c[j + 1].time <= t) j++;
    out.push(c[j].close);
  }
  return out;
}

export type Grade = 'A' | 'B' | 'C' | 'D';
export interface Insights {
  vol: number | null; maxDD: number | null; beta: number | null;
  r12: number | null; b12: number | null; benchName: string;
  twin: { mine: number; index: number; invested: number; covered: number; of: number } | null;
  stress: { shock: number; loss: number }[];
  effN: number; corr: number | null;
  contrib: { s: Stat; amt: number }[];
  /** value of today's holdings on each of the last ~253 trading days, to compare other investments with */
  series: { times: number[]; values: number[] } | null;
  grades: { returns: Grade; risk: Grade; spread: Grade; momentum: Grade; overall: Grade };
  style: { name: string; blurb: string };
}

const G = (x: number, cuts: [number, number, number], invert = false): Grade => {
  const v = invert ? -x : x, c = invert ? cuts.map((k) => -k) : cuts;
  return v >= c[0] ? 'A' : v >= c[1] ? 'B' : v >= c[2] ? 'C' : 'D';
};
const NUM: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1 };

/** `conv(ccy)` converts one unit of a holding's currency into the display currency. */
export function computeInsights(stats: Stat[], sum: Summary, candles: Record<string, Candle[]>, prices: Record<string, number>, conv: (ccy: string) => number): Insights {
  // the market index of the currency that holds most of the money
  const byCcy: Record<string, number> = {};
  stats.forEach((s) => { byCcy[s.ccy] = (byCcy[s.ccy] ?? 0) + s.value * conv(s.ccy); });
  const mainCcy = Object.entries(byCcy).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'INR';
  const bench = benchmarkFor(mainCcy);
  const bc = candles[bench.id];

  // value of today's holdings on each of the last ~year of trading days
  let vol: number | null = null, maxDD: number | null = null, pBeta: number | null = null, r12: number | null = null, b12: number | null = null;
  let sr: Insights['series'] = null;
  const betas = new Map<string, number>();
  const series: Record<string, number[]> = {};
  if (bc && bc.length > 60) {
    const times = bc.slice(-253).map((k) => k.time);
    const bcl = bc.slice(-253).map((k) => k.close);
    const total = new Array(times.length).fill(0);
    for (const s of stats) {
      const c = candles[s.h.inst.id], f = conv(s.ccy);
      if (!c || !c.length) { total.forEach((_, i) => { total[i] += s.value * f; }); continue; }
      const a = align(times, c);
      series[s.h.id] = a;
      a.forEach((x, i) => { total[i] += x * s.qty * f; });
      const own = candles[benchmarkFor(s.ccy).id];
      const ob = own ? align(times, own) : bcl;
      betas.set(s.h.id, beta(rets(a), rets(ob)) ?? 1);
    }
    sr = { times, values: total };
    const r = rets(total);
    vol = r.length > 40 ? sd(r) * Math.sqrt(252) * 100 : null;
    let peak = total[0], dd = 0;
    total.forEach((v) => { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); });
    maxDD = dd * 100;
    pBeta = beta(r, rets(bcl));
    r12 = total[0] ? (total[total.length - 1] / total[0] - 1) * 100 : null;
    b12 = (bcl[bcl.length - 1] / bcl[0] - 1) * 100;
  }

  // "if you had put the same money in the index on the same days" (needs buy dates; bond funds are not compared with stocks)
  let twin: Insights['twin'] = null;
  {
    let mine = 0, idx = 0, inv = 0, covered = 0;
    const eq = stats.filter((s) => !s.debt);
    for (const s of eq) {
      const b = candles[benchmarkFor(s.ccy).id];
      const bnow = prices[benchmarkFor(s.ccy).id] ?? b?.[b.length - 1]?.close;
      const dated = s.h.lots.filter((l) => l.date);
      if (!b || !bnow || !dated.length || s.price === null) continue;
      let ok = true;
      const parts = dated.map((l) => { const b0 = closeOn(b, l.date!); if (b0 === null) ok = false; return { l, b0 }; });
      if (!ok) continue;
      covered++;
      for (const { l, b0 } of parts) {
        const f = conv(s.ccy), amt = l.qty * l.price * f;
        inv += amt; mine += l.qty * s.price * f; idx += amt * (bnow / (b0 as number));
      }
    }
    if (covered) twin = { mine, index: idx, invested: inv, covered, of: eq.length };
  }

  const stress = [-5, -10, -20].map((shock) => ({
    shock,
    loss: stats.reduce((a, s) => a + s.value * conv(s.ccy) * Math.max(-0.5, Math.min(2.5, betas.get(s.h.id) ?? (s.debt ? 0 : 1))) * (shock / 100), 0),
  }));

  const effN = 1 / (stats.reduce((a, s) => a + (s.weight / 100) ** 2, 0) || 1);
  let cor: number | null = null;
  {
    const top = stats.filter((s) => !s.debt && series[s.h.id]).sort((a, b) => b.weight - a.weight).slice(0, 15);
    const cs: number[] = [];
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const v = corr(rets(series[top[i].h.id]), rets(series[top[j].h.id]));
      if (v !== null) cs.push(v);
    }
    cor = cs.length ? mean(cs) : null;
  }

  const contrib = stats.map((s) => ({ s, amt: s.pnl * conv(s.ccy) })).sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));

  // report card
  // with buy dates, "did I beat the index on my own dates" is the fairest test; otherwise the last 12 months
  const edge = twin && twin.invested ? ((twin.mine - twin.index) / twin.invested) * 100 : r12 !== null && b12 !== null ? r12 - b12 : sum.alpha;
  const returns: Grade = edge === null ? (sum.pnlPct > 0 ? 'B' : 'C') : G(edge, [5, 0, -5]);
  const risk: Grade = vol === null ? 'C' : G(vol, [12, 20, 30], true);
  const spread: Grade = stats.length < 2 ? 'D' : sum.sorted[0].weight > 40 ? 'D' : G(effN, [8, 5, 3]);
  const momentum: Grade = G(sum.health, [65, 50, 35]);
  const avg = (NUM[returns] + NUM[risk] + NUM[spread] + NUM[momentum]) / 4;
  const overall: Grade = avg >= 3.5 ? 'A' : avg >= 2.75 ? 'B' : avg >= 2 ? 'C' : 'D';

  const debtShare = stats.filter((s) => s.debt).reduce((a, s) => a + s.weight, 0);
  let style: Insights['style'];
  if (debtShare >= 60) style = { name: 'Safe Saver', blurb: 'Most of your money is in low-risk funds. Very steady, but growth will be slow.' };
  else if (effN < 3.5 && stats.length < 6) style = { name: 'Concentrated Bettor', blurb: 'A few big bets. Big wins are possible, and so are big swings.' };
  else if (vol !== null && vol > 28) style = { name: 'High-Voltage Investor', blurb: 'Your portfolio swings a lot. Make sure you can stay calm during a fall.' };
  else if (pBeta !== null && pBeta < 0.85 && effN >= 5) style = { name: 'Steady Builder', blurb: 'Well spread and calmer than the market. A solid base to grow from.' };
  else style = { name: 'Balanced Investor', blurb: 'A reasonable mix. Small tweaks (see the action plan) can improve it.' };

  return { vol, maxDD, beta: pBeta, r12, b12, benchName: bench.name, twin, stress, effN, corr: cor, contrib, series: sr, grades: { returns, risk, spread, momentum, overall }, style };
}
