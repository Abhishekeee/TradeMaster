import { useCallback, useEffect, useRef, useState } from 'react';

export interface Currency { code: string; name: string }
export const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar' }, { code: 'INR', name: 'Indian Rupee' }, { code: 'EUR', name: 'Euro' }, { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' }, { code: 'AUD', name: 'Australian Dollar' }, { code: 'CAD', name: 'Canadian Dollar' }, { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SGD', name: 'Singapore Dollar' }, { code: 'AED', name: 'UAE Dirham' }, { code: 'CNY', name: 'Chinese Yuan' }, { code: 'HKD', name: 'Hong Kong Dollar' },
];

// Units of currency per 1 USD. Only used if live rates can't be loaded, and flagged as approximate in the UI.
const FALLBACK: Record<string, number> = { USD: 1, INR: 88, EUR: 0.92, GBP: 0.78, JPY: 150, AUD: 1.5, CAD: 1.37, CHF: 0.88, SGD: 1.33, AED: 3.6725, CNY: 7.2, HKD: 7.8 };
const KEY = 'tm-fx';
const MAX_AGE = 15 * 60 * 1000;

/** Yahoo quotes pence for London stocks ("GBp"): treat as 1/100 of a pound. */
const norm = (code: string) => (code === 'GBp' || code === 'GBX' ? 'GBP' : code);
const scale = (code: string) => (code === 'GBp' || code === 'GBX' ? 0.01 : 1);

async function fetchRate(code: string): Promise<number | null> {
  try {
    const r = await fetch(`/api/yahoo/v8/finance/chart/USD${code}=X?interval=1d&range=1d`);
    if (!r.ok) return null;
    const p = (await r.json())?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === 'number' && p > 0 ? p : null;
  } catch { return null; }
}

interface Stored { at: number; rates: Record<string, number> }
function load(): Stored | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.rates) return s; } catch { /* ignore */ }
  return null;
}

export function useFx() {
  const [rates, setRates] = useState<Record<string, number>>(() => load()?.rates ?? FALLBACK);
  const [updated, setUpdated] = useState<number>(() => load()?.at ?? 0);
  const ref = useRef(rates);
  ref.current = rates;

  const refresh = useCallback(async () => {
    const codes = CURRENCIES.map((c) => c.code).filter((c) => c !== 'USD');
    const got = await Promise.all(codes.map(async (c) => [c, await fetchRate(c)] as const));
    const next: Record<string, number> = { ...ref.current, USD: 1 };
    let any = false;
    got.forEach(([c, v]) => { if (v) { next[c] = v; any = true; } });
    if (!any) return;
    const at = Date.now();
    setRates(next); setUpdated(at);
    try { localStorage.setItem(KEY, JSON.stringify({ at, rates: next })); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (Date.now() - updated > MAX_AGE) refresh();
    const t = setInterval(refresh, MAX_AGE);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Make sure a currency that is not in the switcher (for example a position in SEK) has a rate. */
  const ensure = useCallback(async (code: string) => {
    const c = norm(code);
    if (ref.current[c]) return;
    const v = await fetchRate(c);
    if (v) setRates((r) => ({ ...r, [c]: v }));
  }, []);

  /** Units of `code` per 1 USD. */
  const perUSD = useCallback((code: string) => ref.current[norm(code)] ?? 1, []);
  /** USD value of 1 unit of `code` (the factor used to convert instrument prices into the dollar ledger). */
  const usdPer = useCallback((code: string) => scale(code) / (ref.current[norm(code)] ?? 1), []);

  return { rates, perUSD, usdPer, ensure, updated, live: updated > 0 && Date.now() - updated < MAX_AGE * 2, refresh };
}

/** Everything the UI needs to show dollar-ledger values in the chosen display currency. */
export function makeCurrency(code: string, rate: number) {
  let nf: Intl.NumberFormat;
  try { nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: code }); } catch { nf = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  return {
    code, rate,
    money: (usd: number) => nf.format(usd * rate),
    signed: (usd: number) => `${usd * rate >= 0 ? '+' : '−'}${nf.format(Math.abs(usd * rate))}`,
    toUSD: (x: number) => x / rate,
    fromUSD: (usd: number) => usd * rate,
  };
}
export type Cur = ReturnType<typeof makeCurrency>;
