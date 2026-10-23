import { useEffect, useMemo, useState } from 'react';
import Nav from './Nav';
import SymbolSearch from './SymbolSearch';
import AltTable from './AltTable';
import AccountMenu, { SaveHint } from './AccountMenu';
import { WhyCard } from './WhyCard';
import { useTheme } from '../theme';
import { useWatchlist } from '../watchlist';
import { usePortfolios } from '../portfolio';
import { MARKETS, inMarket, loadMarket, saveMarket, type MarketId } from '../markets';
import { HOME_INDICES, SECTORS, moversUniverse, useBoard, useMarketNews, useSparks } from '../home';
import { bestAlternatives, scanLargeCaps, useAlternatives, type Scan } from '../portfolioAlternatives';
import { ago } from '../news';
import type { Board } from '../data';
import type { Instrument } from '../types';

const pc = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`);
const tone = (n: number | null | undefined) => (n === null || n === undefined || Math.abs(n) < 0.005 ? '' : n > 0 ? 'up' : 'down');
const heat = (n: number | null | undefined) => (n === null || n === undefined ? undefined : { background: `${n >= 0 ? 'rgba(38,166,154,' : 'rgba(239,83,80,'}${Math.min(Math.abs(n) / 3, 1) * 0.45})` });
const isIndia = (id: string) => /\.(NS|BO)$/.test(id) || /^\^(NSE|BSE|CNX|INDIA)/.test(id);
const money = (id: string, v: number) => `${isIndia(id) ? '₹' : '$'}${v.toLocaleString(undefined, { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`;
const level = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: v >= 1000 ? 0 : 2 });
const short = (n: string) => n.replace(/\b(Limited|Ltd\.?|Corporation|Corp\.?|Incorporated|Inc\.?|Company|Co\.?)\b\.?/gi, '').replace(/\s+/g, ' ').trim().replace(/[,.]$/, '').trim();
const toInst = (id: string, name: string): Instrument => (/USDT$/.test(id) ? { id, name, source: 'binance', kind: 'CRYPTO' } : { id, name, source: 'yahoo', kind: /^\^/.test(id) ? 'INDEX' : /=X$/.test(id) ? 'CURRENCY' : /=F$/.test(id) ? 'FUTURE' : 'EQUITY' });

/** Open a symbol on the Charts page. */
function openChart(inst: Instrument) {
  try { localStorage.setItem('tm', JSON.stringify({ ...JSON.parse(localStorage.getItem('tm') || '{}'), inst })); } catch { /* ignore */ }
  location.hash = '#/charts';
}

function Spark({ data, up }: { data?: number[]; up: boolean }) {
  if (!data || data.length < 5) return <svg className="hm-spark" />;
  const lo = Math.min(...data), hi = Math.max(...data), w = 120, h = 34;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)).toFixed(1)}`).join(' ');
  return <svg className="hm-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden><polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.6" /></svg>;
}

type MoverTab = 'gainers' | 'losers' | 'high' | 'low' | 'active';
const MOVER_TABS: [MoverTab, string][] = [['gainers', 'Top gainers'], ['losers', 'Top losers'], ['active', 'Most traded'], ['high', 'Near 52-week high'], ['low', 'Near 52-week low']];

function Movers({ board, watch }: { board: Record<string, Board>; watch: ReturnType<typeof useWatchlist> }) {
  const [tab, setTab] = useState<MoverTab>('gainers');
  const [more, setMore] = useState(false);
  const all = useMemo(() => Object.values(board).filter((b) => b.price > 0), [board]);
  const hasRange = all.some((b) => b.hi52 !== null), hasVol = all.some((b) => b.volume > 0);
  const tabs = MOVER_TABS.filter(([t]) => (t === 'high' || t === 'low' ? hasRange : t === 'active' ? hasVol : true));
  const shown = useMemo(() => {
    const a = [...all];
    if (tab === 'gainers') a.sort((x, y) => y.chg - x.chg);
    else if (tab === 'losers') a.sort((x, y) => x.chg - y.chg);
    else if (tab === 'active') a.sort((x, y) => y.volume * y.price - x.volume * x.price);
    else if (tab === 'high') a.sort((x, y) => y.price / (y.hi52 ?? Infinity) - x.price / (x.hi52 ?? Infinity));
    else a.sort((x, y) => x.price / (x.lo52 ?? 0.0001) - y.price / (y.lo52 ?? 0.0001));
    return a.slice(0, more ? 20 : 8);
  }, [all, tab, more]);
  const fromHigh = (b: Board) => (b.hi52 ? (b.price / b.hi52 - 1) * 100 : null);
  const fromLow = (b: Board) => (b.lo52 ? (b.price / b.lo52 - 1) * 100 : null);

  return (
    <section className="pf-box">
      <h3>Stocks moving today</h3>
      <div className="chips pf-chips">{tabs.map(([t, l]) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}</div>
      {!all.length ? <p className="small">Loading prices…</p> : (
        <div className="pf-scroll"><table className="pf-table hm-table"><thead><tr><th></th><th>Name</th><th className="r">Price</th><th className="r">Today</th><th className="r">{tab === 'high' ? 'From 52-wk high' : tab === 'low' ? 'From 52-wk low' : '1 year'}</th></tr></thead>
          <tbody>{shown.map((b) => {
            const inst = toInst(b.id, short(b.name));
            const x = tab === 'high' ? fromHigh(b) : tab === 'low' ? fromLow(b) : b.chg1y;
            return (
              <tr key={b.id} className="link" onClick={() => openChart(inst)}>
                <td style={{ width: 24 }} onClick={(e) => { e.stopPropagation(); watch.toggle(inst); }} title="Add to watchlist">{watch.has(b.id) ? '★' : '☆'}</td>
                <td><b>{short(b.name)}</b><div className="small">{b.id.replace(/\.(NS|BO)$/, '')}</div></td>
                <td className="r">{money(b.id, b.price)}</td>
                <td className={`r ${tone(b.chg)}`} style={heat(b.chg)}><b>{pc(b.chg)}</b></td>
                <td className={`r ${tone(x)}`}>{pc(x, 1)}</td>
              </tr>
            );
          })}</tbody></table></div>
      )}
      {all.length > 8 && <button className="mini" onClick={() => setMore(!more)}>{more ? 'Show fewer' : 'Show more'}</button>}
      <p className="small">Click a row to open its chart. Out of {all.length} widely followed names. Prices refresh every 20 seconds while the market is open.</p>
    </section>
  );
}

function Winners({ scan, watch, held }: { scan: Scan | null; watch: ReturnType<typeof useWatchlist>; held: Set<string> }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!scan) return <p className="small">Loading…</p>;
  return (<>
    {Object.keys(scan.rank).length > 0 && <p className="small">Where your stocks rank among these {scan.total}: {Object.entries(scan.rank).map(([id, r]) => <span key={id} className="chip pf-own" style={{ marginRight: 6 }}>{id.replace(/\.(NS|BO)$/, '')} #{r.pos} ({pc(r.ret1y, 0)})</span>)}</p>}
    <div className="pf-scroll"><table className="pf-table pf-alt">
      <thead><tr><th>#</th><th>Company</th><th className="r">1 year</th><th className="r">Vs {scan.benchName}</th><th></th></tr></thead>
      <tbody>{scan.top.map((w, i) => (
        <WinnerRow key={w.inst.id} i={i + 1} w={w} bench={scan.bench} open={open === w.inst.id} toggle={() => setOpen(open === w.inst.id ? null : w.inst.id)} watch={watch} own={held.has(w.inst.id)} />
      ))}</tbody>
    </table></div>
  </>);
}
function WinnerRow({ i, w, bench, open, toggle, watch, own }: { i: number; w: Scan['top'][number]; bench: number | null; open: boolean; toggle(): void; watch: ReturnType<typeof useWatchlist>; own: boolean }) {
  const vs = bench !== null ? w.ret1y - bench : null;
  const inst = toInst(w.inst.id, short(w.name));
  return (<>
    <tr>
      <td className="small">{i}</td>
      <td><b>{short(w.name)}</b>{own && <span className="chip pf-own">you own this</span>}<div className="small">{w.inst.id.replace(/\.(NS|BO)$/, '')}</div></td>
      <td className={`r ${tone(w.ret1y)}`}><b>{pc(w.ret1y, 1)}</b></td>
      <td className={`r ${tone(vs)}`}>{vs === null ? '–' : `${vs >= 0 ? '+' : '−'}${Math.abs(vs).toFixed(0)} pts`}</td>
      <td className="r"><button className={`mini ${open ? 'on' : ''}`} onClick={toggle}>Why?</button> <button className="mini" onClick={() => openChart(inst)}>Chart</button> <button className="mini" onClick={() => watch.toggle(inst)}>{watch.has(inst.id) ? '★' : '☆'}</button></td>
    </tr>
    {open && <tr className="pf-detail"><td colSpan={5}><WhyCard inst={inst} /></td></tr>}
  </>);
}

function Ideas({ ccy, watch, held }: { ccy: string; watch: ReturnType<typeof useWatchlist>; held: Set<string> }) {
  const [on, setOn] = useState(false);
  const { alts, prog } = useAlternatives(ccy, watch.list, held, null, on);
  return (
    <section className="pf-box">
      <h3>Ideas worth researching</h3>
      <p className="small">Popular stocks, ETFs{ccy === 'INR' ? ' and mutual funds' : ''} that beat the index over 1 and 3 years, are not in a down-trend, and do not look stretched. Your own holdings are left out.</p>
      {!on ? <button className="mini on" onClick={() => setOn(true)}>Find ideas (checks about 35 options, takes a few seconds)</button>
        : !alts ? <p className="small">Checking {prog[1] > 1 ? prog[1] : 'about 35'} options… {prog[0]}/{prog[1] > 1 ? prog[1] : '…'}</p> : (<>
          <h4 className="pf-subh">Stocks, ETFs and equity funds</h4>
          <AltTable list={bestAlternatives(alts, false, 6)} base={null} watch={watch} onChart={openChart} />
          {alts.some((a) => a.debt) && <><h4 className="pf-subh">Lower-risk bond funds</h4><AltTable list={bestAlternatives(alts, true, 3)} base={null} watch={watch} onChart={openChart} /></>}
          <p className="small">Past winners often stop winning. This is a shortlist to research, not advice.</p>
        </>)}
    </section>
  );
}

export default function Home() {
  const [theme, flip] = useTheme();
  const [market, setMarketState] = useState<MarketId>(loadMarket);
  const setMarket = (m: MarketId) => { setMarketState(m); saveMarket(m); };
  const watch = useWatchlist();
  const pf = usePortfolios();
  const holdings = pf.person.holdings;
  const held = useMemo(() => new Set(holdings.map((h) => h.inst.id)), [holdings]);

  const tiles = HOME_INDICES[market];
  const sectors = SECTORS[market] ?? [];
  const universe = useMemo(() => moversUniverse(market), [market]);
  const mine = useMemo(() => holdings.filter((h) => h.inst.source === 'yahoo' && h.inst.kind === 'EQUITY').map((h) => h.inst.id), [holdings]);
  const cues = market === 'IN' || market === 'ALL' ? ['^GSPC', '^IXIC', '^N225', '^HSI', 'CL=F', 'GC=F', 'USDINR=X'] : [];
  const { board, updated } = useBoard([...new Set([...tiles.map((t) => t.id), ...sectors.map((t) => t.id), ...universe, ...mine, ...cues])]);
  const sparks = useSparks(tiles.map((t) => t.id));
  const news = useMarketNews(market);
  const [scan, setScan] = useState<Scan | null>(null);
  const ccy = market === 'US' ? 'USD' : 'INR';
  const showWinners = market === 'IN' || market === 'US' || market === 'ALL';

  useEffect(() => {
    if (!showWinners) return;
    let dead = false;
    setScan(null);
    scanLargeCaps(ccy, held).then((r) => { if (!dead) setScan(r); });
    return () => { dead = true; };
  }, [ccy, showWinners]); // eslint-disable-line react-hooks/exhaustive-deps

  // the user's own stocks, in one line
  const own = useMemo(() => {
    let value = 0, cost = 0, day = 0, n = 0;
    for (const h of holdings) {
      const b = board[h.inst.id];
      if (!b || h.inst.kind !== 'EQUITY') continue;
      const q = h.lots.reduce((s, l) => s + l.qty, 0), c = h.lots.reduce((s, l) => s + l.qty * l.price, 0);
      value += q * b.price; cost += c; day += q * (b.price - b.price / (1 + b.chg / 100)); n++;
    }
    return n ? { value, cost, day, n, id: mine[0] } : null;
  }, [holdings, board, mine]);
  const funds = holdings.filter((h) => h.inst.source === 'mf').length;

  const live = board[tiles[0]?.id]?.live;
  const mkt = MARKETS.find((m) => m.id === market);

  return (
    <>
      <header className="topbar">
        <a className="logo" href="#/" style={{ textDecoration: 'none', color: 'inherit' }}>Trade<b>Master</b></a>
        <Nav page="home" />
        <select className="mktsel" value={market} onChange={(e) => setMarket(e.target.value as MarketId)} title={mkt?.hint} aria-label="Market">
          {MARKETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <SymbolSearch current={{ id: '', name: '', source: 'yahoo' }} market={market} onMarket={setMarket} onPick={(i) => { if (!inMarket(i, market)) saveMarket('ALL'); openChart(i); }} />
        <button className="theme" title="Toggle light / dark mode" onClick={flip}>{theme === 'dark' ? '☀' : '🌙'}</button>
        <span className="small pf-upd">{updated ? `${live ? '● Live' : 'Market closed'} · updated ${new Date(updated).toLocaleTimeString()}` : 'Loading…'}</span>
        <AccountMenu />
      </header>

      <main className="pf">
        <section className="hm-tiles">
          {tiles.map((t) => {
            const b = board[t.id];
            return (
              <div key={t.id} className="hm-tile" onClick={() => openChart(toInst(t.id, t.name))} title="Open chart">
                <div className="small">{t.name}</div>
                <b className="hm-lvl">{b ? level(b.price) : '…'}</b>
                <span className={tone(b?.chg)}>{b ? pc(b.chg) : ''}</span>
                <Spark data={sparks[t.id]} up={(b?.chg ?? 0) >= 0} />
              </div>
            );
          })}
        </section>

        {cues.length > 0 && (
          <div className="hm-cues small">Global cues:
            {cues.map((c) => board[c] && <span key={c} className="chip" style={{ marginLeft: 6 }}>{short(board[c].name).replace(/ Index$/, '').slice(0, 18)} <b className={tone(board[c].chg)}>{pc(board[c].chg)}</b></span>)}
            <a href="#/world" style={{ marginLeft: 10 }}>All world markets →</a>
          </div>
        )}

        <section className="pf-box hm-mine">
          {own ? (
            <>
              <div><span className="small">Your stocks today</span><div className="hm-big"><b className={tone(own.day)}>{own.day >= 0 ? '+' : '−'}{money(mine[0] ?? 'X.NS', Math.abs(own.day))}</b> <span className={tone(own.day)}>{pc((own.day / (own.value - own.day)) * 100)}</span></div></div>
              <div><span className="small">Value / invested</span><div className="hm-big">{money(mine[0] ?? 'X.NS', own.value)} <span className="small">/ {money(mine[0] ?? 'X.NS', own.cost)}</span></div></div>
              <div className="small">{own.n} stock{own.n > 1 ? 's' : ''}{funds ? ` and ${funds} fund${funds > 1 ? 's' : ''} (funds are counted in the full analysis)` : ''}</div>
              <a className="mini on" href="#/portfolio" style={{ textDecoration: 'none' }}>Analyse my portfolio →</a>
            </>
          ) : (
            <>
              <div><b>Track and analyse your own stocks and mutual funds</b><div className="small">Add them by hand or from a screenshot of your broker app. You get buy / hold / sell guidance for each, news and a report card.</div></div>
              <a className="mini on" href="#/portfolio" style={{ textDecoration: 'none' }}>{holdings.length ? 'Open my portfolio →' : 'Add my stocks →'}</a>
              <SaveHint />
            </>
          )}
        </section>

        <div className="hm-two">
          <Movers board={Object.fromEntries(universe.filter((u) => board[u]).map((u) => [u, board[u]]))} watch={watch} />
          <div>
            {sectors.length > 0 && (
              <section className="pf-box">
                <h3>Sectors today</h3>
                <div className="hm-sectors">
                  {sectors.map((s) => { const b = board[s.id]; return (
                    <div key={s.id} className="hm-sector" style={heat(b?.chg)} onClick={() => openChart(toInst(s.id, s.name))} title="Open chart">
                      <b>{s.name}</b><span className={tone(b?.chg)}>{b ? pc(b.chg) : '…'}</span><span className="small">1 yr {pc(b?.chg1y, 0)}</span>
                    </div>
                  ); })}
                </div>
              </section>
            )}
            <section className="pf-box">
              <h3>Market news</h3>
              {news === null ? <p className="small">Loading headlines…</p> : !news.length ? <p className="small">No headlines right now.</p> : (
                <ul className="pf-news pf-news-sm">{news.slice(0, 7).map((n) => (
                  <li key={n.link}><a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a>
                    <div className="small">{n.source}{n.time ? ` · ${ago(n.time)}` : ''}{n.mood !== 0 && <span className={`chip pf-mood ${n.mood > 0 ? 'up' : 'down'}`}>{n.mood > 0 ? 'Positive' : 'Negative'}</span>}</div></li>
                ))}</ul>
              )}
            </section>
          </div>
        </div>

        {showWinners && (
          <section className="pf-box">
            <h3>Top performers this year, and why</h3>
            <p className="small">The best of {scan ? scan.total : 'about 65'} widely held {market === 'US' ? 'US' : 'Indian'} companies over the last 12 months. Press <b>Why?</b> to see what drove each.</p>
            <Winners scan={scan} watch={watch} held={held} />
          </section>
        )}

        {showWinners && <Ideas ccy={ccy} watch={watch} held={held} />}

        <p className="disc">Prices come from Yahoo Finance and can be delayed. Nothing here is investment advice. It is a rule-based reading of price history, and it cannot see everything that moves a market.</p>
      </main>
    </>
  );
}
