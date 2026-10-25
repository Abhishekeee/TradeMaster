import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChartView, { type ChartApi } from './components/ChartView';
import Menu from './components/Menu';
import Nav from './components/Nav';
import AccountMenu from './components/AccountMenu';
import Panel from './components/Panel';
import Trade, { type Prefill } from './components/Trade';
import Alerts from './components/Alerts';
import Stats from './components/Stats';
import Advisor from './components/Advisor';
import IndicatorsMenu from './components/IndicatorsMenu';
import Tour, { type TourStep } from './components/Tour';
import type { PreviewLine } from './components/LevelEditor';
import { advise, levels as srLevels } from './engine/patterns.js';
import Pane from './components/Pane';
import { useAlerts } from './alerts';
import { useWatchlist } from './watchlist';
import Markets from './components/Markets';
import { usePaper, netPnl } from './paper';
import { CURRENCIES, makeCurrency, useFx } from './fx';
import SymbolSearch from './components/SymbolSearch';
import { DEFAULT_INST, MARKETS, inMarket, type MarketId } from './markets';
import { currencyOf, demoData, fetchCandles, fetchHistory, openFeed, openTicks, type FeedStatus } from './data';
import { setPrice as pushPrice } from './priceStore';
import LiveBar from './components/LiveBar';
import Timeframe from './components/Timeframe';
import { runAnalysis, runBacktest, runStrategy } from './engine/client';
import { TFS, cls, fmt, word, type Advice, type Analysis, type BacktestResult, type StrategyResult, type Candle, type Instrument, type MtfRow, type Signal } from './types';

const HIGHER: Record<string, string> = { '1m': '15m', '5m': '1h', '15m': '1h', '1h': '4h', '4h': '1D', '1D': '1W' };

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('tm') || '{}'); } catch { return {}; }
}

export default function App() {
  const prefs = useMemo(loadPrefs, []);
  // India is the default market. Someone who has never chosen one starts on an Indian stock, not on whatever they last viewed.
  // A saved choice wins: a chart opened from the portfolio page keeps its market, or falls back to All markets.
  const start = useMemo(() => {
    const saved: Instrument | undefined = prefs.inst;
    if (MARKETS.some((m) => m.id === prefs.market)) {
      const m: MarketId = prefs.market;
      return saved ? { market: (inMarket(saved, m) ? m : 'ALL') as MarketId, inst: saved } : { market: m, inst: DEFAULT_INST[m] };
    }
    return { market: 'IN' as MarketId, inst: saved && inMarket(saved, 'IN') ? saved : DEFAULT_INST.IN };
  }, [prefs]);
  const [market, setMarketState] = useState<MarketId>(start.market);
  const [inst, setInst] = useState<Instrument>(start.inst);
  const setMarket = useCallback((m: MarketId) => {
    setMarketState(m);
    setInst((cur) => (inMarket(cur, m) ? cur : DEFAULT_INST[m]));
  }, []);
  const symbol = inst.id;
  const [tf, setTf] = useState<string>(TFS.some((t) => t[0] === prefs.tf) ? prefs.tf : '1h');
  const [type, setType] = useState<'candles' | 'line' | 'area'>('candles');
  const [tg, setTg] = useState({ sig: true, e20: true, e50: true, vol: true, sr: false, bb: false, vwap: false, rsi: false, macd: false });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'chart' | 'candle'>('chart');
  const [bias, setBias] = useState('all');
  const [sort, setSort] = useState<'score' | 'name'>('score');
  const [q, setQ] = useState('');
  const [feed, setFeed] = useState<FeedStatus>('off');
  const [lastTick, setLastTick] = useState(0);
  const [demo, setDemo] = useState(false);
  const [price, setPrice] = useState<{ px: number; ch: number } | null>(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  const [theme, setTheme] = useState<'dark' | 'light'>(prefs.theme === 'light' ? 'light' : 'dark');
  const [showMarkets, setShowMarkets] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [showMenu, setShowMenuState] = useState<boolean>(() => { try { return localStorage.getItem('tm-menu') === '1'; } catch { return false; } });
  const [showSide, setShowSideState] = useState<boolean>(() => { try { return localStorage.getItem('tm-side') !== '0'; } catch { return true; } });
  const setShowSide = useCallback((v: boolean) => { setShowSideState(v); try { localStorage.setItem('tm-side', v ? '1' : '0'); } catch { /* ignore */ } }, []);
  // side panel widths: drag the divider to resize, double-click it to reset
  const [lw, setLw] = useState<number>(() => { try { return +(localStorage.getItem('tm-lw') || 290) || 290; } catch { return 290; } });
  const [rw, setRw] = useState<number>(() => { try { return +(localStorage.getItem('tm-rw') || 372) || 372; } catch { return 372; } });
  const drag = useCallback((side: 'l' | 'r') => (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = side === 'l' ? lw : rw, [lo, hi] = side === 'l' ? [220, 480] : [300, 680];
    let w = w0;
    const move = (m: PointerEvent) => { w = Math.max(lo, Math.min(hi, w0 + (side === 'l' ? m.clientX - x0 : x0 - m.clientX))); (side === 'l' ? setLw : setRw)(w); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing');
      try { localStorage.setItem(side === 'l' ? 'tm-lw' : 'tm-rw', String(w)); } catch { /* ignore */ }
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }, [lw, rw]);
  const resetW = (side: 'l' | 'r') => { (side === 'l' ? setLw : setRw)(side === 'l' ? 290 : 372); try { localStorage.removeItem(side === 'l' ? 'tm-lw' : 'tm-rw'); } catch { /* ignore */ } };
  const setShowMenu = useCallback((v: boolean) => { setShowMenuState(v); try { localStorage.setItem('tm-menu', v ? '1' : '0'); } catch { /* ignore */ } }, []);
  const [preview, setPreview] = useState<Record<string, PreviewLine[]>>({});
  const onPreview = useCallback((key: string, lines: PreviewLine[]) => {
    setPreview((p) => {
      const prev = p[key] ?? [];
      if (prev.length === lines.length && prev.every((l, i) => l.price === lines[i].price && l.title === lines[i].title)) return p;
      const n = { ...p };
      if (lines.length) n[key] = lines; else delete n[key];
      return n;
    });
  }, []);
  const [rtab, setRtab] = useState<'advisor' | 'analysis' | 'trade' | 'alerts' | 'stats'>('advisor');
  const [bt, setBt] = useState<BacktestResult | null>(null);
  const [strat, setStrat] = useState<StrategyResult | null>(null);
  const [htf, setHtf] = useState<{ tf: string; bias: number; label: string } | null>(null);
  const [htfDone, setHtfDone] = useState(false); // the advisor waits for this so its verdict doesn't flip once the bigger timeframe arrives
  const [showAdvice, setShowAdvice] = useState(true);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [display, setDisplay] = useState<string>(CURRENCIES.some((c) => c.code === prefs.display) ? prefs.display : 'USD');
  const fx = useFx();
  const paper = usePaper(fx.usdPer);
  if (import.meta.env.DEV) (window as unknown as { __paper: typeof paper }).__paper = paper; // dev only: lets tests feed scripted prices
  const cur = useMemo(() => makeCurrency(display, fx.perUSD(display)), [display, fx.rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const nativeCcy = currencyOf(inst);
  // make sure rates exist for the instrument being viewed and for every open position
  const posCcy = paper.acc.positions.map((p) => p.ccy ?? 'USD').join(',');
  useEffect(() => { [nativeCcy, ...posCcy.split(',')].filter(Boolean).forEach((c) => fx.ensure(c)); }, [nativeCcy, posCcy]); // eslint-disable-line react-hooks/exhaustive-deps
  const watch = useWatchlist();
  const alerts = useAlerts(setToast);
  const ctx = useRef({ inst, tf });
  ctx.current = { inst, tf };

  const chartApi = useRef<ChartApi>(null);
  const candles = useRef<Candle[]>([]);
  const userSel = useRef(false);
  const timer = useRef<number>();

  const analyse = useCallback(async (reset: boolean) => {
    const { analysis: a, signals: s } = await runAnalysis(candles.current);
    if (!a) { setAnalysis(null); setSignals([]); setSel(null); return; } // too little history: drop the previous symbol's results
    setAnalysis(a);
    setSignals(s);
    const top = a.charts[0];
    alerts.checkPattern(ctx.current.inst.id, ctx.current.tf, top.name, top.score, word(top.eff));
    if (reset || !userSel.current) setSel(a.charts[0].score >= 30 ? a.charts[0].id : null);
  }, []);

  const updatePrice = () => {
    const c = candles.current;
    if (c.length < 2) return;
    const a = c[c.length - 1], b = c[c.length - 2];
    setPrice({ px: a.close, ch: ((a.close - b.close) / b.close) * 100 });
    setPrices((p) => (p[inst.id] === a.close ? p : { ...p, [inst.id]: a.close }));
  };

  // load history whenever symbol / timeframe changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    userSel.current = false;
    (async () => {
      let data = await fetchCandles(inst, tf, 500);
      if (cancelled) return;
      const isDemo = !data;
      if (!data) { data = demoData(tf); setToast(`Couldn't load live data for ${symbol}. Showing demo data.`); }
      setDemo(isDemo);
      candles.current = data;
      chartApi.current?.setCandles(data);
      updatePrice();
      if (data.length) { pushPrice(inst.id, data[data.length - 1].close); paper.onPrice(inst.id, data[data.length - 1].close); }
      await analyse(true);
      if (!cancelled) setLoading(false);
    })();
    try { localStorage.setItem('tm', JSON.stringify({ inst, tf, theme, display, market })); } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, [inst, tf, analyse]); // eslint-disable-line react-hooks/exhaustive-deps

  // live stream: every tick goes to the chart once per screen frame; the rest of the page refreshes about 4 times a second
  useEffect(() => {
    if (demo || loading) return;
    let raf = 0;
    let ui: number | undefined;
    let pending: Candle | null = null;
    let tickPx: number | null = null;

    const commit = (c: Candle) => {
      pending = c;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (pending) chartApi.current?.update(pending); pending = null; });
      pushPrice(inst.id, c.close);              // the Trade panel reads this directly, so the page does not have to re-render
      paper.onPrice(inst.id, c.close);          // stop-loss / take-profit and alerts react to every tick
      alerts.checkPrice(inst.id, c.close);
      if (ui === undefined) ui = window.setTimeout(() => { ui = undefined; updatePrice(); setLastTick(Date.now()); }, 250);
      if (!timer.current) timer.current = window.setTimeout(() => { timer.current = undefined; analyse(false); }, 8000);
    };

    const stop = openFeed(inst, tf, (c) => {
      const arr = candles.current;
      if (arr.length && c.time < arr[arr.length - 1].time) return; // polling can resend the previous bar; the chart only accepts the latest or newer
      if (arr.length && arr[arr.length - 1].time === c.time) {
        // a delayed candle must not drag the price back from a fresher tick
        if (tickPx !== null) c = { ...c, close: tickPx, high: Math.max(c.high, tickPx), low: Math.min(c.low, tickPx) };
        arr[arr.length - 1] = c;
      } else arr.push(c);
      commit(c);
    }, setFeed, (p) => {
      tickPx = p;
      const arr = candles.current;
      const last = arr[arr.length - 1];
      if (!last) return;
      const c = { ...last, close: p, high: Math.max(last.high, p), low: Math.min(last.low, p) };
      arr[arr.length - 1] = c;
      commit(c);
    });
    return () => { stop(); cancelAnimationFrame(raf); clearTimeout(ui); clearTimeout(timer.current); timer.current = undefined; };
  }, [inst, tf, demo, loading, analyse]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('tm', JSON.stringify({ inst, tf, theme, display, market })); } catch { /* ignore */ }
  }, [theme, inst, tf, display, market]);

  // the advisor judges a setup by how that pattern performed here before (backtest on up to 5000 candles)
  useEffect(() => {
    if (loading) return;
    let dead = false;
    setBt(null); setStrat(null);
    (async () => {
      const data = demo ? candles.current : (await fetchHistory(inst, tf)) ?? candles.current;
      const r = await runBacktest(data, 20, 55, () => undefined);
      if (!dead) setBt(r);
      const st = await runStrategy(data, { target: 'tp1', minConf: 50, tf }, () => undefined);
      if (!dead) setStrat(st);
    })();
    return () => { dead = true; };
  }, [inst, tf, loading, demo]);

  // the bigger picture: what does the next timeframe up say?
  useEffect(() => {
    const up = HIGHER[tf];
    setHtf(null); setHtfDone(false);
    if (loading) return;
    if (demo || !up) { setHtfDone(true); return; }
    let dead = false;
    (async () => {
      try {
        const c = await fetchCandles(inst, up, 400);
        if (!c || dead) return;
        const { analysis: h } = await runAnalysis(c, false);
        if (h && !dead) setHtf({ tf: up, bias: h.bias, label: h.label });
      } finally { if (!dead) setHtfDone(true); }
    })();
    return () => { dead = true; };
  }, [inst, tf, loading, demo]);

  const advice: Advice | null = useMemo(() => {
    const c = candles.current;
    if (!analysis || c.length < 60 || !bt || !strat || !htfDone) return null; // show "reading the chart" until every input is in
    const base = advise(c.slice(-500), analysis, bt, { tf, strat, isOption: inst.kind === 'OPTION', step: inst.id === '^NSEI' ? 50 : inst.id === '^NSEBANK' ? 100 : undefined }) as Advice;
    if (!htf || base.action === 'WAIT') return base;
    // trading with the higher timeframe is safer than trading against it
    const dir = base.action === 'BUY' ? 1 : -1;
    const agrees = dir * htf.bias >= 15, against = dir * htf.bias <= -15;
    if (!agrees && !against) return { ...base, reasons: [...base.reasons, `Higher timeframe (${htf.tf}) is neutral`] };
    const conf = Math.max(0, Math.min(100, base.conf + (agrees ? 8 : -15)));
    const out: Advice = {
      ...base, conf, level: conf >= 70 ? 'High' : conf >= 50 ? 'Medium' : 'Low',
      reasons: agrees ? [...base.reasons, `Higher timeframe (${htf.tf}) agrees: ${htf.label}`] : base.reasons,
      warnings: against ? [`Higher timeframe (${htf.tf}) is ${htf.label}, so this trade goes against the bigger trend.`, ...base.warnings] : base.warnings,
    };
    if (conf < 50) { out.action = 'WAIT'; out.sl = out.tp1 = out.tp2 = null; out.option = null; out.warnings = ['Setup is too weak once the higher timeframe is taken into account.', ...out.warnings]; }
    return out;
  }, [analysis, bt, strat, tf, inst, htf, htfDone]);

  // average candle range over the last 50 candles: the basis for suggesting a stop loss and target
  const atr = useMemo(() => {
    const c = candles.current;
    if (c.length < 20) return null;
    const t = c.slice(-50);
    let s = 0;
    for (let i = 1; i < t.length; i++) { const k = t[i], pc = t[i - 1].close; s += Math.max(k.high - k.low, Math.abs(k.high - pc), Math.abs(k.low - pc)); }
    return s / (t.length - 1);
  }, [analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  const levels = useMemo(() => (analysis && candles.current.length >= 60 ? (srLevels(candles.current) as { price: number; touches: number }[]) : []), [analysis]);

  const sendAdvice = () => {
    if (!advice || advice.action === 'WAIT' || advice.sl === null || advice.tp2 === null) return;
    setPrefill({
      side: advice.action === 'BUY' ? 'long' : 'short', sl: advice.sl, tp: advice.tp2, nonce: Date.now(),
      note: `AI advisor (${advice.level} confidence ${advice.conf}%): stop ${fmt(advice.sl)}, first target ${fmt(advice.tp1 as number)}, final target ${fmt(advice.tp2)}. Edit freely.`,
    });
    setRtab('trade');
  };

  // keep prices fresh for other instruments that have open positions or active price alerts (the viewed one is live)
  const watched = [...paper.acc.positions.map((p) => p.inst), ...alerts.alerts.filter((x) => !x.fired && x.kind !== 'pattern').map((x) => x.inst)];
  const watchKey = watched.map((i) => i.id).filter((v, i, arr) => arr.indexOf(v) === i).sort().join(',');
  useEffect(() => {
    const others = watched.filter((v, i, arr) => v.id !== inst.id && arr.findIndex((x) => x.id === v.id) === i);
    if (!others.length) return;
    // a live tick stream for every other symbol with an open position or a price alert
    const stop = openTicks(others, (id, px) => {
      pushPrice(id, px);
      paper.onPrice(id, px);
      alerts.checkPrice(id, px);
    });
    return stop;
  }, [watchKey, inst.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = useMemo(() => {
    const out: { price: number; color: string; title: string; dashed?: boolean }[] = [];
    paper.acc.positions.filter((p) => p.inst.id === inst.id).forEach((p) => {
      const pl = netPnl(p, prices[inst.id] ?? p.entry, paper.fxNow(p));
      out.push({ price: p.entry, color: '#7c6cff', title: `${p.side === 'long' ? 'LONG' : 'SHORT'} ${cur.signed(pl)}` });
      if (p.sl !== undefined) out.push({ price: p.sl, color: '#ff5d7a', title: 'SL', dashed: true });
      if (p.tp !== undefined) out.push({ price: p.tp, color: '#2ee6a6', title: 'TP', dashed: true });
    });
    Object.values(preview).forEach((ls) => ls.forEach((l) => out.push(l)));
    (paper.acc.orders ?? []).filter((o) => o.inst.id === inst.id).forEach((o) => {
      out.push({ price: o.trigger, color: '#ffb84d', title: `${o.kind.toUpperCase()} ${o.side === 'long' ? 'BUY' : 'SELL'}`, dashed: true });
    });
    if (rtab === 'advisor' && showAdvice && advice && advice.action !== 'WAIT' && advice.sl !== null && advice.tp1 !== null && advice.tp2 !== null) {
      out.push({ price: advice.sl, color: '#ff5d7a', title: 'AI SL', dashed: true });
      out.push({ price: advice.tp1, color: '#2ee6a6', title: 'AI TP1', dashed: true });
      out.push({ price: advice.tp2, color: '#2ee6a6', title: 'AI TP2', dashed: true });
    }
    return out;
  }, [paper.acc.positions, paper.acc.orders, prices, inst.id, showAdvice, advice, cur, rtab, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t); }, [toast]);

  // Turn the selected pattern into an order: direction from its bias, stop/target from recent volatility (1.5x / 3x ATR)
  const tradeSetup = () => {
    const c = candles.current;
    const p = analysis && sel ? analysis.charts.find((x) => x.id === sel) : null;
    if (!p || c.length < 20 || Math.abs(p.eff) < 0.1) return;
    const px = c[c.length - 1].close;
    const tail = c.slice(-50);
    const atr = tail.reduce((s, k, i) => s + Math.max(k.high - k.low, i ? Math.abs(k.high - tail[i - 1].close) : 0, i ? Math.abs(k.low - tail[i - 1].close) : 0), 0) / tail.length;
    const long = p.eff > 0;
    setPrefill({
      side: long ? 'long' : 'short',
      sl: long ? px - 1.5 * atr : px + 1.5 * atr,
      tp: long ? px + 3 * atr : px - 3 * atr,
      note: `From ${p.name} (${p.score}% match): stop 1.5× and target 3× recent average range (ATR), a 1:2 risk/reward. These levels come from volatility, not the pattern's geometry.`,
      nonce: Date.now(),
    });
    setRtab('trade');
  };

  const select = (id: string) => { userSel.current = true; setSel(id); };
  const selected = useMemo(() => (analysis && sel ? [...analysis.charts, ...analysis.candles].find((p) => p.id === sel) ?? null : null), [analysis, sel]);

  const scan = useCallback(async (): Promise<MtfRow[]> => {
    return Promise.all(TFS.map(async ([label]) => {
      const d = demo ? demoData(label) : await fetchCandles(inst, label, 400);
      if (!d) return { label };
      const { analysis: a } = await runAnalysis(d, false);
      return a ? { label, top: a.charts[0].name, score: a.charts[0].score, verdict: a.label, bias: a.bias } : { label };
    }));
  }, [inst, demo]);

  const strategy = useCallback(async (target: 'tp1' | 'tp2', minConf: number, onProgress: (p: number) => void) => {
    const data = demo ? candles.current : (await fetchHistory(inst, tf)) ?? candles.current;
    return runStrategy(data, { target, minConf, tf }, onProgress);
  }, [inst, tf, demo]);

  const backtest = useCallback(async (h: number, min: number, onProgress: (p: number) => void) => {
    const data = demo ? demoData(tf) : (await fetchHistory(inst, tf)) ?? candles.current;
    return runBacktest(data, h, min, onProgress);
  }, [inst, tf, demo]);

  // ---- guided tour (opens automatically on the first visit; replay it with the ? Tour button)
  const tourSteps: TourStep[] = useMemo(() => [
    { title: 'Welcome to TradeMaster', placement: 'center', body: <>
      <p>A charting and practice platform: live charts, automatic pattern detection, an AI trade advisor, and paper trading.</p>
      <p>This one-minute tour shows what each part does. Everything you trade here uses <b>virtual money</b>, so you can experiment freely.</p>
      <p className="tour-hint">Use the arrow keys or the buttons. Press Esc to leave at any time.</p></> },
    { target: '.symsearch', placement: 'bottom', title: 'Search any market', body: <>
      <p>Type a name or symbol, then pick a result. India is selected by default; use the market box on its left to switch to US, crypto, global markets or <b>All markets</b>.</p>
      <p><code>RELIANCE</code> <code>TCS</code> <code>nifty</code> · in US / All: <code>AAPL</code> <code>gold</code> <code>EURUSD=X</code> <code>BTCUSDT</code></p></> },
    { target: '[data-tour="markets"]', placement: 'bottom', title: 'Browse, scan and watch', body: <>
      <p><b>Markets</b> lists live prices by category, shows US and India (NSE) option chains, keeps your watchlist, and has a <b>Scanner</b> that ranks a whole market by chart patterns.</p></> },
    { target: '[data-tour="tf"]', placement: 'bottom', title: 'Choose a timeframe', body: <>
      <p>Each candle covers this much time. <b>1h</b> or <b>1D</b> is a good place to start.</p>
      <p>Patterns, signals and the AI advisor are all recalculated for the timeframe you pick.</p></> },
    { target: '.menu', placement: 'right', title: 'Pattern menu', before: () => { setTab('chart'); setShowMenu(true); }, body: <>
      <p>Every chart and candlestick pattern, scored by how closely it matches <i>right now</i>. The best match is tagged <b>CLOSEST</b>. Click one to draw it on the chart.</p>
      <p className="tour-hint">The percentage is how similar the shape is. It is not the chance of winning.</p></> },
    { target: '.hud', placement: 'bottom', title: 'The chart at a glance', body: <>
      <p>This line names the pattern that is forming and the overall bias. Green and red arrows on the candles are buy and sell candlestick signals.</p>
      <p><b>Mouse wheel</b> zooms, <b>drag</b> pans, and the buttons below reset the view.</p></> },
    { target: '.drawbar', placement: 'right', title: 'Drawing tools', body: <>
      <p>Horizontal line, trend line and Fibonacci. Click a drawn line to select it, then press <b>Delete</b>. <b>Esc</b> cancels a tool.</p>
      <p>Drawings are saved for each symbol. The camera button saves a picture of the chart.</p></> },
    { target: '.popwrap', placement: 'bottom', title: 'Indicators', body: <>
      <p>Add Bollinger Bands, VWAP, support and resistance levels, plus RSI and MACD panels under the chart.</p></> },
    { target: '.rside', placement: 'left', title: 'AI advisor', before: () => setRtab('advisor'), body: <>
      <p>Suggests <b>Buy, Sell or Wait</b> with an entry, stop loss and targets, then shows how that kind of setup really performed on this symbol before.</p>
      <p className="tour-hint">Honest note: in our own tests these signals did not beat trading costs. Treat it as a checklist, not a prediction.</p></> },
    { target: '.rside', placement: 'left', title: 'Paper trading', before: () => setRtab('trade'), body: <>
      <p>Practise with <b>$100,000 of virtual money</b>: market, limit and stop orders, stop loss, take profit and trailing stops.</p>
      <p>Open positions show live profit <b>after fees</b>, with a bar from your stop (left) to your target (right).</p></> },
    { target: '.rtabs', placement: 'left', title: 'More tabs', before: () => setRtab('analysis'), body: <>
      <p><b>Analysis</b>: what each pattern means, plus backtests. <b>Alerts</b>: price and pattern notifications. <b>Stats</b>: your results and a strategy tester that shows honestly whether a strategy worked.</p></> },
    { target: '.ccysel', placement: 'bottom', title: 'Currency and theme', body: <>
      <p>Show your account in USD, INR, EUR, GBP and more, converted at live rates. The sun and moon button switches between light and dark.</p></> },
    { target: '.price', placement: 'bottom', title: 'Live status', body: <>
      <p><b>LIVE</b> means prices are streaming. The clock counts down to the end of the current candle.</p>
      <p><b>MARKET CLOSED</b>, <b>DELAYED</b> or <b>DEMO DATA</b> tell you when the data is not fresh.</p></> },
    { title: "You're ready", placement: 'center', before: () => setRtab('advisor'), body: <>
      <p>Try it: search <code>RELIANCE</code>, open the <b>AI</b> tab, press <b>Send to paper ticket</b>, then watch your position in the <b>Trade</b> tab.</p>
      <p>You can replay this tour any time with <b>? Tour</b> in the top bar.</p></> },
  ], []);

  useEffect(() => { if (tourOpen) setShowSide(true); }, [tourOpen, setShowSide]);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    setRtab('advisor');
    try { localStorage.setItem('tm-tour', 'done'); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (loading || !analysis) return;
    try { if (localStorage.getItem('tm-tour')) return; } catch { return; }
    const t = setTimeout(() => setTourOpen(true), 900);
    return () => clearTimeout(t);
  }, [loading, analysis]);

  const top = analysis?.charts[0], cd = analysis?.candles[0];
  const status = top ? (top.score >= 55 ? 'Forming' : top.score >= 35 ? 'Early sign' : 'Closest') : '';

  return (
    <>
      <header className="topbar">
        <a className="logo" href="#/" title="Home" style={{ textDecoration: 'none', color: 'inherit' }}>Trade<b>Master</b></a>
        <Nav page="charts" />
        <span className="grow" />
        <select className="mktsel" value={market} onChange={(e) => setMarket(e.target.value as MarketId)} title={MARKETS.find((m) => m.id === market)?.hint} aria-label="Market" data-tour="market">
          {MARKETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <SymbolSearch current={inst} onPick={setInst} market={market} onMarket={setMarket} />
        <select className="ccysel" value={display} onChange={(e) => setDisplay(e.target.value)} title={fx.live ? `Live exchange rates, updated ${new Date(fx.updated).toLocaleTimeString()}` : 'Approximate offline exchange rates'}>
          {CURRENCIES.map((c) => <option key={c.code} value={c.code} title={c.name}>{c.code}</option>)}
        </select>
        <button className="theme" title="Take the guided tour" onClick={() => setTourOpen(true)}>?</button>
        <button className="theme" title="Toggle light / dark mode" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀' : '🌙'}</button>
        <AccountMenu />
      </header>

      <div className="toolbar">
        <LiveBar name={inst.name} kind={inst.kind} tfLabel={tf} symbol={symbol.replace(/.(NS|BO)$/, '')} leading={<button className={`star theme ${watch.has(inst.id) ? 'on' : ''}`} style={{ padding: '0 6px', border: 0, background: 'none', fontSize: 15 }} title="Add / remove this symbol from your watchlist" onClick={() => watch.toggle(inst)}>{watch.has(inst.id) ? '★' : '☆'}</button>} status={feed} demo={demo} px={price?.px ?? null} ch={price?.ch ?? null} lastTick={lastTick} candleTime={candles.current.length ? candles.current[candles.current.length - 1].time : null} tf={tf} unit={nativeCcy === 'GBp' ? 'GBp' : nativeCcy} approx={price && nativeCcy !== display ? `≈ ${cur.money(price.px * fx.usdPer(nativeCcy))}` : undefined} />
        <span className="sp" />
        <Timeframe tf={tf} setTf={setTf} />
        <select value={type} aria-label="Chart type" onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="candles">Candles</option><option value="line">Line</option><option value="area">Area</option>
        </select>
        <IndicatorsMenu tg={tg} setTg={setTg} />
        <button className="theme" title="Show every chart and candlestick pattern" onClick={() => setShowMenu(!showMenu)} style={showMenu ? { background: 'var(--sel)', borderColor: 'rgba(124,108,255,.6)' } : undefined}>◧ Patterns</button>
        <button className="theme" title="Show or hide the side panel (AI, trade, alerts)" onClick={() => setShowSide(!showSide)} style={showSide ? { background: 'var(--sel)', borderColor: 'rgba(124,108,255,.6)' } : undefined}>▤ Panel</button>
        <button className="theme" data-tour="markets" title="Browse stocks, forex, commodities, futures, options" onClick={() => setShowMarkets(true)}>▦ Markets</button>
      </div>

      <Tour open={tourOpen} steps={tourSteps} onClose={closeTour} />
      {showMarkets && <Markets onPick={(i, t) => { setInst(i); if (t) setTf(t); }} onClose={() => setShowMarkets(false)} watch={watch} paper={paper} market={market} setMarket={setMarket} />}

      <div className={`layout ${showMenu ? '' : 'nomenu'} ${showSide ? '' : 'noside'}`} style={{ '--lw': `${lw}px`, '--rw': `${rw}px` } as React.CSSProperties}>
        {showMenu && <div className="grip l" onPointerDown={drag('l')} onDoubleClick={() => resetW('l')} title="Drag to resize · double-click to reset" />}
        {showSide && <div className="grip r" onPointerDown={drag('r')} onDoubleClick={() => resetW('r')} title="Drag to resize · double-click to reset" />}
        {!showMenu ? null : analysis
          ? <Menu analysis={analysis} tab={tab} setTab={setTab} bias={bias} setBias={setBias} sort={sort} setSort={setSort} q={q} setQ={setQ} sel={sel} onSelect={select} />
          : <aside className="menu"><p className="small" style={{ padding: 12 }}>{loading ? 'Loading…' : 'No pattern analysis for this chart yet. Options that are new or expire soon have very little history; pick a later expiry or a smaller timeframe.'}</p></aside>}
        <main className="chartwrap">
          <div className="chartarea">
          <div className="hud">
            {loading ? <span className="hud-k">Loading…</span> : !analysis || !top || !cd ? <span className="small">Not enough history on this timeframe. Try 5m / 15m or a more liquid symbol.</span> : (<>
              <button className="hud-pat" onClick={() => setShowMenu(!showMenu)} title="Open the pattern list">
                <span className="hud-k">{status}</span><b>{top.name}</b><span className="hud-score">{top.score}%</span><span className={`tone ${cls(top.eff)}`}>{word(top.eff)}</span>
              </button>
              <div title="Overall reading of all signals, from bearish (−100) to bullish (+100)">
                <span className="hud-k">Bias</span>
                <span className="bias"><i style={{ left: `${(Math.max(-100, Math.min(100, analysis.bias)) + 100) / 2}%` }} /></span>
                <b className={cls(analysis.bias / 100)}>{analysis.label}</b>
              </div>
              {cd.score >= 50 && <div><span className="hud-k">Candle</span><b>{cd.name}</b><span className={`tone ${cls(cd.eff)}`}>{word(cd.eff)}</span></div>}
            </>)}
          </div>
          <ChartView ref={chartApi} theme={theme} lines={lines} type={type} ema20={tg.e20} ema50={tg.e50} vol={tg.vol} signalsOn={tg.sig} bb={tg.bb} vwap={tg.vwap} showLevels={tg.sr} levels={levels} symbolKey={inst.id} selected={selected} signals={signals} />
            {toast && <div className="toast">{toast}</div>}
          </div>
          {(tg.rsi || tg.macd) && (
            <div className="panes">
              {tg.rsi && <Pane kind="rsi" candles={candles} version={lastTick + candles.current.length} theme={theme} main={() => chartApi.current?.chart()} />}
              {tg.macd && <Pane kind="macd" candles={candles} version={lastTick + candles.current.length} theme={theme} main={() => chartApi.current?.chart()} />}
            </div>
          )}
        </main>
        <div className="rside" style={showSide ? undefined : { display: 'none' }}>
          <div className="rtabs">
            <button className={rtab === 'analysis' ? 'on' : ''} onClick={() => setRtab('analysis')}>Analysis</button>
            <button className={rtab === 'advisor' ? 'on' : ''} onClick={() => setRtab('advisor')}>AI{advice && advice.action !== 'WAIT' ? ` · ${advice.action}` : ''}</button>
            <button className={rtab === 'alerts' ? 'on' : ''} onClick={() => setRtab('alerts')}>Alerts{alerts.alerts.some((x) => !x.fired) ? ` (${alerts.alerts.filter((x) => !x.fired).length})` : ''}</button>
            <button className={rtab === 'stats' ? 'on' : ''} onClick={() => setRtab('stats')}>Stats</button>
            <button className={rtab === 'trade' ? 'on' : ''} onClick={() => setRtab('trade')}>Trade{paper.acc.positions.length ? ` (${paper.acc.positions.length})` : ''}</button>
          </div>
          {rtab === 'advisor'
            ? <Advisor advice={advice} inst={inst} tf={tf} historyReady={bt !== null} strat={strat} showOnChart={showAdvice} setShowOnChart={setShowAdvice} onSend={sendAdvice} />
            : rtab === 'stats'
            ? <Stats paper={paper} cur={cur} symbol={symbol} tf={tf} runStrategy={strategy} />
            : rtab === 'alerts'
            ? <Alerts inst={inst} tf={tf} price={prices[inst.id] ?? price?.px ?? null} api={alerts} />
            : rtab === 'trade'
            ? <Trade inst={inst} price={prices[inst.id] ?? price?.px ?? null} prices={prices} paper={paper} prefill={prefill} cur={cur} usdPer={fx.usdPer} onOpen={setInst} atr={atr} onPreview={onPreview} />
            : analysis ? <Panel analysis={analysis} symbol={symbol} tf={tf} sel={sel} signals={signals} onSelect={select} onTf={setTf} scan={scan} backtest={backtest} onSetup={tradeSetup} /> : <aside className="panel"><p className="small" style={{ padding: 12 }}>{loading ? 'Loading…' : 'No pattern analysis for this chart yet. Options that are new or expire soon have very little history; pick a later expiry or a smaller timeframe.'}</p></aside>}
        </div>
      </div>
    </>
  );
}
