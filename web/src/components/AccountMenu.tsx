import { useEffect, useRef, useState } from 'react';
import Floating, { inFloat } from './Floating';
import { KIND, cloudAvailable, resolveConflict, signIn, signOut, syncNow, useAccount } from '../cloud';

/** Sign in with Google to keep portfolios, watchlist and paper trading across devices. Hidden when sign-in is not set up. */
export default function AccountMenu() {
  const a = useAccount();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !inFloat(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!cloudAvailable || a.status === 'off') return null;

  const u = a.user;
  const line = a.status === 'saving' ? 'Saving…' : a.status === 'working' ? 'Syncing…' : a.status === 'error' ? `Could not save (${a.error || 'offline'}). Will retry.`
    : a.lastSync ? `Saved to your account at ${new Date(a.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Signed in';

  return (
    <div className="acct" ref={box}>
      {!u ? (
        <button className="theme acct-in" onClick={signIn} title="Sign in to save your portfolio, watchlist and paper trading, and use them on any device">
          <b className="acct-g">G</b> Sign in{a.status === 'error' && a.error ? ' (retry)' : ''}
        </button>
      ) : (
        <>
          <button className="acct-av" onClick={() => setOpen(!open)} title={`${u.name} · ${line}`} aria-label="Account">
            {u.photo ? <img src={u.photo} alt="" referrerPolicy="no-referrer" /> : <span>{u.name.slice(0, 1).toUpperCase()}</span>}
            <i className={`acct-dot ${a.status}`} />
          </button>
          {open && (
            <Floating anchor={box} className="acct-menu" width={270} align="right">
              <div><b>{u.name}</b><div className="small">{u.email}</div></div>
              <div className={`small acct-line ${a.status === 'error' ? 'down' : ''}`}>{line}</div>
              <button className="mini" onClick={() => { syncNow(); }}>Sync now</button>
              <button className="mini" onClick={() => signOut(false)}>Sign out</button>
              <button className="mini danger" title="Sign out and remove this account's saved data from this browser (it stays safe in your account)" onClick={() => { if (confirm('Sign out and clear the saved data on this device? It stays in your account, and comes back when you sign in again.')) signOut(true); }}>Sign out and clear this device</button>
              <p className="small">Your portfolios, watchlist, alerts, paper trading and settings are saved to your account.</p>
            </Floating>
          )}
        </>
      )}

      {a.conflicts && (
        <div className="modal">
          <div className="mk acct-conflict">
            <div className="mk-head"><b>Your account already has saved data</b></div>
            <div className="mk-body">
              <p>You have different <b>{a.conflicts.map((k) => KIND[k] ?? k).join(', ')}</b> here on this device and in your account. What should we keep?</p>
              <button className="mini on acct-opt" onClick={() => resolveConflict('combine')}>
                <b>Combine both</b><span className="small">Keeps every stock, fund and watchlist item from both. For paper trading your account's version is kept.</span>
              </button>
              <button className="mini acct-opt" onClick={() => resolveConflict('account')}>
                <b>Use my account's data</b><span className="small">Replaces what is on this device.</span>
              </button>
              <button className="mini acct-opt" onClick={() => resolveConflict('device')}>
                <b>Keep this device's data</b><span className="small">Replaces what is in your account.</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A small nudge near saved data when it only exists in this browser. */
export function SaveHint() {
  const a = useAccount();
  if (!cloudAvailable || a.status !== 'signedOut') return null;
  return <span className="small acct-hint">☁ <a href="#" onClick={(e) => { e.preventDefault(); signIn(); }}>Sign in with Google</a> to keep this on all your devices.</span>;
}
