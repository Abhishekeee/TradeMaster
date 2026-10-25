export type Page = 'home' | 'charts' | 'portfolio' | 'world';

/** Home is the landing page; the Charts page lives at #/charts. */
export const pageFromHash = (): Page => {
  const h = location.hash;
  return h.startsWith('#/portfolio') ? 'portfolio' : h.startsWith('#/world') ? 'world' : h.startsWith('#/charts') ? 'charts' : 'home';
};

const I = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const ICON = {
  home: I('M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10'),
  charts: I('M3 3v18h18M7 15l4-5 3 3 5-7'),
  portfolio: I('M3 7h18v13H3zM8 7V4h8v3M3 13h18'),
  world: I('M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'),
};

/** Top-level switch between the app's pages. */
export default function Nav({ page }: { page: Page }) {
  const L = (p: Page, href: string, label: string) => <a href={href} className={page === p ? 'on' : ''}>{ICON[p]}{label}</a>;
  return (
    <nav className="topnav">
      {L('home', '#/', 'Home')}
      {L('charts', '#/charts', 'Charts')}
      {L('portfolio', '#/portfolio', 'Portfolio')}
      {L('world', '#/world', 'World')}
    </nav>
  );
}
