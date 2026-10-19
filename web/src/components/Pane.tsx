import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts';
import { macdSeries, rsiSeries } from '../indicators';
import type { Candle } from '../types';

interface Props {
  kind: 'rsi' | 'macd';
  candles: React.MutableRefObject<Candle[]>;
  version: number;                       // changes whenever candles change, to redraw
  theme: 'dark' | 'light';
  main(): IChartApi | undefined;         // the main price chart this pane scrolls and zooms with
}

const THEMES = {
  dark: { bg: '#131722', text: '#b2b5be', grid: '#1c202b', border: '#2a2e39' },
  light: { bg: '#ffffff', text: '#434651', grid: '#eef0f5', border: '#dfe3ee' },
};

/** A small synchronized chart under the price chart (RSI or MACD). */
export default function Pane({ kind, candles, version, theme, main }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>();
  const s1 = useRef<ISeriesApi<'Line'>>();
  const s2 = useRef<ISeriesApi<'Line'>>();
  const hist = useRef<ISeriesApi<'Histogram'>>();

  useEffect(() => {
    const t = THEMES[theme];
    const ch = createChart(box.current!, {
      autoSize: true,
      layout: { background: { color: t.bg }, textColor: t.text },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: t.border, timeVisible: true, secondsVisible: false, rightOffset: 8, visible: false },
      handleScroll: false, handleScale: false,               // the main chart drives scrolling and zoom
      crosshair: { mode: 0 },
    });
    chart.current = ch;
    if (kind === 'rsi') {
      s1.current = ch.addLineSeries({ color: '#ab47bc', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'RSI 14' });
      s1.current.createPriceLine({ price: 70, color: '#ef535088', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      s1.current.createPriceLine({ price: 30, color: '#26a69a88', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      ch.priceScale('right').applyOptions({ autoScale: false });
      s1.current.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    } else {
      hist.current = ch.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      s1.current = ch.addLineSeries({ color: '#2962ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'MACD' });
      s2.current = ch.addLineSeries({ color: '#f5a623', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'Signal' });
    }

    // keep the visible range identical to the main chart, in both directions
    let busy = false;
    const m = main();
    const follow = (src: IChartApi, dst: IChartApi) => (r: { from: number; to: number } | null) => {
      if (!r || busy) return;
      busy = true;
      try { dst.timeScale().setVisibleLogicalRange(r); } catch { /* not ready */ }
      busy = false;
    };
    const toPane = m ? follow(m, ch) : null;
    if (m && toPane) {
      m.timeScale().subscribeVisibleLogicalRangeChange(toPane);
      const r = m.timeScale().getVisibleLogicalRange();
      if (r) ch.timeScale().setVisibleLogicalRange(r);
    }
    return () => { if (m && toPane) { try { m.timeScale().unsubscribeVisibleLogicalRangeChange(toPane); } catch { /* chart gone */ } } ch.remove(); chart.current = undefined; };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = THEMES[theme];
    chart.current?.applyOptions({ layout: { background: { color: t.bg }, textColor: t.text }, grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } }, rightPriceScale: { borderColor: t.border }, timeScale: { borderColor: t.border } });
  }, [theme]);

  useEffect(() => {
    const c = candles.current;
    if (c.length < 40) return;
    if (kind === 'rsi') {
      s1.current?.setData(rsiSeries(c).map((p) => ({ time: p.time as Time, value: p.value })));
    } else {
      const m = macdSeries(c);
      s1.current?.setData(m.line.map((p) => ({ time: p.time as Time, value: p.value })));
      s2.current?.setData(m.signal.map((p) => ({ time: p.time as Time, value: p.value })));
      hist.current?.setData(m.hist.map((p) => ({ time: p.time as Time, value: p.value, color: p.color })));
    }
    const r = main()?.timeScale().getVisibleLogicalRange();
    if (r) { try { chart.current?.timeScale().setVisibleLogicalRange(r); } catch { /* ignore */ } }
  }, [version, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="pane"><span className="panetag">{kind === 'rsi' ? 'RSI (14)' : 'MACD (12, 26, 9)'}</span><div ref={box} className="panebox" /></div>;
}
