import { useEffect, useState } from 'react';
import { fetchNseChain, type NseChain, type NseLeg } from '../data';
import type { usePaper } from '../paper';
import type { Instrument } from '../types';

const NSE_INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
const NSE_STOCKS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN', 'ICICIBANK'];
// Editable on purpose: exchanges revise lot sizes, so the user should confirm the current value on nseindia.com
const DEFAULT_LOT: Record<string, number> = { NIFTY: 75, BANKNIFTY: 30, FINNIFTY: 65, MIDCPNIFTY: 120 };
const UNDERLYING_CHART: Record<string, Instrument> = {
  NIFTY: { id: '^NSEI', name: 'Nifty 50', source: 'yahoo', kind: 'INDEX' },
  BANKNIFTY: { id: '^NSEBANK', name: 'Bank Nifty', source: 'yahoo', kind: 'INDEX' },
};

interface Props { paper: ReturnType<typeof usePaper>; onOpenUnderlying(i: Instrument): void }

export default function NseOptions({ paper, onOpenUnderlying }: Props) {
  const [sym, setSym] = useState('NIFTY');
  const [input, setInput] = useState('NIFTY');
  const [expiry, setExpiry] = useState<string | undefined>();
  const [chain, setChain] = useState<NseChain | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading');
  const [all, setAll] = useState(false);
  const [pick, setPick] = useState<{ leg: NseLeg; type: 'CE' | 'PE'; strike: number } | null>(null);
  const [lots, setLots] = useState('1');
  const [lot, setLot] = useState('75');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const kind = NSE_INDICES.includes(sym) ? 'Indices' : 'Equity';

  useEffect(() => {
    let dead = false;
    setState('loading'); setPick(null);
    fetchNseChain(sym, kind, expiry).then((c) => { if (!dead) { setChain(c); setState(c ? 'ok' : 'none'); } });
    return () => { dead = true; };
  }, [sym, expiry]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLot(String(DEFAULT_LOT[sym] ?? 1)); }, [sym]);

  const load = (s: string) => { setExpiry(undefined); setSym(s); setInput(s); };
  const rows = chain ? (all || !chain.spot ? chain.rows : chain.rows.filter((r) => Math.abs(r.strike - chain.spot) / chain.spot <= 0.04)) : [];

  const cell = (l: NseLeg | undefined, t: 'CE' | 'PE', strike: number) => l
    ? [
      <td key="p" className="link" onClick={() => { setPick({ leg: l, type: t, strike }); setMsg(null); }}>{l.ltp ? l.ltp.toFixed(2) : '–'}</td>,
      <td key="i">{l.iv ? `${l.iv.toFixed(0)}%` : '–'}</td>,
      <td key="o">{l.oi}</td>,
    ]
    : [<td key="a">–</td>, <td key="b">–</td>, <td key="c">–</td>];

  const trade = (side: 'long' | 'short') => {
    if (!pick || !chain) return;
    const units = (parseFloat(lots) || 0) * (parseFloat(lot) || 0);
    const inst: Instrument = { id: pick.leg.id, name: `${sym} ${chain.expiry} ${pick.strike} ${pick.type}`, source: 'nse', kind: 'OPTION', lot: parseFloat(lot) || 1 };
    const err = paper.open(inst, side, paper.nativeToUSD(inst, units * pick.leg.ltp), pick.leg.ltp);
    setMsg(err ? { ok: false, t: err } : { ok: true, t: `${side === 'long' ? 'Bought' : 'Sold'} ${lots} lot(s) at ${pick.leg.ltp}. See the Trade tab.` });
  };

  return (
    <div>
      <div className="mk-bar">
        {[...NSE_INDICES, ...NSE_STOCKS].map((u) => <button key={u} className={`mini ${u === sym ? 'on' : ''}`} onClick={() => load(u)}>{u}</button>)}
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') load(input.trim()); }} placeholder="Any F&O stock" />
      </div>
      {state === 'loading' && <p className="small">Loading NSE chain…</p>}
      {state === 'none' && <p className="small">Couldn't load {sym} from NSE. It may not be an F&amp;O stock, NSE data may be unavailable, or the dev server isn't running.</p>}
      {chain && state === 'ok' && (<>
        <div className="mk-bar">
          <label className="small">Expiry
            <select value={chain.expiry} onChange={(e) => setExpiry(e.target.value)}>{chain.expiries.map((d) => <option key={d}>{d}</option>)}</select>
          </label>
          <span className="small">{sym} spot <b>{chain.spot}</b></span>
          <label className="chk"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All strikes</label>
          {UNDERLYING_CHART[sym] && <button className="mini" onClick={() => onOpenUnderlying(UNDERLYING_CHART[sym])}>Open {sym} chart</button>}
        </div>
        <div className="mk-scroll">
          <table className="chain">
            <thead>
              <tr><th colSpan={3} className="up">CALLS (CE)</th><th>Strike</th><th colSpan={3} className="down">PUTS (PE)</th></tr>
              <tr><th>LTP</th><th>IV</th><th>OI</th><th /><th>LTP</th><th>IV</th><th>OI</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.strike} className={chain.spot && Math.abs(r.strike - chain.spot) / chain.spot < 0.003 ? 'atm' : ''}>
                  {cell(r.ce, 'CE', r.strike)}<td className="strike"><b>{r.strike}</b></td>{cell(r.pe, 'PE', r.strike)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pick ? (
          <div className="card" style={{ marginTop: 8 }}>
            <b>{sym} {chain.expiry} {pick.strike} {pick.type}</b> @ <b>{pick.leg.ltp}</b> <span className="small">bid {pick.leg.bid} / ask {pick.leg.ask}</span>
            <div className="mk-bar" style={{ marginTop: 6 }}>
              <label className="small">Lots <input value={lots} onChange={(e) => setLots(e.target.value)} style={{ width: 60 }} /></label>
              <label className="small">Lot size <input value={lot} onChange={(e) => setLot(e.target.value)} style={{ width: 70 }} /></label>
              <span className="small">Cost ≈ {((parseFloat(lots) || 0) * (parseFloat(lot) || 0) * pick.leg.ltp).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <button className="mini buyb" onClick={() => trade('long')}>Buy</button>
              <button className="mini sellb" onClick={() => trade('short')}>Sell</button>
            </div>
            {msg && <div className={`small ${msg.ok ? 'up' : 'down'}`}>{msg.t}</div>}
            <div className="small">Lot sizes change, so check the current value on nseindia.com. Paper trade only.</div>
          </div>
        ) : <p className="small">Click a price to paper-trade that contract. NSE contracts have no price history here, so there's no pattern chart for them; the Nifty and Bank Nifty index charts are available.</p>}
      </>)}
    </div>
  );
}
