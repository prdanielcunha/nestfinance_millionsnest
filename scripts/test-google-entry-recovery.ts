import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Execute the actual browser service with a fake Firebase transport. No Google
// credentials, personal data or live authorization are used by this test.
const state: any = {
  direct: { currentUser: null, authStateReady: async () => {} },
  primary: { currentUser: null, authStateReady: async () => {} },
  popup: null, popupError: null, redirect: null,
  exchanges: 0, redirects: 0, popupCalls: 0, customTokens: 0, cleared: 0,
  response: { status: 'ready', customToken: 'synthetic-token', organization: { id: 'test-org', name: 'Test' } },
};
(globalThis as any).__entryTest = state;
const storage = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => storage.delete(key),
};
(globalThis as any).fetch = async () => {
  state.exchanges++;
  return { status: 200, ok: true, json: async () => state.response };
};
const user = { getIdToken: async () => 'synthetic-id-token' };
const output = await build({
  entryPoints: ['src/services/directEntryService.ts'], bundle: true,
  write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'fake-firebase', setup(builder) {
    builder.onResolve({ filter: /^(firebase\/|\.\.\/lib\/firebase|\.\/ecosystemSessionLifecycle|\.\/sessionResolutionService)/ }, args => ({ path: args.path, namespace: 'fake' }));
    builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => {
      const contents = args.path === 'firebase/app'
        ? `export const getApps=()=>[]; export const initializeApp=()=>({}); export const getApp=()=>({});`
        : args.path === 'firebase/auth'
        ? `const s=globalThis.__entryTest;
           export const getAuth=()=>s.direct;
           export class GoogleAuthProvider {setCustomParameters(){}}
           export const getRedirectResult=async()=>{s.redirects++;return s.redirect};
           export const signInWithPopup=async()=>{s.popupCalls++;if(s.popupError)throw s.popupError;return s.popup};
           export const signInWithCustomToken=async()=>{s.customTokens++;s.primary.currentUser=s.popup?.user||s.direct.currentUser};
           export const signOut=async(auth)=>{auth.currentUser=null};`
        : args.path.includes('lib/firebase')
        ? `export const firebaseAuth=globalThis.__entryTest.primary;export const firebaseConfig={};`
        : args.path.includes('sessionResolutionService')
        ? `export const clearSessionResolutionCache=()=>{globalThis.__entryTest.cleared++};`
        : `export const markNestFinanceSessionOrigin=()=>{};export const clearNestFinanceSessionLifecycle=()=>{};`;
      return { contents, loader: 'js' };
    });
  } }],
});
const service = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

// Popup must be invoked before yielding to persistence or any other async work.
state.popup = { user };
const login = service.startGoogleDirectEntry();
assert.equal(state.popupCalls, 1);
assert.equal((await login).status, 'ready');
assert.equal(state.customTokens, 1);

// A blocked popup must report failure, never switch to a silent cross-site redirect.
state.popupError = Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' });
await assert.rejects(service.startGoogleDirectEntry(), /blocked/);
assert.equal(state.redirects, 0);
state.popupError = null;
state.primary.currentUser = null;

// Reload/StrictMode recovery exchanges a persisted Google identity once.
state.direct.currentUser = user;
state.response = { status: 'choose_organization', organizations: [{ id: 'test-org', name: 'Test' }] };
const before = state.exchanges;
const first = service.finishGoogleRedirectEntry();
const second = service.finishGoogleRedirectEntry();
assert.equal(first, second);
assert.equal((await first).status, 'choose_organization');
await second;
assert.equal(state.exchanges, before + 1);

// Restored primary identity can discover and choose its canonical organization.
state.direct.currentUser = null;
state.primary.currentUser = user;
assert.equal((await service.finishGoogleRedirectEntry()).status, 'choose_organization');
state.response = { status: 'ready', customToken: 'synthetic-token', organization: { id: 'test-org', name: 'Test' } };
assert.equal((await service.chooseDirectEntryOrganization('test-org')).status, 'ready');

// Legacy redirect with no credential must not silently drop into idle/login.
state.primary.currentUser = null;
storage.set('nf_direct_google_redirect_pending', '1');
await assert.rejects(service.finishGoogleRedirectEntry(), /DIRECT_REDIRECT_INCOMPLETE/);
assert.equal(storage.has('nf_direct_google_redirect_pending'), false);
assert.equal(await service.finishGoogleRedirectEntry(), null);

state.direct.currentUser = user;
state.primary.currentUser = user;
await service.clearDirectEntryIdentity();
assert.equal(state.direct.currentUser, null);
assert.equal(state.primary.currentUser, null);
assert.equal(state.cleared, 1);
console.log('GOOGLE_ENTRY_RECOVERY_OK: immediate popup, blocked popup, reload, StrictMode, primary restore, legacy redirect, account switch');
