import { fetchBoard, currencyOf } from './data';
import { themesOf } from './explain';
import { fetchNews, pull, type NewsItem } from './news';
import { benchmarkFor } from './portfolio';
import type { Instrument } from './types';

export interface WhyNow { lines: string[]; news: NewsItem[] }

const cache = new Map<string, { at: number; why: WhyNow }>();
const sg = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;

/**
 * A quick, honest answer to "why is this up / down today?": how it compares with the market, and what the latest
 * headlines are about. These are likely reasons, not proof; the full breakdown lives in the "Why it moved" card.
 */
export async function whyNow(inst: Instrument, chg: number | null): Promise<WhyNow> {
  const hit = cache.get(inst.id);
  if (hit && Date.now() - hit.at < 5 * 60000) return hit.why;

  const lines: string[] = [];
  const up = (chg ?? 0) >= 0;
  const bench = benchmarkFor(currencyOf(inst));
  const isIndex = inst.kind === 'INDEX' || inst.id.startsWith('^');
  const broad = isIndex || inst.kind === 'CURRENCY' || inst.kind === 'FUTURE';
  const [board, items] = await Promise.all([
    isIndex || inst.id === bench.id ? Promise.resolve({}) : fetchBoard([bench.id]),
    (broad ? pull(`${inst.name} market`, currencyOf(inst) === 'INR' ? 'IN' : 'US') : fetchNews(inst, 12)).catch(() => [] as NewsItem[]),
  ]);

  if (chg !== null) {
    const bm = (board as Record<string, { chg: number }>)[bench.id]?.chg;
    if (bm !== undefined) {
      if (Math.abs(bm) < 0.3) lines.push(`${bench.name} is flat today (${sg(bm)}), so this move is about ${inst.kind === 'CRYPTO' ? 'the coin' : 'the stock'} itself, not the whole market.`);
      else if (Math.sign(bm) === Math.sign(chg)) lines.push(Math.abs(chg) > Math.abs(bm) + 1
        ? `The whole market is ${bm > 0 ? 'up' : 'down'} (${bench.name} ${sg(bm)}), and this is moving ${up ? 'even more' : 'harder'} at ${sg(chg)}.`
        : `It is moving with the market: ${bench.name} is ${sg(bm)} too.`);
      else lines.push(`It is going against the market: ${bench.name} is ${sg(bm)} while this is ${sg(chg)}. That points to something specific to it.`);
    } else if (isIndex) lines.push(`${inst.name} is ${up ? 'up' : 'down'} ${Math.abs(chg).toFixed(2)}% today. Broad index moves usually come from its biggest stocks, global markets, oil, currency or interest-rate news.`);
    if (Math.abs(chg) >= 5) lines.push('A move this big in one day usually means news: results, a big order, a rating change or a large investor buying or selling.');
  }

  // headlines from the last 3 days (a week if it is quiet), those that match the direction of the move first
  const fresh = (days: number) => items.filter((n) => !n.time || n.time >= Date.now() - days * 86400000);
  const recent = fresh(3).length >= 2 ? fresh(3) : fresh(7);
  const same = recent.filter((n) => n.mood === (up ? 1 : -1));
  const news = [...same, ...recent.filter((n) => !same.includes(n))].slice(0, 3);
  const theme = themesOf(recent, 7)[0];
  if (theme) lines.push(`In the news: ${theme.label.toLowerCase()}. ${theme.effect}`);
  if (!news.length) lines.push('No fresh headline found. Moves without news often come from money flows or the sector.');

  const why = { lines, news };
  cache.set(inst.id, { at: Date.now(), why });
  return why;
}
