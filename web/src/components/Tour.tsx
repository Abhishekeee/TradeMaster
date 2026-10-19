import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type Placement = 'right' | 'left' | 'bottom' | 'top' | 'center';
export interface TourStep {
  target?: string;            // CSS selector of the element to highlight; omit for a centred message
  title: string;
  body: ReactNode;
  placement?: Placement;
  before?: () => void;        // runs when the step opens (for example, switch the right-hand tab)
}

interface Props { open: boolean; steps: TourStep[]; onClose(finished: boolean): void }

const TIP_W = 350, GAP = 14, PAD = 6, EDGE = 10;

/** Pick a spot for the tooltip next to the highlighted element, falling back to other sides if it would not fit. */
function place(rect: DOMRect | null, pref: Placement, h: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const centred = { left: (vw - TIP_W) / 2, top: Math.max(EDGE, (vh - h) / 2) };
  if (!rect || pref === 'center') return centred;
  const spots: Record<Exclude<Placement, 'center'>, { left: number; top: number }> = {
    right: { left: rect.right + PAD + GAP, top: rect.top + rect.height / 2 - h / 2 },
    left: { left: rect.left - PAD - GAP - TIP_W, top: rect.top + rect.height / 2 - h / 2 },
    bottom: { left: rect.left + rect.width / 2 - TIP_W / 2, top: rect.bottom + PAD + GAP },
    top: { left: rect.left + rect.width / 2 - TIP_W / 2, top: rect.top - PAD - GAP - h },
  };
  const order = [pref, 'bottom', 'right', 'left', 'top'].filter((p, i, a) => a.indexOf(p) === i) as Exclude<Placement, 'center'>[];
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - TIP_W - EDGE);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), vh - h - EDGE);
  for (const p of order) {
    const s = spots[p];
    const fits = s.left >= EDGE && s.left + TIP_W <= vw - EDGE && s.top >= EDGE && s.top + h <= vh - EDGE;
    if (fits) return { left: s.left, top: s.top };
    if ((p === 'right' || p === 'left') && s.left >= EDGE && s.left + TIP_W <= vw - EDGE) return { left: s.left, top: clampY(s.top) };
    if ((p === 'top' || p === 'bottom') && s.top >= EDGE && s.top + h <= vh - EDGE) return { left: clampX(s.left), top: s.top };
  }
  return centred;
}

/** A first-visit walkthrough: dims the page, spotlights one element at a time and explains it. */
export default function Tour({ open, steps, onClose }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [h, setH] = useState(230);
  const tip = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => { if (open) setI(0); }, [open]);

  // run the step's setup, then keep the spotlight glued to its target (layout can shift after a tab switch)
  useEffect(() => {
    if (!open) return;
    const s = stepsRef.current[i];
    if (!s) return;
    s.before?.();
    const measure = () => {
      const el = s.target ? (document.querySelector(s.target) as HTMLElement | null) : null;
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) { setRect(null); return; }
      setRect((old) => (old && old.left === r.left && old.top === r.top && old.width === r.width && old.height === r.height ? old : r));
    };
    measure();                                                  // synchronous: the target is usually already on screen
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    const settle = [120, 400].map((ms) => window.setTimeout(measure, ms)); // catches layout that shifts after a tab switch
    const t = window.setInterval(measure, 400);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); settle.forEach(clearTimeout); clearInterval(t); window.removeEventListener('resize', measure); };
  }, [open, i]);

  useLayoutEffect(() => { if (tip.current) setH(tip.current.offsetHeight); }, [i, open, rect]);
  useEffect(() => { if (open) next.current?.focus(); }, [open, i]);

  const finish = useCallback((done: boolean) => onClose(done), [onClose]);
  const go = useCallback((d: number) => {
    setI((x) => Math.min(Math.max(0, x + d), stepsRef.current.length - 1));
  }, []);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (i === stepsRef.current.length - 1) finish(true); else go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [open, i, finish, go]);

  if (!open || !step) return null;
  const pos = place(rect, step.placement ?? 'bottom', h);

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {rect
        ? <div className="tour-hole" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
        : <div className="tour-dim" />}
      <div className="tour-tip" ref={tip} style={{ transform: `translate(${Math.round(pos.left)}px, ${Math.round(pos.top)}px)`, width: TIP_W }}>
        <div className="tour-step">Step {i + 1} of {steps.length}</div>
        <h4>{step.title}</h4>
        <div className="tour-body">{step.body}</div>
        <div className="tour-dots" aria-hidden="true">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : k < i ? 'seen' : ''} />)}</div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={() => finish(false)}>{last ? 'Close' : 'Skip tour'}</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button className="tour-btn" onClick={() => go(-1)}>Back</button>}
          <button ref={next} className="tour-btn primary" onClick={() => (last ? finish(true) : go(1))}>{last ? 'Start trading' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
