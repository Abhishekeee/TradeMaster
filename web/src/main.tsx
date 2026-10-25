import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Portfolio from './components/Portfolio';
import World from './components/World';
import Home from './components/Home';
import { pageFromHash } from './components/Nav';
import { initCloud } from './cloud';
import './style.css';
import './ui.css';

function Shell() {
  const [page, setPage] = useState(pageFromHash);
  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page === 'portfolio' ? <Portfolio /> : page === 'world' ? <World /> : page === 'charts' ? <App /> : <Home />;
}

// start keeping saved data in step with the account (does nothing when sign-in is not set up)
initCloud();
createRoot(document.getElementById('root')!).render(<Shell />);
