import { TF_SEC, type Candle, type Instrument, type Quote } from './types';

/** Base URL of the API proxy; empty in dev (Vite serves /api), set at build time for static hosting. */
export const API: string = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');

/* ---------------------------------------------------------------- Binance (crypto) */
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const BINANCE_IV: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w' };

async function binancePage(symbol: string, tf: string, limit: number, endTime?: number): Promise<Candle[] | null> {
  for (const h of HOSTS) {
    try {
      const r = await fetch(`${h}/api/v3/klines?symbol=${symbol}&interval=${BINANCE_IV[tf]}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`);
      if (!r.ok) continue;
      const j = await r.json();
      if (Array.isArray(j) && j.length) return j.map((k: string[] & number[]) => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
    } catch { /* try next host */ }
  }
  return null;
}

/** Binance returns at most 1000 candles per call, so longer histories are fetched page by page, walking backwards in time. */
async function binanceCandles(symbol: string, tf: string, limit: number): Promise<Candle[] | null> {
  let out = (await binancePage(symbol, tf, Math.min(limit, 1000))) ?? null;
  while (out && out.length < limit) {
    const older = await binancePage(symbol, tf, Math.min(limit - out.length, 1000), out[0].time * 1000 - 1);
    if (!older) break;
    out = older.concat(out);
  }
  return out;
}

/* ---------------------------------------------------------------- Yahoo Finance (stocks, ETFs, forex, indices)
 * Browsers can't call Yahoo directly (no CORS), so requests go through the Vite proxy at /api/yahoo. */
// Currency each Yahoo symbol is quoted in, learned from the data itself (meta.currency)
const ccyCache = new Map<string, string>();

/** Currency the instrument's price is quoted in. */
export function currencyOf(inst: Instrument): string {
  if (inst.source === 'binance') return 'USD';
  if (inst.source === 'nse' || inst.source === 'mf') return 'INR';
  const known = ccyCache.get(inst.id);
  if (known) return known;
  if (/.(NS|BO)$/.test(inst.id) || ['^NSEI', '^NSEBANK', '^BSESN'].includes(inst.id)) return 'INR';
  if (/.L$/.test(inst.id)) return 'GBp';
  if (/.T$/.test(inst.id)) return 'JPY';
  return 'USD';
}

const YAHOO: Record<string, { iv: string; range: string; agg?: number }> = {
  '1m': { iv: '1m', range: '7d' },
  '5m': { iv: '5m', range: '60d' },
  '15m': { iv: '15m', range: '60d' },
  '1h': { iv: '60m', range: '1y' },
  '4h': { iv: '60m', range: '2y', agg: 14400 },
  '1D': { iv: '1d', range: '10y' },
  '1W': { iv: '1wk', range: '20y' },
};

function aggregate(c: Candle[], size: number): Candle[] {
  const out: Candle[] = [];
  for (const k of c) {
    const t = Math.floor(k.time / size) * size;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, k.high); last.low = Math.min(last.low, k.low);
      last.close = k.close; last.volume += k.volume;
    } else out.push({ ...k, time: t });
  }
  return out;
}

// Short ranges are enough to refresh the latest candles while polling (the full history is only fetched once)
const YAHOO_POLL_RANGE: Record<string, string> = { '1m': '1d', '5m': '1d', '15m': '1d', '1h': '5d', '4h': '5d', '1D': '5d', '1W': '1mo' };

async function yahooRaw(symbol: string, tf: string, range: string): Promise<{ candles: Candle[]; marketTime: number } | null> {
  const m = YAHOO[tf];
  try {
    const r = await fetch(`${API}/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${m.iv}&range=${range}&includePrePost=false`);
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0];
    if (!res?.timestamp || !q) return null;
    let out: Candle[] = [];
    res.timestamp.forEach((t: number, i: number) => {
      if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) return;
      if (out.length && out[out.length - 1].time >= t) return;
      out.push({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] ?? 0 });
    });
    if (res.meta?.currency) ccyCache.set(symbol, res.meta.currency);
    if (m.agg) out = aggregate(out, m.agg);
    return out.length ? { candles: out, marketTime: res.meta?.regularMarketTime ?? 0 } : null;
  } catch { return null; }
}

async function yahooCandles(symbol: string, tf: string, limit: number): Promise<Candle[] | null> {
  const r = await yahooRaw(symbol, tf, YAHOO[tf].range);
  return r ? r.candles.slice(-limit) : null;
}

/** Daily candles for a plain range ("1y", "2y"), lighter than the 10-year history the charts load. */
export async function fetchDaily(symbol: string, range = '1y'): Promise<Candle[] | null> {
  try {
    const r = await fetch(`${API}/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&includePrePost=false`);
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0];
    if (!res?.timestamp || !q) return null;
    const out: Candle[] = [];
    res.timestamp.forEach((t: number, i: number) => {
      if (q.close[i] == null) return;
      if (out.length && out[out.length - 1].time >= t) return;
      out.push({ time: t, open: q.open[i] ?? q.close[i], high: q.high[i] ?? q.close[i], low: q.low[i] ?? q.close[i], close: q.close[i], volume: q.volume?.[i] ?? 0 });
    });
    return out.length ? out : null;
  } catch { return null; }
}

export async function fetchCandles(inst: Instrument, tf: string, limit = 500): Promise<Candle[] | null> {
  if (inst.source === 'nse') return null; // NSE contracts have no price history feed
  if (inst.source === 'mf') return mfCandles(inst.id.slice(3), limit);
  return inst.source === 'binance' ? binanceCandles(inst.id, tf, limit) : yahooCandles(inst.id, tf, limit);
}

/** Longest history available, used to backtest. More trades means a more trustworthy win rate. */
export const fetchHistory = (inst: Instrument, tf: string) => fetchCandles(inst, tf, 5000);

/* ---------------------------------------------------------------- Indian mutual funds (mfapi.in: free, no key, allows browser calls) */
export interface FundHit { code: number; name: string }
export const fundInst = (h: FundHit): Instrument => ({ id: `MF:${h.code}`, name: h.name, source: 'mf', kind: 'MUTUALFUND' });

export async function searchFunds(query: string): Promise<FundHit[]> {
  try {
    const r = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`);
    if (!r.ok) return [];
    return ((await r.json()) as { schemeCode: number; schemeName: string }[]).map((x) => ({ code: x.schemeCode, name: x.schemeName.replace(/\s+/g, ' ').trim() }));
  } catch { return []; }
}

// the full NAV history (one download per fund) also carries the fund house and category
const mfCache = new Map<string, { at: number; p: Promise<{ meta?: Record<string, string>; data?: { date: string; nav: string }[] } | null> }>();
function mfRaw(code: string) {
  const hit = mfCache.get(code);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.p;
  const p = (async () => {
    try { const r = await fetch(`https://api.mfapi.in/mf/${code}`); return r.ok ? await r.json() : null; } catch { return null; }
  })();
  mfCache.set(code, { at: Date.now(), p });
  return p;
}

export interface FundMeta { house: string | null; category: string | null; type: string | null }
export async function fundMeta(inst: Instrument): Promise<FundMeta | null> {
  const j = await mfRaw(inst.id.slice(3));
  return j?.meta ? { house: j.meta.fund_house ?? null, category: j.meta.scheme_category ?? null, type: j.meta.scheme_type ?? null } : null;
}

/** One NAV per day, shaped like a candle so the same analysis works on funds and stocks. */
async function mfCandles(code: string, limit: number): Promise<Candle[] | null> {
  const rows = (await mfRaw(code))?.data ?? [];
  const out: Candle[] = [];
  for (const x of rows) {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(x.date);
    const v = parseFloat(x.nav);
    if (m && v > 0) out.push({ time: Date.UTC(+m[3], +m[2] - 1, +m[1]) / 1000, open: v, high: v, low: v, close: v, volume: 0 });
  }
  out.sort((a, b) => a.time - b.time);
  return out.length ? out.slice(-limit) : null;
}

/** Name, price and 1-year change for many symbols in a few requests (the batch quote feed carries the 52-week change). */
export async function fetchYearChanges(ids: string[]): Promise<Record<string, { name: string; price: number; chg1y: number }>> {
  const out: Record<string, { name: string; price: number; chg1y: number }> = {};
  for (let i = 0; i < ids.length; i += 40) {
    try {
      const r = await fetch(`${API}/api/quote?symbols=${encodeURIComponent(ids.slice(i, i + 40).join(','))}`);
      if (!r.ok) continue;
      for (const q of (await r.json()).quoteResponse?.result ?? []) {
        if (typeof q.fiftyTwoWeekChangePercent === 'number' && typeof q.regularMarketPrice === 'number') out[q.symbol] = { name: q.longName || q.shortName || q.symbol, price: q.regularMarketPrice, chg1y: q.fiftyTwoWeekChangePercent };
      }
    } catch { /* skip this batch */ }
  }
  return out;
}

/* ---------------------------------------------------------------- company fundamentals */
export interface FundamentalsRaw { quote: Record<string, unknown> | null; summary: Record<string, unknown> | null }
const fundCache = new Map<string, { at: number; v: FundamentalsRaw }>();

/** Valuation from the batch quote feed plus profitability, debt and growth from the company summary. */
export async function fetchFundamentalsRaw(inst: Instrument): Promise<FundamentalsRaw> {
  const hit = fundCache.get(inst.id);
  if (hit && Date.now() - hit.at < 30 * 60000) return hit.v;
  const [quote, summary] = await Promise.all([
    (async () => { try { const r = await fetch(`${API}/api/quote?symbols=${encodeURIComponent(inst.id)}`); return r.ok ? (await r.json()).quoteResponse?.result?.[0] ?? null : null; } catch { return null; } })(),
    (async () => { try { const r = await fetch(`${API}/api/fundamentals?symbol=${encodeURIComponent(inst.id)}`); return r.ok ? (await r.json()).quoteSummary?.result?.[0] ?? null : null; } catch { return null; } })(),
  ]);
  const v = { quote, summary };
  if (quote || summary) fundCache.set(inst.id, { at: Date.now(), v });
  return v;
}

/* ---------------------------------------------------------------- symbol search */
const CRYPTO = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'TRXUSDT', 'DOTUSDT', 'LTCUSDT', 'MATICUSDT', 'SHIBUSDT', 'TONUSDT', 'NEARUSDT', 'ATOMUSDT', 'UNIUSDT', 'PEPEUSDT', 'SUIUSDT'];

export async function searchInstruments(query: string, count = 10): Promise<Instrument[]> {
  const q = query.trim().toUpperCase().replace(/\s+/g, '');
  if (!q) return CRYPTO.slice(0, 8).map((s) => ({ id: s, name: 'Crypto', source: 'binance' as const, kind: 'CRYPTO' }));
  const out: Instrument[] = CRYPTO.filter((s) => s.startsWith(q) || s.replace('USDT', '').startsWith(q))
    .slice(0, 4).map((s) => ({ id: s, name: 'Crypto · Binance', source: 'binance' as const, kind: 'CRYPTO' }));
  try {
    const r = await fetch(`${API}/api/yahoo-search/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${count}&newsCount=0`);
    if (r.ok) {
      const j = await r.json();
      for (const x of j.quotes ?? []) {
        if (!x.symbol || !['EQUITY', 'ETF', 'INDEX', 'CURRENCY', 'FUTURE', 'CRYPTOCURRENCY', 'MUTUALFUND', 'OPTION'].includes(x.quoteType)) continue;
        out.push({ id: x.symbol, name: `${x.shortname || x.longname || x.symbol} · ${x.exchDisp || x.exchange || ''}`, source: 'yahoo', kind: x.quoteType });
      }
    }
  } catch { /* offline or proxy unavailable */ }
  return out;
}

/* ---------------------------------------------------------------- demo + live feed */
export function demoData(tf: string): Candle[] {
  const step = TF_SEC[tf];
  const now = Math.floor(Date.now() / 1000 / step) * step;
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: Candle[] = [];
  let p = 100;
  for (let i = 499; i >= 0; i--) {
    const o = p;
    p = Math.max(5, p + (rnd() - 0.5) * 2.2 + Math.sin(i / 25) * 0.6);
    out.push({ time: now - i * step, open: o, close: p, high: Math.max(o, p) + rnd() * 0.8, low: Math.min(o, p) - rnd() * 0.8, volume: 100 + rnd() * 900 });
  }
  return out;
}

export type FeedStatus = 'live' | 'connecting' | 'polling' | 'closed' | 'off';

export interface LiveQuote { price: number; time: number; state: string }

/**
 * Latest traded prices, batched into as few requests as possible: one call for all Yahoo symbols (about 150 ms),
 * one for all Binance symbols, and NSE option contracts one by one.
 */
export async function fetchLivePrices(insts: Instrument[]): Promise<Record<string, LiveQuote>> {
  const out: Record<string, LiveQuote> = {};
  const y = insts.filter((i) => i.source === 'yahoo');
  const b = insts.filter((i) => i.source === 'binance');
  const n = insts.filter((i) => i.source === 'nse');
  const jobs: Promise<void>[] = [];
  if (y.length) {
    jobs.push((async () => {
      try {
        const r = await fetch(`${API}/api/quote?symbols=${encodeURIComponent(y.map((i) => i.id).join(','))}`);
        if (!r.ok) return;
        for (const q of (await r.json()).quoteResponse?.result ?? []) {
          if (typeof q.regularMarketPrice === 'number') out[q.symbol] = { price: q.regularMarketPrice, time: q.regularMarketTime ?? 0, state: q.marketState ?? '' };
        }
      } catch { /* leave missing */ }
    })());
  }
  if (b.length) {
    jobs.push((async () => {
      for (const h of HOSTS) {
        try {
          const r = await fetch(`${h}/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(b.map((i) => i.id)))}`);
          if (!r.ok) continue;
          (await r.json()).forEach((t: { symbol: string; price: string }) => { out[t.symbol] = { price: +t.price, time: Date.now() / 1000, state: 'REGULAR' }; });
          return;
        } catch { /* next host */ }
      }
    })());
  }
  n.forEach((i) => jobs.push(latestPrice(i).then((p) => { if (p != null) out[i.id] = { price: p, time: Date.now() / 1000, state: 'REGULAR' }; })));
  await Promise.all(jobs);
  return out;
}

/**
 * Live updates. Calls onCandle for candle updates and onTick for every new price.
 * Binance: websocket with the per-trade stream (tens of ticks a second) plus the 1s candle stream. It reconnects by
 * itself and falls back to fast polling while disconnected.
 * Yahoo (stocks, forex, futures): the batch quote endpoint every 1s for the price, candles every 8s.
 * Returns a disposer.
 */
export function openFeed(inst: Instrument, tf: string, onCandle: (c: Candle) => void, onState: (s: FeedStatus) => void, onTick?: (price: number) => void) {
  let dead = false;
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => { const id = window.setTimeout(fn, ms); timers.push(id); return id; };

  if (inst.source === 'yahoo') {
    onState('connecting');
    let closed = false;
    const priceLoop = async () => {
      if (dead) return;
      let wait = 1000;
      if (!document.hidden) {
        const q = (await fetchLivePrices([inst]))[inst.id];
        if (dead) return;
        if (q) {
          onTick?.(q.price);
          closed = !!q.state && q.state !== 'REGULAR';   // PRE / POST / CLOSED: the exchange is not trading
          onState(closed ? 'closed' : 'live');
          if (closed) wait = 15000;
        } else onState('polling');
      }
      later(priceLoop, wait);
    };
    const candleLoop = async () => {
      if (dead) return;
      if (!document.hidden) {
        const r = await yahooRaw(inst.id, tf, YAHOO_POLL_RANGE[tf]);
        if (dead) return;
        if (r) r.candles.slice(-2).forEach(onCandle);
      }
      later(candleLoop, closed ? 60000 : 8000);
    };
    priceLoop(); candleLoop();
    return () => { dead = true; timers.forEach(clearTimeout); onState('off'); };
  }

  let ws: WebSocket | null = null;
  let retry = 0, host = 0, lastMsg = Date.now(), fallback: number | undefined;
  const hosts = ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'];
  const sym = inst.id.toLowerCase();

  const poll = async () => {
    const c = await binanceCandles(inst.id, tf, 2);
    if (!dead && c) c.forEach(onCandle);
  };
  const startPoll = () => { if (fallback === undefined) { poll(); fallback = window.setInterval(poll, 2000); } };
  const stopPoll = () => { if (fallback !== undefined) { clearInterval(fallback); fallback = undefined; } };

  const connect = () => {
    if (dead) return;
    onState('connecting');
    const sock = new WebSocket(`${hosts[host % hosts.length]}/stream?streams=${sym}@kline_${BINANCE_IV[tf]}/${sym}@aggTrade`);
    ws = sock;
    sock.onopen = () => { retry = 0; lastMsg = Date.now(); stopPoll(); onState('live'); };
    sock.onmessage = (ev) => {
      lastMsg = Date.now();
      const m = JSON.parse(ev.data).data;
      if (!m) return;
      if (m.e === 'aggTrade') onTick?.(+m.p);
      else if (m.k) onCandle({ time: Math.floor(m.k.t / 1000), open: +m.k.o, high: +m.k.h, low: +m.k.l, close: +m.k.c, volume: +m.k.v });
    };
    const lost = () => {
      if (dead || ws !== sock) return;
      ws = null; host++;
      onState('polling'); startPoll();
      later(connect, Math.min(1000 * 2 ** retry++, 8000));
    };
    sock.onclose = lost;
    sock.onerror = () => sock.close();
  };
  connect();

  // a silent socket is as bad as a closed one: restart it
  const watchdog = window.setInterval(() => { if (ws && Date.now() - lastMsg > 15000) ws.close(); }, 5000);

  return () => {
    dead = true; timers.forEach(clearTimeout); clearInterval(watchdog); stopPoll();
    if (ws) { ws.onmessage = ws.onclose = ws.onerror = ws.onopen = null; ws.close(); }
    onState('off');
  };
}

/**
 * Price ticks for several symbols at once, used to keep open positions and alerts current while you look at another chart.
 * Binance: one websocket with every symbol's trade stream (a tick on every trade), reconnecting by itself and polling
 * while it is down. Yahoo: one batched quote request every 1s. NSE option contracts: every 4s.
 */
export function openTicks(insts: Instrument[], onTick: (id: string, price: number) => void): () => void {
  let dead = false;
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => { const id = window.setTimeout(fn, ms); timers.push(id); };
  const bin = insts.filter((i) => i.source === 'binance');
  const yh = insts.filter((i) => i.source === 'yahoo');
  const nse = insts.filter((i) => i.source === 'nse');
  const cleanups: (() => void)[] = [];

  if (bin.length) {
    let ws: WebSocket | null = null, retry = 0, host = 0, fallback: number | undefined;
    const hosts = ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'];
    const poll = async () => { const q = await fetchLivePrices(bin); if (!dead) Object.entries(q).forEach(([id, x]) => onTick(id, x.price)); };
    const startPoll = () => { if (fallback === undefined) { poll(); fallback = window.setInterval(poll, 1500); } };
    const stopPoll = () => { if (fallback !== undefined) { clearInterval(fallback); fallback = undefined; } };
    const connect = () => {
      if (dead) return;
      const sock = new WebSocket(`${hosts[host % hosts.length]}/stream?streams=${bin.map((i) => `${i.id.toLowerCase()}@aggTrade`).join('/')}`);
      ws = sock;
      sock.onopen = () => { retry = 0; stopPoll(); };
      sock.onmessage = (ev) => { const m = JSON.parse(ev.data).data; if (m && m.e === 'aggTrade') onTick(m.s, +m.p); };
      sock.onclose = () => { if (dead || ws !== sock) return; ws = null; host++; startPoll(); later(connect, Math.min(1000 * 2 ** retry++, 8000)); };
      sock.onerror = () => sock.close();
    };
    connect();
    cleanups.push(() => { stopPoll(); if (ws) { ws.onmessage = ws.onclose = ws.onerror = ws.onopen = null; ws.close(); } });
  }

  const loop = (list: Instrument[], ms: number) => {
    const run = async () => {
      if (dead) return;
      if (!document.hidden) {
        const q = await fetchLivePrices(list);
        if (dead) return;
        Object.entries(q).forEach(([id, x]) => onTick(id, x.price));
      }
      later(run, ms);
    };
    run();
  };
  if (yh.length) loop(yh, 1000);
  if (nse.length) loop(nse, 4000);

  return () => { dead = true; timers.forEach(clearTimeout); cleanups.forEach((f) => f()); };
}

/* ---------------------------------------------------------------- quotes for the market browser */
const quoteCache = new Map<string, { at: number; q: Quote }>();

async function yahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const r = await fetch(`${API}/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`);
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const closes: number[] = (res?.indicators?.quote?.[0]?.close ?? []).filter((x: number | null) => x != null);
    const price = res?.meta?.regularMarketPrice ?? closes[closes.length - 1];
    const prev = closes.length > 1 ? closes[closes.length - 2] : res?.meta?.chartPreviousClose;
    return price && prev ? { price, chg: ((price - prev) / prev) * 100 } : price ? { price, chg: 0 } : null;
  } catch { return null; }
}

export async function fetchQuotes(items: Instrument[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const now = Date.now();
  const need: Instrument[] = [];
  for (const i of items) {
    const c = quoteCache.get(i.id);
    if (c && now - c.at < 60000) out[i.id] = c.q; else need.push(i);
  }
  const save = (id: string, q: Quote | null) => { if (q) { out[id] = q; quoteCache.set(id, { at: now, q }); } };
  const crypto = need.filter((i) => i.source === 'binance');
  if (crypto.length) {
    for (const h of HOSTS) {
      try {
        const r = await fetch(`${h}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(crypto.map((i) => i.id)))}`);
        if (!r.ok) continue;
        (await r.json()).forEach((t: { symbol: string; lastPrice: string; priceChangePercent: string }) => save(t.symbol, { price: +t.lastPrice, chg: +t.priceChangePercent }));
        break;
      } catch { /* next host */ }
    }
  }
  await Promise.all(need.filter((i) => i.source === 'yahoo').map(async (i) => save(i.id, await yahooQuote(i.id))));
  return out;
}

/* ---------------------------------------------------------------- options chain (served by the dev server) */
export interface OptionRow {
  contractSymbol: string; strike: number; lastPrice: number; bid?: number; ask?: number; volume?: number;
  openInterest?: number; impliedVolatility?: number; inTheMoney?: boolean; expiration: number;
}
export interface OptionChain { underlying: string; price: number; expirations: number[]; date: number; calls: OptionRow[]; puts: OptionRow[] }

export async function fetchOptions(symbol: string, date?: number): Promise<OptionChain | null> {
  try {
    const r = await fetch(`${API}/api/options?symbol=${encodeURIComponent(symbol)}${date ? `&date=${date}` : ''}`);
    if (!r.ok) return null;
    const res = (await r.json())?.optionChain?.result?.[0];
    const o = res?.options?.[0];
    if (!res || !o) return null;
    return { underlying: res.underlyingSymbol ?? symbol, price: res.quote?.regularMarketPrice ?? 0, expirations: res.expirationDates ?? [], date: o.expirationDate, calls: o.calls ?? [], puts: o.puts ?? [] };
  } catch { return null; }
}

/* ---------------------------------------------------------------- NSE India options (served by the dev server) */
export interface NseLeg { id: string; ltp: number; bid: number; ask: number; iv: number; oi: number; vol: number }
export interface NseChain { symbol: string; spot: number; expiries: string[]; expiry: string; rows: { strike: number; ce?: NseLeg; pe?: NseLeg }[] }

const leg = (x: Record<string, number | string> | undefined): NseLeg | undefined => x ? ({
  id: String(x.identifier), ltp: +x.lastPrice, bid: +x.buyPrice1, ask: +x.sellPrice1, iv: +x.impliedVolatility, oi: +x.openInterest, vol: +x.totalTradedVolume,
}) : undefined;

const nseCache = new Map<string, { at: number; c: NseChain }>();

export async function fetchNseChain(symbol: string, type: 'Indices' | 'Equity', expiry?: string): Promise<NseChain | null> {
  const key = `${symbol}|${expiry ?? ''}`;
  const hit = nseCache.get(key);
  if (hit && Date.now() - hit.at < 10000) return hit.c;
  try {
    const r = await fetch(`${API}/api/nse?symbol=${encodeURIComponent(symbol)}&type=${type}${expiry ? `&expiry=${encodeURIComponent(expiry)}` : ''}`);
    if (!r.ok) return null;
    const j = await r.json();
    const rec = j?.records;
    if (!rec?.data) return null;
    const rows = rec.data.map((d: { strikePrice: number; CE?: Record<string, number | string>; PE?: Record<string, number | string>; expiryDates: string }) => ({ strike: d.strikePrice, ce: leg(d.CE), pe: leg(d.PE) }));
    const c: NseChain = { symbol, spot: rec.underlyingValue, expiries: rec.expiryDates ?? [], expiry: rec.data[0]?.expiryDates ?? expiry ?? '', rows };
    nseCache.set(key, { at: Date.now(), c });
    return c;
  } catch { return null; }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Latest traded price for any instrument (used to keep open paper positions and alerts fresh). */
export async function latestPrice(inst: Instrument): Promise<number | null> {
  if (inst.source === 'nse') {
    const m = /^OPT(IDX|STK)(.+?)(\d{2})-(\d{2})-(\d{4})(CE|PE)([\d.]+)$/.exec(inst.id);
    if (!m) return null;
    const chain = await fetchNseChain(m[2], m[1] === 'IDX' ? 'Indices' : 'Equity', `${m[3]}-${MON[+m[4] - 1]}-${m[5]}`);
    const row = chain?.rows.find((r) => r.strike === +m[7]);
    return (m[6] === 'CE' ? row?.ce : row?.pe)?.ltp ?? null;
  }
  const q = (await fetchLivePrices([inst]))[inst.id];
  if (q) return q.price;
  const c = await fetchCandles(inst, '1m', 2);
  return c ? c[c.length - 1].close : null;
}
