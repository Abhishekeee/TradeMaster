import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createChart, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type SeriesMarker, type Time } from 'lightweight-charts';
import { ema } from '../engine/patterns.js';
import { bollinger, vwapSeries } from '../indicators';
import { cls, type Candle, type Pattern, type Signal } from '../types';

export interface ChartApi { setCandles(c: Candle[]): void; update(c: Candle): void; chart(): IChartApi | undefined }
const MIN_BARS = 8;

type Tool = 'none' | 'hline' | 'trend' | 'fib';
interface Drawing { id: string; kind: 'hline' | 'trend' | 'fib'; pts: { time: number; price: number }[] }

interface Props {
  type: 'candles' | 'line' | 'area';
  ema20: boolean; ema50: boolean; vol: boolean; signalsOn: boolean; bb: boolean; vwap: boolean; showLevels: boolean;
  selected: Pattern | null; signals: Signal[];
  theme: 'dark' | 'light';
  lines: { price: number; color: string; title: string; dashed?: boolean }[];
  levels: { price: number; touches: number }[];
  symbolKey: string;      // drawings are saved per symbol
}

const THEMES = {
  dark: { bg: 'rgba(0,0,0,0)', text: '#9096b8', grid: 'rgba(255,255,255,0.045)', border: 'rgba(255,255,255,0.09)' },
  light: { bg: 'rgba(0,0,0,0)', text: '#5a6082', grid: 'rgba(30,34,80,0.07)', border: 'rgba(30,34,80,0.12)' },
};

const COL = { up: '#2ee6a6', down: '#ff5d7a', neu: '#ffb84d' } as const;
const MAX_MARKERS = 40;
const FIB: [number, string][] = [[0, '#787b86'], [0.236, '#f5a623'], [0.382, '#26a69a'], [0.5, '#2962ff'], [0.618, '#26a69a'], [0.786, '#f5a623'], [1, '#787b86']];
const DRAW_COLOR = '#2962ff';

function loadDrawings(key: string): Drawing[] {
  try { const a = JSON.parse(localStorage.getItem(`tm-draw:${key}`) || '[]'); if (Array.isArray(a)) return a; } catch { /* ignore */ }
  return [];
}

const ChartView = forwardRef<ChartApi, Props>(function ChartView(p, ref) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>();
  const main = useRef<ISeriesApi<'Candlestick' | 'Line' | 'Area'>>();
  const vol = useRef<ISeriesApi<'Histogram'>>();
  const e20 = useRef<ISeriesApi<'Line'>>();
  const e50 = useRef<ISeriesApi<'Line'>>();
  const bbU = useRef<ISeriesApi<'Line'>>();
  const bbM = useRef<ISeriesApi<'Line'>>();
  const bbL = useRef<ISeriesApi<'Line'>>();
  const vw = useRef<ISeriesApi<'Line'>>();
  const overlays = useRef<ISeriesApi<'Line'>[]>([]);
  const data = useRef<Candle[]>([]);
  const typeRef = useRef(p.type);
  typeRef.current = p.type;
  const flags = useRef({ bb: p.bb, vwap: p.vwap });
  flags.current = { bb: p.bb, vwap: p.vwap };

  const val = (k: Candle) => (typeRef.current === 'candles' ? k : { time: k.time as Time, value: k.close });

  /** Bollinger and VWAP are only calculated while they are switched on. */
  function paintStudies() {
    const c = data.current;
    if (c.length < 25) return;
    if (flags.current.bb) {
      const b = bollinger(c);
      bbU.current?.setData(b.up.map((q) => ({ time: q.time as Time, value: q.value })));
      bbM.current?.setData(b.mid.map((q) => ({ time: q.time as Time, value: q.value })));
      bbL.current?.setData(b.lo.map((q) => ({ time: q.time as Time, value: q.value })));
    }
    if (flags.current.vwap) vw.current?.setData(vwapSeries(c).map((q) => ({ time: q.time as Time, value: q.value })));
  }

  function paintAll() {
    const c = data.current;
    if (!main.current) return;
    if (!c.length) { [main, vol, e20, e50, bbU, bbM, bbL, vw].forEach((s) => s.current?.setData([])); return; }
    main.current.setData(c.map((k) => val(k)) as never);
    vol.current!.setData(c.map((k) => ({ time: k.time as Time, value: k.volume, color: k.close >= k.open ? '#2ee6a644' : '#ff5d7a44' })));
    const closes = c.map((k) => k.close);
    e20.current!.setData(ema(closes, 20).map((v: number, i: number) => ({ time: c[i].time as Time, value: v })));
    e50.current!.setData(ema(closes, 50).map((v: number, i: number) => ({ time: c[i].time as Time, value: v })));
    paintStudies();
  }

  function buildMain() {
    const ch = chart.current!;
    if (main.current) ch.removeSeries(main.current);
    main.current = p.type === 'candles'
      ? ch.addCandlestickSeries({ upColor: COL.up, downColor: COL.down, borderVisible: false, wickUpColor: COL.up, wickDownColor: COL.down })
      : p.type === 'line'
        ? ch.addLineSeries({ color: '#2962ff', lineWidth: 2 })
        : ch.addAreaSeries({ lineColor: '#2962ff', topColor: '#2962ff66', bottomColor: '#2962ff05' });
  }

  useImperativeHandle(ref, () => ({
    chart: () => chart.current,
    setCandles(c) {
      data.current = c.slice();
      paintAll();
      chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, c.length - 150), to: c.length + 6 });
    },
    update(c) {
      const arr = data.current;
      if (arr.length && arr[arr.length - 1].time === c.time) arr[arr.length - 1] = c; else arr.push(c);
      main.current?.update(val(c) as never);
      vol.current?.update({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? '#2ee6a644' : '#ff5d7a44' });
      if (arr.length > 50) {
        const closes = arr.map((k) => k.close);
        e20.current?.update({ time: c.time as Time, value: ema(closes, 20)[arr.length - 1] });
        e50.current?.update({ time: c.time as Time, value: ema(closes, 50)[arr.length - 1] });
        if (flags.current.bb) {
          const b = bollinger(arr.slice(-25));
          const i = b.mid.length - 1;
          bbU.current?.update({ time: c.time as Time, value: b.up[i].value });
          bbM.current?.update({ time: c.time as Time, value: b.mid[i].value });
          bbL.current?.update({ time: c.time as Time, value: b.lo[i].value });
        }
        if (flags.current.vwap) { const v = vwapSeries(arr); vw.current?.update({ time: c.time as Time, value: v[v.length - 1].value }); }
      }
    },
  }));

  const zoom = (f: number) => {
    const ts = chart.current?.timeScale();
    const r = ts?.getVisibleLogicalRange();
    if (!ts || !r) return;
    const w = Math.max(MIN_BARS, (r.to - r.from) * f);
    ts.setVisibleLogicalRange({ from: r.to - w, to: r.to });
  };
  const fit = () => {
    const n = data.current.length;
    chart.current?.priceScale('right').applyOptions({ autoScale: true });
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 8 });
  };
  const latest = () => chart.current?.timeScale().scrollToRealTime();

  const shot = () => {
    const canvas = chart.current?.takeScreenshot();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${p.symbolKey}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  // ---- drawing tools -------------------------------------------------------------------------------------------
  const [tool, setTool] = useState<Tool>('none');
  const [drawings, setDrawings] = useState<Drawing[]>(() => loadDrawings(p.symbolKey));
  const [hint, setHint] = useState('');
  const [selId, setSelId] = useState<string | null>(null);   // the drawing currently selected for deleting
  const [showList, setShowList] = useState(false);
  const [ready, setReady] = useState(0);        // bumps each time the price series is (re)built, so drawings are drawn on it
  const toolRef = useRef<Tool>('none');
  toolRef.current = tool;
  const pend = useRef<{ time: number; price: number } | null>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  drawingsRef.current = drawings;

  /** Which drawing is under the pointer (within 8 pixels)? */
  const hitTest = (x: number, y: number): string | null => {
    const ch = chart.current, m = main.current;
    if (!ch || !m) return null;
    const ts = ch.timeScale();
    const best = { id: null as string | null, d: 8 };
    const consider = (id: string, d: number) => { if (d < best.d) { best.id = id; best.d = d; } };
    const yOf = (pr: number) => m.priceToCoordinate(pr);
    const xOf = (t: number) => ts.timeToCoordinate(t as Time);
    const last = data.current[data.current.length - 1]?.time;
    for (const d of drawingsRef.current) {
      if (d.kind === 'hline') {
        const yy = yOf(d.pts[0].price);
        if (yy !== null) consider(d.id, Math.abs(yy - y));
      } else if (d.kind === 'fib') {
        const [p1, p2] = d.pts;
        for (const [lvl] of FIB) { const yy = yOf(p2.price - (p2.price - p1.price) * lvl); if (yy !== null) consider(d.id, Math.abs(yy - y)); }
      } else {
        const [a, b] = [...d.pts].sort((u, w) => u.time - w.time);
        if (!a || !b || a.time === b.time) continue;
        let tx = b.time, ty = b.price;
        if (last !== undefined && last > b.time) { ty = b.price + ((b.price - a.price) / (b.time - a.time)) * (last - b.time); tx = last; }
        const x1 = xOf(a.time), y1 = yOf(a.price), x2 = xOf(tx), y2 = yOf(ty);
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
        const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
        consider(d.id, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
      }
    }
    return best.id;
  };

  const cancelTool = () => { pend.current = null; setHint(''); setTool('none'); };
  const removeDrawing = (id: string) => { setDrawings((d) => d.filter((x) => x.id !== id)); setSelId((s) => (s === id ? null : s)); };
  const stateRef = useRef({ tool: 'none' as Tool, selId: null as string | null });
  stateRef.current = { tool, selId };
  const drawnSeries = useRef<ISeriesApi<'Line'>[]>([]);
  const drawnLines = useRef<IPriceLine[]>([]);

  useEffect(() => { setDrawings(loadDrawings(p.symbolKey)); pend.current = null; setHint(''); setTool('none'); }, [p.symbolKey]);
  useEffect(() => { try { localStorage.setItem(`tm-draw:${p.symbolKey}`, JSON.stringify(drawings)); } catch { /* ignore */ } }, [drawings, p.symbolKey]);
  useEffect(() => { if (box.current) box.current.style.cursor = tool === 'none' ? '' : 'crosshair'; }, [tool]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]');
      const { tool: t, selId: s } = stateRef.current;
      if (e.key === 'Escape') {
        if (t !== 'none' || pend.current) { e.preventDefault(); cancelTool(); }
        else if (s) setSelId(null);
        setShowList(false);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s && !typing) {
        e.preventDefault();
        removeDrawing(s);
      }
    };
    document.addEventListener('keydown', onKey, true);   // capture phase: runs before any other handler can stop the event
    return () => document.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (t: Tool) => {
    pend.current = null; setSelId(null);
    if (tool === t) { setTool('none'); setHint(''); return; }
    setTool(t);
    setHint(t === 'hline' ? 'Click on the chart to place the line' : 'Click the first point');
  };

  // create once
  useEffect(() => {
    const ch = createChart(box.current!, {
      autoSize: true,
      layout: { background: { color: THEMES[p.theme].bg }, textColor: THEMES[p.theme].text },
      grid: { vertLines: { color: THEMES[p.theme].grid }, horzLines: { color: THEMES[p.theme].grid } },
      rightPriceScale: { borderColor: THEMES[p.theme].border },
      timeScale: { borderColor: THEMES[p.theme].border, timeVisible: true, secondsVisible: false, rightOffset: 8, minBarSpacing: 1.5, shiftVisibleRangeOnNewBar: true },
      crosshair: { mode: 0 },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
    });
    chart.current = ch;
    box.current!.addEventListener('contextmenu', (e) => { if (toolRef.current !== 'none' || pend.current) { e.preventDefault(); cancelTool(); } });
    vol.current = ch.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const line = (color: string, width: 1 | 2 = 1, dashed = false) => ch.addLineSeries({ color, lineWidth: width, lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false });
    e20.current = ch.addLineSeries({ color: '#f5a623', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    e50.current = ch.addLineSeries({ color: '#ab47bc', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    bbU.current = line('#2962ff'); bbL.current = line('#2962ff'); bbM.current = line('#2962ff88', 1, true);
    vw.current = line('#00bcd4', 2);

    ch.subscribeClick((param) => {
      const t = toolRef.current;
      if (!param.point || !main.current) return;
      if (t === 'none') { setSelId(hitTest(param.point.x, param.point.y)); return; }
      const price = main.current.coordinateToPrice(param.point.y);
      if (price === null) return;
      const arr = data.current;
      const tt = (param.time as number | undefined) ?? (ch.timeScale().coordinateToTime(param.point.x) as number | null) ?? arr[arr.length - 1]?.time;
      if (tt === undefined) return;
      const id = `d${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      if (t === 'hline') {
        setDrawings((d) => [...d, { id, kind: 'hline', pts: [{ time: tt, price }] }]);
        setTool('none'); setHint('');
        return;
      }
      if (!pend.current) { pend.current = { time: tt, price }; setHint(t === 'fib' ? 'Click the second point (the other end of the move)' : 'Click the second point'); return; }
      const first = pend.current;           // copy now: React may run the update later, after pend is cleared
      setDrawings((d) => [...d, { id, kind: t, pts: [first, { time: tt, price }] }]);
      pend.current = null; setTool('none'); setHint('');
    });
    return () => { ch.remove(); chart.current = undefined; main.current = undefined; };
  }, []);

  // draw the saved drawings (rebuilt whenever they change; there are only a handful)
  useEffect(() => {
    const ch = chart.current, m = main.current;
    if (!ch || !m) return;
    drawnSeries.current.forEach((s) => { try { ch.removeSeries(s); } catch { /* already gone */ } });
    drawnLines.current.forEach((l) => { try { m.removePriceLine(l); } catch { /* series rebuilt */ } });
    drawnSeries.current = []; drawnLines.current = [];
    const last = data.current[data.current.length - 1]?.time;
    for (const d of drawings) {
      const sel = d.id === selId;
      const color = sel ? '#f5a623' : DRAW_COLOR;
      const w = (sel ? 3 : 1) as 1 | 3;
      if (d.kind === 'hline') {
        drawnLines.current.push(m.createPriceLine({ price: d.pts[0].price, color, lineWidth: w, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: sel ? 'selected' : '' }));
        continue;
      }
      const [a, b] = [...d.pts].sort((x, y) => x.time - y.time);
      if (!a || !b || a.time === b.time) continue;
      if (d.kind === 'trend') {
        const pts = [{ time: a.time as Time, value: a.price }, { time: b.time as Time, value: b.price }];
        if (last !== undefined && last > b.time) pts.push({ time: last as Time, value: b.price + ((b.price - a.price) / (b.time - a.time)) * (last - b.time) }); // extend to the latest candle
        const s = ch.addLineSeries({ color, lineWidth: (sel ? 4 : 2) as 2 | 4, autoscaleInfoProvider: () => null, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(pts);
        drawnSeries.current.push(s);
      } else {
        const [p1, p2] = d.pts;
        const guide = ch.addLineSeries({ color: '#787b86', lineWidth: 1, lineStyle: LineStyle.Dashed, autoscaleInfoProvider: () => null, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        guide.setData([...d.pts].sort((x, y) => x.time - y.time).map((q) => ({ time: q.time as Time, value: q.price })));
        drawnSeries.current.push(guide);
        for (const [lvl, color] of FIB) {
          const price = p2.price - (p2.price - p1.price) * lvl;   // 0% at the end of the move, 100% back at its start
          drawnLines.current.push(m.createPriceLine({ price, color: sel ? '#f5a623' : color, lineWidth: w, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${(lvl * 100).toFixed(1)}%` }));
        }
      }
    }
  }, [drawings, p.type, ready, selId]);

  useEffect(() => {
    const t = THEMES[p.theme];
    chart.current?.applyOptions({
      layout: { background: { color: t.bg }, textColor: t.text },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border }, timeScale: { borderColor: t.border },
    });
  }, [p.theme]);

  // chart type
  useEffect(() => { buildMain(); paintAll(); plKey.current = ''; pl.current = []; srLines.current = []; drawnLines.current = []; setReady((r) => r + 1); }, [p.type]); // eslint-disable-line react-hooks/exhaustive-deps

  // price lines for open positions (entry / stop / target)
  const pl = useRef<IPriceLine[]>([]);
  const plKey = useRef('');
  useEffect(() => {
    const m = main.current;
    if (!m) return;
    const key = p.lines.map((l) => `${l.price}|${l.color}|${l.dashed ? 1 : 0}`).join(';');
    if (key === plKey.current && pl.current.length === p.lines.length && pl.current.length) {
      // same levels: only the label text (live P&L) changed, so update it in place instead of rebuilding the lines
      pl.current.forEach((x, i) => x.applyOptions({ title: p.lines[i].title }));
      return;
    }
    plKey.current = key;
    pl.current.forEach((x) => { try { m.removePriceLine(x); } catch { /* series was rebuilt */ } });
    pl.current = p.lines.map((l) => m.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: l.title }));
  }, [p.lines, p.type]);

  // automatic support / resistance
  const srLines = useRef<IPriceLine[]>([]);
  useEffect(() => {
    const m = main.current;
    if (!m) return;
    srLines.current.forEach((x) => { try { m.removePriceLine(x); } catch { /* series was rebuilt */ } });
    srLines.current = [];
    if (!p.showLevels) return;
    srLines.current = p.levels.map((l) => m.createPriceLine({ price: l.price, color: '#9598a1', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: `S/R ×${l.touches}` }));
  }, [p.levels, p.showLevels, p.type]);

  useEffect(() => {
    e20.current?.applyOptions({ visible: p.ema20 });
    e50.current?.applyOptions({ visible: p.ema50 });
    vol.current?.applyOptions({ visible: p.vol });
    [bbU, bbM, bbL].forEach((s) => s.current?.applyOptions({ visible: p.bb }));
    vw.current?.applyOptions({ visible: p.vwap });
    if (p.bb || p.vwap) paintStudies();
  }, [p.ema20, p.ema50, p.vol, p.bb, p.vwap]); // eslint-disable-line react-hooks/exhaustive-deps

  // pattern lines for the selected chart pattern
  useEffect(() => {
    const ch = chart.current!;
    overlays.current.forEach((s) => ch.removeSeries(s));
    overlays.current = [];
    const s = p.selected;
    if (!s || s.kind !== 'chart' || s.score <= 0) return;
    const color = COL[cls(s.eff) as keyof typeof COL];
    for (const l of s.lines) {
      const pts: { time: Time; value: number }[] = [];
      [...l.pts].sort((a, b) => a.time - b.time).forEach((q) => {
        if (!pts.length || (pts[pts.length - 1].time as number) !== q.time) pts.push({ time: q.time as Time, value: q.price });
      });
      if (pts.length < 2) continue;
      const ls = ch.addLineSeries({ color, lineWidth: 2, lineStyle: l.dash ? 2 : 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ls.setData(pts);
      overlays.current.push(ls);
    }
  }, [p.selected]);

  // candle signal markers: few, strong, text only on the newest (keeps zoom/pan fast)
  useEffect(() => {
    const m = main.current as ISeriesApi<'Candlestick'> | undefined;
    if (!m) return;
    if (p.type !== 'candles' || !p.signalsOn) { m.setMarkers([]); return; }
    const sc = p.selected?.kind === 'candle' ? p.selected : null;
    const list = p.signals.filter((s) => (sc ? s.id === sc.id : s.score >= 65)).slice(-MAX_MARKERS);
    const out: SeriesMarker<Time>[] = list.map((s, i) => {
      const text = i >= list.length - 2 || sc ? s.name : '';
      return s.bias > 0 ? { time: s.time as Time, position: 'belowBar', color: COL.up, shape: 'arrowUp', text }
        : s.bias < 0 ? { time: s.time as Time, position: 'aboveBar', color: COL.down, shape: 'arrowDown', text }
          : { time: s.time as Time, position: 'inBar', color: COL.neu, shape: 'circle', text };
    });
    m.setMarkers(out.sort((a, b) => (a.time as number) - (b.time as number)));
  }, [p.signals, p.signalsOn, p.selected, p.type]);

  return (
    <>
      <div id="chart" ref={box} />
      <div className="zoombar">
        <button title="Zoom out" onClick={() => zoom(1.4)}>−</button>
        <button title="Zoom in" onClick={() => zoom(0.7)}>+</button>
        <button title="Reset zoom and price scale" onClick={fit}>Reset</button>
        <button title="Jump to latest candle" onClick={latest}>Latest »</button>
      </div>
      <div className="drawbar" role="toolbar" aria-label="Drawing tools">
        <button className={tool === 'hline' ? 'on' : ''} title="Horizontal line" onClick={() => pick('hline')}>─</button>
        <button className={tool === 'trend' ? 'on' : ''} title="Trend line (two clicks)" onClick={() => pick('trend')}>╱</button>
        <button className={tool === 'fib' ? 'on' : ''} title="Fibonacci retracement (two clicks)" onClick={() => pick('fib')}>Fib</button>
        <button className={showList ? 'on' : ''} title="List of drawings (select or delete one)" onClick={() => setShowList((s) => !s)}>☰</button>
        <button title="Undo last drawing" disabled={!drawings.length} onClick={() => setDrawings((d) => d.slice(0, -1))}>↶</button>
        <button title="Delete all drawings on this symbol" disabled={!drawings.length} onClick={() => { if (confirm('Delete all drawings on this symbol?')) setDrawings([]); }}>🗑</button>
        <button title="Save a picture of the chart" onClick={shot}>📷</button>
      </div>
      {hint && (
        <div className="drawhint">
          {hint} <span className="small">· Esc or right-click to cancel</span>
          <button onClick={cancelTool}>✕ Cancel</button>
        </div>
      )}
      {!hint && selId && (() => {
        const d = drawings.find((x) => x.id === selId);
        return d ? (
          <div className="drawhint sel">
            {d.kind === 'hline' ? 'Horizontal line' : d.kind === 'trend' ? 'Trend line' : 'Fibonacci'} selected
            <button className="del" onClick={() => removeDrawing(d.id)}>🗑 Delete</button>
            <button onClick={() => setSelId(null)}>Done</button>
          </div>
        ) : null;
      })()}
      {showList && (
        <div className="drawlist">
          <div className="small" style={{ padding: '2px 4px 6px' }}>Drawings on this symbol</div>
          {drawings.length ? drawings.map((d, i) => (
            <div key={d.id} className={`drawitem ${d.id === selId ? 'on' : ''}`}>
              <button className="grow" onClick={() => setSelId(d.id)}>{i + 1}. {d.kind === 'hline' ? `Horizontal line · ${d.pts[0].price.toPrecision(7)}` : d.kind === 'trend' ? 'Trend line' : 'Fibonacci'}</button>
              <button className="x" title="Delete this drawing" onClick={() => removeDrawing(d.id)}>✕</button>
            </div>
          )) : <div className="small" style={{ padding: 4 }}>Nothing drawn yet.</div>}
        </div>
      )}
    </>
  );
});

export default ChartView;
