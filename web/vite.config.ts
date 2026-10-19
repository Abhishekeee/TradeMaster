import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Yahoo Finance has no CORS headers, so the dev/preview server forwards these paths for the browser.
const headers = { 'User-Agent': 'Mozilla/5.0' };
const proxy = {
  '/api/yahoo-search': { target: 'https://query2.finance.yahoo.com', changeOrigin: true, headers, rewrite: (p: string) => p.replace(/^\/api\/yahoo-search/, '') },
  '/api/yahoo': { target: 'https://query1.finance.yahoo.com', changeOrigin: true, headers, rewrite: (p: string) => p.replace(/^\/api\/yahoo/, '') },
};

// Options chains need a Yahoo session cookie + crumb, so they are fetched server-side: /api/options?symbol=AAPL&date=<unix>
let session: { cookie: string; crumb: string } | null = null;
async function getSession(force = false) {
  if (session && !force) return session;
  const r1 = await fetch('https://fc.yahoo.com', { headers, redirect: 'manual' });
  const cookie = (r1.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const crumb = await (await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { ...headers, cookie } })).text();
  session = { cookie, crumb };
  return session;
}

// NSE India (Nifty, Bank Nifty and F&O stocks): /api/nse?symbol=NIFTY&type=Indices|Equity&expiry=27-Oct-2026
const NSE_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9', Accept: '*/*' };
let nse: { cookie: string; at: number } | null = null;
async function nseSession(force = false) {
  if (nse && !force && Date.now() - nse.at < 4 * 60000) return nse.cookie;
  const r = await fetch('https://www.nseindia.com/option-chain', { headers: { ...NSE_UA, Accept: 'text/html' } });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  nse = { cookie, at: Date.now() };
  return cookie;
}
async function nseGet(path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const cookie = await nseSession(attempt > 0);
      const r = await fetch('https://www.nseindia.com/api/' + path, { headers: { ...NSE_UA, cookie, Referer: 'https://www.nseindia.com/option-chain' } });
      if (r.ok) return await r.text();
    } catch { /* retry with a fresh session */ }
  }
  return null;
}

function optionsPlugin(): Plugin {
  const nseHandler = async (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(b: string): void }) => {
    const u = new URL(req.url ?? '/', 'http://local');
    const symbol = u.searchParams.get('symbol') ?? '';
    const type = u.searchParams.get('type') === 'Equity' ? 'Equity' : 'Indices';
    let expiry = u.searchParams.get('expiry') ?? '';
    res.setHeader('Content-Type', 'application/json');
    if (!/^[A-Z0-9&-]{1,20}$/.test(symbol) || (expiry && !/^[0-9]{2}-[A-Za-z]{3}-[0-9]{4}$/.test(expiry))) { res.statusCode = 400; res.end('{"error":"bad request"}'); return; }
    if (!expiry) {
      const info = await nseGet('option-chain-contract-info?symbol=' + symbol);
      try { expiry = JSON.parse(info ?? '').expiryDates[0]; } catch { /* handled below */ }
    }
    const body = expiry ? await nseGet(`option-chain-v3?type=${type}&symbol=${symbol}&expiry=${expiry}`) : null;
    if (body) res.end(body); else { res.statusCode = 502; res.end('{"error":"nse unavailable"}'); }
  };

  // Latest prices for many symbols in one call (about 150 ms): /api/quote?symbols=AAPL,RELIANCE.NS
  const quoteHandler = async (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(b: string): void }) => {
    const u = new URL(req.url ?? '/', 'http://local');
    const symbols = (u.searchParams.get('symbols') ?? '').split(',').filter((s) => /^[A-Za-z0-9.^=-]{1,20}$/.test(s)).slice(0, 40);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (!symbols.length) { res.statusCode = 400; res.end('{"error":"no symbols"}'); return; }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const s = await getSession(attempt > 0);
        const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&crumb=${encodeURIComponent(s.crumb)}`, { headers: { ...headers, cookie: s.cookie } });
        if (r.ok) { res.end(await r.text()); return; }
      } catch { /* retry with a fresh session */ }
    }
    res.statusCode = 502;
    res.end('{"error":"quotes unavailable"}');
  };

  const handler = async (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(b: string): void }) => {
    const u = new URL(req.url ?? '/', 'http://local');
    const symbol = u.searchParams.get('symbol');
    const date = u.searchParams.get('date');
    res.setHeader('Content-Type', 'application/json');
    if (!symbol || !/^[A-Za-z0-9.^=-]{1,15}$/.test(symbol)) { res.statusCode = 400; res.end('{"error":"bad symbol"}'); return; }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const s = await getSession(attempt > 0);
        const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(s.crumb)}${date ? `&date=${encodeURIComponent(date)}` : ''}`;
        const r = await fetch(url, { headers: { ...headers, cookie: s.cookie } });
        const body = await r.text();
        if (r.ok) { res.end(body); return; }
      } catch { /* retry with a fresh session */ }
    }
    res.statusCode = 502;
    res.end('{"error":"options unavailable"}');
  };
  return {
    name: 'yahoo-options',
    configureServer(server) { server.middlewares.use('/api/options', handler); server.middlewares.use('/api/nse', nseHandler); server.middlewares.use('/api/quote', quoteHandler); },
    configurePreviewServer(server) { server.middlewares.use('/api/options', handler); server.middlewares.use('/api/nse', nseHandler); server.middlewares.use('/api/quote', quoteHandler); },
  };
}

export default defineConfig({ plugins: [react(), optionsPlugin()], worker: { format: 'es' }, server: { proxy }, preview: { proxy } });
