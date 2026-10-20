import { useEffect, useMemo, useState } from 'react';
import { currencyOf, fetchLivePrices } from '../data';
import type { Cur } from '../fx';
import { costOf, exitFeeOf, feeInOf, FEE_DEFAULT, netPnl, pnlOf, type Position, type usePaper } from '../paper';
import { usePrices } from '../priceStore';
import { fmt, type Instrument } from '../types';
import MoneyLevel from './MoneyLevel';
import LevelEditor, { fmtPrice, suggestLevel, type PreviewLine } from './LevelEditor';

type Paper = ReturnType<typeof usePaper>;
export interface Prefill { side: 'long' | 'short'; sl: number; tp: number; note: string; nonce: number }
interface Props {
  inst: Instrument; price: number | null; prices: Record<string, number>; paper: Paper; prefill: Prefill | null;
  cur: Cur; usdPer: (ccy: string) => number; onOpen(i: Instrument): void;
  atr: number | null;                                       // recent average range of the chart being viewed
  onPreview(key: string, lines: PreviewLine[]): void;       // draws the levels being edited on the chart
}

const col = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
const plain = (x: number) => (Math.floor(x * 100) / 100).toString();
const num = (s: string) => (s.trim() === '' ? undefined : parseFloat(s));

/** SL ── entry ── TP track with a dot for the current price. */
function RangeBar({ p, now }: { p: Position; now: number }) {
  const pts = [p.entry, now, p.sl, p.tp].filter((v): v is number => v !== undefined);
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const pad = (hi - lo) * 0.1 || Math.abs(p.entry) * 0.01 || 1;
  const a = lo - pad, b = hi + pad;
  // Profit always runs left to right: stop on the left, target on the right. A short makes money when the price FALLS,
  // so its axis is mirrored; otherwise the dot would drift toward the stop while the position is winning.
  const pct = (v: number) => (p.side === 'long' ? ((v - a) / (b - a)) * 100 : ((b - v) / (b - a)) * 100);
  const at = (v: number) => `${pct(v)}%`;
  const span = (x: number, y: number) => ({ left: `${Math.min(pct(x), pct(y))}%`, width: `${Math.abs(pct(x) - pct(y))}%` });
  const winning = (p.side === 'long' ? now - p.entry : p.entry - now) >= 0;
  return (
    <div className="rbar" aria-hidden="true">
      {p.sl !== undefined && <i className="zone loss" style={span(p.sl, p.entry)} />}
      {p.tp !== undefined && <i className="zone gain" style={span(p.entry, p.tp)} />}
      {p.sl !== undefined && <i className="tick sl" style={{ left: at(p.sl) }} />}
      {p.tp !== undefined && <i className="tick tp" style={{ left: at(p.tp) }} />}
      <i className="tick en" style={{ left: at(p.entry) }} />
      <i className={`now ${winning ? 'win' : 'lose'}`} style={{ left: at(now) }} />
    </div>
  );
}

function PositionCard({ p, px, cur, paper, onOpen, atr, viewed, onPreview }: { p: Position; px: number; cur: Cur; paper: Paper; onOpen(i: Instrument): void; atr: number | null; viewed: boolean; onPreview(key: string, lines: PreviewLine[]): void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [sl, setSl] = useState(p.sl !== undefined ? String(p.sl) : '');
  const [tp, setTp] = useState(p.tp !== undefined ? String(p.tp) : '');
  const [err, setErr] = useState('');
  const [slAuto, setSlAuto] = useState(false);
  const [tpAuto, setTpAuto] = useState(false);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(false), 3000); return () => clearTimeout(t); }, [confirm]);

  const long = p.side === 'long';
  const fxn = paper.fxNow(p);
  const gross = pnlOf(p, px, fxn);
  const fees = feeInOf(p) + exitFeeOf(p, px, fxn);
  const pl = gross - fees;                 // what you would really keep if you closed now
  const pct = (pl / costOf(p)) * 100;

  // close at the freshest price available, not the last one painted on screen
  const closeNow = async () => {
    setBusy(true);
    const q = (await fetchLivePrices([p.inst]))[p.inst.id];
    paper.close(p.id, q?.price ?? px);
  };
  const unit = p.ccy ?? 'USD';

  // opening the editor fills in a suggestion for any level that is missing, so there is always something to adjust
  const startEdit = () => {
    const s = p.sl !== undefined ? fmtPrice(p.sl) : fmtPrice(suggestLevel('sl', p.side, px, atr));
    const t = p.tp !== undefined ? fmtPrice(p.tp) : fmtPrice(suggestLevel('tp', p.side, px, atr));
    setSl(s); setTp(t); setSlAuto(p.sl === undefined); setTpAuto(p.tp === undefined); setErr(''); setEdit(true);
  };
  // show the levels being edited on the chart (only possible for the symbol on screen)
  useEffect(() => {
    const key = 'pos-' + p.id;
    if (!edit || !viewed) { onPreview(key, []); return; }
    const out: PreviewLine[] = [];
    const s = num(sl), t = num(tp);
    if (s !== undefined && Number.isFinite(s)) out.push({ price: s, color: '#ef5350', title: 'SL (editing)', dashed: true });
    if (t !== undefined && Number.isFinite(t)) out.push({ price: t, color: '#26a69a', title: 'TP (editing)', dashed: true });
    onPreview(key, out);
    return () => onPreview(key, []);
  }, [edit, viewed, sl, tp]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const s = num(sl), t = num(tp);
    if (s !== undefined && (long ? s >= px : s <= px)) { setErr(`Stop must be ${long ? 'below' : 'above'} the current price (${fmt(px)}).`); return; }
    if (t !== undefined && (long ? t <= px : t >= px)) { setErr(`Target must be ${long ? 'above' : 'below'} the current price (${fmt(px)}).`); return; }
    paper.setLevels(p.id, s, t);
    setErr(''); setEdit(false);
  };

  return (
    <div className={`pcard ${pl >= 0 ? 'win' : 'lose'}`}>
      <div className="phead">
        <button className="plink" title="Show this chart" disabled={p.inst.source === 'nse'} onClick={() => onOpen(p.inst)}>
          <b>{p.inst.id}</b>
          <span className={`badge ${long ? 'up' : 'down'}`}>{long ? 'LONG' : 'SHORT'}</span>
        </button>
        <div className={`ppl ${col(pl)}`}><b>{cur.signed(pl)}</b><span>{pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%</span></div>
      </div>
      {p.inst.name && p.inst.name !== p.inst.id && <div className="small pname2">{p.inst.name}</div>}

      <RangeBar p={p} now={px} />
      <div className="plabels">
        <span className="down">{p.sl !== undefined ? `SL ${fmt(p.sl)}` : 'No stop'}</span>
        <span>Entry {fmt(p.entry)}</span>
        <span className="up">{p.tp !== undefined ? `TP ${fmt(p.tp)}` : 'No target'}</span>
      </div>

      {p.trail ? <div className="small" style={{ marginTop: 4 }}><span className="chip">Trailing stop {p.trail}%</span> the stop follows the best price and never moves back</div> : null}
      <div className="pfees small" title="Profit after the entry fee already paid and the exit fee you would pay now">
        Gross <b className={col(gross)}>{cur.signed(gross)}</b> · Fees <b>−{cur.money(fees)}</b> · Net <b className={col(pl)}>{cur.signed(pl)}</b>
      </div>
      <div className="pgrid">
        <div><span>Now</span><b>{fmt(px)} <em>{unit}</em></b></div>
        <div><span>Quantity</span><b>{p.qty.toPrecision(4)}</b></div>
        <div><span>Invested</span><b>{cur.money(costOf(p))}</b></div>
      </div>

      {edit ? (
        <div className="pedit2">
          <LevelEditor kind="sl" side={p.side} entry={px} value={sl} auto={slAuto} atr={atr} cur={cur}
            onChange={(v) => { setSl(v); setSlAuto(false); }}
            onReset={() => { setSl(fmtPrice(suggestLevel('sl', p.side, px, atr))); setSlAuto(true); }}
            result={(lvl) => netPnl(p, lvl, fxn)} />
          <LevelEditor kind="tp" side={p.side} entry={px} value={tp} auto={tpAuto} atr={atr} cur={cur} other={num(sl) ?? null}
            onChange={(v) => { setTp(v); setTpAuto(false); }}
            onReset={() => { setTp(fmtPrice(suggestLevel('tp', p.side, px, atr))); setTpAuto(true); }}
            result={(lvl) => netPnl(p, lvl, fxn)} />
          <div className="small">Distances are measured from the current price (<b>{fmt(px)}</b>). "If hit" is your profit or loss after fees.</div>
          {err && <div className="small down">{err}</div>}
          <div className="pact" style={{ marginTop: 8 }}>
            <button className="mini on" onClick={save}>Save levels</button>
            <button className="mini" onClick={() => { setEdit(false); setErr(''); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="pact">
          <button className="mini" onClick={startEdit}>Edit stop / target</button>
          <button className={`mini ${confirm ? 'danger' : ''}`} disabled={busy} onClick={() => (confirm ? closeNow() : setConfirm(true))}>
            {busy ? 'Closing…' : confirm ? 'Confirm close' : 'Close position'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Trade({ inst, price: priceProp, prices: pricesProp, paper, prefill, cur, usdPer, onOpen, atr, onPreview }: Props) {
  const { acc } = paper;
  // live prices come straight from the tick store (about 15 updates a second); the props are only the starting values
  const live = usePrices();
  const prices = useMemo(() => ({ ...pricesProp, ...live }), [pricesProp, live]);
  const price = live[inst.id] ?? priceProp;
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [amount, setAmount] = useState('');   // in the display currency
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [fund, setFund] = useState('');       // in the display currency
  const [risk, setRisk] = useState('1');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [closeAll, setCloseAll] = useState(false);
  const [kind, setKind] = useState<'market' | 'limit' | 'stop'>('market');
  const [trigger, setTrigger] = useState('');
  const [trail, setTrail] = useState('');
  const auto = true;                           // stop and target are suggested until the user takes over
  const [slT, setSlT] = useState(false);           // the user has taken over the stop
  const [tpT, setTpT] = useState(false);           // ... and the target
  const [nonce, setNonce] = useState(0);
  const [mode, setMode] = useState<'amount' | 'price'>(() => { try { return localStorage.getItem('tm-lvlmode') === 'price' ? 'price' : 'amount'; } catch { return 'amount'; } });
  const pickMode = (m: 'amount' | 'price') => { setMode(m); try { localStorage.setItem('tm-lvlmode', m); } catch { /* ignore */ } };
  useEffect(() => { if (!closeAll) return; const t = setTimeout(() => setCloseAll(false), 3000); return () => clearTimeout(t); }, [closeAll]);

  useEffect(() => {
    if (!prefill) return;
    setSide(prefill.side); setSl(fmtPrice(prefill.sl)); setTp(fmtPrice(prefill.tp)); setNote(prefill.note); setSlT(true); setTpT(true);
  }, [prefill?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = (id: string, fallback: number) => prices[id] ?? fallback;
  const invested = acc.positions.reduce((s, p) => s + costOf(p), 0);
  const rate = acc.feeRate ?? FEE_DEFAULT;
  // open P&L is shown net of fees, so it matches what closing the position will actually book
  const open = acc.positions.reduce((s, p) => s + netPnl(p, last(p.inst.id, p.entry), paper.fxNow(p)), 0);
  const grossOpen = acc.positions.reduce((s, p) => s + pnlOf(p, last(p.inst.id, p.entry), paper.fxNow(p)) - exitFeeOf(p, last(p.inst.id, p.entry), paper.fxNow(p)), 0);
  const equity = acc.cash + invested + grossOpen;     // all in USD; entry fees are already out of cash
  const total = equity - acc.deposits;
  const realized = acc.history.reduce((s, h) => s + h.pnl, 0);
  const wins = acc.history.filter((h) => h.pnl > 0).length;

  const ccy = currencyOf(inst);
  const fx = usdPer(ccy);                         // USD per 1 unit of the instrument's currency
  const mult = inst.lot ?? (inst.kind === 'OPTION' ? 100 : 1);
  const amtUSD = cur.toUSD(parseFloat(amount) || 0);
  const qty = price && amtUSD ? amtUSD / (price * fx * mult) : 0;
  const slN = num(sl), tpN = num(tp);
  const long = side === 'long';

  const trigN = num(trigger), trailN = num(trail);
  const ref = kind === 'market' ? price : trigN ?? null; // the price the order will fill at
  const below = long === (kind === 'limit');           // limit buy and stop sell wait for a lower price
  const trigBad = kind !== 'market' && price && trigN !== undefined && (below ? trigN >= price : trigN <= price) ? `Trigger must be ${below ? 'below' : 'above'} the current price ${fmt(price)}` : '';
  const slBad = ref && slN !== undefined && (long ? slN >= ref : slN <= ref) ? `Stop should be ${long ? 'below' : 'above'} ${fmt(ref)}` : '';
  const tpBad = ref && tpN !== undefined && (long ? tpN <= ref : tpN >= ref) ? `Target should be ${long ? 'above' : 'below'} ${fmt(ref)}` : '';
  const feesUSD = amtUSD * rate * 2;                     // entry and exit
  // both figures are what you would really lose or make: the move itself plus (or minus) the fees
  const lossUSD = ref && slN !== undefined && !slBad ? amtUSD * (Math.abs(ref - slN) / ref) + feesUSD : null;
  const gainUSD = ref && tpN !== undefined && !tpBad ? Math.max(0, amtUSD * (Math.abs(tpN - ref) / ref) - feesUSD) : null;

  // new symbol: forget any levels from the last one
  useEffect(() => { setSl(''); setTp(''); setSlT(false); setTpT(false); }, [inst.id]);
  // Fill in a stop and target automatically. This re-runs when the side, order type, trigger, volatility or symbol change,
  // but NOT on every price tick, so the numbers do not move while you are adjusting them.
  useEffect(() => {
    if (!auto || !ref) return;
    if (!slT) setSl(fmtPrice(suggestLevel('sl', side, ref, atr)));
    if (!tpT) setTp(fmtPrice(suggestLevel('tp', side, ref, atr)));
  }, [auto, side, kind, trigN, inst.id, atr, ref === null, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // draw the levels you are setting on the chart while this panel is open
  useEffect(() => {
    const out: PreviewLine[] = [];
    if (slN !== undefined && Number.isFinite(slN) && !slBad) out.push({ price: slN, color: '#ef5350', title: 'SL (new)', dashed: true });
    if (tpN !== undefined && Number.isFinite(tpN) && !tpBad) out.push({ price: tpN, color: '#26a69a', title: 'TP (new)', dashed: true });
    onPreview('ticket', out);
    return () => onPreview('ticket', []);
  }, [slN, tpN, slBad, tpBad]); // eslint-disable-line react-hooks/exhaustive-deps

  // size the position so that hitting the stop loses `risk`% of equity
  const sizeByRisk = () => {
    if (!ref || slN === undefined || slN === ref) { setMsg({ ok: false, t: 'Set a stop loss first.' }); return; }
    const riskUSD = (equity * (parseFloat(risk) || 0)) / 100;
    const full = riskUSD / (Math.abs(ref - slN) / ref);
    const usd = Math.min(full, acc.cash / (1 + rate));
    setAmount(plain(cur.fromUSD(usd)));
    setMsg({ ok: true, t: usd < full ? 'Capped to your available cash.' : `Sized so a stop-out loses about ${risk}% of equity.` });
  };

  const exportCsv = () => {
    const rows = [['symbol', 'side', 'qty', 'entry', 'exit', 'price_currency', 'pnl_usd', 'reason', 'opened', 'closed'],
      ...acc.history.map((h) => [h.inst.id, h.side, h.qty, h.entry, h.exit, h.ccy ?? 'USD', h.pnl.toFixed(2), h.reason, new Date(h.time).toISOString(), new Date(h.exitTime).toISOString()])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'paper-trades.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const place = () => {
    if (!price) { setMsg({ ok: false, t: 'No price yet.' }); return; }
    if (kind !== 'market') {
      if (trigN === undefined) { setMsg({ ok: false, t: 'Enter a trigger price.' }); return; }
      const err = paper.placeOrder(inst, side, kind, trigN, amtUSD, price, slN, tpN, trailN);
      setMsg(err ? { ok: false, t: err } : { ok: true, t: `${kind === 'limit' ? 'Limit' : 'Stop'} order placed: ${long ? 'buy' : 'sell'} when ${inst.id} reaches ${fmt(trigN)}.` });
      if (!err) { setAmount(''); setSl(''); setTp(''); setNote(''); setTrigger(''); setTrail(''); setSlT(false); setTpT(false); setNonce((n) => n + 1); }
      return;
    }
    const err = paper.open(inst, side, amtUSD, price, slN, tpN, trailN);
    setMsg(err ? { ok: false, t: err } : { ok: true, t: `${long ? 'Bought' : 'Sold short'} ${qty.toPrecision(4)} ${inst.id} at ${fmt(price)} ${ccy}` });
    if (!err) { setAmount(''); setSl(''); setTp(''); setNote(''); setTrail(''); setSlT(false); setTpT(false); setNonce((n) => n + 1); }
  };

  return (
    <aside className="panel">
      {/* open trades come first, and only when there are any */}
      {acc.positions.length > 0 && (<>
      <div className="sechead">
        <h3>Open positions ({acc.positions.length})</h3>
        {acc.positions.length > 1 && (
          <button className={`mini ${closeAll ? 'danger' : ''}`} onClick={() => {
            if (!closeAll) { setCloseAll(true); return; }
            acc.positions.forEach((p) => paper.close(p.id, last(p.inst.id, p.entry)));
            setCloseAll(false);
          }}>{closeAll ? 'Confirm: close all' : 'Close all'}</button>
        )}
      </div>
      {acc.positions.map((p) => (
        <PositionCard key={p.id} p={p} px={last(p.inst.id, p.entry)} cur={cur} paper={paper} onOpen={onOpen} atr={p.inst.id === inst.id ? atr : null} viewed={p.inst.id === inst.id} onPreview={onPreview} />
      ))}
      </>)}

      {(acc.orders ?? []).length > 0 && (<>
        <h3>Pending orders ({(acc.orders ?? []).length})</h3>
        {(acc.orders ?? []).map((o) => {
          const px = last(o.inst.id, o.trigger);
          const away = ((o.trigger - px) / px) * 100;
          return (
            <div key={o.id} className="card order">
              <div className="row">
                <span><b>{o.inst.id}</b> <span className={`badge ${o.side === 'long' ? 'up' : 'down'}`}>{o.kind.toUpperCase()} {o.side === 'long' ? 'BUY' : 'SELL'}</span></span>
                <button className="mini" onClick={() => paper.cancelOrder(o.id)}>Cancel</button>
              </div>
              <div className="small">Triggers at <b>{fmt(o.trigger)}</b> ({away >= 0 ? '+' : '−'}{Math.abs(away).toFixed(2)}% from now) · {cur.money(o.amountUSD)}{o.sl !== undefined ? ` · SL ${fmt(o.sl)}` : ''}{o.tp !== undefined ? ` · TP ${fmt(o.tp)}` : ''}{o.trail ? ` · trail ${o.trail}%` : ''}</div>
            </div>
          );
        })}
      </>)}

      {/* 1. order ticket first: it is what people come here to use */}
      <h3>New order · {inst.id}</h3>
      <div className="card">
        <div className="row"><b>{price ? fmt(price) : '–'} <span className="small">{ccy}</span></b>{price && ccy !== cur.code && <span className="small">≈ {cur.money(price * fx)}</span>}</div>

        <div className="segc">
          <button className={long ? 'on buy' : ''} onClick={() => setSide('long')}>Buy</button>
          <button className={!long ? 'on sell' : ''} onClick={() => setSide('short')}>Sell (short)</button>
        </div>

        <label className="fld">How much to invest
          <span className="igroup"><em>{cur.code}</em><input inputMode="decimal" placeholder={plain(cur.fromUSD(10000))} value={amount} onChange={(e) => setAmount(e.target.value)} /></span>
        </label>
        <div className="chips" style={{ padding: '6px 0 0' }}>
          {[25, 50, 100].map((q) => (
            <button key={q} onClick={() => setAmount(plain(cur.fromUSD((acc.cash / (1 + rate)) * (q / 100))))}>{q}% of cash</button>
          ))}
        </div>

        {note && <div className="note">{note}</div>}

        <div className="segc lvltabs" role="tablist">
          <button role="tab" aria-selected={mode === 'amount'} className={mode === 'amount' ? 'on' : ''} onClick={() => pickMode('amount')}>Profit / loss amount</button>
          <button role="tab" aria-selected={mode === 'price'} className={mode === 'price' ? 'on' : ''} onClick={() => pickMode('price')}>Target / stop price</button>
        </div>
        {mode === 'amount' ? (<>
          <MoneyLevel kind="tp" entry={ref} value={tp} cur={cur} invested={parseFloat(amount) || 0}
            onChange={(v) => { setTp(v); setTpT(true); }} result={(lvl) => (ref ? amtUSD * ((long ? lvl - ref : ref - lvl) / ref) - amtUSD * rate * 2 : null)} />
          <MoneyLevel kind="sl" entry={ref} value={sl} cur={cur} invested={parseFloat(amount) || 0}
            onChange={(v) => { setSl(v); setSlT(true); }} result={(lvl) => (ref ? amtUSD * ((long ? lvl - ref : ref - lvl) / ref) - amtUSD * rate * 2 : null)} />
        </>) : (<>
          <LevelEditor hideAmount kind="tp" side={side} entry={ref} value={tp} auto={auto && !tpT} atr={atr} cur={cur} other={slN !== undefined && !slBad ? slN : null}
            onChange={(v) => { setTp(v); setTpT(true); }}
            onReset={() => { if (ref) { setTp(fmtPrice(suggestLevel('tp', side, ref, atr))); setTpT(false); } }}
            result={(lvl) => (ref ? amtUSD * ((long ? lvl - ref : ref - lvl) / ref) - amtUSD * rate * 2 : null)} />
          <LevelEditor hideAmount kind="sl" side={side} entry={ref} value={sl} auto={auto && !slT} atr={atr} cur={cur}
            onChange={(v) => { setSl(v); setSlT(true); }}
            onReset={() => { if (ref) { setSl(fmtPrice(suggestLevel('sl', side, ref, atr))); setSlT(false); } }}
            result={(lvl) => (ref ? amtUSD * ((long ? lvl - ref : ref - lvl) / ref) - amtUSD * rate * 2 : null)} />
        </>)}
        {(trigBad || slBad || tpBad) && <div className="small down">{trigBad || slBad || tpBad}</div>}

        {amtUSD > 0 && (
          <div className="preview">
            <div><span>{mult > 1 ? 'Contracts' : 'Quantity'}</span><b>{qty ? qty.toPrecision(4) : '–'}</b></div>
            <div><span>Risking</span><b>{lossUSD !== null && equity > 0 ? `${((lossUSD / equity) * 100).toFixed(1)}% of account` : '–'}</b></div>
            <div><span>Target hit</span><b className="up">{gainUSD !== null ? `+${cur.money(gainUSD)}` : '–'}</b></div>
            <div><span>Stop hit</span><b className="down">{lossUSD !== null ? `−${cur.money(lossUSD)}` : '–'}</b></div>
            {lossUSD && gainUSD ? <div className="wide"><span>Reward : risk</span><b className={gainUSD / lossUSD >= 1.5 ? 'up' : 'down'}>{(gainUSD / lossUSD).toFixed(1)} : 1</b></div> : null}
          </div>
        )}
        <div className="small" style={{ marginTop: 4 }}>Amounts are after fees. The trade closes by itself when the target or stop is reached.</div>

        <button className={`act ${long ? 'buyact' : 'sellact'}`} onClick={place}>{kind === 'market' ? `${long ? 'Buy' : 'Sell'} ${inst.id}` : `Place ${kind} ${long ? 'buy' : 'sell'}${trigN !== undefined ? ` at ${fmt(trigN)}` : ''}`}</button>
        {msg && <div className={`small ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 6 }}>{msg.t}</div>}

        <details className="fold">
          <summary>More options</summary>
          <div className="segc three">
            {(['market', 'limit', 'stop'] as const).map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'market' ? 'Market' : k === 'limit' ? 'Limit' : 'Stop'}</button>)}
          </div>
          {kind !== 'market' && (
            <label className="fld">{kind === 'limit' ? (long ? 'Buy when price falls to' : 'Sell when price rises to') : (long ? 'Buy when price breaks above' : 'Sell when price breaks below')}
              <span className="igroup"><em>{ccy}</em><input inputMode="decimal" placeholder={price ? fmt(price * (below ? 0.99 : 1.01)) : ''} value={trigger} onChange={(e) => setTrigger(e.target.value)} /></span>
            </label>
          )}
          <label className="fld">Trailing stop (% behind the best price)
            <span className="igroup"><input inputMode="decimal" placeholder="e.g. 1.5" value={trail} onChange={(e) => setTrail(e.target.value)} /></span>
          </label>
          <div className="btctl">
            <label className="fld" style={{ marginTop: 0 }}>Risk per trade (% of account)<input inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value)} /></label>
            <button className="mini" style={{ alignSelf: 'flex-end' }} onClick={sizeByRisk}>Set amount from stop</button>
          </div>
        </details>
      </div>

      {/* 2. account summary */}
      <div className="card">
        <div className="eqrow">
          <div>
            <div className="small">Account equity · {cur.code}</div>
            <div className="big">{cur.money(equity)}</div>
          </div>
          <div className={`pill ${col(total)}`} title="Profit or loss since you started, after deposits">
            {cur.signed(total)}<span>{acc.deposits ? `${total >= 0 ? '+' : '−'}${Math.abs((total / acc.deposits) * 100).toFixed(2)}%` : ''}</span>
          </div>
        </div>
        <details className="fold">
          <summary>Account details, add cash, fees</summary>
          <div className="stats">
            <div><span>Cash</span><b>{cur.money(acc.cash)}</b></div>
            <div><span>Open P&amp;L</span><b className={col(open)}>{cur.signed(open)}</b></div>
            <div><span>Realized</span><b className={col(realized)}>{cur.signed(realized)}</b></div>
            <div><span>Win rate</span><b>{acc.history.length ? `${((wins / acc.history.length) * 100).toFixed(0)}%` : '–'}</b></div>
          </div>

          <div className="btctl">
            <input placeholder={`Amount (${cur.code})`} inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} />
            <button className="mini" onClick={() => { paper.deposit(cur.toUSD(parseFloat(fund) || 0)); setFund(''); }}>Add cash</button>
            <button className="mini" onClick={() => { if (confirm('Reset the paper account to $100,000 and delete all trades?')) paper.reset(); }}>Reset</button>
          </div>
          <label className="fld">Trading fee per side (entry and exit each)
            <select value={rate} onChange={(e) => paper.setFeeRate(parseFloat(e.target.value))}>
              {[0, 0.0003, 0.0005, 0.001, 0.002].map((r) => <option key={r} value={r}>{r === 0 ? 'No fees' : `${(r * 100).toFixed(2)}%`}</option>)}
            </select>
          </label>
          <div className="small">Applies to new trades. The account is kept in US dollars and shown in {cur.code} at the live rate.</div>
        </details>
      </div>

      {/* 4. history */}
      <div className="sechead">
        <h3>Trade history</h3>
        {acc.history.length > 0 && <button className="mini" onClick={exportCsv}>Export CSV</button>}
      </div>
      <div className="card">
        {acc.history.length ? (
          <table className="hist"><tbody>
            <tr><th>Closed</th><th>Symbol</th><th>Result</th><th>Net P&amp;L</th></tr>
            {acc.history.slice(0, 15).map((h) => (
              <tr key={h.id}>
                <td className="small">{new Date(h.exitTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td>
                <td><b>{h.inst.id}</b> <span className={h.side === 'long' ? 'up' : 'down'}>{h.side === 'long' ? '▲' : '▼'}</span></td>
                <td><span className={`chip ${h.reason}`}>{h.reason === 'stop' ? 'Stop hit' : h.reason === 'target' ? 'Target hit' : 'Closed'}</span></td>
                <td className={col(h.pnl)}><b>{cur.signed(h.pnl)}</b>{h.fees !== undefined && h.gross !== undefined && <div className="small" title="Profit before fees, and total fees paid">gross {cur.signed(h.gross)} · fees −{cur.money(h.fees)}</div>}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <span className="small">Closed trades will appear here.</span>}
      </div>
      <p className="disc">Paper trading with virtual money and live prices. Real trading results will differ.</p>
    </aside>
  );
}
