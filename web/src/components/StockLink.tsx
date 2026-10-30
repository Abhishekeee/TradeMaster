import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Floating from './Floating';
import { WhyCard } from './WhyCard';
import { currencyOf, fetchBoard, fetchCandles } from '../data';
import { ago } from '../news';
import { whyNow, type WhyNow } from '../whyNow';
import type { Instrument } from '../types';

interface Look { price: number; chg: number | null; at: number }
const cache = new Map<string, Look>();
const inflight = new Map<string, Promise<Look | null>>();

async function quote(inst: Instrument): Promise<Look | null> {
  const hit = cache.get(inst.id);
  if (hit && Date.now() - hit.at < 15000) return hit;
  let p = inflight.get(inst.id);
  if (!p) {
    p = (async () => {
      let look: Look | null = null;
      if (inst.source === 'yahoo' || inst.source === 'binance') {
        const b = (await fetchBoard([inst.id]))[inst.id];
        if (b) look = { price: b.price, chg: b.chg, at: Date.now() };
      } else if (inst.source === 'mf') {
        const c = await fetchCandles(inst, '1D', 3);
        if (c && c.length) look = { price: c[c.length - 1].close, chg: c.length > 1 ? (c[c.length - 1].close / c[c.length - 2].close - 1) * 100 : null, at: Date.now() };
      }
      if (look) cache.set(inst.id, look);
      return look;
    })().finally(() => inflight.delete(inst.id));
    inflight.set(inst.id, p);
  }
  return p;
}

const nf = new Map<string, Intl.NumberFormat>();
function money(ccy: string, v: number): string {
  if (ccy === 'GBp' || ccy === 'GBX') return `${v.toFixed(2)}p`;
  let f = nf.get(ccy);
  if (!f) { try { f = new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy, maximumFractionDigits: v < 1 ? 6 : 2 }); } catch { f = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }); } nf.set(ccy, f); }
  return f.format(v);
}

/** Open a symbol on the Charts page. */
export function openChart(inst: Instrument) {
  try { localStorage.setItem('tm', JSON.stringify({ ...JSON.parse(localStorage.getItem('tm') || '{}'), inst })); } catch { /* ignore */ }
  location.hash = '#/charts';
}

/**
 * Wraps a stock or market name anywhere in the app. Hover: its current price, today's move and why it is moving.
 * Click: open its chart. `onOpen` lets the Charts page switch symbol in place instead of changing page.
 */
export default function StockLink({ inst, children, onOpen, className = '' }: { inst: Instrument; children: ReactNode; onOpen?(i: Instrument): void; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const plain = inst.source === 'mf' || inst.source === 'nse';   // funds and option contracts have no chart to open
  const [show, setShow] = useState(false);
  const [look, setLook] = useState<Look | null | undefined>(undefined);
  const [why, setWhy] = useState<WhyNow | null | undefined>(undefined);
  const [full, setFull] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    if (!show) return;
    let dead = false;
    setLook(cache.get(inst.id) ?? undefined);
    quote(inst).then((l) => { if (!dead) setLook(l); });
    const t = window.setInterval(() => quote(inst).then((l) => { if (!dead && l) setLook(l); }), 10000);
    return () => { dead = true; clearInterval(t); };
  }, [show, inst]);

  const chg = look ? look.chg : undefined;
  const haveChg = chg !== undefined && chg !== null;
  useEffect(() => {
    if (!show || !haveChg) return;
    let dead = false;
    whyNow(inst, chg ?? null).then((w) => { if (!dead) setWhy(w); }).catch(() => { if (!dead) setWhy(null); });
    return () => { dead = true; };
  }, [show, inst.id, haveChg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!show) setWhy(undefined); }, [show]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const enter = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setShow(true), 220); };
  // a short grace so the pointer can travel from the name into the card (clicks on links inside it)
  const leave = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setShow(false), 260); };
  const go = (e: { preventDefault(): void; stopPropagation(): void }) => { e.preventDefault(); e.stopPropagation(); clearTimeout(timer.current); setShow(false); (onOpen ?? openChart)(inst); };

  if (plain) return <>{children}</>;
  return (
    <>
      <span ref={ref} role="link" tabIndex={0} className={`stk ${className}`} onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}
        onClick={go} onKeyDown={(e) => { if (e.key === 'Enter') go(e); }}>
        {children}
        {show && (
          <Floating anchor={ref} className="stk-tip" width={300} stop>
            <div className="stk-nm"><b>{inst.id.replace(/\.(NS|BO)$/, '')}</b><span>{inst.name && inst.name !== inst.id ? inst.name : ''}</span></div>
            {look === undefined ? <div className="stk-px small">Loading price…</div>
              : look === null ? <div className="stk-px small">Price not available right now</div>
                : <div className="stk-px"><b>{money(currencyOf(inst), look.price)}</b>{look.chg !== null && <i className={look.chg >= 0 ? 'up' : 'down'}>{look.chg >= 0 ? '▲' : '▼'} {Math.abs(look.chg).toFixed(2)}%</i>}</div>}
            {look && look.chg !== null && (
              <div className="stk-why">
                <div className="stk-wh">Why is it {look.chg >= 0 ? 'up' : 'down'} today?</div>
                {why === undefined ? <div className="small">Checking the market and the latest news…</div>
                  : why === null ? <div className="small">Could not work that out right now.</div>
                    : <>
                      <ul>{why.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                      {why.news.map((n) => <a key={n.link} className="stk-news" href={n.link} target="_blank" rel="noopener noreferrer">{n.title}<small>{n.source}{n.time ? ` · ${ago(n.time)}` : ''}</small></a>)}
                    </>}
                <button className="mini" onClick={() => { setShow(false); setFull(true); }}>Full explanation</button>
              </div>
            )}
            <div className="stk-go small">Click the name to open the chart</div>
          </Floating>
        )}
      </span>
      {full && createPortal(
        <div className="modal" onClick={() => setFull(false)}>
          <div className="mk" onClick={(e) => e.stopPropagation()}>
            <div className="mk-head"><b>Why {inst.id.replace(/\.(NS|BO)$/, '')} moves</b><span className="grow" /><button className="mini" onClick={() => setFull(false)}>✕</button></div>
            <div className="mk-body"><WhyCard inst={inst} /></div>
          </div>
        </div>, document.body)}
    </>
  );
}
