export type Page = 'charts' | 'portfolio' | 'world';

export const pageFromHash = (): Page => (location.hash.startsWith('#/portfolio') ? 'portfolio' : location.hash.startsWith('#/world') ? 'world' : 'charts');

/** Top-level switch between the trading workspace and the portfolio analyser. */
export default function Nav({ page }: { page: Page }) {
  return (
    <nav className="topnav">
      <a href="#/" className={page === 'charts' ? 'on' : ''}>Charts &amp; Trading</a>
      <a href="#/portfolio" className={page === 'portfolio' ? 'on' : ''}>My Portfolio</a>
      <a href="#/world" className={page === 'world' ? 'on' : ''}>World Markets</a>
    </nav>
  );
}
