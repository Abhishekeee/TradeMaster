import { useEffect, useRef, useState, type ReactNode } from 'react';
import SymbolSearch from './SymbolSearch';
import ChartPicker from './ChartPicker';
import Info from './Info';
import Floating, { inFloat } from './Floating';
import { currencyOf, fetchCandles, fetchDayRanges, fetchLivePrices, fundInst, searchFunds, type DayRange, type FundHit } from '../data';
import { checkDay, everTraded, nearestDays, reachedDays, type DayCheck } from '../priceCheck';
import type { MarketId } from '../markets';
import type { NewLot, Plan } from '../portfolio';
import { todayIso } from '../portfolioPlan';
import type { Instrument } from '../types';

type Step = 'kind' | 'pick' | 'a' | 'b' | 'date' | 'horizon' | 'purpose' | 'target' | 'loss' | 'calm' | 'review';
const ORDER: Step[] = ['kind', 'pick', 'a', 'b', 'date', 'horizon', 'purpose', 'target', 'loss', 'calm', 'review'];
const OPTIONAL: Step[] = ['date', 'purpose', 'target', 'loss', 'calm'];

const ago = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10); };
const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function FundSearch({ onPick }: { onPick(h: FundHit): void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FundHit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 3) { setItems([]); return; }
    let stale = false;
    const t = setTimeout(async () => { const r = await searchFunds(q); if (!stale) setItems(r.slice(0, 30)); }, 300);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !inFloat(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="symsearch" ref={box}>
      <input value={q} placeholder="Type the fund name, e.g. parag parikh flexi" spellCheck={false} style={{ textTransform: 'none' }} autoFocus
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && items.length > 0 && (
        <Floating anchor={box} className="sresults" width={Math.max(box.current?.offsetWidth ?? 0, 340)}>
          {items.map((h) => <li key={h.code} onMouseDown={() => { onPick(h); setQ(h.name); setOpen(false); }}><span>{h.name}</span></li>)}
        </Floating>
      )}
    </div>
  );
}

/** A row of big answer buttons; picking one moves on to the next question. */
function Choices<T extends string | number>({ value, options, onPick }: { value?: T; options: { v: T; label: string; hint?: string; disabled?: boolean }[]; onPick(v: T): void }) {
  return (
    <div className="qa-choices">
      {options.map((o) => (
        <button key={String(o.v)} className={`qa-choice ${o.v === value ? 'on' : ''}`} disabled={o.disabled} onClick={() => onPick(o.v)}>
          <b>{o.label}</b>{o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

export default function AddWizard({ onAdd, market, setMarket }: { onAdd(l: NewLot): void; market: MarketId; setMarket(m: MarketId): void }) {
  const [step, setStep] = useState<Step>('kind');
  const [kind, setKind] = useState<'stock' | 'fund'>('stock');
  const [inst, setInst] = useState<Instrument | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [date, setDate] = useState('');
  const [horizon, setHorizon] = useState<Plan['horizon'] | ''>('');
  const [until, setUntil] = useState('');
  const [purpose, setPurpose] = useState<Plan['purpose']>();
  const [target, setTarget] = useState<number | null | undefined>();
  const [loss, setLoss] = useState<number | null | undefined>();
  const [calm, setCalm] = useState<Plan['calm']>();
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [win, setWin] = useState('');   // which period was picked on the date question (today, past month, past year ...)
  const [mon, setMon] = useState('');   // and which month of it, when the period has many matching days
  const [ipo, setIpo] = useState(false);   // bought in the IPO at the issue price, which is not a price the stock ever traded at
  const [days, setDays] = useState<DayRange[] | 'loading' | null>(null);   // what the stock really traded at, day by day, to check the buy price and date

  const idx = ORDER.indexOf(step);
  const go = (s: Step) => setStep(s);
  const next = () => setStep(ORDER[Math.min(idx + 1, ORDER.length - 1)]);
  const back = () => setStep(ORDER[Math.max(idx - 1, 0)]);
  const stock = kind === 'stock';
  const name = inst ? inst.id.replace(/\.(NS|BO)$/, '') : '';

  const reset = () => {
    setStep('kind'); setInst(null); setNow(null); setA(''); setB(''); setDate(''); setHorizon(''); setUntil('');
    setPurpose(undefined); setTarget(undefined); setLoss(undefined); setCalm(undefined); setCustom(''); setAdded(null); setDays(null); setWin(''); setMon(''); setIpo(false);
  };
  const pickKind = (k: 'stock' | 'fund') => { setKind(k); setInst(null); setNow(null); setA(''); setB(''); setDays(null); setDate(''); setWin(''); setMon(''); setIpo(false); setStep('pick'); };
  const pick = async (i: Instrument) => {
    setInst(i); setNow(null); setDate(''); setWin(''); setMon(''); setIpo(false); setStep('a');
    setDays('loading');
    fetchDayRanges(i).then((d) => setDays((cur) => (cur === 'loading' ? d : cur)));   // a later pick resets it first, so a slow answer for the old stock is ignored
    const q = (await fetchLivePrices([i]))[i.id];
    if (q) setNow(q.price);
  };

  // is the price (and date) one this stock could really have had? Only for stocks: a fund app shows today's value, not a buy price.
  const list = stock && !ipo && Array.isArray(days) ? days : null;   // an IPO allotment price is not checked against traded prices
  const price = +b;
  const sym = inst ? ({ INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' } as Record<string, string>)[currencyOf(inst)] ?? '' : '';
  const num = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ever = list && price > 0 ? everTraded(list, price) : null;
  const dayCheck = (iso: string): DayCheck | null => (list && price > 0 && iso ? checkDay(list, price, iso) : null);
  const reason = (c: DayCheck | null) => (!c || c.why === 'ok' ? '' : c.why === 'before' ? 'Not listed yet' : c.why === 'closed' ? 'Market closed' : 'Price not reached');
  const dc = dayCheck(date);
  /** how close the day came to the price, with decimals: the nearest it got and how far off that was */
  const miss = (c: DayCheck) => (c.gap !== undefined && c.edge ? `${sym}${num(c.edge === 'low' ? (c.low as number) : (c.high as number))} (that day's ${c.edge}) was the nearest it came: ${sym}${num(c.gap)} (${((c.gap / price) * 100).toFixed(2)}%) ${c.edge === 'low' ? 'above' : 'below'} your ${sym}${num(price)}.` : '');

  // the periods offered on the date question, each with the days in it when the price was really reached
  const periods: { k: string; label: string; from: string; to: string }[] = [
    { k: 'today', label: 'Today', from: todayIso(), to: todayIso() },
    { k: '1m', label: 'Past month', from: ago(1), to: todayIso() },
    { k: '6m', label: 'Past 6 months', from: ago(6), to: todayIso() },
    { k: '1y', label: 'Past year', from: ago(12), to: todayIso() },
    { k: '2y', label: 'Past 2 years', from: ago(24), to: todayIso() },
    { k: '5y', label: 'Past 5 years', from: ago(60), to: todayIso() },
    { k: 'old', label: 'Earlier than that', from: '0000-01-01', to: ago(60) },
  ];
  const reached = (w: { from: string; to: string }) => (list && price > 0 ? reachedDays(list, price, w.from, w.to) : []);
  const curWin = periods.find((w) => w.k === win);
  const winDays = curWin ? reached(curWin) : [];
  const months = [...new Set(winDays.map((d) => d.date.slice(0, 7)))];
  const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dayChips = mon ? winDays.filter((d) => d.date.startsWith(mon)) : winDays.length <= 12 ? winDays : [];

  // what the current step needs before "Next" works
  const can: Record<Step, boolean> = {
    kind: true, pick: !!inst, a: +a > 0, b: +b > 0 && (!ever || ever.ok), date: !date || !dc || dc.why === 'ok',
    horizon: horizon === 'short' || horizon === 'long' || (horizon === 'date' && until > todayIso()),
    purpose: true, target: true, loss: true, calm: true, review: !busy,
  };

  const plan = (): Plan | undefined => {
    if (!horizon) return undefined;
    return { horizon, until: horizon === 'date' ? until : undefined, purpose, target: target || undefined, loss: loss || undefined, calm };
  };

  const submit = async () => {
    if (!inst) return;
    const p = plan();
    if (stock) onAdd({ inst, qty: +a, price: +b, date: date || undefined, plan: p });
    else {
      // a fund app shows money, not units: units = current value / latest NAV, average NAV = invested / units
      setBusy(true);
      const c = await fetchCandles(inst, '1D', 3);
      setBusy(false);
      if (!c) { alert('Could not load this fund\'s price right now. Try again in a moment.'); return; }
      const units = +b / c[c.length - 1].close;
      onAdd({ inst, qty: units, price: +a / units, date: date || undefined, plan: p });
    }
    setAdded(name || inst.name);
  };

  // an "i" beside each question that explains why it is asked and what to enter
  const tips: Partial<Record<Step, ReactNode>> = {
    a: stock ? <p>The number of shares you hold right now, in total. Bought at different times? Add them up. You can add more lots later.</p> : <p>The total money you have put into this fund so far, as shown under "Invested" in your fund app.</p>,
    b: stock ? <><p><b>Your average cost per share.</b> Total money spent divided by shares bought, before brokerage and taxes.</p><p>Not sure? Use the chart below: tap the day you bought and pick what you paid.</p></> : <p>What your holding is worth right now, as shown under "Current value" in your fund app. We turn it into units using today's price.</p>,
    date: <><p>The day you bought. We use it to compare your return with the market since then, and to know when you pass one year (long-term for Indian tax).</p><p>Only days when the price you entered really traded are accepted, so a wrong price or date is caught.</p></>,
    horizon: <p>How long you plan to keep it. A fall is normal for someone holding for years, but a warning for someone who needs the money soon, so the advice depends on this. "Until a date" is for money you need on a particular day.</p>,
    purpose: <p>Why you own it. Growth, income, a quick trade and safety are judged differently: income stocks on their dividends, quick trades on momentum, safe money on steadiness.</p>,
    target: <p>The profit at which you would be happy to sell some or all of it (book profit). We warn you when you get close, so greed does not give the gain back.</p>,
    loss: <p>A point to stop and recheck why you bought. It is not an automatic sell order, only a nudge.</p>,
    calm: <p>How you would react to a big drop. It helps us avoid suggestions that would keep you awake at night.</p>,
  };
  const q = (title: string, sub?: string) => <><h3 className="qa-q">{title}{tips[step] && <Info>{tips[step]}</Info>}</h3>{sub && <p className="qa-sub">{sub}</p>}</>;
  const numField = (val: string, set: (v: string) => void, ph: string, prefix?: string): ReactNode => (
    <div className="qa-num">
      {prefix && <span>{prefix}</span>}
      <input type="number" min="0" step="any" autoFocus value={val} placeholder={ph} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && +val > 0 && (step !== 'b' || !ever || ever.ok)) next(); }} />
    </div>
  );
  const percentStep = (cur: number | null | undefined, set: (v: number | null) => void, opts: number[], sign: string) => (
    <>
      <Choices value={cur === null ? -1 : cur} options={[...opts.map((n) => ({ v: n, label: `${sign}${n}%` })), { v: -1, label: 'No limit', hint: 'skip' }]}
        onPick={(v) => { set(v === -1 ? null : v); setCustom(''); next(); }} />
      <div className="qa-num qa-or">
        <span>or type your own</span>
        <input type="number" min="1" max="1000" value={custom} placeholder="e.g. 35" onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && +custom > 0) { set(+custom); setCustom(''); next(); } }} />
        <b>%</b>
        <button className="mini" disabled={!(+custom > 0)} onClick={() => { set(+custom); setCustom(''); next(); }}>Use</button>
      </div>
    </>
  );

  // short recap of what has been answered, each one a way back to change it
  const recap: [Step, string][] = [];
  if (inst && step !== 'kind' && step !== 'pick') recap.push(['pick', name || inst.name]);
  if (+a > 0 && ORDER.indexOf(step) > 2) recap.push(['a', stock ? `${a} shares` : `₹${a} invested`]);
  if (+b > 0 && ORDER.indexOf(step) > 3) recap.push(['b', stock ? `paid ${b}` : `worth ₹${b}`]);
  if (ORDER.indexOf(step) > 4) recap.push(['date', date ? `bought ${fmtDate(date)}${dc?.close !== undefined ? ` · closed ${sym}${num(dc.close)}` : ''}` : 'date not given']);
  if (horizon && ORDER.indexOf(step) > 5) recap.push(['horizon', horizon === 'short' ? 'short term' : horizon === 'long' ? 'long term' : `until ${until ? fmtDate(until) : '…'}`]);
  if (purpose && ORDER.indexOf(step) > 6) recap.push(['purpose', ({ growth: 'for growth', income: 'for income', quick: 'quick profit', safe: 'keep safe' })[purpose]]);
  if (target && ORDER.indexOf(step) > 7) recap.push(['target', `book at +${target}%`]);
  if (loss && ORDER.indexOf(step) > 8) recap.push(['loss', `rethink at −${loss}%`]);

  if (added) {
    return (
      <div className="qa qa-done">
        <div className="qa-tick">✓</div>
        <h3 className="qa-q">{added} is in your portfolio</h3>
        <p className="qa-sub">We will now track it against your plan and tell you when it is time to act.</p>
        <div className="pf-row" style={{ justifyContent: 'center' }}><button className="mini on" onClick={reset}>+ Add another</button></div>
      </div>
    );
  }

  return (
    <div className="qa">
      <div className="qa-top">
        <div className="qa-bar"><i style={{ width: `${(idx / (ORDER.length - 1)) * 100}%` }} /></div>
        <span className="small">Question {Math.min(idx + 1, ORDER.length - 1)} of {ORDER.length - 1}</span>
      </div>
      {recap.length > 0 && <div className="qa-recap">{recap.map(([s, t]) => <button key={s} onClick={() => go(s)} title="Change this answer">{t}</button>)}</div>}

      <div className="qa-body" key={step}>
        {step === 'kind' && <>
          {q('What are you adding?')}
          <Choices value={kind} options={[{ v: 'stock', label: 'A stock or ETF', hint: 'Shares you bought on an exchange' }, { v: 'fund', label: 'A mutual fund', hint: 'India, Direct or Regular' }]} onPick={pickKind} />
        </>}

        {step === 'pick' && <>
          {q(stock ? 'Which stock is it?' : 'Which fund is it?', stock ? 'Search by company name or symbol. For India pick the one ending in .NS; for US stocks use the plain symbol (AAPL).' : 'Pick the Direct / Growth version if that is what you hold.')}
          {stock ? <SymbolSearch current={{ id: inst?.id ?? '', name: '', source: 'yahoo' }} onPick={pick} market={market} onMarket={setMarket} /> : <FundSearch onPick={(h) => { setInst(fundInst(h)); setStep('a'); }} />}
        </>}

        {step === 'a' && <>
          {q(stock ? `How many shares of ${name} do you own?` : 'How much have you invested in this fund in total?', stock ? 'Bought in several lots? Enter the total; you can add more lots later.' : 'The "Invested" amount shown in your fund app.')}
          {numField(a, setA, stock ? 'e.g. 10' : 'e.g. 70000', stock ? undefined : '₹')}
        </>}

        {step === 'b' && <>
          {q(stock ? 'What price did you pay per share?' : 'What is it worth today?', stock ? 'Your average buy price if you bought more than once.' : 'The "Current value" shown in your fund app.')}
          {numField(b, setB, stock ? 'e.g. 2450' : 'e.g. 68000', stock ? undefined : '₹')}
          {stock && <label className="chk" style={{ margin: '8px 2px', fontSize: 13 }}><input type="checkbox" checked={ipo} onChange={(e) => setIpo(e.target.checked)} /> I got it in the IPO (this is the issue price I was allotted at)</label>}
          {stock && ipo && <p className="qa-hint">Enter the issue (allotment) price. We won't check it against trading prices, since an IPO price comes before the stock lists. On the next question, enter the allotment or listing date.</p>}
          {stock && now !== null && <button className="qa-chip" onClick={() => setB(String(now))}>It trades at {now} now · use this</button>}
          {stock && days === 'loading' && +b > 0 && <p className="qa-hint">Checking this price against the stock's history…</p>}
          {stock && days === 'loading' && !(+b > 0) && <p className="qa-hint">Loading the price chart…</p>}
          {stock && list && (
            <div className="qa-chartpick">
              <p className="qa-sub">Not sure of the price? Tap the day you bought it on the chart, and pick what you paid. This fills in the price and the date for you.</p>
              <ChartPicker days={list} sym={sym} price={+b > 0 ? +b : 0}
                onUse={(d, v) => { setB(String(v)); setDate(d.date); setWin(''); setMon(''); setStep('horizon'); }} />
            </div>
          )}
          {ever && !ever.ok && (
            <div className="qa-warn" role="alert">
              <b>{name} never traded at {sym}{b}.</b>
              <span>In all the history we have, it has traded between {sym}{num(ever.low)} and {sym}{num(ever.high)}.{ever.nearest && ` The nearest it ever came was ${sym}${num(ever.nearest.value)} on ${fmtDate(ever.nearest.date)} (that day's ${ever.nearest.edge}), ${sym}${num(ever.nearest.gap)} ${ever.nearest.edge === 'low' ? 'above' : 'below'} your ${sym}${num(price)}.`} Check the price for a stray zero or a price from another stock.</span>
            </div>
          )}
        </>}

        {step === 'date' && <>
          {q(stock ? 'When did you buy it?' : 'When did you first invest?', stock && list ? `Only the periods when ${name} really traded at ${sym}${b} are switched on. Pick one, then a day in it, or type any date. Optional.` : 'Lets us compare it with the market from that day, and tells you when it turns long-term for tax. Optional.')}
          {stock && list ? <>
            <Choices value={win} options={periods.map((w) => { const n = reached(w).length; return { v: w.k, label: w.label, hint: n ? `${n} day${n > 1 ? 's' : ''} at ${sym}${b}` : 'Price not reached', disabled: n === 0 }; })}
              onPick={(k) => { setWin(k); setMon(''); const w = periods.find((x) => x.k === k); const ds = w ? reached(w) : []; if (ds.length === 1) setDate(ds[0].date); }} />
            {curWin && winDays.length > 1 && (
              <div className="qa-near">
                <small>{winDays.length <= 12 || mon ? `Days it traded at ${sym}${b} · ${mon ? monthLabel(mon) : curWin.label.toLowerCase()}:` : `Months it traded at ${sym}${b} · ${curWin.label.toLowerCase()}, pick one:`}</small>
                {!mon && winDays.length > 12 && months.map((m) => <button key={m} className="qa-chip" onClick={() => setMon(m)}>{monthLabel(m)} · {winDays.filter((d) => d.date.startsWith(m)).length} days</button>)}
                {dayChips.map((d) => <button key={d.date} className={`qa-chip ${d.date === date ? 'on' : ''}`} title={`Range ${sym}${num(d.low)} to ${sym}${num(d.high)}`} onClick={() => setDate(d.date)}>{fmtDate(d.date)} · closed {sym}{num(d.close)}</button>)}
                {mon && <button className="qa-chip" onClick={() => setMon('')}>← other months</button>}
              </div>
            )}
          </> : (
          <Choices value={date} options={[['Today', todayIso()], ['1 month ago', ago(1)], ['6 months ago', ago(6)], ['A year ago', ago(12)], ['2 years ago', ago(24)], ['5 years ago', ago(60)]].map(([label, v]) => ({ v, label }))}
            onPick={(v) => { setDate(v); next(); }} />)}
          <div className="qa-num qa-or"><span>or pick the exact day</span>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            <button className="mini" disabled={!date || !can.date} onClick={next}>Use</button></div>
          {stock && days === 'loading' && date && <p className="qa-hint">Checking that day's prices…</p>}
          {date && dc && dc.why === 'ok' && dc.low !== undefined && dc.high !== undefined && (
            <p className="qa-okline">✓ {sym}{b} is inside {fmtDate(date)}'s range ({sym}{num(dc.low)} to {sym}{num(dc.high)}){dc.close !== undefined ? `. It closed that day at ${sym}${num(dc.close)}` : ''}.</p>
          )}
          {date && dc && dc.why !== 'ok' && (
            <div className="qa-warn" role="alert">
              <b>{dc.why === 'outside' ? `${sym}${b} was never reached on ${fmtDate(date)}.` : dc.why === 'closed' ? `The market was closed on ${fmtDate(date)}.` : `${name} was not trading on ${fmtDate(date)}.`}</b>
              <span>
                {dc.why === 'outside' && `That day ${name} only traded between ${sym}${num(dc.low as number)} and ${sym}${num(dc.high as number)} and closed at ${sym}${num(dc.close as number)}. ${miss(dc)} `}
                {dc.why === 'closed' && 'It was a weekend or a market holiday, so nothing could have been bought. '}
                {dc.why === 'before' && dc.first && `It started trading on ${fmtDate(dc.first)}. `}
                {`Pick another day below, or press Skip if ${b} is an average of several buys.`}
              </span>
              {dc.why === 'outside' && dc.low !== undefined && dc.high !== undefined && dc.close !== undefined && (
                <div className="qa-near"><small>Keep {fmtDate(date)} and use a price it really traded at:</small>
                  {([['Low', dc.low], ['Close', dc.close], ['High', dc.high]] as [string, number][]).map(([l, v]) => (
                    <button key={l} className="qa-chip" onClick={() => setB(String(Number(v.toFixed(2))))}>{l} {sym}{num(v)} · use this</button>
                  ))}</div>
              )}
              {list && (() => {
                const near = nearestDays(list, price, date);
                return near.length > 0 && (
                  <div className="qa-near"><small>Days it traded at {sym}{b}, closest to then:</small>
                    {near.map((d) => <button key={d.date} className="qa-chip" title={`Range ${sym}${num(d.low)} to ${sym}${num(d.high)}`} onClick={() => setDate(d.date)}>{fmtDate(d.date)} · closed {sym}{num(d.close)}</button>)}</div>
                );
              })()}
            </div>
          )}
        </>}

        {step === 'horizon' && <>
          {q(`How long will you hold ${name || 'it'}?`, 'This changes what we tell you. A dip is fine for a long-term holder and a warning for a short-term one.')}
          <Choices value={horizon || undefined} options={[
            { v: 'short', label: 'Short term', hint: 'Under a year' },
            { v: 'long', label: 'Long term', hint: 'A year or more' },
            { v: 'date', label: 'Until a date', hint: 'I need it by a day' },
          ]} onPick={(v) => { setHorizon(v as Plan['horizon']); if (v !== 'date') next(); }} />
          {horizon === 'date' && <div className="qa-num qa-or"><span>I will sell on</span>
            <input type="date" autoFocus value={until} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />
            <button className="mini on" disabled={!can.horizon} onClick={next}>Next</button></div>}
        </>}

        {step === 'purpose' && <>
          {q('What is this money for?')}
          <Choices value={purpose} options={[
            { v: 'growth', label: 'Grow my wealth', hint: 'Let it compound' }, { v: 'income', label: 'Earn dividends', hint: 'Regular income' },
            { v: 'quick', label: 'Quick profit', hint: 'In and out' }, { v: 'safe', label: 'Keep it safe', hint: 'Protect my money' },
          ]} onPick={(v) => { setPurpose(v as Plan['purpose']); next(); }} />
        </>}

        {step === 'target' && <>
          {q('What profit would make you happy to book?', 'We will tell you when you get close, so you do not hold on out of greed.')}
          {percentStep(target, setTarget, [10, 20, 30, 50, 100], '+')}
        </>}

        {step === 'loss' && <>
          {q('At what loss would you want to rethink?', 'Not an order to sell. It is the point where we nudge you to check if your reason for buying still holds.')}
          {percentStep(loss, setLoss, [5, 10, 15, 20, 30], '−')}
        </>}

        {step === 'calm' && <>
          {q('If it fell 20% next month, you would…')}
          <Choices value={calm} options={[
            { v: 'calm', label: 'Stay calm', hint: 'I can wait' }, { v: 'uneasy', label: 'Feel uneasy', hint: 'But I would hold' }, { v: 'panic', label: 'Want to sell', hint: 'I would lose sleep' },
          ]} onPick={(v) => { setCalm(v as Plan['calm']); next(); }} />
        </>}

        {step === 'review' && <>
          {q(`Ready to add ${name || 'it'}?`)}
          <div className="qa-sum">
            <div><span>{stock ? 'Shares' : 'Invested'}</span><b>{stock ? a : `₹${a}`}</b></div>
            <div><span>{stock ? 'Paid per share' : 'Worth today'}</span><b>{stock ? b : `₹${b}`}</b></div>
            <div><span>{stock ? 'Bought' : 'First invested'}</span><b>{date ? fmtDate(date) : 'Not given'}{date && dc?.close !== undefined ? ` · closed ${sym}${num(dc.close)}` : ''}</b></div>
            <div><span>Holding</span><b>{horizon === 'short' ? 'Short term' : horizon === 'long' ? 'Long term' : `Until ${until ? fmtDate(until) : ''}`}</b></div>
            <div><span>Purpose</span><b>{purpose ? ({ growth: 'Grow my wealth', income: 'Earn dividends', quick: 'Quick profit', safe: 'Keep it safe' })[purpose] : 'Not given'}</b></div>
            <div><span>Book profit at</span><b>{target ? `+${target}%` : 'No target'}</b></div>
            <div><span>Rethink at</span><b>{loss ? `−${loss}%` : 'No limit'}</b></div>
            <div><span>A 20% fall</span><b>{calm ? ({ calm: 'Stay calm', uneasy: 'Feel uneasy', panic: 'Want to sell' })[calm] : 'Not given'}</b></div>
          </div>
        </>}
      </div>

      <div className="qa-nav">
        <button className="mini" onClick={back} disabled={idx === 0}>← Back</button>
        <span className="grow" />
        {OPTIONAL.includes(step) && <button className="mini" onClick={next}>Skip</button>}
        {step === 'review'
          ? <button className="mini buyb" disabled={!can.review} onClick={submit}>{busy ? 'Adding…' : 'Add to portfolio'}</button>
          : ['a', 'b', 'date'].includes(step) || (step === 'pick' && !!inst)
            ? <button className="mini on" disabled={!can[step]} onClick={next}>Next →</button>
            : null}
      </div>
    </div>
  );
}
