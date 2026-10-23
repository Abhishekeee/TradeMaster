import { API, currencyOf } from './data';
import { shortName } from './portfolio';
import type { Instrument } from './types';

export interface NewsItem { title: string; source: string; link: string; time: number; mood: -1 | 0 | 1 }

// A quick keyword read of the headline, not an understanding of it. It is shown as a hint only.
const POS = /\b(surges?|surged|rall(?:y|ies|ied)|jumps?|jumped|soars?|soared|gains?|gained|record high|upgrad(?:e|es|ed)|beats? estimates|profit (?:rises|jumps|up|growth)|strong (?:results|growth|earnings)|bullish|buy rating|outperform\w*|order wins?|bags?|dividend|bonus|top pick|top performer)\b/i;
const NEG = /\b(falls?|fell|drops?|dropped|plunges?|plunged|slumps?|slumped|tumbles?|tumbled|crash\w*|downgrad(?:e|es|ed)|loss(?:es)?|probe|fraud|banned?|penalty|fined?|lawsuit|sell-?off|bearish|sell rating|underperform\w*|cuts? (?:target|forecast)|weak|declines?|declined|warning|default\w*|raid|resigns?|layoffs?|slips?|slipped)\b/i;
export const moodOf = (t: string): -1 | 0 | 1 => { const p = POS.test(t), n = NEG.test(t); return p && !n ? 1 : n && !p ? -1 : 0; };

const cache = new Map<string, { at: number; items: NewsItem[] }>();

/** What to search for: the fund's name, or the company's name plus "share" / "stock". */
export function newsQuery(inst: Instrument): string {
  if (inst.source === 'mf') return shortName(inst);
  const name = inst.name.split(' · ')[0].replace(/\b(ltd|limited|inc|corp|corporation|plc|co)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
  return `${/[a-z]{3,}/i.test(name) && name.toUpperCase() !== inst.id ? name : inst.id.replace(/\.(NS|BO)$/, '')} ${currencyOf(inst) === 'INR' ? 'share' : 'stock'}`;
}

export async function pull(q: string, region: 'IN' | 'US'): Promise<NewsItem[]> {
  try {
    const r = await fetch(`${API}/api/news?q=${encodeURIComponent(q)}&region=${region}`);
    if (!r.ok) return [];
    const doc = new DOMParser().parseFromString(await r.text(), 'text/xml');
    const seen = new Set<string>();
    const out: NewsItem[] = [];
    doc.querySelectorAll('item').forEach((it) => {
      const raw = it.querySelector('title')?.textContent?.trim() ?? '';
      const source = it.querySelector('source')?.textContent?.trim() ?? '';
      const title = source && raw.endsWith(' - ' + source) ? raw.slice(0, -(source.length + 3)) : raw;
      const link = it.querySelector('link')?.textContent?.trim() ?? '';
      const time = Date.parse(it.querySelector('pubDate')?.textContent ?? '') || 0;
      const key = title.toLowerCase().slice(0, 60);
      if (!title || !link || seen.has(key)) return;
      seen.add(key);
      out.push({ title, source, link, time, mood: moodOf(title) });
    });
    return out.sort((a, b) => b.time - a.time);
  } catch { return []; }
}

export async function fetchNews(inst: Instrument, limit = 10): Promise<NewsItem[]> {
  const hit = cache.get(inst.id);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.items.slice(0, limit);
  const region = currencyOf(inst) === 'INR' ? 'IN' : 'US';
  let items = await pull(newsQuery(inst), region);
  // a fund with few headlines: try its fund house instead
  if (items.length < 2 && inst.source === 'mf') items = await pull(shortName(inst).split(' ').slice(0, 2).join(' ') + ' mutual fund', region);
  cache.set(inst.id, { at: Date.now(), items });
  return items.slice(0, limit);
}

/** Headlines from the days around a date (a big price move), to see what was in the news then. */
export async function fetchNewsAround(inst: Instrument, whenSec: number, limit = 3): Promise<NewsItem[]> {
  const day = 86400000, t = whenSec * 1000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const items = await pull(`${newsQuery(inst)} after:${iso(t - day)} before:${iso(t + 2 * day)}`, currencyOf(inst) === 'INR' ? 'IN' : 'US');
  return items.slice(0, limit);
}

export function ago(ms: number): string {
  if (!ms) return '';
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m || 1} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} day${d > 1 ? 's' : ''} ago` : new Date(ms).toLocaleDateString();
}
