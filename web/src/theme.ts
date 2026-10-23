import { useEffect, useState } from 'react';

/** Light / dark mode shared by every page: stored with the rest of the settings and applied to the document. */
export function useTheme(): ['dark' | 'light', () => void] {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    let t: 'dark' | 'light' = 'dark';
    try { t = JSON.parse(localStorage.getItem('tm') || '{}').theme === 'light' ? 'light' : 'dark'; } catch { /* ignore */ }
    setTheme(t); document.documentElement.dataset.theme = t;
  }, []);
  const flip = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t); document.documentElement.dataset.theme = t;
    try { localStorage.setItem('tm', JSON.stringify({ ...JSON.parse(localStorage.getItem('tm') || '{}'), theme: t })); } catch { /* ignore */ }
  };
  return [theme, flip];
}
