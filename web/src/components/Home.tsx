import { useEffect, useMemo, useState } from 'react';
import Nav from './Nav';
import SymbolSearch from './SymbolSearch';
import { shortName } from '../portfolio';
import AccountMenu, { SaveHint } from './AccountMenu';
import { WhyCard } from './WhyCard';
import { useTheme } from '../theme';
import { useWatchlist } from '../watchlist';
import { usePortfolios } from '../portfolio';
import { MARKETS, inMarket, loadMarket, saveMarket, type MarketId } from '../markets';
import { HOME_INDICES, SECTORS, moversUniverse, useBoard, useMarketNews, useSparks } from '../home';
import { bestAlternatives, scanLargeCaps, useAlternatives, type Alt, type Scan } from '../portfolioAlternatives';
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

function Spark({ data, up, id }: { data?: number[]; up: boolean; id: string }) {
  if (!data || data.length < 5) return <svg className="hm-spark" />;
  const lo = Math.min(...data), hi = Math.max(...data), w = 120, h = 46;
  const xy = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 12)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const col = up ? 'var(--up)' : 'var(--down)';
  return (
    <svg className="hm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".38" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={col} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
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
      <h3>Movers today</h3>
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

type IdeaSort = 'score' | 'r1y' | 'r3yAnn' | 'maxDD';
const IDEA_SORTS: [IdeaSort, string][] = [['score', 'Best overall'], ['r1y', '1-year return'], ['r3yAnn', '3-year / yr'], ['maxDD', 'Smallest fall']];

function IdeaCards({ list, watch, chips = true }: { list: Alt[]; watch: ReturnType<typeof useWatchlist>; chips?: boolean }) {
  const [by, setBy] = useState<IdeaSort>('score');
  const sorted = useMemo(() => [...list].sort((x, y) => by === 'maxDD' ? Math.abs(x.maxDD ?? 999) - Math.abs(y.maxDD ?? 999) : (y[by] ?? -999) - (x[by] ?? -999)), [list, by]);
  const best = Math.max(...sorted.map((x) => Math.abs(x.r1y ?? 0)), 1);
  return (<>
    {chips && <div className="chips pf-chips">{IDEA_SORTS.map(([k, l]) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{l}</button>)}</div>}
    <div className="idea-grid">
      {sorted.map((a, i) => (
        <div key={a.inst.id} className="idea">
          <div className="idea-top">
            <span className="idea-rank">{i + 1}</span>
            <div className="idea-nm"><b>{shortName(a.inst)}</b><span className="small">{a.inst.source === 'mf' ? a.kind : `${a.inst.id.replace(/.(NS|BO)$/, '')} · ${a.kind}`}</span></div>
            <div className={`idea-ret ${tone(a.r1y)}`}><b>{pc(a.r1y, 1)}</b><span className="small">1 year</span></div>
          </div>
          <div className="idea-bar"><i className={tone(a.r1y)} style={{ width: `${Math.min(100, (Math.abs(a.r1y ?? 0) / best) * 100)}%` }} /></div>
          <div className="idea-stats">
            <div><span>3 yrs / yr</span><b className={tone(a.r3yAnn)}>{pc(a.r3yAnn, 1)}</b></div>
            <div><span>Vs index</span><b className={tone(a.alpha1)}>{a.alpha1 === null ? '–' : `${a.alpha1 >= 0 ? '+' : '−'}${Math.abs(a.alpha1).toFixed(1)}`}</b></div>
            <div><span>Worst fall</span><b className="down">{a.maxDD === null ? '–' : `−${Math.abs(a.maxDD).toFixed(0)}%`}</b></div>
            <div><span>Trend</span><b>{a.debt ? 'Low risk' : a.stat.trend}</b></div>
          </div>
          {a.inst.source !== 'mf' && (
            <div className="idea-act">
              <button className="mini" onClick={() => openChart(a.inst)}>Chart</button>
              <button className="mini" onClick={() => watch.toggle(a.inst)}>{watch.has(a.inst.id) ? '★ Watching' : '☆ Watch'}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  </>);
}

function Ideas({ ccy, watch, held }: { ccy: string; watch: ReturnType<typeof useWatchlist>; held: Set<string> }) {
  const [on, setOn] = useState(false);
  const { alts, prog } = useAlternatives(ccy, watch.list, held, null, on);
  return (
    <section className="pf-box">
      <h3>Ideas to research</h3>
      {!on ? (<>
        <p className="small">Names that beat the index over 1 and 3 years without looking stretched.</p>
        <button className="mini on" onClick={() => setOn(true)}>✨ Find ideas</button>
      </>) : !alts ? (
        <div className="idea-load"><i style={{ width: `${prog[1] > 1 ? (prog[0] / prog[1]) * 100 : 8}%` }} /><span className="small">Checking {prog[1] > 1 ? prog[1] : 'about 35'} options… {prog[0]}/{prog[1] > 1 ? prog[1] : '…'}</span></div>
      ) : (<>
        <IdeaCards list={bestAlternatives(alts, false, 6)} watch={watch} />
        {alts.some((a) => a.debt) && <><h4 className="pf-subh">Lower-risk bond funds</h4><IdeaCards chips={false} list={bestAlternatives(alts, true, 3)} watch={watch} /></>}
        <p className="small">Past winners often stop winning. A shortlist to research, not advice.</p>
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
  const mood = useMemo(() => {
    const idx = tiles.filter((t) => t.id !== '^INDIAVIX').map((t) => board[t.id]).filter(Boolean);
    if (!idx.length) return { head: <>Reading the <em>market</em>…</>, sub: 'Fetching live prices' };
    const upN = idx.filter((b) => b.chg > 0).length, avg = idx.reduce((a, b) => a + b.chg, 0) / idx.length, first = idx[0];
    const word = avg > 0.6 ? 'rallying' : avg > 0.1 ? 'climbing' : avg > -0.1 ? 'flat' : avg > -0.6 ? 'cautious' : 'selling off';
    return { head: <>Markets are <em>{word}</em></>, sub: `${tiles[0].name} ${level(first.price)} (${pc(first.chg)}) · ${upN} of ${idx.length} indices higher` };
  }, [board, tiles]);
  const mkt = MARKETS.find((m) => m.id === market);

  return (
    <>
      <header className="topbar">
        <a className="logo" href="#/" style={{ textDecoration: 'none', color: 'inherit' }}>Trade<b>Master</b></a>
        <Nav page="home" />
        <span className="grow" /><select className="mktsel" value={market} onChange={(e) => setMarket(e.target.value as MarketId)} title={mkt?.hint} aria-label="Market">
          {MARKETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button className="theme" title="Toggle light / dark mode" onClick={flip}>{theme === 'dark' ? '☀' : '🌙'}</button>
        <AccountMenu />
      </header>

      <main className="pf">
        <section className="hero">
          <div className="hero-main">
            <span className="eyebrow"><i className={`dot ${live ? 'live' : ''}`} />{live ? 'Live' : 'Market closed'} · {mkt?.label}{updated ? ` · ${new Date(updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            <h1>{mood.head}</h1>
            <p className="hero-sub">{mood.sub}</p>
            <SymbolSearch current={{ id: '', name: '', source: 'yahoo' }} market={market} onMarket={setMarket} onPick={(i) => { if (!inMarket(i, market)) saveMarket('ALL'); openChart(i); }} />
          </div>
          <div className="hero-side">
            {own ? (<>
              <div><span className="eyebrow">Your stocks today</span>
                <div className={`big-n ${tone(own.day)}`} style={{ marginTop: 8 }}>{own.day >= 0 ? '+' : '−'}{money(mine[0] ?? 'X.NS', Math.abs(own.day))}</div>
                <div className={tone(own.day)} style={{ fontWeight: 700 }}>{pc((own.day / (own.value - own.day)) * 100)}</div></div>
              <div className="small">Worth <b style={{ color: 'var(--text)' }}>{money(mine[0] ?? 'X.NS', own.value)}</b> · {own.n} stock{own.n > 1 ? 's' : ''}{funds ? ` + ${funds} fund${funds > 1 ? 's' : ''}` : ''}</div>
              <a className="cta" href="#/portfolio">Open portfolio →</a>
            </>) : (<>
              <div><span className="eyebrow">Your portfolio</span>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', margin: '10px 0 6px' }}>See what to hold, buy or sell</div>
                <div className="small">Add stocks by hand or from a screenshot.</div></div>
              <a className="cta" href="#/portfolio">{holdings.length ? 'Open portfolio →' : 'Add my stocks →'}</a>
              <SaveHint />
            </>)}
          </div>
        </section>

        <section className="hm-tiles">
          {tiles.map((t) => {
            const b = board[t.id];
            return (
              <div key={t.id} className="hm-tile" onClick={() => openChart(toInst(t.id, t.name))} title="Open chart">
                <div className="small">{t.name}</div>
                <b className="hm-lvl">{b ? level(b.price) : '…'}</b>
                <span className={tone(b?.chg)}>{b ? pc(b.chg) : ''}</span>
                <Spark id={`sg-${t.id.replace(/\W/g, "")}`} data={sparks[t.id]} up={(b?.chg ?? 0) >= 0} />
              </div>
            );
          })}
        </section>

        {cues.length > 0 && (
          <div className="hm-cues small"><span className="hud-k" style={{ marginRight: 8 }}>Global</span>
            {cues.map((c) => board[c] && <span key={c} className="chip" style={{ marginLeft: 6 }}>{short(board[c].name).replace(/ Index$/, '').slice(0, 18)} <b className={tone(board[c].chg)}>{pc(board[c].chg)}</b></span>)}
            <a href="#/world" style={{ marginLeft: 10 }}>World map →</a>
          </div>
        )}

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
            <h3>Top performers this year</h3>
            <p className="small">Best of {scan ? scan.total : '~65'} large companies, last 12 months. Tap <b>Why?</b> for the drivers.</p>
            <Winners scan={scan} watch={watch} held={held} />
          </section>
        )}

        {showWinners && <Ideas ccy={ccy} watch={watch} held={held} />}

        <p className="disc">Prices from Yahoo Finance, may be delayed. Not investment advice.</p>
      </main>
    </>
  );
}
