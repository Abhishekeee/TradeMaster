import { useCallback, useEffect, useRef, useState } from 'react';
import { currencyOf } from './data';
import type { Instrument } from './types';

export const FEE_DEFAULT = 0.0005; // 0.05% of order value, charged on entry and again on exit (adjustable in the account panel)
export const FEE_OLD = 0.001;       // rate used before fees became adjustable
export const START_CASH = 100000; // dollars

/**
 * The account ledger is always in US dollars. Instrument prices stay in their own currency (rupees for NSE stocks,
 * pounds for London, and so on) and are converted to dollars with the live rate, so a position's profit includes the
 * currency move too. The display currency chosen in the UI only changes how these dollar figures are shown.
 */
export interface Position {
  id: string; inst: Instrument; side: 'long' | 'short'; qty: number; entry: number; sl?: number; tp?: number; time: number;
  mult?: number; // contract multiplier (options = 100)
  ccy?: string;  // currency the price is quoted in
  fx?: number;   // USD per 1 unit of ccy when the position was opened
  trail?: number; // trailing stop distance in percent: the stop follows the price but never moves backwards
  feeIn?: number; // entry fee already paid, in USD
  rate?: number;  // fee rate this position was opened with
}
export interface Closed {
  id: string; inst: Instrument; side: 'long' | 'short'; qty: number; entry: number; exit: number;
  pnl: number;    // net profit after all fees, USD
  gross?: number; // profit before fees, USD
  fees?: number;  // entry + exit fees, USD
  reason: 'manual' | 'stop' | 'target'; time: number; exitTime: number; ccy?: string;
}
/** A limit or stop order waiting for its trigger price. */
export interface Order {
  id: string; inst: Instrument; side: 'long' | 'short'; kind: 'limit' | 'stop';
  trigger: number; amountUSD: number; sl?: number; tp?: number; trail?: number; time: number;
}
export interface Account { cash: number; deposits: number; positions: Position[]; history: Closed[]; feeRate?: number; orders?: Order[] }

const KEY = 'tm-paper';
const fresh = (): Account => ({ cash: START_CASH, deposits: START_CASH, positions: [], history: [], feeRate: FEE_DEFAULT });

function load(): Account {
  try { const a = JSON.parse(localStorage.getItem(KEY) || ''); if (a && typeof a.cash === 'number') return { ...a, feeRate: a.feeRate ?? FEE_DEFAULT }; } catch { /* ignore */ }
  return fresh();
}

export const multOf = (p: Position) => p.mult ?? 1;
export const rateOf = (p: Position) => p.rate ?? FEE_OLD;
/** Dollar cost basis of a position. */
export const costOf = (p: Position) => p.qty * multOf(p) * p.entry * (p.fx ?? 1);
/** Dollar profit at `price` (instrument currency) with `fxNow` USD per unit of the instrument currency. */
export const pnlOf = (p: Position, price: number, fxNow: number = p.fx ?? 1) => {
  const value = price * fxNow, basis = p.entry * (p.fx ?? 1);
  return (p.side === 'long' ? value - basis : basis - value) * p.qty * multOf(p);
};

/** Entry fee already paid for this position. */
export const feeInOf = (p: Position) => p.feeIn ?? costOf(p) * FEE_OLD;
/** Fee we expect to pay if the position is closed at `price`. */
export const exitFeeOf = (p: Position, price: number, fxNow: number = p.fx ?? 1) => p.qty * multOf(p) * price * fxNow * rateOf(p);
/** What you would actually walk away with if closed at `price`: profit after the entry fee and the exit fee. */
export const netPnl = (p: Position, price: number, fxNow: number = p.fx ?? 1) => pnlOf(p, price, fxNow) - feeInOf(p) - exitFeeOf(p, price, fxNow);

export function usePaper(usdPer: (ccy: string) => number) {
  const [acc, setAcc] = useState<Account>(load);
  const accRef = useRef(acc);
  accRef.current = acc;
  const fxRef = useRef(usdPer);
  fxRef.current = usdPer;
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(acc)); } catch { /* ignore */ } }, [acc]);

  const fxNow = useCallback((p: Position) => fxRef.current(p.ccy ?? 'USD'), []);

  const settle = (a: Account, p: Position, exit: number, reason: Closed['reason']): Account => {
    const fx = fxRef.current(p.ccy ?? 'USD');
    const gross = pnlOf(p, exit, fx);
    const feeOut = exitFeeOf(p, exit, fx);
    const fees = feeInOf(p) + feeOut;
    const closed: Closed = { id: p.id, inst: p.inst, side: p.side, qty: p.qty, entry: p.entry, exit, pnl: gross - fees, gross, fees, reason, time: p.time, exitTime: Date.now(), ccy: p.ccy };
    return { ...a, cash: a.cash + costOf(p) + gross - feeOut, positions: a.positions.filter((x) => x.id !== p.id), history: [closed, ...a.history].slice(0, 200) };
  };

  /** Pure: returns the account with the new position, or an error message. `amountUSD` is the money to put in, in dollars. */
  const build = (a: Account, inst: Instrument, side: 'long' | 'short', amountUSD: number, price: number, sl?: number, tp?: number, trail?: number): Account | string => {
    const mult = inst.lot ?? (inst.kind === 'OPTION' ? 100 : 1);
    const ccy = currencyOf(inst);
    const fx = fxRef.current(ccy);
    const rate = a.feeRate ?? FEE_DEFAULT;
    const feeIn = amountUSD * rate;
    const cost = amountUSD + feeIn;
    if (cost > a.cash + 1e-9) return 'Not enough cash. Add funds or reduce the amount.';
    const stop = sl ?? (trail ? price * (side === 'long' ? 1 - trail / 100 : 1 + trail / 100) : undefined);
    const pos: Position = { id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`, inst, side, qty: amountUSD / (price * fx * mult), entry: price, sl: stop, tp, trail, time: Date.now(), mult, ccy, fx, feeIn, rate };
    return { ...a, cash: a.cash - cost, positions: [pos, ...a.positions] };
  };

  const checkLevels = (side: 'long' | 'short', price: number, sl?: number, tp?: number, trail?: number): string | null => {
    if (sl !== undefined && (side === 'long' ? sl >= price : sl <= price)) return `Stop loss must be ${side === 'long' ? 'below' : 'above'} the entry price.`;
    if (tp !== undefined && (side === 'long' ? tp <= price : tp >= price)) return `Target must be ${side === 'long' ? 'above' : 'below'} the entry price.`;
    if (trail !== undefined && !(trail > 0 && trail < 50)) return 'Trailing stop must be between 0 and 50 percent.';
    return null;
  };

  const open = useCallback((inst: Instrument, side: 'long' | 'short', amountUSD: number, price: number, sl?: number, tp?: number, trail?: number): string | null => {
    if (!(amountUSD > 0) || !(price > 0)) return 'Enter an amount.';
    const bad = checkLevels(side, price, sl, tp, trail);
    if (bad) return bad;
    const r = build(accRef.current, inst, side, amountUSD, price, sl, tp, trail);
    if (typeof r === 'string') return r;
    setAcc((a) => { const n = build(a, inst, side, amountUSD, price, sl, tp, trail); return typeof n === 'string' ? a : n; });
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Limit: buy lower / sell higher than now. Stop: buy on a break above / sell on a break below.
   * Checked on every price tick; fills at the trigger (or better, if the price gapped through it).
   */
  const placeOrder = useCallback((inst: Instrument, side: 'long' | 'short', kind: 'limit' | 'stop', trigger: number, amountUSD: number, now: number, sl?: number, tp?: number, trail?: number): string | null => {
    if (!(amountUSD > 0)) return 'Enter an amount.';
    if (!(trigger > 0) || !(now > 0)) return 'Enter a trigger price.';
    const below = (side === 'long') === (kind === 'limit'); // limit buy and stop sell wait for a lower price
    if (below ? trigger >= now : trigger <= now) {
      return `A ${kind} ${side === 'long' ? 'buy' : 'sell'} needs a trigger ${below ? 'below' : 'above'} the current price (${now}).`;
    }
    const bad = checkLevels(side, trigger, sl, tp, trail);
    if (bad) return bad;
    if (amountUSD * (1 + (accRef.current.feeRate ?? FEE_DEFAULT)) > accRef.current.cash + 1e-9) return 'Not enough cash for this order right now.';
    const o: Order = { id: `o${Date.now()}${Math.random().toString(36).slice(2, 5)}`, inst, side, kind, trigger, amountUSD, sl, tp, trail, time: Date.now() };
    setAcc((a) => ({ ...a, orders: [o, ...(a.orders ?? [])] }));
    return null;
  }, []);

  const cancelOrder = useCallback((id: string) => setAcc((a) => ({ ...a, orders: (a.orders ?? []).filter((o) => o.id !== id) })), []);

  const close = useCallback((id: string, price: number) => {
    setAcc((a) => { const p = a.positions.find((x) => x.id === id); return p ? settle(a, p, price, 'manual') : a; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Feed a fresh price. Fills pending orders, ratchets trailing stops, and closes positions on their stop or target.
   * Returns the same object when nothing changes, so React does not re-render on every tick.
   */
  const onPrice = useCallback((instId: string, price: number) => {
    setAcc((a) => {
      let next = a;
      // 1. pending orders
      for (const o of a.orders ?? []) {
        if (o.inst.id !== instId) continue;
        const below = (o.side === 'long') === (o.kind === 'limit');
        const hit = below ? price <= o.trigger : price >= o.trigger;
        if (!hit) continue;
        const fill = o.kind === 'limit' ? (below ? Math.min(price, o.trigger) : Math.max(price, o.trigger)) : (below ? Math.min(price, o.trigger) : Math.max(price, o.trigger));
        const r = build({ ...next, orders: (next.orders ?? []).filter((x) => x.id !== o.id) }, o.inst, o.side, o.amountUSD, fill, o.sl, o.tp, o.trail);
        next = typeof r === 'string' ? { ...next, orders: (next.orders ?? []).filter((x) => x.id !== o.id) } : r; // not enough cash: the order is dropped
      }
      // 2. positions: stop / target first, then move trailing stops
      for (const p of next.positions) {
        if (p.inst.id !== instId) continue;
        const stop = p.sl !== undefined && (p.side === 'long' ? price <= p.sl : price >= p.sl);
        const tgt = p.tp !== undefined && (p.side === 'long' ? price >= p.tp : price <= p.tp);
        if (stop) { next = settle(next, p, p.sl as number, 'stop'); continue; }
        if (tgt) { next = settle(next, p, p.tp as number, 'target'); continue; }
        if (p.trail) {
          const cand = price * (p.side === 'long' ? 1 - p.trail / 100 : 1 + p.trail / 100);
          if (p.sl === undefined || (p.side === 'long' ? cand > p.sl : cand < p.sl)) {
            next = { ...next, positions: next.positions.map((x) => (x.id === p.id ? { ...x, sl: cand } : x)) };
          }
        }
      }
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLevels = useCallback((id: string, sl?: number, tp?: number) => {
    setAcc((a) => ({ ...a, positions: a.positions.map((p) => (p.id === id ? { ...p, sl, tp } : p)) }));
  }, []);
  const deposit = useCallback((usd: number) => { if (usd > 0) setAcc((a) => ({ ...a, cash: a.cash + usd, deposits: a.deposits + usd })); }, []);
  const reset = useCallback(() => setAcc(fresh()), []);
  const setFeeRate = useCallback((r: number) => setAcc((a) => ({ ...a, feeRate: r })), []);
  /** Convert an amount quoted in the instrument's own currency (for example rupees) into dollars. */
  const nativeToUSD = useCallback((inst: Instrument, x: number) => x * fxRef.current(currencyOf(inst)), []);

  return { acc, open, placeOrder, cancelOrder, close, onPrice, setLevels, deposit, reset, fxNow, nativeToUSD, setFeeRate };
}
