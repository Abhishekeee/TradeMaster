import { useEffect, useMemo, useState } from 'react';
import { combine, fundamentals, fundCheck, technical, type Combined, type Fundamental, type FundCheck, type Technical } from './analysis';
import { benchmarkFor, type Stat } from './portfolio';
import { fetchFundamentalsRaw, fundMeta, type FundamentalsRaw, type FundMeta } from './data';
import type { Candle } from './types';

export interface Deep {
  tech: Technical | null;
  company: Fundamental | null;   // stocks
  fund: FundCheck | null;        // mutual funds
  combined: Combined;
  quality: number | null;
  /** false while the company or fund details are still being fetched */
  ready: boolean;
}

/** Technical analysis for every holding, plus fundamentals (stocks) or a fund check-up (mutual funds). */
export function useDeep(stats: Stat[], candles: Record<string, Candle[]>): Record<string, Deep> {
  const [raw, setRaw] = useState<Record<string, FundamentalsRaw>>({});
  const [meta, setMeta] = useState<Record<string, FundMeta | null>>({});
  const key = stats.map((s) => s.h.inst.id).join();

  useEffect(() => {
    let dead = false;
    stats.forEach((s) => {
      const i = s.h.inst;
      if (i.source === 'mf') { if (!(i.id in meta)) fundMeta(i).then((m) => { if (!dead) setMeta((p) => ({ ...p, [i.id]: m })); }); }
      else if (i.source === 'yahoo' && i.kind === 'EQUITY' && !raw[i.id]) fetchFundamentalsRaw(i).then((r) => { if (!dead) setRaw((p) => ({ ...p, [i.id]: r })); });
    });
    return () => { dead = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const out: Record<string, Deep> = {};
    for (const s of stats) {
      const i = s.h.inst, c = candles[i.id];
      const tech = c ? technical(c) : null;
      let company: Fundamental | null = null, fund: FundCheck | null = null, ready = true;
      if (i.source === 'mf') {
        if (!(i.id in meta)) ready = false;
        if (c) fund = fundCheck(c, candles[benchmarkFor('INR').id], meta[i.id] ?? null, s.debt);
      } else if (i.source === 'yahoo' && i.kind === 'EQUITY') {
        if (!raw[i.id]) ready = false; else company = fundamentals(raw[i.id], s.price);
      }
      const quality = company?.score ?? fund?.score ?? null;
      out[s.h.id] = { tech, company, fund, quality, ready, combined: combine(quality, tech?.score ?? null, i.source === 'mf') };
    }
    return out;
  }, [stats, candles, raw, meta]);
}
