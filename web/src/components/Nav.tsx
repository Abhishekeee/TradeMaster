export type Page = 'home' | 'charts' | 'portfolio' | 'world';

/** Home is the landing page; the Charts page lives at #/charts. */
export const pageFromHash = (): Page => {
  const h = location.hash;
  return h.startsWith('#/portfolio') ? 'portfolio' : h.startsWith('#/world') ? 'world' : h.startsWith('#/charts') ? 'charts' : 'home';
};

/** Top-level switch between the app's pages. */
export default function Nav({ page }: { page: Page }) {
  return (
    <nav className="topnav">
      <a href="#/" className={page === 'home' ? 'on' : ''}>Home</a>
      <a href="#/charts" className={page === 'charts' ? 'on' : ''}>Charts &amp; Trading</a>
      <a href="#/portfolio" className={page === 'portfolio' ? 'on' : ''}>My Portfolio</a>
      <a href="#/world" className={page === 'world' ? 'on' : ''}>World Markets</a>
    </nav>
  );
}
