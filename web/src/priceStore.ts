import { useSyncExternalStore } from 'react';

/**
 * Latest price of every symbol we track, outside React state. Writers (live feeds) call setPrice on every tick;
 * components that show money (the Trade panel) subscribe with usePrices() and re-render by themselves about 15 times
 * a second, so a price tick does not have to re-render the whole page to reach a position's profit and loss.
 */
const current = new Map<string, number>();
const subs = new Set<() => void>();
let snapshot: Record<string, number> = {};
let timer: number | undefined;
const FLUSH_MS = 60;

export function setPrice(id: string, px: number) {
  if (!(px > 0) || current.get(id) === px) return;
  current.set(id, px);
  if (timer === undefined) {
    timer = window.setTimeout(() => {
      timer = undefined;
      snapshot = Object.fromEntries(current);   // a new object per flush, as useSyncExternalStore requires
      subs.forEach((f) => f());
    }, FLUSH_MS);
  }
}

export const usePrices = () => useSyncExternalStore(
  (f) => { subs.add(f); return () => { subs.delete(f); }; },
  () => snapshot,
);
