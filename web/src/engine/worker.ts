import { analyze, scanCandles, backtest, simulate } from './patterns.js';
import type { Candle } from '../types';

// Runs pattern analysis off the UI thread so zooming/panning never stalls.
self.onmessage = (ev: MessageEvent) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  const m = ev.data;
  try { run(m, post); } catch {
    // too little history (a new listing) or odd data: answer anyway so the page never waits forever
    post({ reqId: m.reqId, failed: true, result: null, analysis: null, signals: [] });
  }
};

function run(m: any, post: (m: unknown) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (m.kind === 'backtest') {
    const result = backtest(m.candles as Candle[], {
      horizon: m.horizon, minScore: m.minScore, step: m.step,
      onProgress: (p: number) => post({ kind: 'progress', reqId: m.reqId, p }),
    });
    post({ reqId: m.reqId, result });
    return;
  }
  if (m.kind === 'strategy') {
    const result = simulate(m.candles as Candle[], { ...m.opts, onProgress: (p: number) => post({ kind: 'progress', reqId: m.reqId, p }) });
    post({ reqId: m.reqId, result });
    return;
  }
  const full = analyze(m.candles);
  // drop the large EMA arrays; the chart computes its own
  const a = full && (({ ema20, ema50, ...rest }) => rest)(full);
  post({ reqId: m.reqId, analysis: a, signals: m.signals && a ? scanCandles(m.candles, 55) : [] });
}
