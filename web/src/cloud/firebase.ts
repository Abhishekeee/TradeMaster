import type { Backend, CloudUser, Entry } from './sync';

/**
 * Firebase settings come from the build (VITE_FIREBASE_* variables). They are the public web settings Firebase hands out
 * for a web app, not secrets: access is protected by the sign-in and the rules in firestore.rules.
 */
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || (import.meta.env.VITE_FIREBASE_PROJECT_ID ? `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com` : undefined),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};
export const firebaseConfigured = !!(cfg.apiKey && cfg.projectId && cfg.appId);

// the SDK is large, so it is only downloaded when sign-in is set up
let sdk: Promise<{ auth: import('firebase/auth').Auth; db: import('firebase/firestore').Firestore; A: typeof import('firebase/auth'); F: typeof import('firebase/firestore') }> | null = null;
const load = () => (sdk ??= (async () => {
  const [app, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const a = app.initializeApp(cfg);
  return { auth: A.getAuth(a), db: F.getFirestore(a), A, F };
})());

const docId = (k: string) => k.replace(/[^A-Za-z0-9_-]/g, '_');

export const firebaseBackend: Backend = {
  onUser(cb) {
    let off: (() => void) | undefined, dead = false;
    load().then(({ auth, A }) => {
      if (dead) return;
      off = A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, name: u.displayName || u.email || 'You', email: u.email || '', photo: u.photoURL } as CloudUser : null));
    });
    return () => { dead = true; off?.(); };
  },
  async signIn() {
    const { auth, A } = await load();
    try { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); }
    catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/popup-blocked') { await A.signInWithRedirect(auth, new A.GoogleAuthProvider()); return; }
      if (code === 'auth/unauthorized-domain') throw new Error('This website address is not allowed to sign in yet. Add it under Authentication → Settings → Authorized domains in the Firebase console.');
      throw e;
    }
  },
  async signOut() { const { auth, A } = await load(); await A.signOut(auth); },
  async pullAll(uid) {
    const { db, F } = await load();
    const snap = await F.getDocs(F.collection(db, 'users', uid, 'store'));
    const out: Record<string, Entry> = {};
    snap.forEach((d) => { const x = d.data(); if (typeof x.key === 'string' && typeof x.value === 'string') out[x.key] = { value: x.value, at: +x.at || 0 }; });
    return out;
  },
  async push(uid, key, entry) {
    const { db, F } = await load();
    await F.setDoc(F.doc(db, 'users', uid, 'store', docId(key)), { key, value: entry.value, at: entry.at });
  },
};
