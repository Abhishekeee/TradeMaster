import { useEffect, useRef, useState, type ReactNode } from 'react';
import Floating, { inFloat } from './Floating';

/**
 * A small "i" that explains what the thing next to it is. Hover (or keyboard focus) opens it, a click or tap pins it open
 * for touch screens, and a click anywhere else closes it. It never triggers whatever it sits inside.
 */
export default function Info({ children, width = 270, label = 'What is this?' }: { children: ReactNode; width?: number; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !inFloat(e.target)) { setOpen(false); setPinned(false); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const show = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 120); };
  const hide = () => { clearTimeout(timer.current); if (!pinned) timer.current = window.setTimeout(() => setOpen(false), 220); };
  const stop = (e: { preventDefault(): void; stopPropagation(): void }) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <span ref={ref} className={`info ${open ? 'on' : ''}`} role="button" tabIndex={0} aria-label={label} aria-expanded={open}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onClick={(e) => { stop(e); clearTimeout(timer.current); const next = !(open && pinned); setOpen(next); setPinned(next); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setPinned(false); } if (e.key === 'Enter' || e.key === ' ') { stop(e); setOpen(!open); setPinned(!open); } }}>
      i
      {open && (
        <Floating anchor={ref} className="info-tip" width={width} stop>
          <div onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={hide}>{children}</div>
        </Floating>
      )}
    </span>
  );
}
