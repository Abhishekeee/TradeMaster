import { useCallback, useEffect, useRef, useState } from 'react';
import type { Instrument } from './types';

export interface Alert {
  id: string; inst: Instrument; kind: 'above' | 'below' | 'pattern';
  level: number;        // price for above/below, minimum match % for pattern
  tf?: string;          // pattern alerts watch one timeframe
  created: number; fired?: number; message?: string;
}

const KEY = 'tm-alerts';

function load(): Alert[] {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(a)) return a; } catch { /* ignore */ }
  return [];
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.05;
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch { /* audio blocked */ }
}

export function useAlerts(notify: (msg: string) => void) {
  const [alerts, setAlerts] = useState<Alert[]>(load);
  const ref = useRef(alerts);
  ref.current = alerts;
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(alerts)); } catch { /* ignore */ } }, [alerts]);

  const fire = useCallback((hits: { a: Alert; msg: string }[]) => {
    if (!hits.length) return;
    const ids = new Set(hits.map((h) => h.a.id));
    ref.current = ref.current.map((a) => (ids.has(a.id) ? { ...a, fired: Date.now() } : a)); // mark now so ticks can't double-fire
    setAlerts((l) => l.map((a) => { const h = hits.find((x) => x.a.id === a.id); return h ? { ...a, fired: Date.now(), message: h.msg } : a; }));
    hits.forEach(({ msg }) => {
      notify(`🔔 ${msg}`);
      beep();
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('TradeMaster alert', { body: msg }); } catch { /* ignore */ }
    });
  }, [notify]);

  const add = useCallback((a: Omit<Alert, 'id' | 'created'>) => {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
    setAlerts((l) => [{ ...a, id: `${Date.now()}${Math.random().toString(36).slice(2, 5)}`, created: Date.now() }, ...l]);
  }, []);
  const remove = useCallback((id: string) => setAlerts((l) => l.filter((a) => a.id !== id)), []);
  const clearFired = useCallback(() => setAlerts((l) => l.filter((a) => !a.fired)), []);

  /** Call on every price update for an instrument. */
  const checkPrice = useCallback((instId: string, price: number) => {
    const hits = ref.current
      .filter((a) => !a.fired && a.inst.id === instId && (a.kind === 'above' ? price >= a.level : a.kind === 'below' ? price <= a.level : false))
      .map((a) => ({ a, msg: `${a.inst.id} ${a.kind === 'above' ? 'rose to' : 'fell to'} ${price.toPrecision(6)} (alert ${a.kind} ${a.level})` }));
    fire(hits);
  }, [fire]);

  /** Call after each pattern analysis of the viewed chart. */
  const checkPattern = useCallback((instId: string, tf: string, name: string, score: number, label: string) => {
    const hits = ref.current
      .filter((a) => !a.fired && a.kind === 'pattern' && a.inst.id === instId && a.tf === tf && score >= a.level)
      .map((a) => ({ a, msg: `${instId} ${tf}: ${name} ${score}% (${label}) reached your ${a.level}% alert` }));
    fire(hits);
  }, [fire]);

  return { alerts, add, remove, clearFired, checkPrice, checkPattern };
}
