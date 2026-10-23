import { useSyncExternalStore } from 'react';
import { firebaseBackend, firebaseConfigured } from './firebase';
import { getState, startSync, subscribe, type Backend } from './sync';

export { signIn, signOut, syncNow, resolveConflict, KIND } from './sync';
export type { AccountState, Choice } from './sync';

/** Whether sign-in is available in this build. */
export const cloudAvailable = firebaseConfigured || (import.meta.env.DEV && (() => { try { return !!localStorage.getItem('tm-fakecloud'); } catch { return false; } })());

/** Call once when the app starts. */
export async function initCloud() {
  let b: Backend | null = null;
  if (firebaseConfigured) b = firebaseBackend;
  else if (import.meta.env.DEV && cloudAvailable) b = (await import('./fake')).fakeBackend; // development stand-in, never shipped
  startSync(b);
}

export const useAccount = () => useSyncExternalStore(subscribe, getState);
