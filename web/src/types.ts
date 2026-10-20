export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface Line { dash: boolean; pts: { time: number; price: number }[] }
export interface Pattern {
  id: string; name: string; kind: 'chart' | 'candle'; bias: number; eff: number; score: number;
  desc: string; confirm: string; lines: Line[]; time?: number | null;
}
export interface Analysis { charts: Pattern[]; candles: Pattern[]; bias: number; label: string; reasons: string[]; rsi: number; trend: number }
export interface Signal { time: number; id: string; name: string; bias: number; score: number }
export interface MtfRow { label: string; top?: string; score?: number; verdict?: string; bias?: number }

export const TFS: [string, string][] = [['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['1h', '1h'], ['4h', '4h'], ['1D', '1d'], ['1W', '1w']];
export const TF_SEC: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1D': 86400, '1W': 604800 };
export const SYMS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'TRXUSDT', 'DOTUSDT', 'LTCUSDT', 'MATICUSDT', 'SHIBUSDT'];

export const cls = (b: number) => (b > 0.1 ? 'up' : b < -0.1 ? 'down' : 'neu');
export const word = (b: number) => (b > 0.1 ? 'Bullish' : b < -0.1 ? 'Bearish' : 'Neutral');
export const fmt = (x: number) => (x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(3) : x.toPrecision(4));

export interface BtStat { name: string; dir?: number; n: number; wins?: number; winRate: number; avgRet: number; edge: number }
export interface BacktestResult {
  H: number; Hc: number; minScore: number; bars: number; baseUp: number; baseUpC: number;
  closest: BtStat; bias: BtStat; charts: BtStat[]; candles: BtStat[];
  recent: { name: string; dir: number; score: number; time: number; ret: number; win: boolean; group: string }[];
}

export interface Instrument { id: string; name: string; source: 'binance' | 'yahoo' | 'nse'; kind?: string; lot?: number }

export interface Quote { price: number; chg: number }

export interface Advice {
  action: "BUY" | "SELL" | "WAIT"; conf: number; level: string; setup: string | null;
  entry: number; sl: number | null; tp1: number | null; tp2: number | null; risk: number; riskPct: number; rr: number;
  reasons: string[]; warnings: string[]; vote: number;
  history: { name: string; n: number; winRate: number; edge: number; avgRet: number } | null;
  option: { type: "CALL" | "PUT"; strike: number; expiry: string; note: string } | null;
}

export interface StrategyOpts { target: 'tp1' | 'tp2'; minConf: number; tf: string; feePct?: number; riskPct?: number }
export interface StrategyTrade { time: number; exitTime: number; dir: number; entry: number; exit: number; sl: number; tp: number; reason: 'stop' | 'target' | 'time'; r: number; pct: number; conf: number; setup: string | null }
export interface StrategyResult {
  trades: StrategyTrade[]; curve: { t: number; v: number }[]; n: number; from: number; to: number;
  recentN: number; recentAvgR: number; winRate: number; avgR: number; profitFactor: number; returnPct: number; maxDrawdown: number; buyHold: number; stops: number; targets: number;
}
