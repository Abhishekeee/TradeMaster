/* TradeMaster pattern engine
 * Scores EVERY pattern in the catalog (0-100 "closeness") against the current candles,
 * so the UI can rank them and name the closest one for the active symbol + timeframe.
 * Bearish/bottom variants are detected by mirroring prices (p -> -p) and reusing the bullish logic.
 */
// @ts-nocheck
/* eslint-disable */
const global = {};
{

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const sim = (x, t, tol) => clamp(1 - Math.abs(x - t) / tol);
  const gm = (a) => { let p = 1; for (const v of a) p *= Math.max(v, 0); return Math.pow(p, 1 / a.length); };
  const toScore = (g) => Math.round(100 * Math.pow(clamp(g), 2.2));

  /* ------------------------------------------------------------------ catalog */
  const CHART = [
    { id: 'dtop', name: 'Double Top', bias: -1, desc: 'Price tests the same resistance twice and fails, leaving two similar peaks with a valley between them. Buyers are exhausted at that level.', confirm: 'Confirmed when price closes below the valley (neckline). Target: neckline minus the pattern height.' },
    { id: 'dbot', name: 'Double Bottom', bias: 1, desc: 'Price tests the same support twice and bounces, forming a "W". Sellers fail to push lower twice.', confirm: 'Confirmed on a close above the middle peak (neckline). Target: neckline plus the pattern height.' },
    { id: 'ttop', name: 'Triple Top', bias: -1, desc: 'Three failed attempts at roughly the same high. A stronger version of the double top.', confirm: 'Confirmed on a close below the lowest valley. Target: the pattern height projected down.' },
    { id: 'tbot', name: 'Triple Bottom', bias: 1, desc: 'Three successful defenses of the same low. A stronger version of the double bottom.', confirm: 'Confirmed on a close above the highest peak between the lows.' },
    { id: 'hs', name: 'Head & Shoulders', bias: -1, desc: 'Three peaks with the middle (head) highest and two lower, similar shoulders. A classic trend-reversal top.', confirm: 'Confirmed when price breaks below the neckline joining the two troughs. Target: head-to-neckline distance.' },
    { id: 'ihs', name: 'Inverse Head & Shoulders', bias: 1, desc: 'Three troughs with the middle (head) lowest and two higher shoulders. A classic bottoming reversal.', confirm: 'Confirmed when price breaks above the neckline. Target: head-to-neckline distance.' },
    { id: 'atri', name: 'Ascending Triangle', bias: 1, desc: 'Flat resistance with rising lows. Buyers press higher into a fixed ceiling; usually breaks upward.', confirm: 'Breakout above the flat top with rising volume. Target: triangle height.' },
    { id: 'dtri', name: 'Descending Triangle', bias: -1, desc: 'Flat support with falling highs. Sellers press lower into a fixed floor; usually breaks downward.', confirm: 'Breakdown below the flat base. Target: triangle height.' },
    { id: 'stri', name: 'Symmetrical Triangle', bias: 0, desc: 'Lower highs and higher lows squeeze price into a point. A neutral coil that resolves in either direction, usually with the prior trend.', confirm: 'Trade the break of either trendline, ideally in the direction of the prior trend.' },
    { id: 'rwedge', name: 'Rising Wedge', bias: -1, desc: 'Price rises between two converging up-sloping lines; momentum fades as the range tightens. Typically bearish.', confirm: 'Confirmed on a break below the lower trendline.' },
    { id: 'fwedge', name: 'Falling Wedge', bias: 1, desc: 'Price falls between two converging down-sloping lines; selling pressure fades. Typically bullish.', confirm: 'Confirmed on a break above the upper trendline.' },
    { id: 'bflag', name: 'Bull Flag', bias: 1, desc: 'A sharp rally (the pole) followed by a small, orderly pullback (the flag). A bullish continuation.', confirm: 'Breakout above the flag top. Target: pole length added to the breakout.' },
    { id: 'rflag', name: 'Bear Flag', bias: -1, desc: 'A sharp drop (the pole) followed by a small, orderly bounce (the flag). A bearish continuation.', confirm: 'Breakdown below the flag bottom. Target: pole length subtracted from the breakdown.' },
    { id: 'achan', name: 'Ascending Channel', bias: 1, desc: 'Price rises between two parallel up-sloping lines. An established uptrend; buy dips near the lower line.', confirm: 'Trend is intact while price respects the lower line; a close below it signals weakness.' },
    { id: 'dchan', name: 'Descending Channel', bias: -1, desc: 'Price falls between two parallel down-sloping lines. An established downtrend; sell rallies near the upper line.', confirm: 'Trend is intact while price respects the upper line; a close above it signals a possible reversal.' },
    { id: 'rect', name: 'Rectangle (Range)', bias: 0, desc: 'Price bounces between flat support and resistance. Neutral consolidation; the breakout sets the direction.', confirm: 'Trade the close outside the range, ideally with volume.' },
    { id: 'cup', name: 'Cup & Handle', bias: 1, desc: 'A rounded bottom (cup) returning to the prior high, then a short pullback (handle). A bullish continuation base.', confirm: 'Breakout above the rim. Target: cup depth added to the rim.' },
    { id: 'icup', name: 'Inverted Cup & Handle', bias: -1, desc: 'A rounded top that returns to the prior low, then a small bounce. A bearish mirror of the cup & handle.', confirm: 'Breakdown below the rim. Target: cup depth subtracted from the rim.' },
  ];

  const CANDLE = [
    { id: 'c_hammer', name: 'Hammer', bias: 1, desc: 'Small body at the top, long lower shadow (2x body) after a decline. Sellers pushed price down but buyers took it back.', confirm: 'Needs a bullish candle after it to confirm.' },
    { id: 'c_sstar', name: 'Shooting Star', bias: -1, desc: 'Small body at the bottom, long upper shadow after an advance. Buyers rejected at the highs.', confirm: 'Needs a bearish candle after it to confirm.' },
    { id: 'c_ihammer', name: 'Inverted Hammer', bias: 1, desc: 'Small body low, long upper shadow after a decline. Buyers are testing higher prices.', confirm: 'Needs a bullish follow-through candle.' },
    { id: 'c_hman', name: 'Hanging Man', bias: -1, desc: 'Hammer shape appearing after an advance. Warns that sellers are starting to appear.', confirm: 'Needs a bearish candle after it to confirm.' },
    { id: 'c_bengulf', name: 'Bullish Engulfing', bias: 1, desc: 'A large green candle fully engulfs the prior red candle body after a decline.', confirm: 'Stronger with volume; a close above its high confirms.' },
    { id: 'c_sengulf', name: 'Bearish Engulfing', bias: -1, desc: 'A large red candle fully engulfs the prior green candle body after an advance.', confirm: 'Stronger with volume; a close below its low confirms.' },
    { id: 'c_pierce', name: 'Piercing Line', bias: 1, desc: 'After a red candle, a green candle opens lower but closes above the red candle midpoint.', confirm: 'Confirmed by a higher close on the next candle.' },
    { id: 'c_dcloud', name: 'Dark Cloud Cover', bias: -1, desc: 'After a green candle, a red candle opens higher but closes below the green candle midpoint.', confirm: 'Confirmed by a lower close on the next candle.' },
    { id: 'c_bharami', name: 'Bullish Harami', bias: 1, desc: 'A small candle contained inside the prior large red body. Selling momentum is stalling.', confirm: 'Needs a bullish close above the harami high.' },
    { id: 'c_sharami', name: 'Bearish Harami', bias: -1, desc: 'A small candle contained inside the prior large green body. Buying momentum is stalling.', confirm: 'Needs a bearish close below the harami low.' },
    { id: 'c_mstar', name: 'Morning Star', bias: 1, desc: 'Three candles: a big red, a small indecision candle, then a big green closing above the first candle midpoint. A bottom reversal.', confirm: 'Complete on the third candle; strong with volume.' },
    { id: 'c_estar', name: 'Evening Star', bias: -1, desc: 'Three candles: a big green, a small indecision candle, then a big red closing below the first candle midpoint. A top reversal.', confirm: 'Complete on the third candle; strong with volume.' },
    { id: 'c_soldiers', name: 'Three White Soldiers', bias: 1, desc: 'Three consecutive long green candles, each closing higher and opening inside the prior body.', confirm: 'Strong reversal/continuation; watch for exhaustion if extended.' },
    { id: 'c_crows', name: 'Three Black Crows', bias: -1, desc: 'Three consecutive long red candles, each closing lower and opening inside the prior body.', confirm: 'Strong reversal/continuation; watch for exhaustion if extended.' },
    { id: 'c_tweezb', name: 'Tweezer Bottom', bias: 1, desc: 'Two candles with matching lows: a red followed by a green. Support held twice.', confirm: 'Needs a bullish close above the pair.' },
    { id: 'c_tweezt', name: 'Tweezer Top', bias: -1, desc: 'Two candles with matching highs: a green followed by a red. Resistance held twice.', confirm: 'Needs a bearish close below the pair.' },
    { id: 'c_bmaru', name: 'Bullish Marubozu', bias: 1, desc: 'A long green candle with almost no shadows. Buyers controlled the whole session.', confirm: 'Momentum signal; continuation is likely while price holds its midpoint.' },
    { id: 'c_smaru', name: 'Bearish Marubozu', bias: -1, desc: 'A long red candle with almost no shadows. Sellers controlled the whole session.', confirm: 'Momentum signal; continuation is likely while price stays below its midpoint.' },
    { id: 'c_doji', name: 'Doji', bias: 0, desc: 'Open and close are nearly equal. Indecision; after a long move it can precede a reversal.', confirm: 'Wait for the next candle to show direction.' },
  ];

  /* ------------------------------------------------------------------ indicators */
  function atrOf(c, period) {
    const s = Math.max(1, c.length - (period || 50));
    let sum = 0, k = 0;
    for (let i = s; i < c.length; i++) {
      const pc = c[i - 1].close;
      sum += Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc));
      k++;
    }
    return k ? sum / k : (c[0].high - c[0].low) || 1;
  }

  function ema(values, p) {
    const k = 2 / (p + 1);
    const out = new Array(values.length);
    let e = values[0];
    for (let i = 0; i < values.length; i++) { e = i === 0 ? values[0] : values[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }

  function rsi(closes, p) {
    p = p || 14;
    if (closes.length <= p) return 50;
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= p; l /= p;
    for (let i = p + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      g = (g * (p - 1) + Math.max(d, 0)) / p;
      l = (l * (p - 1) + Math.max(-d, 0)) / p;
    }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }

  /* ------------------------------------------------------------------ pivots */
  const pv = (i, p, type) => ({ i, p, type });

  function zigzag(c, th) {
    const piv = [];
    let dir = 0, hiI = 0, hiP = c[0].high, loI = 0, loP = c[0].low;
    for (let i = 1; i < c.length; i++) {
      const h = c[i].high, l = c[i].low;
      if (dir === 0) {
        if (h > hiP) { hiP = h; hiI = i; }
        if (l < loP) { loP = l; loI = i; }
        if (hiP - loP >= th) {
          if (loI < hiI) { piv.push(pv(loI, loP, 'L')); dir = 1; }
          else { piv.push(pv(hiI, hiP, 'H')); dir = -1; }
        }
      } else if (dir === 1) {
        if (h > hiP) { hiP = h; hiI = i; }
        else if (hiP - l >= th) { piv.push(pv(hiI, hiP, 'H')); dir = -1; loP = l; loI = i; }
      } else {
        if (l < loP) { loP = l; loI = i; }
        else if (h - loP >= th) { piv.push(pv(loI, loP, 'L')); dir = 1; hiP = h; hiI = i; }
      }
    }
    if (dir === 1) piv.push(pv(hiI, hiP, 'H'));
    else if (dir === -1) piv.push(pv(loI, loP, 'L'));
    return piv;
  }

  const mirrorPivots = (piv) => piv.map((x) => ({ i: x.i, p: -x.p, type: x.type === 'H' ? 'L' : 'H' }));
  const mirrorCandle = (k) => ({ time: k.time, open: -k.open, high: -k.low, low: -k.high, close: -k.close, volume: k.volume });

  const recency = (ctx, idx, span) => clamp(1 - (ctx.last - idx) / Math.max(10, span * 0.6));

  /* ------------------------------------------------------------------ chart-pattern detectors (top-space) */
  function doubleTop(piv, ctx) {
    let best = null;
    for (let off = 0; off <= 1; off++) {
      const e = piv.length - off;
      if (e < 3) continue;
      const [a, b, d] = piv.slice(e - 3, e);
      if (a.type !== 'H') continue;
      const height = (a.p + d.p) / 2 - b.p;
      if (height <= 0) continue;
      const g = gm([
        clamp(1 - Math.abs(a.p - d.p) / (0.3 * height)),
        clamp(height / (4 * ctx.atr)),
        clamp((d.i - a.i) / 15),
        recency(ctx, d.i, d.i - a.i),
        clamp(1 - (ctx.close - Math.max(a.p, d.p)) / (1.5 * ctx.atr)),
      ]);
      if (!best || g > best.g) best = { g, lines: [{ pts: [[a.i, a.p], [b.i, b.p], [d.i, d.p]] }, { pts: [[a.i, b.p], [ctx.last, b.p]], dash: true }] };
    }
    return best;
  }

  function tripleTop(piv, ctx) {
    let best = null;
    for (let off = 0; off <= 1; off++) {
      const e = piv.length - off;
      if (e < 5) continue;
      const [a, b, c, d, f] = piv.slice(e - 5, e);
      if (a.type !== 'H') continue;
      const peaks = [a.p, c.p, f.p];
      const height = (a.p + c.p + f.p) / 3 - (b.p + d.p) / 2;
      if (height <= 0) continue;
      const g = gm([
        clamp(1 - (Math.max(...peaks) - Math.min(...peaks)) / (0.3 * height)),
        clamp(1 - Math.abs(b.p - d.p) / (0.4 * height)),
        clamp(height / (3 * ctx.atr)),
        recency(ctx, f.i, f.i - a.i),
        clamp(1 - (ctx.close - Math.max(...peaks)) / (1.5 * ctx.atr)),
      ]);
      const nk = Math.min(b.p, d.p);
      if (!best || g > best.g) best = { g, lines: [{ pts: [[a.i, a.p], [b.i, b.p], [c.i, c.p], [d.i, d.p], [f.i, f.p]] }, { pts: [[a.i, nk], [ctx.last, nk]], dash: true }] };
    }
    return best;
  }

  function headShoulders(piv, ctx) {
    let best = null;
    for (let off = 0; off <= 1; off++) {
      const e = piv.length - off;
      if (e < 5) continue;
      const [ls, t1, hd, t2, rs] = piv.slice(e - 5, e);
      if (ls.type !== 'H') continue;
      const neck = (t1.p + t2.p) / 2;
      const head = hd.p - neck;
      if (head <= 0) continue;
      const g = gm([
        clamp(Math.min(hd.p - ls.p, hd.p - rs.p) / (0.25 * head)),
        clamp(1 - Math.abs(ls.p - rs.p) / (0.35 * head)),
        clamp(1 - Math.abs(t1.p - t2.p) / (0.5 * head)),
        clamp(head / (3 * ctx.atr)),
        recency(ctx, rs.i, rs.i - ls.i),
        clamp(1 - (ctx.close - hd.p) / (1.5 * ctx.atr)),
      ]);
      const slope = (t2.p - t1.p) / (t2.i - t1.i);
      const yEnd = t1.p + slope * (ctx.last - t1.i);
      if (!best || g > best.g) best = { g, lines: [{ pts: [[ls.i, ls.p], [t1.i, t1.p], [hd.i, hd.p], [t2.i, t2.p], [rs.i, rs.p]] }, { pts: [[t1.i, t1.p], [ctx.last, yEnd]], dash: true }] };
    }
    return best;
  }

  function fitLine(pts) {
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const q of pts) { sx += q.i; sy += q.p; sxx += q.i * q.i; sxy += q.i * q.p; }
    const d = n * sxx - sx * sx;
    const m = d ? (n * sxy - sx * sy) / d : 0;
    const b = (sy - m * sx) / n;
    return (x) => m * x + b;
  }

  // [id, upperSlope, tol, lowerSlope, tol, structure]  slopes are price change across the window / mean channel height
  const LINE_SPECS = [
    ['atri', 0, 0.45, 0.9, 0.7, 'conv'],
    ['dtri', -0.9, 0.7, 0, 0.45, 'conv'],
    ['stri', -0.8, 0.6, 0.8, 0.6, 'conv'],
    ['rwedge', 0.6, 0.5, 1.2, 0.7, 'conv'],
    ['fwedge', -1.2, 0.7, -0.6, 0.5, 'conv'],
    ['achan', 0.8, 0.6, 0.8, 0.6, 'par'],
    ['dchan', -0.8, 0.6, -0.8, 0.6, 'par'],
    ['rect', 0, 0.35, 0, 0.35, 'par'],
  ];

  function trendLines(piv, ctx) {
    const out = {};
    for (let k = 4; k <= 9; k++) {
      if (piv.length < k) break;
      const seg = piv.slice(-k);
      const hs = seg.filter((x) => x.type === 'H'), ls = seg.filter((x) => x.type === 'L');
      if (hs.length < 2 || ls.length < 2) continue;
      const U = fitLine(hs), L = fitLine(ls);
      const x0 = seg[0].i, x1 = ctx.last, span = x1 - x0;
      if (span < 8) continue;
      const h0 = U(x0) - L(x0), h1 = U(x1) - L(x1);
      if (h0 <= 0 || h1 <= 0.03 * h0) continue;
      const hm = (h0 + h1) / 2;
      const su = (U(x1) - U(x0)) / hm, sl = (L(x1) - L(x0)) / hm;
      let res = 0;
      for (const q of hs) res += Math.abs(q.p - U(q.i));
      for (const q of ls) res += Math.abs(q.p - L(q.i));
      res /= seg.length * hm;
      const touches = hs.length + ls.length;
      const common = [
        clamp(1 - res / 0.2),
        [0, 0, 0, 0.35, 0.6, 0.85, 1][Math.min(touches, 6)],
        clamp(1 - Math.max(L(x1) - ctx.close, ctx.close - U(x1), 0) / hm / 0.5),
        clamp(hm / (2.5 * ctx.atr)),
        recency(ctx, seg[seg.length - 1].i, span),
      ];
      const lines = [{ pts: [[x0, U(x0)], [x1, U(x1)]] }, { pts: [[x0, L(x0)], [x1, L(x1)]] }];
      for (const [id, tu, tolU, tl, tolL, st] of LINE_SPECS) {
        const struct = st === 'conv' ? clamp((1 - h1 / h0) / 0.35) : clamp(1 - Math.abs(h1 / h0 - 1) / 0.35);
        const g = gm([sim(su, tu, tolU), sim(sl, tl, tolL), struct].concat(common));
        if (!out[id] || g > out[id].g) out[id] = { g, lines };
      }
    }
    return out;
  }

  function bullFlag(piv, ctx) {
    let best = null;
    const c = ctx.c;
    for (let j = piv.length - 1; j >= 1 && j >= piv.length - 5; j--) {
      const H = piv[j], Lw = piv[j - 1];
      if (H.type !== 'H' || Lw.type !== 'L') continue;
      const move = H.p - Lw.p, pole = H.i - Lw.i;
      if (move < 4 * ctx.atr || pole < 2 || pole > 40) continue;
      const cons = ctx.last - H.i;
      if (cons < 3 || cons > Math.max(12, pole * 2.5)) continue;
      let lowest = Infinity, lowI = H.i, hiMax = -Infinity;
      for (let i = H.i + 1; i <= ctx.last; i++) {
        if (c[i].low < lowest) { lowest = c[i].low; lowI = i; }
        hiMax = Math.max(hiMax, c[i].high);
      }
      const retr = (H.p - lowest) / move;
      const g = gm([
        clamp(move / (7 * ctx.atr)),
        clamp(move / pole / (0.5 * ctx.atr)),
        sim(retr, 0.3, 0.3),
        sim(cons / pole, 1, 1.2),
        clamp(1 - (hiMax - H.p) / ctx.atr),
      ]);
      const tail = c.slice(Math.max(H.i + 1, ctx.last - 2), ctx.last + 1);
      const tHi = Math.max(...tail.map((k) => k.high)), tLo = Math.min(...tail.map((k) => k.low));
      if (!best || g > best.g) best = { g, lines: [
        { pts: [[Lw.i, Lw.p], [H.i, H.p]] },
        { pts: [[H.i, H.p], [ctx.last, tHi]], dash: true },
        { pts: [[lowI, lowest], [ctx.last, tLo]], dash: true },
      ] };
    }
    return best;
  }

  function det3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }

  function quadFit(ys) {
    const n = ys.length;
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    const xs = ys.map((_, i) => -1 + (2 * i) / (n - 1));
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i], x2 = x * x;
      s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
      t0 += y; t1 += x * y; t2 += x2 * y;
    }
    const M = [[s4, s3, s2], [s3, s2, s1], [s2, s1, n]];
    const D = det3(M);
    if (!D) return { a: 0, b: 0, c: 0, r2: 0 };
    const rep = (col, v) => M.map((row, r) => row.map((x, k) => (k === col ? v[r] : x)));
    const v = [t2, t1, t0];
    const a = det3(rep(0, v)) / D, b = det3(rep(1, v)) / D, c = det3(rep(2, v)) / D;
    const mean = t0 / n;
    let ssr = 0, sst = 0;
    for (let i = 0; i < n; i++) { const f = a * xs[i] * xs[i] + b * xs[i] + c; ssr += (ys[i] - f) ** 2; sst += (ys[i] - mean) ** 2; }
    return { a, b, c, r2: sst ? 1 - ssr / sst : 0 };
  }

  function cupHandle(piv, ctx) {
    const hs = piv.filter((x) => x.type === 'H').slice(-8);
    let best = null;
    for (let x = 0; x < hs.length; x++) {
      for (let y = x + 1; y < hs.length; y++) {
        const A = hs[x], B = hs[y], w = B.i - A.i;
        if (w < 15) continue;
        let mn = Infinity, mi = A.i;
        const ys = [];
        for (let i = A.i; i <= B.i; i++) { if (ctx.c[i].low < mn) { mn = ctx.c[i].low; mi = i; } ys.push(ctx.c[i].close); }
        const depth = (A.p + B.p) / 2 - mn;
        if (depth < 3 * ctx.atr) continue;
        const q = quadFit(ys);
        if (q.a <= 0) continue;
        let after = Infinity;
        for (let i = B.i + 1; i <= ctx.last; i++) after = Math.min(after, ctx.c[i].low);
        const pull = after === Infinity ? 0 : Math.max(0, B.p - after);
        const g = gm([
          clamp(1 - Math.abs(A.p - B.p) / (0.35 * depth)),
          sim((mi - A.i) / w, 0.5, 0.45),
          clamp((q.r2 - 0.5) / 0.4),
          clamp(depth / (4 * ctx.atr)),
          pull <= 0.5 * depth ? 1 : clamp(1 - (pull - 0.5 * depth) / (0.5 * depth)),
          clamp(1 - (ctx.last - B.i) / Math.max(10, w * 0.5)),
        ]);
        if (!best || g > best.g) {
          const curve = [];
          for (let s = 0; s <= 16; s++) { const xn = -1 + (2 * s) / 16; curve.push([A.i + Math.round((w * s) / 16), q.a * xn * xn + q.b * xn + q.c]); }
          const rim = (A.p + B.p) / 2;
          best = { g, lines: [{ pts: curve }, { pts: [[A.i, rim], [ctx.last, rim]], dash: true }] };
        }
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ chart analysis */
  function analyzeCharts(candles) {
    const N = Math.min(candles.length, 320);
    const win = candles.slice(candles.length - N);
    const last = N - 1;
    const atr = atrOf(win, 50);
    const ctx = { c: win, atr, last, close: win[last].close };
    const ctxM = { c: win.map(mirrorCandle), atr, last, close: -win[last].close };
    const best = {};
    const take = (id, res, mirrored) => {
      if (!res || !(res.g >= 0)) return;
      if (!best[id] || res.g > best[id].g) best[id] = { g: res.g, lines: res.lines, mirrored: !!mirrored };
    };
    for (const scale of [1.6, 2.6, 4]) {
      const piv = zigzag(win, scale * atr);
      if (piv.length < 3) continue;
      const pivM = mirrorPivots(piv);
      take('dtop', doubleTop(piv, ctx)); take('dbot', doubleTop(pivM, ctxM), true);
      take('ttop', tripleTop(piv, ctx)); take('tbot', tripleTop(pivM, ctxM), true);
      take('hs', headShoulders(piv, ctx)); take('ihs', headShoulders(pivM, ctxM), true);
      take('bflag', bullFlag(piv, ctx)); take('rflag', bullFlag(pivM, ctxM), true);
      take('cup', cupHandle(piv, ctx)); take('icup', cupHandle(pivM, ctxM), true);
      const tl = trendLines(piv, ctx);
      for (const id in tl) take(id, tl[id]);
    }
    return CHART.map((def) => {
      const b = best[def.id];
      const lines = b
        ? b.lines.map((l) => ({ dash: !!l.dash, pts: l.pts.map(([i, p]) => ({ time: win[Math.max(0, Math.min(last, i))].time, price: b.mirrored ? -p : p })) }))
        : [];
      return Object.assign({ kind: 'chart', score: b ? toScore(b.g) : 0, lines }, def);
    });
  }

  /* ------------------------------------------------------------------ candlestick detectors (bullish-space) */
  const P = (k) => ({ body: Math.abs(k.close - k.open), range: Math.max(k.high - k.low, 1e-12), up: k.high - Math.max(k.open, k.close), lo: Math.min(k.open, k.close) - k.low, bull: k.close > k.open });
  const trendF = (c, s, a) => { const look = Math.min(6, s); return look < 2 ? 0.5 : clamp((c[s - look].close - c[s - 1].close) / (2 * a)); };
  const cf = (c, s, a) => 0.35 + 0.65 * trendF(c, s, a);
  const ZERO = { g: 0 };

  const CD = {
    hammer: (c, i, a) => {
      const k = P(c[i]), body = Math.max(k.body, 0.08 * k.range);
      return { g: gm([clamp(k.lo / (2 * body)), clamp(1 - k.up / (0.25 * k.range)), clamp(1 - (body / k.range - 0.35) / 0.3), clamp(k.range / (0.8 * a)), cf(c, i, a)]) };
    },
    ihammer: (c, i, a) => {
      const k = P(c[i]), body = Math.max(k.body, 0.08 * k.range);
      return { g: gm([clamp(k.up / (2 * body)), clamp(1 - k.lo / (0.25 * k.range)), clamp(1 - (body / k.range - 0.35) / 0.3), clamp(k.range / (0.8 * a)), cf(c, i, a)]) };
    },
    engulf: (c, i, a) => {
      if (i < 2) return ZERO;
      const p = c[i - 1], k = c[i];
      if (!(p.close < p.open && k.close > k.open)) return ZERO;
      const pb = p.open - p.close, kb = k.close - k.open;
      const overlap = Math.min(k.close, p.open) - Math.max(k.open, p.close);
      return { g: gm([clamp(overlap / pb), clamp(kb / (1.05 * pb)), clamp(kb / (0.8 * a)), cf(c, i - 1, a)]) };
    },
    pierce: (c, i, a) => {
      if (i < 2) return ZERO;
      const p = c[i - 1], k = c[i];
      if (!(p.close < p.open && k.close > k.open)) return ZERO;
      const pb = p.open - p.close, mid = (p.open + p.close) / 2;
      return { g: gm([clamp(pb / (0.8 * a)), clamp((k.close - mid) / (0.1 * pb)), clamp(1 - (k.close - p.open) / (0.3 * pb)), clamp(1 - (k.open - p.close) / (0.4 * pb)), cf(c, i - 1, a)]) };
    },
    harami: (c, i, a) => {
      if (i < 2) return ZERO;
      const p = c[i - 1], k = c[i];
      if (!(p.close < p.open)) return ZERO;
      const pb = p.open - p.close, kb = Math.abs(k.close - k.open);
      const top = Math.max(k.open, k.close), bot = Math.min(k.open, k.close);
      const over = Math.max(0, top - p.open) + Math.max(0, p.close - bot);
      return { g: gm([clamp(pb / a), clamp(1 - over / (0.3 * pb)), clamp((1 - kb / pb) / 0.5), k.close > k.open ? 1 : 0.6, cf(c, i - 1, a)]) };
    },
    mstar: (c, i, a) => {
      if (i < 3) return ZERO;
      const c0 = c[i - 2], c1 = c[i - 1], c2 = c[i];
      if (!(c0.close < c0.open && c2.close > c2.open)) return ZERO;
      const b0 = c0.open - c0.close, b1 = Math.abs(c1.close - c1.open), mid = (c0.open + c0.close) / 2;
      return { g: gm([clamp(b0 / (0.8 * a)), clamp(1 - (b1 / b0) / 0.5), clamp((c2.close - mid) / (0.15 * b0)), clamp(1 - (Math.max(c1.open, c1.close) - c0.close) / (0.4 * b0)), cf(c, i - 2, a)]) };
    },
    soldiers: (c, i, a) => {
      if (i < 4) return ZERO;
      const f = [];
      for (let j = i - 2; j <= i; j++) {
        const k = c[j];
        if (!(k.close > k.open)) return ZERO;
        const body = k.close - k.open;
        let g = clamp(body / (0.6 * a)) * clamp(1 - (k.high - k.close) / (0.6 * body));
        if (j > i - 2) {
          const p = c[j - 1];
          if (!(k.close > p.close)) return ZERO;
          g *= clamp(1 - Math.max(0, p.open - k.open, k.open - p.close) / (0.3 * body));
        }
        f.push(g);
      }
      f.push(cf(c, i - 2, a));
      return { g: gm(f) };
    },
    tweez: (c, i, a) => {
      if (i < 2) return ZERO;
      const p = c[i - 1], k = c[i];
      if (!(p.close < p.open && k.close > k.open)) return ZERO;
      return { g: gm([clamp(1 - Math.abs(p.low - k.low) / (0.25 * a)), clamp((p.open - p.close) / (0.3 * a)), clamp((k.close - k.open) / (0.3 * a)), cf(c, i - 1, a)]) };
    },
    maru: (c, i, a) => {
      const k = P(c[i]);
      if (!k.bull) return ZERO;
      return { g: gm([clamp((k.body / k.range - 0.75) / 0.2), clamp(k.body / a)]) };
    },
  };

  const CD_DEFS = [
    ['c_hammer', 'c_sstar', CD.hammer], ['c_ihammer', 'c_hman', CD.ihammer], ['c_bengulf', 'c_sengulf', CD.engulf],
    ['c_pierce', 'c_dcloud', CD.pierce], ['c_bharami', 'c_sharami', CD.harami], ['c_mstar', 'c_estar', CD.mstar],
    ['c_soldiers', 'c_crows', CD.soldiers], ['c_tweezb', 'c_tweezt', CD.tweez], ['c_bmaru', 'c_smaru', CD.maru],
  ];

  function analyzeCandles(cs) {
    const n = cs.length;
    const atr = atrOf(cs, 50);
    const m = cs.map(mirrorCandle);
    const best = {};
    const take = (id, g, idx) => { if (!best[id] || g > best[id].g) best[id] = { g, idx }; };
    [[0, 1], [1, 0.82]].forEach(([off, f]) => {
      const i = n - 1 - off;
      if (i < 0) return;
      for (const [bull, bear, fn] of CD_DEFS) {
        take(bull, fn(cs, i, atr).g * f, i);
        take(bear, fn(m, i, atr).g * f, i);
      }
      const k = P(cs[i]);
      take('c_doji', gm([clamp(1 - (k.body / k.range) / 0.15), clamp(k.range / (0.6 * atr))]) * f, i);
    });
    return CANDLE.map((def) => {
      const b = best[def.id];
      return Object.assign({ kind: 'candle', score: b ? toScore(b.g) : 0, time: b ? cs[b.idx].time : null }, def);
    });
  }

  // Every candlestick signal across the loaded history (for chart markers)
  function scanCandles(cs, minScore) {
    minScore = minScore || 55;
    const m = cs.map(mirrorCandle);
    const byId = {};
    CANDLE.forEach((d) => { byId[d.id] = d; });
    const out = [];
    for (let i = 8; i < cs.length; i++) {
      const atr = atrOf(cs.slice(Math.max(0, i - 60), i + 1), 50); // rolling ATR: no look-ahead
      let best = null;
      const consider = (id, g) => { const sc = toScore(g); if (sc >= minScore && (!best || sc > best.score)) best = { id, score: sc }; };
      for (const [bull, bear, fn] of CD_DEFS) { consider(bull, fn(cs, i, atr).g); consider(bear, fn(m, i, atr).g); }
      const k = P(cs[i]);
      consider('c_doji', gm([clamp(1 - (k.body / k.range) / 0.15), clamp(k.range / (0.6 * atr))]));
      if (best) { const d = byId[best.id]; out.push({ time: cs[i].time, id: d.id, name: d.name, bias: d.bias, score: best.score }); }
    }
    return out;
  }

  /* ------------------------------------------------------------------ full analysis */
  function analyze(candles) {
    if (!candles || candles.length < 30) return null;
    const closes = candles.map((k) => k.close);
    const e20 = ema(closes, 20), e50 = ema(closes, 50);
    const n = closes.length - 1;
    const rsiV = rsi(closes, 14);
    const dir = (Math.sign(e20[n] - e50[n]) + Math.sign(closes[n] - e50[n])) / 2; // -1..1
    const lean = 0.3 * dir;
    const eff = (p) => (p.bias !== 0 ? p.bias : lean);

    const charts = analyzeCharts(candles).sort((a, b) => b.score - a.score);
    const candlesRes = analyzeCandles(candles).sort((a, b) => b.score - a.score);
    charts.forEach((p) => { p.eff = eff(p); });
    candlesRes.forEach((p) => { p.eff = eff(p); });

    let s = 0;
    const reasons = [];
    const tc = charts[0];
    if (tc && tc.score >= 35) { s += 0.45 * tc.eff * (tc.score / 100); reasons.push(`${tc.name} (${tc.score}%) leans ${tc.eff > 0.1 ? 'bullish' : tc.eff < -0.1 ? 'bearish' : 'neutral'}`); }
    candlesRes.slice(0, 2).forEach((p) => { if (p.score >= 50) { s += 0.15 * p.eff * (p.score / 100); reasons.push(`Candle: ${p.name} (${p.score}%)`); } });
    s += 0.2 * dir;
    reasons.push(dir > 0.4 ? 'Trend up: EMA20 above EMA50 and price above EMA50' : dir < -0.4 ? 'Trend down: EMA20 below EMA50 and price below EMA50' : 'Trend mixed: EMAs and price disagree');
    s += 0.1 * clamp((rsiV - 50) / 20, -1, 1);
    reasons.push(`RSI(14) = ${rsiV.toFixed(0)}${rsiV > 70 ? ' (overbought)' : rsiV < 30 ? ' (oversold)' : ''}`);
    const bias = Math.round(clamp(s, -1, 1) * 100);
    const label = bias >= 25 ? 'Bullish' : bias <= -25 ? 'Bearish' : 'Neutral';
    return { charts, candles: candlesRes, bias, label, reasons, rsi: rsiV, trend: dir, ema20: e20, ema50: e50 };
  }

  const scoreLabel = (s) => (s >= 75 ? 'Strong match' : s >= 55 ? 'Forming' : s >= 35 ? 'Early / weak' : 'Not present');

  /* ------------------------------------------------------------------ walk-forward backtest */
  // At every step only candles up to bar i are visible; the outcome is the close H bars later.
  function backtest(cs, opt) {
    opt = opt || {};
    const H = opt.horizon || 20, minScore = opt.minScore || 55, step = opt.step || 3;
    const Hc = Math.max(3, Math.round(H / 4));
    const warm = 120;
    const n = cs.length;
    const upPct = (h) => { let up = 0, t = 0; for (let i = warm; i + h < n; i++) { t++; if (cs[i + h].close > cs[i].close) up++; } return t ? (100 * up) / t : 50; };
    const baseUp = upPct(H), baseUpC = upPct(Hc);
    const recs = [];
    const cool = {};
    const add = (group, key, name, dir, score, i, h) => {
      if (cool[key] !== undefined && i - cool[key] < h) return;
      cool[key] = i;
      const ret = ((cs[i + h].close - cs[i].close) / cs[i].close) * 100 * dir;
      recs.push({ group, key, name, dir, score, time: cs[i].time, ret, win: ret > 0, h });
    };
    for (let i = warm; i + H < n; i += step) {
      const a = analyze(cs.slice(Math.max(0, i - 399), i + 1));
      if (a) {
        a.charts.forEach((p, idx) => {
          if (p.score < minScore || p.bias === 0) return;
          add('chart', 'c:' + p.id, p.name, p.bias, p.score, i, H);
          if (idx === 0) add('closest', 'top', 'Closest pattern', p.bias, p.score, i, H);
        });
        if (Math.abs(a.bias) >= 25) add('bias', 'b:' + Math.sign(a.bias), a.label + ' overall bias', Math.sign(a.bias), Math.abs(a.bias), i, H);
      }
      if (opt.onProgress) opt.onProgress(i / n);
    }
    const idxByTime = new Map(cs.map((k, i) => [k.time, i]));
    scanCandles(cs, 60).forEach((s) => {
      const i = idxByTime.get(s.time);
      if (i === undefined || i < warm || i + Hc >= n || s.bias === 0) return;
      add('candle', 'k:' + s.id, s.name, s.bias, s.score, i, Hc);
    });
    const agg = (list) => {
      const t = list.length;
      if (!t) return { n: 0, winRate: 0, avgRet: 0, edge: 0 };
      const wins = list.filter((r) => r.win).length;
      let base = 0;
      list.forEach((r) => { const up = r.h === H ? baseUp : baseUpC; base += r.dir > 0 ? up : 100 - up; });
      const winRate = (100 * wins) / t;
      return { n: t, wins, winRate, avgRet: list.reduce((s, r) => s + r.ret, 0) / t, edge: winRate - base / t };
    };
    const byKey = (group) => {
      const m = {};
      recs.filter((r) => r.group === group).forEach((r) => { (m[r.key] = m[r.key] || []).push(r); });
      return Object.keys(m).map((k) => Object.assign({ name: m[k][0].name, dir: m[k][0].dir }, agg(m[k]))).sort((a, b) => b.n - a.n);
    };
    return {
      H, Hc, minScore, bars: n, baseUp, baseUpC,
      closest: agg(recs.filter((r) => r.group === 'closest')),
      bias: agg(recs.filter((r) => r.group === 'bias')),
      charts: byKey('chart'), candles: byKey('candle'),
      recent: recs.filter((r) => r.group === 'closest' || r.group === 'candle').slice(-12).reverse(),
    };
  }

  /* ------------------------------------------------------------------ AI advisor */
  // Combines pattern match, trend, RSI, candle signal and the pattern's own track record on this symbol/timeframe
  // (from the backtest) into one suggestion with entry, stop loss and targets. Rules + statistics, not a guarantee.
  const strikeStep = (p) => (p < 25 ? 0.5 : p < 50 ? 1 : p < 100 ? 2.5 : p < 500 ? 5 : p < 2000 ? 10 : p < 10000 ? 50 : 100);
  const expiryHint = (tf) => ({ '1m': 'nearest weekly (0-7 days)', '5m': 'nearest weekly (0-7 days)', '15m': 'nearest weekly (0-7 days)', '30m': 'nearest weekly (0-7 days)', '1h': '1-2 weeks out', '4h': '2-3 weeks out', '1D': '3-6 weeks out', '1W': '2-3 months out' }[tf] || '1-3 weeks out');

  const MIN_CONF = 50;
  function advise(cs, a, bt, opt) {
    opt = opt || {};
    const n = cs.length;
    const price = cs[n - 1].close;
    const atr = atrOf(cs, 50);
    const top = a.charts[0];
    const cand = a.candles.find((c) => c.score >= 60 && c.bias !== 0);
    const reasons = [], warnings = [];
    const patOk = top.score >= 50;
    let vote = 0;
    if (patOk) {
      vote += top.eff * (top.score / 100) * 0.45;
      reasons.push(top.name + ' at ' + top.score + '% (' + (top.eff > 0.1 ? 'bullish' : top.eff < -0.1 ? 'bearish' : 'neutral') + ')');
    } else reasons.push('No chart pattern above 50% (closest: ' + top.name + ' ' + top.score + '%)');
    if (cand) { vote += cand.eff * (cand.score / 100) * 0.15; reasons.push('Candle signal: ' + cand.name + ' ' + cand.score + '%'); }
    vote += 0.25 * a.trend;
    reasons.push(a.trend > 0.4 ? 'Uptrend: EMA20 above EMA50 and price above EMA50' : a.trend < -0.4 ? 'Downtrend: EMA20 below EMA50 and price below EMA50' : 'Trend is mixed');
    vote += 0.1 * clamp((a.rsi - 50) / 20, -1, 1);
    const dir = vote >= 0.2 ? 1 : vote <= -0.2 ? -1 : 0;
    const stat = bt && patOk ? bt.charts.find((s) => s.name === top.name) : null;

    // levels from swing structure, volatility-bounded
    const piv = zigzag(cs.slice(-300), 2 * atr);
    const lows = piv.filter((p) => p.type === 'L' && p.p < price - 0.5 * atr).map((p) => p.p);
    const highs = piv.filter((p) => p.type === 'H' && p.p > price + 0.5 * atr).map((p) => p.p);
    let sl = null, tp1 = null, tp2 = null, risk = 0, rr = 0;
    if (dir !== 0) {
      const swing = dir > 0 ? (lows.length ? Math.max(...lows) - 0.25 * atr : null) : (highs.length ? Math.min(...highs) + 0.25 * atr : null);
      const raw = swing === null ? 1.5 * atr : Math.abs(price - swing);
      risk = clamp(raw, 0.8 * atr, 3 * atr);
      const ys = [];
      if (patOk && Math.sign(top.bias) === dir) top.lines.forEach((l) => l.pts.forEach((q) => ys.push(q.price)));
      const measured = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
      sl = price - dir * risk;
      tp1 = price + dir * 1.5 * risk;
      tp2 = price + dir * clamp(measured || 3 * risk, 2 * risk, 5 * risk);
      rr = Math.abs(tp2 - price) / risk;
      const wall = dir > 0 ? (highs.length ? Math.min(...highs) : null) : (lows.length ? Math.max(...lows) : null);
      if (wall !== null && Math.abs(wall - price) < 1.5 * risk) warnings.push('A recent swing ' + (dir > 0 ? 'high' : 'low') + ' sits close to entry (' + wall.toPrecision(6) + '), so the first target may be hard to reach.');
      if (patOk && top.bias !== 0 && Math.sign(top.bias) !== dir) warnings.push('The closest pattern points the other way; the other signals outvoted it.');
      if ((dir > 0 && a.rsi > 72) || (dir < 0 && a.rsi < 28)) warnings.push('RSI is stretched (' + a.rsi.toFixed(0) + '), so the move may be late.');
    }

    // confidence
    let conf = 20;
    if (patOk && top.bias !== 0 && Math.sign(top.bias) === dir) conf += top.score * 0.35;
    else if (patOk && top.bias === 0) conf += top.score * 0.15;
    if (dir !== 0 && a.trend * dir > 0.4) conf += 15; else if (dir !== 0 && a.trend * dir < -0.4) conf -= 15;
    if (cand && Math.sign(cand.bias) === dir) conf += 10 * (cand.score / 100);
    if (dir !== 0 && ((dir > 0 && a.rsi > 72) || (dir < 0 && a.rsi < 28))) conf -= 10;
    let history = null;
    if (stat && stat.n > 0) {
      history = { name: top.name, n: stat.n, winRate: stat.winRate, edge: stat.edge, avgRet: stat.avgRet };
      if (stat.n >= 10) {
        conf += stat.edge >= 10 ? 20 : stat.edge >= 3 ? 10 : stat.edge <= -5 ? -15 : stat.n >= 30 && stat.edge <= 0 ? -10 : 0;
        if (stat.edge <= -5) warnings.push('In the past, ' + top.name + ' lost to a blind guess on this symbol and timeframe (' + stat.winRate.toFixed(0) + '% win, ' + stat.n + ' trades).');
      } else warnings.push('Only ' + stat.n + ' past ' + top.name + ' trades here: too few to trust the track record.');
    } else if (patOk) warnings.push('No track record for ' + top.name + ' on this symbol and timeframe yet.');
    if (dir !== 0 && rr < 1.5) { conf -= 10; warnings.push('Reward-to-risk is below 1.5.'); }
    conf = Math.round(clamp(conf, 0, 100));

    let action = dir > 0 ? 'BUY' : dir < 0 ? 'SELL' : 'WAIT';
    if (action !== 'WAIT' && conf < MIN_CONF) { warnings.unshift('Setup is too weak to act on (confidence ' + conf + '%).'); action = 'WAIT'; }

    // evidence gate: the advisor only trades when this symbol and timeframe have actually paid off in the past
    const ev = opt.strat;
    if (action !== 'WAIT' && ev === null) warnings.unshift('Still checking this setup against past trades. Wait for the check before acting.');
    if (action !== 'WAIT' && ev) {
      const recent = ev.recentN >= 8 ? ev.recentAvgR : null;
      if (ev.n < 20) { conf = Math.min(conf, 55); warnings.unshift('Only ' + ev.n + ' past trades of this kind on this symbol and timeframe: unproven, so confidence is capped.'); }
      else if (ev.avgR <= 0 || ev.profitFactor < 1) { action = 'WAIT'; warnings.unshift('Past signals lost money here after fees (' + ev.n + ' trades, profit factor ' + ev.profitFactor.toFixed(2) + '). No trade until this changes.'); }
      else if (recent !== null && recent < 0) { action = 'WAIT'; warnings.unshift('The strategy made money overall but has been losing lately (last ' + ev.recentN + ' trades averaged ' + recent.toFixed(2) + 'R). No trade for now.'); }
      else if (ev.profitFactor < 1.15) { conf = Math.min(conf, 55); warnings.unshift('Past results are only marginally profitable (profit factor ' + ev.profitFactor.toFixed(2) + ').'); }
      else reasons.push('Backtest: ' + ev.n + ' past trades, ' + ev.winRate.toFixed(0) + '% won, profit factor ' + ev.profitFactor.toFixed(2) + ' after fees');
      conf = Math.round(clamp(conf, 0, 100));
    }
    if (action !== 'WAIT' && !patOk && !cand) { warnings.unshift('Direction comes from trend alone with no pattern or candle confirmation.'); }

    let option = null;
    if (action !== 'WAIT' && !opt.isOption) {
      const step = opt.step || strikeStep(price);
      option = { type: action === 'BUY' ? 'CALL' : 'PUT', strike: Math.round(price / step) * step, expiry: expiryHint(opt.tf), note: 'Buy at-the-money or one strike in-the-money. Your maximum loss is the premium. Exit when the underlying reaches the stop or target levels above, which are underlying prices, not option premiums.' };
    }
    return {
      action, conf, level: conf >= 70 ? 'High' : conf >= 50 ? 'Medium' : 'Low', setup: patOk ? top.name : null,
      entry: price, sl: action === 'WAIT' ? null : sl, tp1: action === 'WAIT' ? null : tp1, tp2: action === 'WAIT' ? null : tp2,
      risk, riskPct: price ? (risk / price) * 100 : 0, rr, reasons, warnings, history, option, vote,
    };
  }

  /* ------------------------------------------------------------------ support / resistance */
  // Swing highs and lows that price has reacted to at least twice at roughly the same level, nearest to the current price.
  function levels(cs) {
    const n = cs.length;
    if (n < 60) return [];
    const atr = atrOf(cs, 50), price = cs[n - 1].close;
    const piv = zigzag(cs.slice(-400), 1.5 * atr);
    const tol = 0.6 * atr;
    const groups = [];
    piv.forEach((q) => {
      const g = groups.find((x) => Math.abs(x.price - q.p) <= tol);
      if (g) { g.price = (g.price * g.n + q.p) / (g.n + 1); g.n++; } else groups.push({ price: q.p, n: 1 });
    });
    const strong = groups.filter((g) => g.n >= 2);
    const above = strong.filter((g) => g.price > price).sort((a, b) => a.price - b.price).slice(0, 3);
    const below = strong.filter((g) => g.price <= price).sort((a, b) => b.price - a.price).slice(0, 3);
    return above.concat(below).map((g) => ({ price: g.price, touches: g.n }));
  }

  /* ------------------------------------------------------------------ strategy tester */
  // Replays the advisor bar by bar: it only sees candles up to the decision point, enters at that close, and exits on the
  // stop, the target, or after maxHold bars. If a bar touches both the stop and the target, the stop is assumed to hit
  // first (the pessimistic choice). One trade at a time. Fees are charged on entry and exit.
  function simulate(cs, opt) {
    opt = opt || {};
    const target = opt.target === 'tp2' ? 'tp2' : 'tp1';
    const minConf = opt.minConf || 50, step = opt.step || 2, maxHold = opt.maxHold || 60, warm = 120;
    const fee = (opt.feePct === undefined ? 0.05 : opt.feePct) / 100;
    const riskFrac = (opt.riskPct || 1) / 100;
    const trades = [];
    let i = warm;
    while (i < cs.length - 2) {
      const win = cs.slice(Math.max(0, i - 499), i + 1);
      const a = analyze(win);
      const ad = a ? advise(win, a, null, { tf: opt.tf }) : null;
      if (!ad || ad.action === 'WAIT' || ad.conf < minConf || ad.sl === null) { i += step; if (opt.onProgress) opt.onProgress(i / cs.length); continue; }
      const dir = ad.action === 'BUY' ? 1 : -1;
      const entry = cs[i].close, sl = ad.sl, tp = target === 'tp2' ? ad.tp2 : ad.tp1;
      const risk = Math.abs(entry - sl);
      const end = Math.min(cs.length - 1, i + maxHold);
      let exit = null, reason = 'time', j = i + 1;
      for (; j <= end; j++) {
        const k = cs[j];
        if (dir > 0 ? k.low <= sl : k.high >= sl) { exit = sl; reason = 'stop'; break; }
        if (dir > 0 ? k.high >= tp : k.low <= tp) { exit = tp; reason = 'target'; break; }
      }
      if (exit === null) { j = end; exit = cs[end].close; }
      const gross = ((exit - entry) * dir) / entry;
      const net = gross - 2 * fee;                       // fee on entry and on exit
      const r = (net * entry) / risk;                    // result in multiples of the amount risked
      trades.push({ time: cs[i].time, exitTime: cs[j].time, dir, entry, exit, sl, tp, reason, r, pct: net * 100, conf: ad.conf, setup: ad.setup });
      i = j + 1;
      if (opt.onProgress) opt.onProgress(i / cs.length);
    }
    const n = trades.length;
    const tail = trades.slice(-Math.max(8, Math.round(n * 0.3)));      // newest ~30% of trades: has the edge faded?
    const recentN = n >= 16 ? tail.length : 0;
    const recentAvgR = recentN ? tail.reduce((s, t) => s + t.r, 0) / recentN : 0;
    const wins = trades.filter((t) => t.r > 0);
    const losses = trades.filter((t) => t.r <= 0);
    const sumW = wins.reduce((s, t) => s + t.r, 0), sumL = Math.abs(losses.reduce((s, t) => s + t.r, 0));
    let eq = 1, peak = 1, maxDD = 0;
    const curve = [{ t: cs[warm].time, v: 100 }];
    trades.forEach((t) => {
      eq *= 1 + riskFrac * t.r;
      peak = Math.max(peak, eq);
      maxDD = Math.max(maxDD, (peak - eq) / peak);
      curve.push({ t: t.exitTime, v: eq * 100 });
    });
    return {
      trades, curve, n, recentN, recentAvgR, from: cs[warm].time, to: cs[cs.length - 1].time,
      winRate: n ? (100 * wins.length) / n : 0,
      avgR: n ? trades.reduce((s, t) => s + t.r, 0) / n : 0,
      profitFactor: sumL ? sumW / sumL : sumW ? Infinity : 0,
      returnPct: (eq - 1) * 100, maxDrawdown: maxDD * 100,
      buyHold: ((cs[cs.length - 1].close - cs[warm].close) / cs[warm].close) * 100,
      stops: trades.filter((t) => t.reason === 'stop').length, targets: trades.filter((t) => t.reason === 'target').length,
    };
  }

  global.PatternEngine = { analyze, scanCandles, backtest, advise, simulate, levels, ema, scoreLabel, CHART, CANDLE };
}
export const { analyze, scanCandles, backtest, advise, simulate, levels, ema, scoreLabel, CHART, CANDLE } = global.PatternEngine;
