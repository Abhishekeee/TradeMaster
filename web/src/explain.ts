import { currencyOf, fetchFundamentalsRaw, fundMeta } from './data';
import { growthOf } from './analysis';
import { fetchNews, fetchNewsAround, pull, type NewsItem } from './news';
import { benchmarkFor, dailyCandles, shortName } from './portfolio';
import type { Candle, Instrument } from './types';

/* ---------------------------------------------------------------- what the headlines are about */
export interface Theme { id: string; label: string; effect: string; items: NewsItem[]; tone: number }

const THEMES: { id: string; label: string; re: RegExp; effect: string }[] = [
  { id: 'war', label: 'War & geopolitical tension', re: /\b(war|conflict|attacks?|missiles?|ceasefire|sanctions?|tensions?|geopolitic\w*|israel|iran|russia|ukraine|gaza|border|military)\b/i,
    effect: 'Wars, sanctions and border tensions make investors cautious. They often push oil prices and the whole market around.' },
  { id: 'oil', label: 'Oil & fuel prices', re: /\b(crude|oil prices?|brent|opec|fuel prices?|petrol|diesel|gas prices?|natural gas|lng)\b/i,
    effect: 'Oil and gas prices change costs for airlines, paints, chemicals and transport, and profits for producers and refiners.' },
  { id: 'rates', label: 'Interest rates & inflation', re: /\b(rbi|repo rate|rate cuts?|rate hikes?|interest rates?|the fed|fed rate|federal reserve|inflation|cpi|bond yields?|monetary policy)\b/i,
    effect: 'Higher rates make loans costlier and shares less attractive. Rate cuts usually help banks\' customers, housing, autos and bond funds.' },
  { id: 'tariff', label: 'Tariffs & trade', re: /\b(tariffs?|trade war|trade deal|export dut\w+|import dut\w+|trump|exports?|imports?)\b/i,
    effect: 'Tariffs and trade rules change what exporters can earn and what imported goods cost.' },
  { id: 'earn', label: 'Earnings & results', re: /\b(q[1-4]|quarter\w*|results?|earnings|profit|revenue|ebitda|net income|margins?)\b/i,
    effect: 'Results move a price the most when profit or sales beat or miss what analysts expected.' },
  { id: 'views', label: 'Analyst views & guidance', re: /\b(guidance|outlook|forecast|target price|price target|downgrad\w+|upgrad\w+|brokerages?|buy rating|sell rating|overweight|underweight)\b/i,
    effect: 'Brokerages raising or cutting ratings and targets, or the company changing its own guidance, can move a stock for days.' },
  { id: 'rules', label: 'Regulation & legal', re: /\b(sebi|regulators?|banned?|penalty|fined?|probe|investigation|raids?|court|nclt|tax(es)?|gst|fda|recall|antitrust|lawsuit|fraud)\b/i,
    effect: 'Rule changes, penalties, court cases or investigations can hit profits or confidence quickly.' },
  { id: 'prices', label: 'Price changes (products & raw materials)', re: /\b(price hikes?|hikes? prices|raise[sd]? prices|price cuts?|price increase|price war|msp|commodity|steel prices?|gold prices?|silver prices?|cement prices?|coal prices?|copper)\b/i,
    effect: 'Price hikes or cuts, for the company\'s own products or for raw materials like steel, gold or gas, change margins directly.' },
  { id: 'flows', label: 'Investor flows & stake sales', re: /\b(fiis?|fpis?|foreign investors?|institutional|diis?|block deals?|bulk deals?|stake sale|promoters?|pledge\w*|selling pressure|short interest)\b/i,
    effect: 'Foreign and institutional investors buying or selling large blocks can push a price even when the business has not changed.' },
  { id: 'deals', label: 'Deals, orders & expansion', re: /\b(acquisitions?|acquires?|mergers?|demergers?|ipo|buyout|order wins?|bags?|contracts?|partnerships?|expansion|capex|plant|launch\w*)\b/i,
    effect: 'Takeovers, big orders, listings and expansion plans change the growth story.' },
  { id: 'payout', label: 'Dividend, bonus & buyback', re: /\b(dividends?|bonus|buybacks?|stock split|share split)\b/i,
    effect: 'Dividends, bonus shares and buybacks return cash to shareholders and are usually welcomed.' },
  { id: 'mgmt', label: 'Management changes', re: /\b(ceo|cfo|chairman|resigns?|steps down|appointed|appoints|succession|new md)\b/i,
    effect: 'A change at the top can raise doubts or hopes about the company\'s direction.' },
  { id: 'demand', label: 'Sector & demand trends', re: /\b(demand|slowdown|recession|monsoon|crop|real estate|housing|auto sales|sales volumes?|capacity|supply chain)\b/i,
    effect: 'Demand for the sector\'s products (sales numbers, monsoon, housing, auto sales) sets the pace for the whole group.' },
  { id: 'fx', label: 'Currency moves', re: /\b(rupee|dollar|currency|forex|exchange rate)\b/i,
    effect: 'A weaker rupee helps exporters such as IT and pharma and hurts importers; a stronger one does the opposite.' },
  { id: 'tech', label: 'AI, technology & jobs', re: /\b(ai|artificial intelligence|layoffs?|job cuts|hiring|attrition|automation)\b/i,
    effect: 'New technology and job cuts can change how much work companies need, and who wins it.' },
];

/** Groups recent headlines by what they are about and whether they read as good or bad news. */
export function themesOf(items: NewsItem[], days = 45): Theme[] {
  const since = Date.now() - days * 86400000;
  const recent = items.filter((n) => !n.time || n.time >= since);
  return THEMES.map((t) => {
    const hit = recent.filter((n) => t.re.test(n.title));
    return { id: t.id, label: t.label, effect: t.effect, items: hit, tone: hit.length ? hit.reduce((a, n) => a + n.mood, 0) / hit.length : 0 };
  }).filter((t) => t.items.length > 0).sort((a, b) => b.items.length - a.items.length).slice(0, 5);
}

/* ---------------------------------------------------------------- the sector a company belongs to */
const IN_SECTOR: Record<string, [string, string]> = {
  bank: ['^NSEBANK', 'Bank Nifty'], it: ['^CNXIT', 'Nifty IT'], pharma: ['^CNXPHARMA', 'Nifty Pharma'], auto: ['^CNXAUTO', 'Nifty Auto'],
  fmcg: ['^CNXFMCG', 'Nifty FMCG'], energy: ['^CNXENERGY', 'Nifty Energy'], metal: ['^CNXMETAL', 'Nifty Metal'], realty: ['^CNXREALTY', 'Nifty Realty'], infra: ['^CNXINFRA', 'Nifty Infrastructure'],
};
const US_SECTOR: Record<string, [string, string]> = {
  Technology: ['XLK', 'US Technology'], 'Financial Services': ['XLF', 'US Financials'], Healthcare: ['XLV', 'US Healthcare'], Energy: ['XLE', 'US Energy'],
  'Consumer Cyclical': ['XLY', 'US Consumer Discretionary'], 'Consumer Defensive': ['XLP', 'US Consumer Staples'], Industrials: ['XLI', 'US Industrials'],
  'Basic Materials': ['XLB', 'US Materials'], Utilities: ['XLU', 'US Utilities'], 'Real Estate': ['XLRE', 'US Real Estate'], 'Communication Services': ['XLC', 'US Communication'],
};

export function sectorIndex(ccy: string, sector?: string, industry?: string): { inst: Instrument; name: string } | null {
  let pair: [string, string] | undefined;
  if (ccy === 'INR') {
    const ind = industry ?? '';
    if (sector === 'Financial Services') pair = /bank/i.test(ind) ? IN_SECTOR.bank : undefined;
    else if (sector === 'Technology') pair = IN_SECTOR.it;
    else if (sector === 'Healthcare') pair = IN_SECTOR.pharma;
    else if (sector === 'Consumer Cyclical') pair = /auto/i.test(ind) ? IN_SECTOR.auto : undefined;
    else if (sector === 'Consumer Defensive') pair = IN_SECTOR.fmcg;
    else if (sector === 'Energy') pair = IN_SECTOR.energy;
    else if (sector === 'Basic Materials') pair = IN_SECTOR.metal;
    else if (sector === 'Real Estate') pair = IN_SECTOR.realty;
    else if (sector === 'Industrials' || sector === 'Utilities') pair = IN_SECTOR.infra;
  } else if (sector) pair = US_SECTOR[sector];
  return pair ? { inst: { id: pair[0], name: pair[1], source: 'yahoo', kind: 'INDEX' }, name: pair[1] } : null;
}

/* ---------------------------------------------------------------- the explanation */
export interface Row { label: string; stock: number | null; sector: number | null; market: number | null }
export interface Move { time: number; pct: number; news: NewsItem[] }
export interface Explanation {
  s1: number | null; m1: number | null; x1: number | null;
  marketName: string; sectorName: string | null; sector?: string;
  driver: 'market' | 'sector' | 'stock' | 'rates' | 'unknown';
  headline: string; rows: Row[]; business: string[]; themes: Theme[]; moves: Move[]; notes: string[];
}

const pctBack = (c: Candle[] | null | undefined, n: number): number | null => (c && c.length > n + 1 ? (c[c.length - 1].close / c[c.length - 1 - n].close - 1) * 100 : null);
const fmt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
const DEBT = /debt|bond|liquid|gilt|money market|duration|overnight|floater|credit risk|income|corporate|banking\s*(&|and)\s*psu/i;

export async function explain(inst: Instrument, have?: Candle[]): Promise<Explanation> {
  const isFund = inst.source === 'mf';
  const ccy = currencyOf(inst);
  const bench = benchmarkFor(ccy);
  const [c, bc] = await Promise.all([have ? Promise.resolve(have) : dailyCandles(inst), dailyCandles(bench)]);

  let sector: string | undefined, sectorIdx: ReturnType<typeof sectorIndex> = null, debt = false, category: string | null = null;
  const business: string[] = [];
  const notes: string[] = [];

  if (isFund) {
    const meta = await fundMeta(inst);
    category = meta?.category ?? null;
    debt = DEBT.test(`${category ?? ''} ${inst.name}`);
    if (!debt && /mid\s*cap/i.test(`${category ?? ''} ${inst.name}`) && !/large/i.test(category ?? '')) sectorIdx = { inst: { id: 'MID150BEES.NS', name: 'Nifty Midcap 150', source: 'yahoo', kind: 'ETF' }, name: 'Nifty Midcap 150' };
    if (category) notes.push(`Category: ${category.replace(/^.*?-\s*/, '')}.`);
  } else if (inst.source === 'yahoo' && inst.kind === 'EQUITY') {
    const g = growthOf(await fetchFundamentalsRaw(inst));
    sector = g.sector;
    sectorIdx = sectorIndex(ccy, g.sector, g.industry);
    if (g.sales !== null && g.profit !== null) {
      const s = g.sales * 100, p = g.profit * 100;
      if (s >= 5 && p < 0) business.push(`Sales are up ${s.toFixed(0)}% but profit is down ${Math.abs(p).toFixed(0)}%: costs or margins are squeezing it, which usually weighs on the price.`);
      else if (s < 0 && p < 0) business.push(`Both sales (${fmt(s)}) and profit (${fmt(p)}) are shrinking, which usually weighs on the price.`);
      else if (p >= 10 && s >= 5) business.push(`Sales (${fmt(s)}) and profit (${fmt(p)}) are both growing: real business momentum behind the price.`);
      else if (p >= 10 && s < 5) business.push(`Profit is up ${p.toFixed(0)}% even though sales grew only ${s.toFixed(0)}%: better margins or cost savings.`);
      else if (p > -5 && p < 10) business.push(`Profit is roughly flat (${fmt(p)}), so the price has been driven more by mood and valuation than by earnings.`);
    } else if (g.profit !== null) business.push(`Profit changed ${fmt(g.profit * 100)} in the latest quarter versus a year ago.`);
    if (g.margin !== null && g.margin < 0.05) business.push(`Its profit margin is thin (${(g.margin * 100).toFixed(1)}%), so small cost increases hit hard.`);
  }

  const xc = sectorIdx ? await dailyCandles(sectorIdx.inst) : null;
  const rows: Row[] = [['1 month', 21], ['3 months', 63], ['1 year', 252]].map(([label, n]) => ({
    label: label as string, stock: pctBack(c, n as number), sector: pctBack(xc, n as number), market: pctBack(bc, n as number),
  }));
  const s1 = rows[2].stock, m1 = rows[2].market, x1 = sectorIdx ? rows[2].sector : null;
  const mName = bench.name, xName = sectorIdx?.name ?? null;
  const nm = shortName(inst);

  let driver: Explanation['driver'] = 'unknown';
  let headline = 'Not enough price history for a year-long comparison yet.';
  if (s1 !== null && debt) {
    driver = 'rates';
    headline = `${nm} returned ${fmt(s1)} in a year. Bond funds earn mostly interest, so their return follows interest rates, not the stock market (${mName} ${m1 !== null ? fmt(m1) : '–'}).`;
  } else if (s1 !== null && m1 !== null) {
    if (x1 !== null && xName) {
      if (Math.abs(s1 - x1) <= 8) {
        driver = Math.abs(x1 - m1) >= 8 ? 'sector' : 'market';
        headline = driver === 'sector' ? `Mostly a sector story. ${xName} is ${fmt(x1)} over the year and ${nm} (${fmt(s1)}) has moved with it, while ${mName} is ${fmt(m1)}.`
          : `Mostly moving with the market. ${nm} is ${fmt(s1)}, its sector ${fmt(x1)} and ${mName} ${fmt(m1)}: all three are close.`;
      } else {
        driver = 'stock';
        headline = `Mostly specific to ${nm}. Its sector (${xName}) is ${fmt(x1)} and ${mName} ${fmt(m1)}, but ${nm} is ${fmt(s1)}, ${s1 > x1 ? 'well ahead of' : 'well behind'} its sector.`;
      }
    } else if (Math.abs(s1 - m1) <= 8) {
      driver = 'market';
      headline = `Mostly moving with the market: ${nm} is ${fmt(s1)} and ${mName} ${fmt(m1)}.`;
    } else {
      driver = 'stock';
      headline = `Mostly specific to ${nm}: it is ${fmt(s1)} while ${mName} is ${fmt(m1)} (${s1 > m1 ? 'ahead by' : 'behind by'} ${Math.abs(s1 - m1).toFixed(0)} points).`;
    }
  }
  const r3 = rows[1].stock, r1m = rows[0].stock;
  if (s1 !== null && r3 !== null && r1m !== null && Math.abs(r3) > 3) {
    notes.push(`Lately: ${fmt(r3)} over 3 months and ${fmt(r1m)} over the last month${(s1 > 0) !== (r3 > 0) ? ', a change of direction from the full year' : ''}.`);
  }

  // what the headlines are about, and what was in the news on the biggest-move days
  // bond funds follow interest rates, so the relevant news is about the RBI and bond yields rather than the fund itself
  const news = debt ? await pull(ccy === 'INR' ? 'RBI repo rate bond yields' : 'Federal Reserve interest rates bond yields', ccy === 'INR' ? 'IN' : 'US') : await fetchNews(inst, 60);
  if (debt) notes.push('The headlines below are about interest rates in general, because that is what moves bond funds.');
  const themes = themesOf(news);
  let moves: Move[] = [];
  if (c && c.length > 40 && !debt) {
    const tail = c.slice(-90);
    const ch = tail.slice(1).map((k, i) => ({ time: k.time, pct: (k.close / tail[i].close - 1) * 100 }));
    const picked: { time: number; pct: number }[] = [];
    for (const m of [...ch].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))) {
      if (Math.abs(m.pct) < (isFund ? 2 : 3)) break;
      if (picked.every((p) => Math.abs(p.time - m.time) > 5 * 86400)) picked.push(m);
      if (picked.length === 2) break;
    }
    moves = await Promise.all(picked.sort((a, b) => b.time - a.time).map(async (m) => ({ ...m, news: await fetchNewsAround(inst, m.time, 3) })));
  }
  return { s1, m1, x1, marketName: mName, sectorName: xName, sector, driver, headline, rows, business, themes, moves, notes };
}
