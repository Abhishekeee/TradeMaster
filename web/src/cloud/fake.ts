import type { Backend, CloudUser, Entry } from './sync';

/**
 * A stand-in for Firebase used only while developing (turn it on with localStorage 'tm-fakecloud').
 * "Signing in" picks the account named in that setting, and its data lives in another localStorage key, so
 * the whole sign-in and sync flow can be tried without a Firebase project.
 */
const DB = 'tm-fakecloud-db';
const read = (): Record<string, Record<string, Entry>> => { try { return JSON.parse(localStorage.getItem(DB) || '{}'); } catch { return {}; } };
const SESSION = 'tm-fakecloud-user';
const listeners = new Set<(u: CloudUser | null) => void>();
const current = (): CloudUser | null => { try { return JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch { return null; } };

export const fakeBackend: Backend = {
  onUser(cb) { listeners.add(cb); setTimeout(() => cb(current()), 50); return () => { listeners.delete(cb); }; },
  async signIn() {
    const name = localStorage.getItem('tm-fakecloud') || 'Test User';
    const u: CloudUser = { uid: name.toLowerCase().replace(/\W+/g, '-'), name, email: `${name.toLowerCase().replace(/\W+/g, '.')}@example.com`, photo: null };
    localStorage.setItem(SESSION, JSON.stringify(u));
    listeners.forEach((l) => l(u));
  },
  async signOut() { localStorage.removeItem(SESSION); listeners.forEach((l) => l(null)); },
  async pullAll(uid) { return read()[uid] ?? {}; },
  async push(uid, key, entry) { const d = read(); (d[uid] ??= {})[key] = entry; localStorage.setItem(DB, JSON.stringify(d)); },
};
