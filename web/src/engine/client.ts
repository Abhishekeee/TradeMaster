import type { Analysis, BacktestResult, Candle, Signal, StrategyOpts, StrategyResult } from '../types';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let seq = 0;
const waiting = new Map<number, (v: any) => void>(); // eslint-disable-line @typescript-eslint/no-explicit-any
const progress = new Map<number, (p: number) => void>();
worker.onmessage = (ev) => {
  const d = ev.data;
  if (d.kind === 'progress') { progress.get(d.reqId)?.(d.p); return; }
  const r = waiting.get(d.reqId);
  if (r) { waiting.delete(d.reqId); progress.delete(d.reqId); r(d); }
};

export function runAnalysis(candles: Candle[], signals = true) {
  return new Promise<{ analysis: Analysis | null; signals: Signal[] }>((resolve) => {
    const reqId = ++seq;
    waiting.set(reqId, resolve);
    worker.postMessage({ reqId, candles, signals });
  });
}

export function runBacktest(candles: Candle[], horizon: number, minScore: number, onProgress: (p: number) => void) {
  return new Promise<BacktestResult | null>((resolve) => {
    const reqId = ++seq;
    progress.set(reqId, onProgress);
    waiting.set(reqId, (d) => resolve(d.result));
    worker.postMessage({ kind: 'backtest', reqId, candles, horizon, minScore, step: 3 });
  });
}

export function runStrategy(candles: Candle[], opts: StrategyOpts, onProgress: (p: number) => void) {
  return new Promise<StrategyResult | null>((resolve) => {
    const reqId = ++seq;
    progress.set(reqId, onProgress);
    waiting.set(reqId, (d) => resolve(d.result));
    worker.postMessage({ kind: 'strategy', reqId, candles, opts });
  });
}
