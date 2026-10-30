import { useEffect, useState, type MutableRefObject } from 'react';
import { API } from '../data';
import type { Candle } from '../types';

interface Level { price: number; quantity: number }
interface Book { buy: number; sell: number; bid: Level[]; ask: Level[] }

const compact = (n: number) => n >= 1e7 ? (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? (n / 1e5).toFixed(2) + ' L' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
const WINDOW = 30;

/**
 * Splits the volume of the last candles into buying and selling. A candle that closes near its high was mostly bought, one that
 * closes near its low was mostly sold; a flat candle follows the direction of the close. This is an estimate: the exchange does not
 * label each trade as a buy or a sell.
 */
function fromVolume(c: Candle[]): { buy: number; sell: number; bars: number } | null {
  const w = c.slice(-WINDOW);
  let buy = 0, sell = 0;
  w.forEach((k, i) => {
    if (!(k.volume > 0)) return;
    const range = k.high - k.low;
    const share = range > 0 ? (k.close - k.low) / range : k.close >= (i ? w[i - 1].close : k.open) ? 1 : 0;
    buy += k.volume * share; sell += k.volume * (1 - share);
  });
  return buy + sell > 0 ? { buy, sell, bars: w.length } : null;
}

/**
 * Buyers vs sellers, like the bar on Groww. For NSE stocks it shows the live order book (quantity waiting to be bought and sold)
 * when the exchange answers; otherwise it falls back to a volume-based estimate and says so.
 */
export default function Depth({ symbol, candles, nse }: { symbol: string; candles: MutableRefObject<Candle[]>; nse: boolean }) {
  const [book, setBook] = useState<Book | null>(null);
  const [est, setEst] = useState<{ buy: number; sell: number; bars: number } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dead = false;
    setBook(null);
    const load = async () => {
      if (nse) {
        try {
          const r = await fetch(`${API}/api/depth?symbol=${encodeURIComponent(symbol)}`);
          const b: Book | null = r.ok ? await r.json() : null;
          if (!dead) setBook(b && b.buy + b.sell > 0 ? b : null);
        } catch { if (!dead) setBook(null); }
      }
      if (!dead) setEst(fromVolume(candles.current));
    };
    load();
    const t = setInterval(load, 6000);
    return () => { dead = true; clearInterval(t); };
  }, [symbol, nse, candles]);

  const src: { buy: number; sell: number; bars?: number } | null = book ?? est;
  if (!src) return null;
  const buyPct = Math.round((src.buy / (src.buy + src.sell)) * 100);
  const rows = book ? Math.max(book.bid?.length ?? 0, book.ask?.length ?? 0) : 0;

  return (
    <span className="depth" onClick={() => setOpen(!open)} title={book ? 'Orders waiting at the exchange. Click for the top 5 bids and offers.' : `Estimated from the volume of the last ${est?.bars} candles. Click for details.`}>
      <span className="up">{buyPct}% <small>buyers</small></span>
      <span className="dbar"><i style={{ width: buyPct + '%' }} /></span>
      <span className="down">{100 - buyPct}% <small>sellers</small></span>
      {!book && <small>est.</small>}
      {open && (
        <div className="depthbook" onClick={(e) => e.stopPropagation()}>
          {book ? (
            <table>
              <thead><tr><th>Bid</th><th>Qty</th><th>Offer</th><th>Qty</th></tr></thead>
              <tbody>
                {Array.from({ length: rows }, (_, i) => (
                  <tr key={i}>
                    <td className="up">{book.bid[i]?.price ?? '–'}</td><td>{book.bid[i] ? compact(book.bid[i].quantity) : ''}</td>
                    <td className="down">{book.ask[i]?.price ?? '–'}</td><td>{book.ask[i] ? compact(book.ask[i].quantity) : ''}</td>
                  </tr>
                ))}
                <tr><td className="up" colSpan={2}><b>Total {compact(book.buy)}</b></td><td className="down" colSpan={2}><b>Total {compact(book.sell)}</b></td></tr>
              </tbody>
            </table>
          ) : (
            <table><tbody><tr><td className="up"><b>Bought ≈ {compact(src.buy)}</b></td><td className="down"><b>Sold ≈ {compact(src.sell)}</b></td></tr></tbody></table>
          )}
          <p>{book ? 'Buy and sell orders currently queued at the exchange. More buyers than sellers usually means upward pressure.' : `An estimate, not exchange data: each of the last ${est?.bars} candles' volume is split by where it closed between its low (sold) and its high (bought). The exchange does not publish who bought and who sold.`}</p>
        </div>
      )}
    </span>
  );
}
