import { useEffect, useRef, useState } from 'react';
import { fetchBoard, fetchCandles, fetchDaily, type Board } from './data';
import { CATEGORIES, type MarketId } from './markets';
import { IN_LARGE, US_LARGE } from './portfolioAlternatives';
import { pull, type NewsItem } from './news';

export interface Tile { id: string; name: string }

/** The big numbers at the top of Home, per market. */
export const HOME_INDICES: Record<MarketId, Tile[]> = {
  IN: [{ id: '^NSEI', name: 'Nifty 50' }, { id: '^BSESN', name: 'Sensex' }, { id: '^NSEBANK', name: 'Bank Nifty' }, { id: '^CNXIT', name: 'Nifty IT' }, { id: '^CNXAUTO', name: 'Nifty Auto' }, { id: '^CNXPHARMA', name: 'Nifty Pharma' }, { id: '^INDIAVIX', name: 'India VIX' }],
  US: [{ id: '^GSPC', name: 'S&P 500' }, { id: '^IXIC', name: 'Nasdaq' }, { id: '^DJI', name: 'Dow Jones' }, { id: '^RUT', name: 'Russell 2000' }, { id: '^VIX', name: 'VIX' }],
  CRYPTO: [{ id: 'BTCUSDT', name: 'Bitcoin' }, { id: 'ETHUSDT', name: 'Ethereum' }, { id: 'SOLUSDT', name: 'Solana' }, { id: 'BNBUSDT', name: 'BNB' }, { id: 'XRPUSDT', name: 'XRP' }],
  GLOBAL: [{ id: 'GC=F', name: 'Gold' }, { id: 'SI=F', name: 'Silver' }, { id: 'CL=F', name: 'Crude oil' }, { id: 'USDINR=X', name: 'USD / INR' }, { id: 'EURUSD=X', name: 'EUR / USD' }, { id: 'DX=F', name: 'Dollar index' }],
  ALL: [{ id: '^NSEI', name: 'Nifty 50' }, { id: '^BSESN', name: 'Sensex' }, { id: '^GSPC', name: 'S&P 500' }, { id: '^IXIC', name: 'Nasdaq' }, { id: '^FTSE', name: 'FTSE 100' }, { id: '^N225', name: 'Nikkei 225' }, { id: 'BTCUSDT', name: 'Bitcoin' }],
};

/** Sector scoreboards. India has its own sector indices; the US uses the standard sector funds. */
export const SECTORS: Partial<Record<MarketId, Tile[]>> = {
  IN: [{ id: '^NSEBANK', name: 'Banks' }, { id: '^CNXIT', name: 'IT' }, { id: '^CNXPHARMA', name: 'Pharma' }, { id: '^CNXAUTO', name: 'Auto' }, { id: '^CNXFMCG', name: 'FMCG' }, { id: '^CNXENERGY', name: 'Energy' }, { id: '^CNXMETAL', name: 'Metals' }, { id: '^CNXREALTY', name: 'Realty' }, { id: '^CNXINFRA', name: 'Infrastructure' }, { id: '^CNXPSUBANK', name: 'PSU banks' }],
  US: [{ id: 'XLK', name: 'Technology' }, { id: 'XLF', name: 'Financials' }, { id: 'XLV', name: 'Healthcare' }, { id: 'XLE', name: 'Energy' }, { id: 'XLY', name: 'Consumer discretionary' }, { id: 'XLP', name: 'Consumer staples' }, { id: 'XLI', name: 'Industrials' }, { id: 'XLB', name: 'Materials' }, { id: 'XLU', name: 'Utilities' }, { id: 'XLRE', name: 'Real estate' }, { id: 'XLC', name: 'Communication' }],
};
SECTORS.ALL = SECTORS.IN;

/** Which names the "movers" lists look through. */
export function moversUniverse(m: MarketId): string[] {
  const ids = (c: string) => CATEGORIES.find((x) => x.id === c)?.items.map((i) => i.id) ?? [];
  if (m === 'US') return US_LARGE;
  if (m === 'CRYPTO') return ids('crypto');
  if (m === 'GLOBAL') return [...ids('com'), ...ids('fx'), ...ids('idx')].filter((v, i, a) => a.indexOf(v) === i);
  if (m === 'ALL') return [...IN_LARGE, ...US_LARGE];
  return IN_LARGE;
}

export const NEWS_QUERY: Record<MarketId, { q: string; region: 'IN' | 'US' }> = {
  IN: { q: 'Sensex Nifty stock market today', region: 'IN' }, US: { q: 'Wall Street stock market today', region: 'US' },
  CRYPTO: { q: 'bitcoin crypto market', region: 'US' }, GLOBAL: { q: 'gold crude oil forex markets', region: 'US' }, ALL: { q: 'Sensex Nifty stock market today', region: 'IN' },
};

/** Live board for a list of symbols, refreshed while the page is open. */
export function useBoard(ids: string[], everyMs = 20000) {
  const [board, setBoard] = useState<Record<string, Board>>({});
  const [updated, setUpdated] = useState(0);
  const key = ids.join();
  useEffect(() => {
    let dead = false, t: number | undefined;
    const run = async () => {
      if (!document.hidden) {
        const b = await fetchBoard(ids);
        if (!dead && Object.keys(b).length) { setBoard((p) => ({ ...p, ...b })); setUpdated(Date.now()); }
      }
      if (!dead) t = window.setTimeout(run, everyMs);
    };
    run();
    return () => { dead = true; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { board, updated };
}

/** About three months of closes for small trend lines. */
export function useSparks(ids: string[]) {
  const [sp, setSp] = useState<Record<string, number[]>>({});
  const asked = useRef(new Set<string>());
  const key = ids.join();
  useEffect(() => {
    ids.filter((i) => !asked.current.has(i)).forEach(async (id) => {
      asked.current.add(id);
      const c = /USDT$/.test(id) ? await fetchCandles({ id, name: id, source: 'binance', kind: 'CRYPTO' }, '1D', 70) : await fetchDaily(id, '3mo');
      if (c) setSp((p) => ({ ...p, [id]: c.map((k) => k.close) }));
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return sp;
}

export function useMarketNews(market: MarketId) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  useEffect(() => {
    let dead = false;
    setItems(null);
    const { q, region } = NEWS_QUERY[market];
    pull(q, region).then((r) => { if (!dead) setItems(r); });
    return () => { dead = true; };
  }, [market]);
  return items;
}
