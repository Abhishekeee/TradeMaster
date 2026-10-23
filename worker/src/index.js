// Cloudflare Worker that stands in for the Vite dev/preview proxy, so the static site can be hosted on GitHub Pages.
// Routes: /api/yahoo/*, /api/yahoo-search/*, /api/quote, /api/options, /api/nse, /api/news, /api/fundamentals

const UA = { 'User-Agent': 'Mozilla/5.0' };
const NSE_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9', Accept: '*/*' };

const cors = (origin, env) => {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return { 'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : origin) : allowed[0], Vary: 'Origin' };
};

const json = (body, status, extra = {}) => new Response(body, { status, headers: { 'Content-Type': 'application/json', ...extra } });

/* News: Google News first; when Google refuses a datacenter address, fall back to Bing News and reshape it to the same format */
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/rss+xml, application/xml, text/xml, */*', 'Accept-Language': 'en-US,en;q=0.9' };
const unxml = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function bingToGoogleShape(feed) {
  const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 40).map((m) => {
    const tag = (t) => { const x = new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>').exec(m[1]); return x ? unxml(x[1]).trim() : ''; };
    let link = tag('link');
    try { const real = new URL(link).searchParams.get('url'); if (real) link = real; } catch { /* keep the link as it is */ }
    return '<item><title>' + xml(tag('title')) + '</title><link>' + xml(link) + '</link><pubDate>' + xml(tag('pubDate')) + '</pubDate><source>' + xml(tag('News:Source')) + '</source></item>';
  });
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>' + items.join('') + '</channel></rss>';
}

async function newsFeed(term, region) {
  let google = 0;
  try {
    const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=en-${region}&gl=${region}&ceid=${region}:en`, { headers: BROWSER });
    google = r.status;
    if (r.ok) { const t = await r.text(); if (t.includes('<item>')) return { body: t, via: 'google', google }; }
  } catch { /* try the fallback */ }
  // Bing cannot search a date range, so say "nothing" instead of showing unrelated days
  if (/\b(after|before):/.test(term)) return { body: '<?xml version="1.0"?><rss><channel></channel></rss>', via: 'none', google };
  try {
    const r = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(term)}&format=rss&setmkt=en-${region}`, { headers: BROWSER });
    if (r.ok) return { body: bingToGoogleShape(await r.text()), via: 'bing', google };
  } catch { /* give up below */ }
  return { body: null, via: 'none', google };
}

/* Yahoo session (cookie + crumb), cached per isolate */
let session = null;
async function getSession(force = false) {
  if (session && !force) return session;
  const r1 = await fetch('https://fc.yahoo.com', { headers: UA, redirect: 'manual' });
  const cookie = (r1.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const crumb = await (await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { ...UA, cookie } })).text();
  session = { cookie, crumb };
  return session;
}

async function yahooWithCrumb(buildUrl) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const s = await getSession(attempt > 0);
      const r = await fetch(buildUrl(s.crumb), { headers: { ...UA, cookie: s.cookie } });
      if (r.ok) return await r.text();
    } catch { /* retry with a fresh session */ }
  }
  return null;
}

/* NSE session cookie, cached for 4 minutes */
let nse = null;
async function nseSession(force = false) {
  if (nse && !force && Date.now() - nse.at < 4 * 60000) return nse.cookie;
  const r = await fetch('https://www.nseindia.com/option-chain', { headers: { ...NSE_UA, Accept: 'text/html' } });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  nse = { cookie, at: Date.now() };
  return cookie;
}
async function nseGet(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const cookie = await nseSession(attempt > 0);
      const r = await fetch('https://www.nseindia.com/api/' + path, { headers: { ...NSE_UA, cookie, Referer: 'https://www.nseindia.com/option-chain' } });
      if (r.ok) return await r.text();
    } catch { /* retry with a fresh session */ }
  }
  return null;
}

async function proxy(target, prefix, u, extra) {
  const r = await fetch(target + u.pathname.slice(prefix.length) + u.search, { headers: UA });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json', ...extra } });
}

async function route(u, extra) {
  const p = u.pathname;
  const q = u.searchParams;
  if (p.startsWith('/api/yahoo-search/')) return proxy('https://query2.finance.yahoo.com', '/api/yahoo-search', u, extra);
  if (p.startsWith('/api/yahoo/')) return proxy('https://query1.finance.yahoo.com', '/api/yahoo', u, extra);

  if (p === '/api/quote') {
    const symbols = (q.get('symbols') ?? '').split(',').filter((s) => /^[A-Za-z0-9.^=-]{1,20}$/.test(s)).slice(0, 40);
    if (!symbols.length) return json('{"error":"no symbols"}', 400, extra);
    const body = await yahooWithCrumb((crumb) => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&crumb=${encodeURIComponent(crumb)}`);
    return body ? json(body, 200, { ...extra, 'Cache-Control': 'no-store' }) : json('{"error":"quotes unavailable"}', 502, extra);
  }

  if (p === '/api/fundamentals') {
    const symbol = q.get('symbol');
    if (!symbol || !/^[A-Za-z0-9.^=-]{1,15}$/.test(symbol)) return json('{"error":"bad symbol"}', 400, extra);
    const body = await yahooWithCrumb((crumb) => `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics,assetProfile,summaryDetail&crumb=${encodeURIComponent(crumb)}`);
    return body ? json(body, 200, { ...extra, 'Cache-Control': 'public, max-age=900' }) : json('{"error":"fundamentals unavailable"}', 502, extra);
  }

  if (p === '/api/news') {
    const term = (q.get('q') ?? '').trim().slice(0, 120);
    const region = q.get('region') === 'IN' ? 'IN' : 'US';
    if (term.length < 2) return json('{"error":"no query"}', 400, extra);
    const f = await newsFeed(term, region);
    return f.body !== null
      ? new Response(f.body, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-News-Via': f.via, ...extra } })
      : json(JSON.stringify({ error: 'news unavailable', google: f.google }), 502, extra);
  }

  if (p === '/api/options') {
    const symbol = q.get('symbol');
    const date = q.get('date');
    if (!symbol || !/^[A-Za-z0-9.^=-]{1,15}$/.test(symbol)) return json('{"error":"bad symbol"}', 400, extra);
    const body = await yahooWithCrumb((crumb) => `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(crumb)}${date ? `&date=${encodeURIComponent(date)}` : ''}`);
    return body ? json(body, 200, extra) : json('{"error":"options unavailable"}', 502, extra);
  }

  if (p === '/api/nse') {
    const symbol = q.get('symbol') ?? '';
    const type = q.get('type') === 'Equity' ? 'Equity' : 'Indices';
    let expiry = q.get('expiry') ?? '';
    if (!/^[A-Z0-9&-]{1,20}$/.test(symbol) || (expiry && !/^[0-9]{2}-[A-Za-z]{3}-[0-9]{4}$/.test(expiry))) return json('{"error":"bad request"}', 400, extra);
    if (!expiry) {
      const info = await nseGet('option-chain-contract-info?symbol=' + symbol);
      try { expiry = JSON.parse(info ?? '').expiryDates[0]; } catch { /* handled below */ }
    }
    const body = expiry ? await nseGet(`option-chain-v3?type=${type}&symbol=${symbol}&expiry=${expiry}`) : null;
    return body ? json(body, 200, extra) : json('{"error":"nse unavailable"}', 502, extra);
  }

  return json('{"error":"not found"}', 404, extra);
}

export default {
  async fetch(request, env) {
    const extra = cors(request.headers.get('Origin') ?? '', env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...extra, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return json('{"error":"method not allowed"}', 405, extra);
    try {
      return await route(new URL(request.url), extra);
    } catch {
      return json('{"error":"upstream failure"}', 502, extra);
    }
  },
};
