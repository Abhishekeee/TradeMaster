import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchor: RefObject<HTMLElement | null>;
  className?: string;
  /** wanted width in px; never wider than the screen. Defaults to the anchor's width (at least 280). */
  width?: number;
  align?: 'left' | 'right';
  /** keep clicks inside the menu from reaching whatever opened it (e.g. a link that opens a chart) */
  stop?: boolean;
  children: ReactNode;
}

interface Pos { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

/** Closes menus when the click lands outside both the anchor's wrapper and any floating menu. */
export const inFloat = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('[data-float]');

/**
 * A dropdown that is drawn on top of the page (not inside the card that opened it), so no parent can clip it.
 * It opens downwards, flips upwards when there is more room above, and scrolls inside when it is still too tall.
 */
export default function Floating({ anchor, className, width, align = 'left', stop, children }: Props) {
  const [pos, setPos] = useState<Pos | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = Math.min(width ?? Math.max(r.width, 280), vw - 16);
      const left = align === 'right' ? Math.max(8, Math.min(r.right - w, vw - w - 8)) : Math.max(8, Math.min(r.left, vw - w - 8));
      const below = vh - r.bottom - 12, above = r.top - 12;
      if (below >= 260 || below >= above) setPos({ left, width: w, top: r.bottom + 6, maxHeight: Math.max(140, Math.min(480, below)) });
      else setPos({ left, width: w, bottom: vh - r.top + 6, maxHeight: Math.max(140, Math.min(480, above)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, width, align]);

  if (!pos) return null;
  return createPortal(
    <div data-float onClick={stop ? (e) => e.stopPropagation() : undefined} className={`float ${className ?? ''}`} style={{ position: 'fixed', zIndex: 1000, left: pos.left, width: pos.width, top: pos.top ?? 'auto', bottom: pos.bottom ?? 'auto', right: 'auto', margin: 0, maxHeight: pos.maxHeight, overflowY: 'auto' }}>
      {children}
    </div>,
    document.body,
  );
}
