interface Props { points: { t: number; v: number }[]; base?: number; height?: number; label?: (v: number) => string }

/** Small SVG area chart for equity curves. The dashed line marks the starting value. */
export default function EquityChart({ points, base, height = 110, label }: Props) {
  if (points.length < 2) return <div className="small" style={{ padding: '14px 0' }}>Not enough points to draw a curve yet.</div>;
  const W = 300, H = height, padX = 4, padY = 8;
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const vs = points.map((p) => p.v).concat(base !== undefined ? [base] : []);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = hi - lo || 1;
  const x = (t: number) => padX + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * padX);
  const y = (v: number) => H - padY - ((v - lo) / span) * (H - 2 * padY);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(t1).toFixed(1)},${H - padY} L${x(t0).toFixed(1)},${H - padY} Z`;
  const last = points[points.length - 1].v;
  const up = base === undefined ? last >= points[0].v : last >= base;
  const color = up ? 'var(--up)' : 'var(--down)';
  return (
    <div className="eqchart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Equity curve">
        {base !== undefined && <line x1={padX} x2={W - padX} y1={y(base)} y2={y(base)} stroke="var(--mute)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        <path d={area} fill={color} opacity="0.14" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {label && <div className="eqaxis"><span>{label(lo)}</span><span>{label(hi)}</span></div>}
    </div>
  );
}
