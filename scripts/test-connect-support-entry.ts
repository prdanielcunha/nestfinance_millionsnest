import assert from 'node:assert/strict';
import { createConnectSupportDraftHandler } from '../server/vercel-handlers/system/connectSupportDraft';
import { createConnectSupportAction, type SupportSession } from '../src/services/connectSupportAction';

const valid = () => ({ product: 'nestfinance', automaticSend: false, expiresAt: Date.now() + 600000,
  draftUrl: 'https://wa.me/15555550123?text=NestFinance%20synthetic-origin' });
let count = 0;
async function test(name: string, run: () => unknown) { await run(); count++; console.log(`PASS ${name}`); }
function relay(upstream: typeof fetch = async () => new Response(JSON.stringify(valid()))) {
  let status = 200, data: any, calls = 0;
  const req: any = { method: 'POST', headers: { authorization: 'Bearer synthetic-user-token', 'x-organization-id': 'synthetic-org' }, body: { locale: 'pt-BR' } };
  const res: any = { setHeader(k: string, v: string) { assert.equal(k, 'Cache-Control'); assert.equal(v, 'no-store'); },
    status(n: number) { status = n; return res; }, json(value: any) { data = value; return res; } };
  return { req, run: async () => { await createConnectSupportDraftHandler(async (input, init) => { calls++; return upstream(input, init); })(req, res); return { status, data, calls }; } };
}
function client(fetchImpl: typeof fetch = async () => new Response(JSON.stringify(valid()))) {
  let session: SupportSession | null = { uid: 'synthetic-user', organizationId: 'synthetic-org', getToken: async () => 'synthetic-user-token' };
  let calls = 0, navigated = '', lastState: boolean[] = [];
  const popup = { closed: false, opener: {} as unknown, location: { href: 'about:blank' }, close() { this.closed = true; } };
  const options = { session: () => session, popup: () => popup, fetch: (async (input, init) => { calls++; return fetchImpl(input, init); }) as typeof fetch,
    navigate: (url: string) => { navigated = url; }, state: (busy: boolean, failed: boolean) => { lastState = [busy, failed]; } };
  const action = createConnectSupportAction(options);
  return { action, popup, options, get calls() { return calls; }, get state() { return lastState; }, get navigated() { return navigated; }, setSession(value: SupportSession | null) { session = value; } };
}
await test('fixed Core endpoint and product; only selected tenant/locale/identity forwarded', async () => {
  const h = relay(async (url, init) => {
    assert.equal(url, 'https://connect.millionsnest.com/api/core/support/draft');
    assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    assert.deepEqual(JSON.parse(String(init?.body)), { product: 'nestfinance', organizationId: 'synthetic-org', locale: 'pt-BR' });
    assert.equal(new Headers(init?.headers).get('X-Connect-User-Authorization'), 'Bearer synthetic-user-token');
    return new Response(JSON.stringify({ ...valid(), secret: 'never-project' }));
  });
  const result = await h.run(); assert.equal(result.status, 200); assert.deepEqual(Object.keys(result.data).sort(), ['automaticSend', 'draftUrl', 'expiresAt', 'product']);
});
for (const status of [401, 403, 404, 409, 429, 500]) await test(`Core denial ${status} fails closed without body disclosure`, async () => {
  const h = relay(async () => new Response(JSON.stringify({ private: 'synthetic-private-data' }), { status }));
  const r = await h.run(); assert.equal(r.status, status < 410 ? status : 503); assert.deepEqual(r.data, { error: 'SUPPORT_UNAVAILABLE' });
});
for (const [name, mutate, expected] of [
  ['wrong method', (r: any) => { r.method = 'GET'; }, 405],
  ['missing identity', (r: any) => { delete r.headers.authorization; }, 401],
  ['invalid alternate identity', (r: any) => { r.headers['x-connect-user-authorization'] = ['Bearer other']; }, 401],
  ['tenant traversal', (r: any) => { r.headers['x-organization-id'] = '../other'; }, 400],
  ['caller product spoof', (r: any) => { r.body.product = 'musicscale'; }, 400],
  ['caller financial content', (r: any) => { r.body.financeEntityId = 'synthetic-entity'; }, 400],
  ['unsupported locale', (r: any) => { r.body.locale = 'invalid'; }, 400],
] as const) await test(name, async () => { const h = relay(); mutate(h.req); const r = await h.run(); assert.equal(r.status, expected); assert.equal(r.calls, 0); });
for (const mutate of [
  (d: any) => { d.product = 'musicscale'; }, (d: any) => { d.automaticSend = true; },
  (d: any) => { d.expiresAt = Date.now() - 1; }, (d: any) => { d.expiresAt = Date.now() + 700000; },
  (d: any) => { d.draftUrl = 'https://evil.invalid/?text=hello'; },
  (d: any) => { d.draftUrl = 'https://wa.me/15555550123?text=hello#unsafe'; },
  (d: any) => { d.draftUrl = 'https://wa.me/15555550123?text=one&text=two'; },
  (d: any) => { d.draftUrl = 'https://wa.me/15555550123?text=synthetic-user-token'; },
]) await test('unsafe or expired draft rejected by relay and client', async () => {
  const d = valid(); mutate(d); const fetchImpl: typeof fetch = async () => new Response(JSON.stringify(d));
  assert.equal((await relay(fetchImpl).run()).status, 503);
  const c = client(fetchImpl); await c.action.open('en-US'); assert.equal(c.popup.location.href, 'about:blank'); assert.equal(c.popup.closed, true); assert.deepEqual(c.state, [false, true]);
});
await test('explicit action only, repeated clicks do not duplicate; accepted popup is detached', async () => {
  const c = client(); assert.equal(c.calls, 0);
  await Promise.all([c.action.open('pt-BR'), c.action.open('pt-BR')]);
  assert.equal(c.calls, 1); assert.equal(c.popup.opener, null); assert.match(c.popup.location.href, /^https:\/\/wa.me\//);
  c.action.cancel(); assert.equal(c.popup.closed, false);
});
for (const kind of ['logout', 'organization', 'account', 'unmount'] as const) await test(`${kind} during request never navigates`, async () => {
  let resolve!: (value: Response) => void; const c = client(async () => new Promise<Response>(r => { resolve = r; }));
  const open = c.action.open('es-ES'); await Promise.resolve();
  if (kind === 'logout') c.setSession(null);
  else if (kind === 'unmount') c.action.cancel();
  else c.setSession({ uid: kind === 'account' ? 'other' : 'synthetic-user', organizationId: kind === 'organization' ? 'other-org' : 'synthetic-org', getToken: async () => 'other-token' });
  resolve(new Response(JSON.stringify(valid()))); await open;
  assert.equal(c.popup.location.href, 'about:blank'); assert.equal(c.popup.closed, true); assert.equal(c.navigated, '');
});
await test('logout before token resolution sends nothing', async () => {
  let resolve!: (token: string) => void; const c = client();
  c.setSession({ uid: 'synthetic-user', organizationId: 'synthetic-org', getToken: () => new Promise(r => { resolve = r; }) });
  const open = c.action.open('pt-BR'); c.setSession(null); resolve('synthetic-user-token'); await open; assert.equal(c.calls, 0);
});
await test('closed popup is not reopened; blocked popup uses same-tab navigation', async () => {
  const c = client(); c.popup.closed = true; await c.action.open('pt-BR'); assert.equal(c.popup.location.href, 'about:blank'); assert.equal(c.navigated, '');
  const blocked = client(); const action = createConnectSupportAction({ ...blocked.options, popup: () => null }); await action.open('pt-BR'); assert.match(blocked.navigated, /^https:\/\/wa.me\//);
});
await test('missing canonical UI scope never initiates a request', async () => { const c = client(); c.setSession(null); await c.action.open('pt-BR'); assert.equal(c.calls, 0); });
console.log(`CONNECT_SUPPORT_ENTRY_TESTS_OK ${count}`);
