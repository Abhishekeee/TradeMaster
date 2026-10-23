import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Portfolio from './components/Portfolio';
import World from './components/World';
import { pageFromHash } from './components/Nav';
import './style.css';

function Shell() {
  const [page, setPage] = useState(pageFromHash);
  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page === 'portfolio' ? <Portfolio /> : page === 'world' ? <World /> : <App />;
}

createRoot(document.getElementById('root')!).render(<Shell />);
