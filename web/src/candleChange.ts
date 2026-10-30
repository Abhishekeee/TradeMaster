import { TF_SEC, type Candle } from './types';

export interface CandleChange { px: number; ch: number; prev: number; open: number; closed: boolean }

/**
 * Change of the candle being drawn: its price now against the close of the candle before it (as TradingView shows it).
 * `closed` is true when the session is over and the timeframe is intraday. Then the last 15m, 30m and 1h candles of the day
 * all start at the same moment (e.g. 15:15 on NSE), so their changes come out the same and say nothing about the timeframe.
 * `sessionEnd` is the close of the latest session in unix seconds, for markets that close each day.
 */
export function candleChange(c: Candle[], tf: string, sessionEnd?: number, nowSec = Date.now() / 1000): CandleChange | null {
  if (c.length < 2) return null;
  const a = c[c.length - 1], b = c[c.length - 2], sec = TF_SEC[tf] ?? 0;
  let end = sessionEnd;
  if (end && end - a.time >= 86400) end -= Math.floor((end - a.time) / 86400) * 86400;   // Yahoo may already report the next session's close
  const closed = !!end && sec > 0 && sec < 86400 && nowSec >= end && a.time < end;
  return { px: a.close, ch: ((a.close - b.close) / b.close) * 100, prev: b.close, open: a.open, closed };
}
