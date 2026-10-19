import type { Cur } from '../fx';

export interface PreviewLine { price: number; color: string; title: string; dashed?: boolean }

/** Prices keep enough decimals to be useful for both BTC (82,000.12) and a forex pair (1.12183). */
export const fmtPrice = (x: number) => String(+x.toFixed(x >= 100 ? 2 : x >= 1 ? 4 : 6));

/**
 * A sensible starting stop loss or target: 1.5x (stop) and 3x (target) the recent average range, which gives a 1:2
 * reward-to-risk. Without a volatility figure it falls back to 1.5% and 3% of the price.
 */
export function suggestLevel(kind: 'sl' | 'tp', side: 'long' | 'short', entry: number, atr: number | null): number {
  const raw = atr ? (kind === 'sl' ? 1.5 : 3) * atr : entry * (kind === 'sl' ? 0.015 : 0.03);
  const d = Math.min(Math.max(raw, entry * 0.0015), entry * (kind === 'sl' ? 0.12 : 0.25));
  return (kind === 'tp') === (side === 'long') ? entry + d : entry - d;
}

const level = (kind: 'sl' | 'tp', side: 'long' | 'short', entry: number, pct: number) => {
  const up = (kind === 'tp') === (side === 'long');
  return entry * (1 + (up ? 1 : -1) * (pct / 100));
};

interface Props {
  kind: 'sl' | 'tp';
  side: 'long' | 'short';
  entry: number | null;                       // the price the level is measured from
  value: string;                            // the level as text
  onChange(v: string): void;                // any user change (typing, slider, buttons, chips)
  onReset(): void;                          // back to the suggestion
  atr: number | null;
  result(level: number): number | null;     // money (USD, after fees) if this level is hit
  cur: Cur;
  other?: number | null;                    // for a target: the stop level, so chips can offer 1R, 2R, 3R
  auto: boolean;                            // still showing the automatic suggestion
}

/** One stop-loss or take-profit control: price box, slider, tighter/wider buttons, presets and a live "if hit" figure. */
export default function LevelEditor({ kind, side, entry, value, onChange, onReset, atr, result, cur, other, auto }: Props) {
  const isSl = kind === 'sl';
  const label = isSl ? 'Stop loss' : 'Take profit';
  const n = value.trim() === '' ? null : parseFloat(value);
  const valid = n !== null && Number.isFinite(n) && entry !== null && entry > 0;
  const rightSide = valid && (isSl === (side === 'long') ? (n as number) < (entry as number) : (n as number) > (entry as number));
  const distPct = valid ? (Math.abs((n as number) - (entry as number)) / (entry as number)) * 100 : null;
  const maxPct = Math.max(isSl ? 10 : 20, Math.ceil(distPct ?? 0));
  const atrPct = atr && entry ? (atr / entry) * 100 : null;
  const stepPct = atrPct ? Math.max(0.05, +(atrPct * 0.25).toFixed(2)) : 0.25;
  const money = valid && rightSide ? result(n as number) : null;

  const setPct = (p: number) => {
    if (!entry) return;
    onChange(fmtPrice(level(kind, side, entry, Math.min(Math.max(p, 0.05), maxPct))));
  };
  const shown = distPct ?? (entry ? (Math.abs(suggestLevel(kind, side, entry, atr) - entry) / entry) * 100 : 1);

  // presets
  const chips: { label: string; pct: number }[] = [];
  if (entry) {
    const slDist = !isSl && other ? (Math.abs(other - entry) / entry) * 100 : null;
    if (slDist) [1, 1.5, 2, 3].forEach((r) => chips.push({ label: `${r}R`, pct: slDist * r }));
    else if (atrPct) (isSl ? [0.5, 1, 1.5, 2, 3] : [1, 2, 3, 4.5]).forEach((m) => chips.push({ label: `${m}× ATR`, pct: atrPct * m }));
    else (isSl ? [0.5, 1, 2, 3, 5] : [1, 2, 3, 5, 8]).forEach((p) => chips.push({ label: `${p}%`, pct: p }));
  }

  return (
    <div className={`lvl ${kind}`}>
      <div className="lvl-head">
        <b>{label}</b>
        {auto && n !== null && <span className="chip" title="Filled in automatically from recent volatility. Change it any way you like.">auto</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="lvl-link" onClick={onReset} title="Fill in the suggested level again">↺ suggest</button>
        <button type="button" className="lvl-link" onClick={() => onChange('')} disabled={n === null} title={`Remove the ${label.toLowerCase()}`}>✕ none</button>
      </div>

      <div className="lvl-row">
        <button type="button" className="lvl-step" disabled={!valid} onClick={() => setPct((distPct ?? shown) - stepPct)} title="Move closer to the entry price">Tighter</button>
        <span className="igroup"><input inputMode="decimal" placeholder="none" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} /></span>
        <button type="button" className="lvl-step" disabled={!valid} onClick={() => setPct((distPct ?? shown) + stepPct)} title="Move further from the entry price">Wider</button>
      </div>

      <input
        type="range" className={`lvl-range ${kind}`} min={0.05} max={maxPct} step={0.05}
        value={Math.min(shown, maxPct)} disabled={!entry}
        onChange={(e) => setPct(parseFloat(e.target.value))}
        aria-label={`${label} distance`}
      />

      <div className="lvl-info small">
        {valid && !rightSide
          ? <span className="down">Wrong side of the entry price. A {label.toLowerCase()} should be {(isSl === (side === 'long')) ? 'below' : 'above'} it.</span>
          : valid
            ? <>
              <b>{distPct!.toFixed(2)}%</b> {(isSl === (side === 'long')) ? 'below' : 'above'} entry
              {atrPct ? <> · {(distPct! / atrPct).toFixed(1)}× ATR</> : null}
              {money !== null && <> · if hit: <b className={money >= 0 ? 'up' : 'down'}>{cur.signed(money)}</b></>}
            </>
            : <>No {label.toLowerCase()}. Drag the slider or pick a preset to add one.</>}
      </div>

      {chips.length > 0 && (
        <div className="lvl-chips">
          {chips.map((c) => (
            <button key={c.label} type="button" className={distPct !== null && Math.abs(distPct - c.pct) / c.pct < 0.02 ? 'on' : ''} onClick={() => setPct(c.pct)}>{c.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
