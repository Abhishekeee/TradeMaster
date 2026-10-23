/**
 * Keeps the app's saved data (portfolios, watchlist, paper trading, alerts, drawings, settings) in step between this
 * browser and the user's account. The browser copy stays the working copy, so the app works the same when signed out
 * or offline; signing in just adds a copy in the cloud and brings other devices up to date.
 */

export interface CloudUser { uid: string; name: string; email: string; photo: string | null }
export interface Entry { value: string; at: number }

/** Where the account data lives (Firebase in the real app, an in-memory stand-in in tests). */
export interface Backend {
  onUser(cb: (u: CloudUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  pullAll(uid: string): Promise<Record<string, Entry>>;
  push(uid: string, key: string, entry: Entry): Promise<void>;
}

export type Status = 'off' | 'signedOut' | 'working' | 'synced' | 'saving' | 'error';
export interface AccountState { status: Status; user: CloudUser | null; lastSync: number; conflicts: string[] | null; error: string }
export type Choice = 'account' | 'device' | 'combine';

/** What gets saved to the account. Cached rates and the "tour done" flag stay on the device. */
export const isSynced = (k: string) => k === 'tm' || /^tm-(portfolio|watch|paper|alerts|pf-ccy|world|lvlmode)$/.test(k) || k.startsWith('tm-draw:');
const CRITICAL = ['tm-portfolio', 'tm-watch', 'tm-paper', 'tm-alerts'];
export const KIND: Record<string, string> = { 'tm-portfolio': 'Portfolio', 'tm-watch': 'Watchlist', 'tm-paper': 'Paper trading', 'tm-alerts': 'Alerts' };
const META = 'tm-sync';

interface Meta { at: Record<string, number>; last: Record<string, number> }

let state: AccountState = { status: 'off', user: null, lastSync: 0, conflicts: null, error: '' };
const listeners = new Set<() => void>();
export const getState = () => state;
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const set = (p: Partial<AccountState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };

let backend: Backend | null = null;
let applying = false;
let installed = false;
let rawSet: (k: string, v: string) => void = (k, v) => localStorage.setItem(k, v);
const queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: { uid: string; cloud: Record<string, Entry> } | null = null;

const readMeta = (): Meta => { try { const m = JSON.parse(localStorage.getItem(META) || ''); return { at: m.at ?? {}, last: m.last ?? {} }; } catch { return { at: {}, last: {} }; } };
const writeMeta = (m: Meta) => { try { rawSet(META, JSON.stringify(m)); } catch { /* ignore */ } };

function localEntries(): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isSynced(k)) { const v = localStorage.getItem(k); if (v !== null) out.set(k, v); } }
  return out;
}

const parse = (v: string) => { try { return JSON.parse(v); } catch { return null; } };
/** "Nothing of value here yet": a fresh portfolio, an empty watchlist, an untouched paper account. */
function isEmpty(k: string, v: string | undefined): boolean {
  if (v === undefined) return true;
  const j = parse(v);
  if (j === null) return true;
  if (k === 'tm-portfolio') return !(j.people ?? []).some((p: { holdings?: unknown[] }) => (p.holdings ?? []).length);
  if (k === 'tm-watch' || k === 'tm-alerts') return Array.isArray(j) ? j.length === 0 : true;
  if (k === 'tm-paper') return !(j.positions ?? []).length && !(j.history ?? []).length && !(j.orders ?? []).length;
  return false;
}

/** Combine two copies: portfolios and watchlists keep everything from both; anything else keeps the account's copy. */
function combine(k: string, local: string, cloud: string): string {
  const a = parse(local), b = parse(cloud);
  if (k === 'tm-portfolio' && a?.people && b?.people) {
    const people = [...b.people];
    for (const lp of a.people) {
      const cp = people.find((p: { id: string }) => p.id === lp.id);
      if (!cp) { people.push(lp); continue; }
      const holdings = [...(cp.holdings ?? [])];
      for (const lh of lp.holdings ?? []) {
        const ch = holdings.find((h: { inst: { id: string } }) => h.inst.id === lh.inst.id);
        if (!ch) holdings.push(lh);
        else for (const lot of lh.lots ?? []) if (!(ch.lots ?? []).some((x: { id: string }) => x.id === lot.id)) ch.lots = [...(ch.lots ?? []), lot];
      }
      cp.holdings = holdings;
    }
    return JSON.stringify({ active: a.active ?? b.active, people });
  }
  if ((k === 'tm-watch' || k === 'tm-alerts') && Array.isArray(a) && Array.isArray(b)) {
    const seen = new Set(b.map((x: unknown) => JSON.stringify(x)));
    return JSON.stringify([...b, ...a.filter((x: unknown) => !seen.has(JSON.stringify(x)))]);
  }
  return cloud;
}

function reloadOnce() {
  try {
    const last = +(sessionStorage.getItem('tm-reloaded') || 0);
    if (Date.now() - last < 20000) return;
    sessionStorage.setItem('tm-reloaded', String(Date.now()));
  } catch { /* ignore */ }
  location.reload();
}

/** Bring this browser and the account in line. Called after sign-in and whenever the page starts while signed in. */
async function reconcile(uid: string, decision?: Choice) {
  if (!backend) return;
  set({ status: 'working', error: '' });
  try {
    const cloud = decision && pending ? pending.cloud : await backend.pullAll(uid);
    const meta = readMeta();
    const first = meta.last[uid] === undefined;
    const local = localEntries();
    const apply: string[] = [], push: string[] = [], conflicts: string[] = [];
    const merged = new Map<string, string>();

    for (const k of new Set([...local.keys(), ...Object.keys(cloud)])) {
      const l = local.get(k), c = cloud[k];
      const lAt = meta.at[k] ?? 0;
      if (l === undefined) { apply.push(k); continue; }
      if (!c) { push.push(k); continue; }
      if (l === c.value) { meta.at[k] = Math.max(lAt, c.at); continue; }
      if (first) {
        if (CRITICAL.includes(k) && !isEmpty(k, l) && !isEmpty(k, c.value)) conflicts.push(k);
        else if (isEmpty(k, l)) apply.push(k);
        else if (isEmpty(k, c.value)) push.push(k);
        else apply.push(k);
      } else if (lAt > c.at) push.push(k);
      else apply.push(k);
    }

    if (conflicts.length) {
      if (!decision) { pending = { uid, cloud }; set({ conflicts, status: 'working' }); return; }
      for (const k of conflicts) {
        if (decision === 'account') apply.push(k);
        else if (decision === 'device') push.push(k);
        else { merged.set(k, combine(k, local.get(k)!, cloud[k].value)); }
      }
    }
    pending = null;

    applying = true;
    try { for (const k of apply) { rawSet(k, cloud[k].value); meta.at[k] = cloud[k].at; } for (const [k, v] of merged) { rawSet(k, v); push.push(k); } } finally { applying = false; }
    const now = Date.now();
    for (const k of push) meta.at[k] = k in meta.at && !merged.has(k) ? meta.at[k] || now : now;
    meta.last[uid] = now;
    writeMeta(meta);

    for (const k of push) await backend.push(uid, k, { value: localStorage.getItem(k) ?? '', at: meta.at[k] });
    set({ status: 'synced', lastSync: Date.now(), conflicts: null });
    if (apply.length || merged.size) reloadOnce();
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : 'Could not sync' });
  }
}

async function flush() {
  timer = undefined;
  const uid = state.user?.uid;
  if (!backend || !uid || state.conflicts) return;
  const meta = readMeta();
  set({ status: 'saving' });
  try {
    for (const k of [...queue]) {
      const v = localStorage.getItem(k);
      if (v !== null) await backend.push(uid, k, { value: v, at: meta.at[k] ?? Date.now() });
      queue.delete(k);
    }
    set({ status: 'synced', lastSync: Date.now(), error: '' });
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : 'Could not save' });
    timer = setTimeout(flush, 30000);
  }
}

function onLocalChange(k: string) {
  const meta = readMeta();
  meta.at[k] = Date.now();
  writeMeta(meta);
  if (backend && state.user && !state.conflicts) {
    queue.add(k);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 1500);
  }
}

/** Record every save of a synced setting, however the app writes it. */
function patchStorage() {
  if (installed) return;
  installed = true;
  const proto = Storage.prototype;
  const orig = proto.setItem;
  rawSet = (k, v) => orig.call(localStorage, k, v);
  proto.setItem = function (k: string, v: string) {
    orig.call(this, k, v);
    if (this === localStorage && !applying && isSynced(k)) onLocalChange(k);
  };
}

/** Start syncing. With no backend (cloud sign-in not set up) the app simply stays local. */
export function startSync(b: Backend | null) {
  patchStorage();
  backend = b;
  if (!b) { set({ status: 'off' }); return; }
  set({ status: 'signedOut' });
  b.onUser((u) => {
    if (!u) { queue.clear(); set({ user: null, status: 'signedOut', conflicts: null, lastSync: 0 }); return; }
    set({ user: u });
    reconcile(u.uid);
  });
  window.addEventListener('online', () => { if (state.status === 'error' && state.user) { if (queue.size) flush(); else reconcile(state.user.uid); } });
}

export const resolveConflict = (c: Choice) => { if (state.user) reconcile(state.user.uid, c); };
export const syncNow = () => { if (state.user) reconcile(state.user.uid); };
export const signIn = async () => { try { set({ error: '' }); await backend?.signIn(); } catch (e) { set({ status: 'error', error: e instanceof Error ? e.message : 'Sign-in failed' }); } };
export async function signOut(clearDevice = false) {
  if (timer) { clearTimeout(timer); timer = undefined; }
  if (queue.size && state.user && backend) { try { await flush(); } catch { /* signing out anyway */ } }
  await backend?.signOut();
  if (clearDevice) {
    applying = true;
    try { [...localEntries().keys(), META].forEach((k) => localStorage.removeItem(k)); } finally { applying = false; }
    location.hash = '#/';
    location.reload();
  }
}
