import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candle, Instrument } from './types';
import { currencyOf, fetchCandles, fetchLivePrices, fundInst, searchFunds, searchInstruments } from './data';
import { rsiSeries } from './indicators';

/* ---------------------------------------------------------------- what the user types in */
export interface Lot { id: string; qty: number; price: number; date?: string }   // one purchase; date is "YYYY-MM-DD"
/** What the owner intends to do with a holding; the answers to the questions asked when it is added. */
export interface Plan {
  horizon: 'short' | 'long' | 'date';   // under a year, a year or more, or until a chosen date
  until?: string;                       // "YYYY-MM-DD", when horizon is 'date'
  purpose?: 'growth' | 'income' | 'quick' | 'safe';
  target?: number;                      // profit (%) the owner would be happy to book
  loss?: number;                        // loss (%) at which the owner wants to rethink
  calm?: 'calm' | 'uneasy' | 'panic';   // how a 20% fall would feel
}
export interface Holding { id: string; inst: Instrument; lots: Lot[]; plan?: Plan }
export interface Person { id: string; name: string; holdings: Holding[] }
interface Store { active: string; people: Person[] }

const KEY = 'tm-portfolio';
export const uid = () => Math.random().toString(36).slice(2, 9);

function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.people) && s.people.length) return s;
  } catch { /* ignore */ }
  const id = uid();
  return { active: id, people: [{ id, name: 'My portfolio', holdings: [] }] };
}

export interface NewLot { inst: Instrument; qty: number; price: number; date?: string; plan?: Plan }

export function usePortfolios() {
  const [store, setStore] = useState<Store>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ } }, [store]);
  const person = store.people.find((p) => p.id === store.active) ?? store.people[0];

  const edit = useCallback((fn: (p: Person) => Person) => {
    setStore((s) => ({ ...s, people: s.people.map((p) => (p.id === s.active ? fn(p) : p)) }));
  }, []);

  const addLots = useCallback((items: NewLot[], replace = false) => edit((p) => {
    const hs: Holding[] = replace ? [] : p.holdings.map((h) => ({ ...h, lots: [...h.lots] }));
    for (const it of items) {
      const lot: Lot = { id: uid(), qty: it.qty, price: it.price, date: it.date };
      const h = hs.find((x) => x.inst.id === it.inst.id);
      if (h) { h.lots.push(lot); if (it.plan) h.plan = it.plan; } else hs.push({ id: uid(), inst: it.inst, lots: [lot], plan: it.plan });
    }
    return { ...p, holdings: hs };
  }), [edit]);

  const setLot = useCallback((hid: string, lid: string, patch: Partial<Lot>) => edit((p) => ({
    ...p, holdings: p.holdings.map((h) => (h.id === hid ? { ...h, lots: h.lots.map((l) => (l.id === lid ? { ...l, ...patch } : l)) } : h)),
  })), [edit]);

  const removeLot = useCallback((hid: string, lid: string) => edit((p) => ({
    ...p, holdings: p.holdings.map((h) => (h.id === hid ? { ...h, lots: h.lots.filter((l) => l.id !== lid) } : h)).filter((h) => h.lots.length),
  })), [edit]);

  const setPlan = useCallback((hid: string, plan: Plan | undefined) => edit((p) => ({ ...p, holdings: p.holdings.map((h) => (h.id === hid ? { ...h, plan } : h)) })), [edit]);
  const clearHoldings = useCallback(() => edit((p) => ({ ...p, holdings: [] })), [edit]);
  const removeHolding = useCallback((hid: string) => edit((p) => ({ ...p, holdings: p.holdings.filter((h) => h.id !== hid) })), [edit]);

  const addPerson = useCallback((name: string) => setStore((s) => { const id = uid(); return { active: id, people: [...s.people, { id, name: name || 'New portfolio', holdings: [] }] }; }), []);
  const rename = useCallback((name: string) => edit((p) => ({ ...p, name })), [edit]);
  const removePerson = useCallback(() => setStore((s) => {
    if (s.people.length < 2) return s;
    const people = s.people.filter((p) => p.id !== s.active);
    return { active: people[0].id, people };
  }), []);
  const setActive = useCallback((id: string) => setStore((s) => ({ ...s, active: id })), []);

  return { people: store.people, person, addLots, setPlan, setLot, removeLot, removeHolding, clearHoldings, addPerson, rename, removePerson, setActive };
}
export type Portfolios = ReturnType<typeof usePortfolios>;

/* ---------------------------------------------------------------- market data */
export const benchmarkFor = (ccy: string): Instrument => (ccy === 'INR'
  ? { id: '^NSEI', name: 'Nifty 50', source: 'yahoo', kind: 'INDEX' }
  : { id: '^GSPC', name: 'S&P 500', source: 'yahoo', kind: 'INDEX' });

const candleCache = new Map<string, { at: number; c: Candle[] }>();
export async function dailyCandles(inst: Instrument): Promise<Candle[] | null> {
  const hit = candleCache.get(inst.id);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.c;
  const c = await fetchCandles(inst, '1D', 2600);
  if (c && c.length) candleCache.set(inst.id, { at: Date.now(), c });
  return c;
}

/** Daily history for every holding (and the market index to compare with) plus live prices that refresh by themselves. */
export function usePortfolioData(holdings: Holding[]) {
  const [candles, setCandles] = useState<Record<string, Candle[]>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(0);

  // the instruments to follow: every holding plus the benchmark(s) for the currencies in use
  const insts = useMemo(() => {
    const m = new Map<string, Instrument>();
    holdings.forEach((h) => m.set(h.inst.id, h.inst));
    holdings.forEach((h) => { const b = benchmarkFor(currencyOf(h.inst)); m.set(b.id, b); });
    return [...m.values()];
  }, [holdings]);
  const key = insts.map((i) => i.id).sort().join(',');

  useEffect(() => {
    if (!insts.length) return;
    let dead = false;
    setLoading(true);
    (async () => {
      const got = await Promise.all(insts.map(async (i) => [i.id, await dailyCandles(i)] as const));
      if (dead) return;
      const next: Record<string, Candle[]> = {};
      got.forEach(([id, c]) => { if (c) next[id] = c; });
      setCandles(next);
      setLoading(false);
    })();
    return () => { dead = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!insts.length) return;
    let dead = false;
    let t: number | undefined;
    const tick = async () => {
      if (!document.hidden) {
        const out: Record<string, number> = {};
        for (let i = 0; i < insts.length; i += 30) {
          const q = await fetchLivePrices(insts.slice(i, i + 30));
          Object.entries(q).forEach(([id, x]) => { out[id] = x.price; });
        }
        if (dead) return;
        if (Object.keys(out).length) { setPrices((p) => ({ ...p, ...out })); setUpdated(Date.now()); }
      }
      t = window.setTimeout(tick, 10000);
    };
    tick();
    return () => { dead = true; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { candles, prices, loading, updated };
}

/* ---------------------------------------------------------------- analysis of one holding */
export type Verdict = 'good' | 'ok' | 'poor' | 'wait';

/** Readable name: "Parag Parikh Flexi Cap Fund" for a fund, "RELIANCE" for a stock. */
export const shortName = (i: Instrument) => (i.source === 'mf' ? i.name.split(/\s+-\s+/)[0] : i.id.replace(/\.(NS|BO)$/, ''));
// funds that hold bonds or cash: judging them against the stock market would always make them look bad
const DEBT = /liquid|overnight|money market|short term|short duration|ultra short|low duration|gilt|bond|debt|corporate|banking\s*(&|and)\s*psu|floater|credit risk|treasury|income fund|arbitrage/i;

export interface Stat {
  h: Holding; isFund: boolean; debt: boolean; ccy: string; qty: number; cost: number; avg: number;
  price: number | null; value: number; pnl: number; pnlPct: number;
  dayPct: number | null; dayAbs: number;
  since?: string;
  benchName: string; alpha: number | null; alphaBasis: 'since you bought' | 'over the last year' | null;
  r1m: number | null; r3m: number | null; r1y: number | null; ext50: number | null; above200: boolean;
  trend: 'Uptrend' | 'Downtrend' | 'Sideways' | 'Unknown'; rsi: number | null; fromHigh: number | null;
  spark: number[];
  verdict: Verdict; action: string; reasons: string[]; weight: number;
}

const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : 0);
const SEC = 86400;
const toSec = (d: string) => Date.parse(d + 'T00:00:00Z') / 1000;

/** Close on the first trading day on or after `date`; null if the history does not reach back that far. */
export function closeOn(c: Candle[], date: string): number | null {
  const t = toSec(date);
  if (!c.length || t < c[0].time - 7 * SEC) return null;
  const k = c.find((x) => x.time >= t - SEC / 2);
  return k ? k.close : null;
}

export function analyse(h: Holding, c: Candle[] | undefined, live: number | undefined, bc: Candle[] | undefined, blive: number | undefined): Stat {
  const ccy = currencyOf(h.inst);
  const bench = benchmarkFor(ccy);
  const isFund = h.inst.source === 'mf';
  const debt = isFund && DEBT.test(h.inst.name);
  const qty = h.lots.reduce((s, l) => s + l.qty, 0);
  const cost = h.lots.reduce((s, l) => s + l.qty * l.price, 0);
  const closes = c?.map((k) => k.close) ?? [];
  const price = live ?? (closes.length ? closes[closes.length - 1] : null);
  const value = price !== null ? price * qty : cost;
  const dated = h.lots.filter((l) => l.date).sort((a, b) => a.date!.localeCompare(b.date!));

  const back = (n: number) => (price !== null && closes.length > n ? pct(price, closes[closes.length - 1 - n]) : null);
  const r1m = back(21), r3m = back(63), r1y = closes.length > 240 ? back(252) : null;
  const prev = closes.length > 1 ? closes[closes.length - 2] : null;
  const dayPct = price !== null && prev ? pct(price, prev) : null;
  const dayAbs = price !== null && prev ? (price - prev) * qty : 0;

  const ma = (n: number) => (closes.length >= n ? closes.slice(-n).reduce((s, x) => s + x, 0) / n : null);
  const ma50 = ma(50), ma200 = ma(200);
  let trend: Stat['trend'] = 'Unknown';
  if (price !== null && ma50 !== null) {
    if (price > ma50 && (ma200 === null || price > ma200)) trend = 'Uptrend';
    else if (price < ma50 && (ma200 === null || price < ma200)) trend = 'Downtrend';
    else trend = 'Sideways';
  }
  const rs = c && c.length > 30 ? rsiSeries(c.slice(-120)) : [];
  const rsi = rs.length ? rs[rs.length - 1].value : null;
  const year = closes.slice(-252);
  const high = year.length ? Math.max(...year, price ?? 0) : null;
  const fromHigh = price !== null && high ? pct(price, high) : null;

  // compare with the market: since the purchase dates when we know them, otherwise over the last year
  const bnow = blive ?? (bc?.length ? bc[bc.length - 1].close : undefined);
  let alpha: number | null = null;
  let basis: Stat['alphaBasis'] = null;
  const pnlPct = cost ? pct(value, cost) : 0;
  if (!debt && bc && bnow && dated.length && price !== null) {
    let c0 = 0, g = 0, bg = 0;
    for (const l of dated) {
      const b0 = closeOn(bc, l.date!);
      if (b0 === null) { c0 = 0; break; }
      const amt = l.qty * l.price;
      c0 += amt; g += l.qty * (price - l.price); bg += amt * (bnow / b0 - 1);
    }
    if (c0 > 0) { alpha = (g / c0 - bg / c0) * 100; basis = 'since you bought'; }
  }
  if (!debt && alpha === null && r1y !== null && bc && bnow && bc.length > 240) {
    alpha = r1y - pct(bnow, bc[bc.length - 253] ? bc[bc.length - 253].close : bc[0].close);
    basis = 'over the last year';
  }

  // points: market-beating, trend, momentum, distance from the high
  let raw = 0;
  if (debt) raw = r1y === null ? 0 : r1y >= 7 ? 3 : r1y >= 4 ? 0 : -2;
  else if (alpha !== null) raw += alpha > 10 ? 2 : alpha > 0 ? 1 : alpha < -10 ? -2 : -1;
  if (!debt) raw += trend === 'Uptrend' ? 2 : trend === 'Downtrend' ? -2 : 0;
  if (!debt && r3m !== null) raw += r3m > 5 ? 1 : r3m < -8 ? -1 : 0;
  if (!debt && fromHigh !== null) raw += fromHigh > -10 ? 1 : fromHigh < -35 ? -2 : fromHigh < -20 ? -1 : 0;
  const verdict: Verdict = !closes.length ? 'wait' : raw >= 3 ? 'good' : raw <= -2 ? 'poor' : 'ok';

  const reasons: string[] = [];
  if (debt) {
    reasons.push(r1y !== null ? `Returned ${r1y.toFixed(1)}% over the last year. Compare that with what a bank fixed deposit pays.` : 'Not enough history yet to judge.');
    reasons.push('This is a low-risk bond/cash fund, so it is not compared with the stock market.');
  }
  if (!debt && alpha !== null) reasons.push(`${alpha >= 0 ? 'Beating' : 'Trailing'} ${bench.name} by ${Math.abs(alpha).toFixed(1)} points ${basis}.`);
  if (!debt && trend !== 'Unknown') {
    reasons.push(trend === 'Uptrend' ? `Price is above its ${ma200 !== null ? '50 and 200' : '50'}-day average: the trend is up.`
      : trend === 'Downtrend' ? `Price is below its ${ma200 !== null ? '50 and 200' : '50'}-day average: the trend is down.` : 'Price is between its short and long averages: no clear trend.');
  }
  if (!debt && r3m !== null) reasons.push(`${r3m >= 0 ? 'Up' : 'Down'} ${Math.abs(r3m).toFixed(1)}% in the last 3 months.`);
  if (!debt && fromHigh !== null && fromHigh < -10) reasons.push(`${Math.abs(fromHigh).toFixed(0)}% below its 1-year high.`);
  if (!debt && rsi !== null && rsi >= 70) reasons.push(`RSI ${rsi.toFixed(0)}: the recent rise looks stretched.`);
  if (!debt && rsi !== null && rsi <= 30) reasons.push(`RSI ${rsi.toFixed(0)}: heavily sold off recently.`);

  let action: string;
  if (verdict === 'wait') action = 'Waiting for price history.';
  else if (debt) action = verdict === 'good' ? 'Hold. Steady returns from a low-risk fund.' : verdict === 'poor' ? 'Returns were low this past year. Compare with similar funds or a bank fixed deposit.' : 'Hold. Returns are modest, which is normal for a safe part of your money.';
  else if (verdict === 'poor') {
    action = pnlPct <= -15 ? 'Review. Weak chart and you are in a loss. If you no longer believe in the business, consider cutting the loss rather than waiting to break even.'
      : pnlPct > 0 ? 'Consider booking the profit and moving the money to something stronger.'
      : 'Review. It is lagging the market, so keep a close eye on it.';
  } else if (verdict === 'good') {
    action = (rsi !== null && rsi >= 75) || (ma50 !== null && price !== null && price / ma50 > 1.25)
      ? 'Hold. The run looks stretched, so consider booking a part of the profit.'
      : 'Hold. It is doing well, and small dips can be a chance to add.';
  } else action = 'Hold. Nothing here calls for action.';

  return {
    h, isFund, debt, ccy, qty, cost, avg: qty ? cost / qty : 0, price, value, pnl: value - cost, pnlPct, dayPct, dayAbs,
    since: dated[0]?.date, benchName: bench.name, alpha, alphaBasis: basis, r1m, r3m, r1y, ext50: ma50 !== null && price !== null ? pct(price, ma50) : null, above200: ma200 !== null && price !== null && price > ma200, trend, rsi, fromHigh,
    spark: closes.slice(-252), verdict, action, reasons, weight: 0,
  };
}

/* ---------------------------------------------------------------- the whole portfolio */
export interface Summary {
  invested: number; value: number; pnl: number; pnlPct: number; day: number; dayPct: number;
  alpha: number | null; health: number; healthLabel: string; insights: string[]; sorted: Stat[];
  good: Stat[]; poor: Stat[]; benchName: string;
}

/** `conv(ccy)` converts one unit of a holding's currency into the display currency. */
export function summarise(stats: Stat[], conv: (ccy: string) => number): Summary {
  const f = (s: Stat) => conv(s.ccy);
  const invested = stats.reduce((a, s) => a + s.cost * f(s), 0);
  const value = stats.reduce((a, s) => a + s.value * f(s), 0);
  const day = stats.reduce((a, s) => a + s.dayAbs * f(s), 0);
  stats.forEach((s) => { s.weight = value ? (s.value * f(s) / value) * 100 : 0; });
  const sorted = [...stats].sort((a, b) => b.weight - a.weight);

  let aw = 0, an = 0;
  stats.forEach((s) => { if (s.alpha !== null) { aw += s.alpha * s.cost * f(s); an += s.cost * f(s); } });
  const alpha = an ? aw / an : null;

  const wOf = (v: Verdict) => stats.filter((s) => s.verdict === v).reduce((a, s) => a + s.weight, 0);
  const rated = wOf('good') + wOf('ok') + wOf('poor');
  const health = rated ? Math.round(((wOf('good') + 0.5 * wOf('ok')) / rated) * 100) : 0;
  const healthLabel = !rated ? 'No data yet' : health >= 65 ? 'Healthy' : health >= 40 ? 'Mixed' : 'Needs attention';

  const good = stats.filter((s) => s.verdict === 'good').sort((a, b) => b.pnlPct - a.pnlPct);
  const poor = stats.filter((s) => s.verdict === 'poor').sort((a, b) => a.pnlPct - b.pnlPct);
  const benchName = stats[0]?.benchName ?? 'the market';

  const insights: string[] = [];
  const pnl = value - invested;
  const pnlPct = invested ? (pnl / invested) * 100 : 0;
  insights.push(`Overall you are ${pnl >= 0 ? 'up' : 'down'} ${Math.abs(pnlPct).toFixed(1)}% on the money you put in.`);
  if (alpha !== null) insights.push(alpha >= 0 ? `Your stocks and equity funds are ahead of ${benchName} by about ${alpha.toFixed(1)} points, which beats simply buying the index.` : `Your stocks and equity funds are behind ${benchName} by about ${Math.abs(alpha).toFixed(1)} points. A plain index fund would have done better over the same period.`);
  if (sorted[0] && !sorted[0].debt && sorted[0].weight > 25 && stats.length > 1) insights.push(`${shortName(sorted[0].h.inst)} is ${sorted[0].weight.toFixed(0)}% of your money. One bad result there would hurt a lot; avoid adding more.`);
  if (stats.length > 0 && stats.length < 5) insights.push(`Only ${stats.length} holding${stats.length > 1 ? 's' : ''}: spreading across 8–15 different stocks or funds lowers the risk.`);
  if (poor.length) insights.push(`${poor.length} holding${poor.length > 1 ? 's' : ''} (${poor.reduce((a, s) => a + s.weight, 0).toFixed(0)}% of your money) ${poor.length > 1 ? 'are' : 'is'} underperforming. See the action plan above.`);
  if (good.length) insights.push(`${good.length} holding${good.length > 1 ? 's' : ''} (${good.reduce((a, s) => a + s.weight, 0).toFixed(0)}% of your money) ${good.length > 1 ? 'are' : 'is'} performing well.`);

  return { invested, value, pnl, pnlPct, day, dayPct: value - day ? (day / (value - day)) * 100 : 0, alpha, health, healthLabel, insights, sorted, good, poor, benchName };
}

/* ---------------------------------------------------------------- reading a broker's holdings export (Zerodha, Groww, Upstox, ...) */
export interface RawRow { label: string; isin?: string; qty: number; price: number; date?: string; fund?: { invested: number; current: number } }

function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === d && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const num = (s: string | undefined) => { const n = parseFloat((s ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : NaN; };

function isoDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/.exec(s.trim());
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

export function readBrokerText(text: string): { rows: RawRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], error: 'Nothing to read yet.' };
  const delim = [',', '\t', ';', '|'].map((d) => [d, lines.slice(0, 15).reduce((a, l) => a + splitLine(l, d).length, 0)] as const).sort((a, b) => b[1] - a[1])[0][0];
  const grid = lines.map((l) => splitLine(l, delim));
  const find = (hs: string[], ...res: RegExp[]) => { for (const r of res) { const i = hs.findIndex((h) => r.test(h)); if (i >= 0) return i; } return -1; };

  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const hs = grid[r].map((x) => x.replace(/\s+/g, ' ').trim());
    const qi = find(hs, /^(qty|quantity|shares|units|no\.? of shares)/i);
    const pi = find(hs, /(avg|average).*(cost|price|buy)|buy.*(avg|price)|purchase price|cost price|^price$/i);
    const ni = find(hs, /^(symbol|instrument|trading ?symbol|scrip|ticker)/i, /(stock )?name|company|security/i);
    if (qi < 0 || pi < 0 || ni < 0) continue;
    const ii = find(hs, /isin/i), di = find(hs, /(buy|purchase|trade).*date|^date$/i);
    const rows: RawRow[] = [];
    for (const row of grid.slice(r + 1)) {
      const qty = num(row[qi]), price = num(row[pi]);
      if (!row[ni] || !(qty > 0) || !(price > 0)) continue;
      rows.push({ label: row[ni], isin: ii >= 0 && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(row[ii] ?? '') ? row[ii] : undefined, qty, price, date: di >= 0 ? isoDate(row[di]) : undefined });
    }
    return rows.length ? { rows } : { rows, error: 'Found the column headings but no holdings under them.' };
  }
  return { rows: [], error: 'Could not find the columns. The file needs a stock name (or symbol), a quantity and an average buy price.' };
}

/** Turn a broker's stock name / symbol / ISIN into a Yahoo Finance symbol, preferring the NSE listing. */
export async function resolveRow(r: RawRow): Promise<Instrument | null> {
  const tries = [r.isin, r.label, r.label.replace(/-[A-Z]{1,2}$/, '')].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const ticker = r.label.toUpperCase().replace(/-[A-Z]{1,2}$/, '').replace(/\s+/g, '');
  for (const q of tries) {
    const found = (await searchInstruments(q)).filter((i) => i.source === 'yahoo' && ['EQUITY', 'ETF', 'MUTUALFUND'].includes(i.kind ?? ''));
    const pick = found.find((i) => i.id === ticker + '.NS') ?? found.find((i) => i.id.endsWith('.NS')) ?? found.find((i) => i.id.endsWith('.BO')) ?? found[0];
    if (pick) return pick;
  }
  return null;
}

/* ---------------------------------------------------------------- reading text recognised from a screenshot of a broker app */
const amount = (s: string) => parseFloat(s.replace(/,/g, ''));

/**
 * Screenshot text is messy, so this looks for the two things every holdings card has: a quantity ("10 shares", "Qty 10")
 * and an average buy price ("Avg ₹2,450.50"), and takes the nearest line above them as the stock name.
 * Also understands table rows that start with a ticker: "RELIANCE 10 2,450.50 ...".
 */
export function readScreenshotText(text: string): RawRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: RawRow[] = [];
  const seen = new Set<string>();
  const add = (label: string, qty: number, price: number) => {
    const name = label.replace(/[^A-Za-z0-9&.\- ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || !(qty > 0) || !(price > 0) || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    rows.push({ label: name, qty, price });
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = /^([A-Z][A-Z0-9&-]{1,19})\s+(\d[\d,]*)\s+[₹Rs. ]*(\d[\d,]*\.?\d*)\b/.exec(l);
    if (t && !/^(QTY|AVG|LTP|SHARES)$/.test(t[1])) { add(t[1], amount(t[2]), amount(t[3])); continue; }

    const avgM = /avg\.?[^0-9\n]{0,8}(\d[\d,]*\.?\d*)/i.exec(l);
    if (!avgM) continue;
    // the quantity is on the same line or the one before/after
    let qty = NaN;
    for (const j of [i, i - 1, i + 1]) {
      const m = lines[j] && (/(\d[\d,]*)\s*(?:shares?|qty|units)\b/i.exec(lines[j]) ?? /\bqty\.?[^0-9\n]{0,4}(\d[\d,]*)/i.exec(lines[j]));
      if (m) { qty = amount(m[1]); break; }
    }
    // the name is the closest earlier line that is mostly letters
    let label = '';
    for (let k = i; k >= Math.max(0, i - 3); k--) {
      const cand = lines[k].replace(/(shares?|qty|avg)\b.*$/i, '').replace(/[₹]?\s*\d[\d,]*\.?\d*\s*%?/g, ' ').trim();
      if (/[A-Za-z]{3,}/.test(cand)) { label = cand; break; }
    }
    if (label) add(label, qty, amount(avgM[1]));
  }
  return rows;
}

/**
 * Mutual-fund dashboards (Groww) show each fund's profit and its percentage, not units or buy price.
 * Invested = profit / percentage, and current value = invested + profit. OCR often reads the rupee sign as a digit
 * ("+₹4,813" becomes "+34,813"), so the candidates are checked against the "Invested" total shown on the same screen.
 */
export function readFundScreenshot(text: string): { rows: RawRow[]; note?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines.findIndex((l) => /returns\s*\(\s*%/i.test(l));
  const items: { name: string; sign: number; pct: number; cands: number[] }[] = [];
  let buf: string[] = [];
  for (const l of lines.slice(head + 1)) {
    const m = /\(\s*([+\-−–])\s*(\d+(?:\.\d+)?)\s*%\s*\)/.exec(l);
    if (/^(sip|nfo)$/i.test(l)) continue;
    if (!m) { buf.push(l); continue; }
    const joined = (buf.join(' ') + ' ' + l.replace(m[0], ' ')).replace(/\s+/g, ' ').trim();
    buf = [];
    const am = /([+\-−–]?)\s*(\d[\d,]*(?:\.\d+)?)(?![\s\S]*\d)/.exec(joined); // the last number on the card is the profit
    if (!am) continue;
    const name = (joined.slice(0, am.index) + ' ' + joined.slice(am.index + am[0].length)).replace(/\bSIP\b/gi, '').replace(/[^A-Za-z0-9&.\- ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z]{3,}/.test(name)) continue;
    const digits = am[2].replace(/,/g, '');
    const cands = [parseFloat(digits)];
    if (digits.replace('.', '').length >= 3 && /^[23]/.test(digits)) cands.push(parseFloat(digits.slice(1)));
    items.push({ name, sign: /[-−–]/.test(m[1]) ? -1 : 1, pct: parseFloat(m[2]), cands: cands.filter((x) => x > 0) });
  }
  if (!items.length) return { rows: [] };

  const tot = /invested\D{0,4}(\d[\d,]*)/i.exec(text);
  const total = tot ? parseFloat(tot[1].replace(/,/g, '')) : NaN;
  const pick = new Array<number>(items.length).fill(0);
  if (total > 0 && items.length <= 12) {
    let best = Infinity;
    for (let mask = 0; mask < 1 << items.length; mask++) {
      let sum = 0, ok = true;
      items.forEach((it, i) => { const c = it.cands[(mask >> i) & 1]; if (c === undefined) ok = false; else sum += c / (it.pct / 100); });
      if (ok && Math.abs(sum - total) < best) { best = Math.abs(sum - total); items.forEach((_, i) => { pick[i] = (mask >> i) & 1; }); }
    }
  }
  const rows: RawRow[] = items.map((it, i) => {
    const amt = it.cands[pick[i]] ?? it.cands[0];
    const invested = Math.round(amt / (it.pct / 100));
    return { label: it.name, qty: 0, price: 0, fund: { invested, current: Math.round(invested + it.sign * amt) } };
  });
  const sum = rows.reduce((a, r) => a + r.fund!.invested, 0);
  const n = /holdings\s*\(\s*(\d+)/i.exec(text);
  const inr = (x: number) => '₹' + x.toLocaleString('en-IN');
  let note: string | undefined;
  if (total > 0 && n && +n[1] === rows.length) {
    note = Math.abs(sum - total) / total < 0.03 ? `Invested amounts add up to ${inr(sum)}, matching the ${inr(total)} on your screen.` : `These add up to ${inr(sum)} but your screen says ${inr(total)} invested, so some digits may be misread. Please check each row.`;
  } else if (total > 0) note = 'Only some of your funds seem to be in this screenshot. Upload the others too, or add them by hand.';
  return { rows, note };
}

/** Match a fund name from the app ("Parag Parikh Flexi Cap Fund Direct Growth") to an mfapi.in scheme and its latest NAV. */
export async function resolveFund(r: RawRow): Promise<{ inst: Instrument; nav: number } | null> {
  const words = r.label.replace(/[^A-Za-z0-9& ]/g, ' ').split(/\s+/).filter(Boolean);
  const want = new Set(words.map((w) => w.toLowerCase()));
  const score = (n: string) => {
    const t = n.toLowerCase().replace(/[^a-z0-9& ]/g, ' ').split(/\s+/).filter(Boolean);
    const hit = new Set(t.filter((x) => want.has(x))).size;
    let s = hit - 0.5 * t.filter((x) => !want.has(x)).length;
    for (const bad of ['idcw', 'dividend', 'bonus', 'payout', 'reinvestment']) if (t.includes(bad) && !want.has(bad)) s -= 5;
    for (const other of ['gilt', 'ultra', 'liquid', 'overnight', 'floating', 'floater', 'index', 'etf', 'fof', 'regular', 'next']) if (t.includes(other) && !want.has(other)) s -= 2;
    if (want.has('direct') !== t.includes('direct')) s -= 4;
    if (want.has('growth') && !t.includes('growth')) s -= 3;
    return { s, cover: hit / want.size };
  };
  for (let drop = 0; drop < 4 && words.length - drop >= 2; drop++) {
    const hits = await searchFunds(words.slice(0, words.length - drop).join(' '));
    const best = hits.map((h) => ({ h, ...score(h.name) })).filter((x) => x.cover >= 0.6).sort((a, b) => b.s - a.s)[0];
    if (!best) continue;
    const inst = fundInst(best.h);
    const c = await fetchCandles(inst, '1D', 5);
    if (c) return { inst, nav: c[c.length - 1].close };
  }
  return null;
}

/** One entry point for pasted text: a table (CSV / copied spreadsheet) first, then screenshot-style text. */
export function readHoldingsText(text: string): { rows: RawRow[]; error?: string; note?: string } {
  const table = readBrokerText(text);
  if (table.rows.length) return table;
  const shot = readScreenshotText(text);
  if (shot.length) return { rows: shot };
  const funds = readFundScreenshot(text);
  if (funds.rows.length) return funds;
  return { rows: [], error: 'Could not find any holdings in that. Each stock needs a name, a quantity and an average buy price. For a screenshot, make sure those are visible and sharp.' };
}
