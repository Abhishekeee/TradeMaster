import { useCallback, useEffect, useState } from 'react';
import type { Instrument } from './types';

const KEY = 'tm-watch';

function load(): Instrument[] {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(a)) return a; } catch { /* ignore */ }
  return [];
}

export function useWatchlist() {
  const [list, setList] = useState<Instrument[]>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } }, [list]);
  const has = useCallback((id: string) => list.some((i) => i.id === id), [list]);
  const toggle = useCallback((inst: Instrument) => {
    setList((l) => (l.some((i) => i.id === inst.id) ? l.filter((i) => i.id !== inst.id) : [...l, inst]));
  }, []);
  return { list, has, toggle };
}
