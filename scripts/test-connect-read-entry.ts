import assert from 'node:assert/strict';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { resolveFinanceRequestContext } from '../server/vercel-handlers/finance/accessHelpers.js';
import { resolveConnectFinanceReadContext, resolveConnectFinanceReadIdentity } from '../server/vercel-handlers/finance/connectReadContext.js';
import { createConnectEntitiesHandler } from '../server/vercel-handlers/finance/connectEntities.js';
import { createConnectPendingDocumentsHandler } from '../server/vercel-handlers/finance/connectPendingDocuments.js';

// Synthetic read-only Firestore semantics: actual selectors, filters, limits and aggregates.
const data: Record<string, any> = {}, reads: string[] = [];
let outage = false;
function ref(path: string, filters: Array<[string, unknown]> = [], limit = 1000): any {
  const docs = () => Object.keys(data).filter(key => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/'))
    .filter(key => filters.every(([field, value]) => field.split('.').reduce((v, k) => v?.[k], data[key]) === value)).sort()
    .slice(0, limit).map(key => ({ id: key.split('/').at(-1), exists: true, data: () => data[key], ref: ref(key) }));
  return {
    collection: (name: string) => ref(`${path}/${name}`), doc: (id: string) => ref(`${path}/${id}`),
    orderBy: () => ref(path, filters, limit), startAfter: () => { throw new Error('Unexpected cursor'); },
    limit: (n: number) => ref(path, filters, n), where: (field: string, op: string, value: unknown) => { assert.equal(op, '=='); return ref(path, [...filters, [field, value]], limit); },
    count: () => ({ get: async () => { reads.push(path); return { data: () => ({ count: docs().length }) }; } }),
    get: async () => { if (outage) throw new Error('PRIVATE provider body'); reads.push(path); return { id: path.split('/').at(-1), exists: Object.hasOwn(data, path), data: () => data[path], docs: docs(), size: docs().length, ref: ref(path) }; },
  };
}
process.env.NODE_ENV = 'test';
(globalThis as any)[Symbol.for('TEST_FIRESTORE')] = { collection: (path: string) => ref(path), runTransaction: () => { throw new Error('READ_ONLY_TEST_WRITE'); } };
resetFirebaseAdminForTests();
const admin = getFirebaseAdmin(), originalVerify = admin.auth.verifyIdToken;
const org = 'synthetic-connect-org-a', uid = 'synthetic-connect-user';
const orgPath = `organizations/${org}`, memberPath = `${orgPath}/members/${uid}`, userPath = `users/${uid}`;
data[orgPath] = { name: 'Synthetic org', enabledApps: ['nestfinance'], entitlements: { nestfinance: { active: true } } };
data[userPath] = { status: 'active', ecosystemSessionVersion: 7 };
const member = () => ({ status: 'active', role: 'member', appAccess: { nestFinance: { enabled: true, permissions: ['finance.view'], scopes: { financeEntityIds: ['synthetic-entity-a'] } } } });
data[memberPath] = member();
for (const [id, active] of [['synthetic-entity-a', true], ['synthetic-entity-b', true], ['synthetic-inactive', false]]) data[`${orgPath}/financeEntities/${id}`] = { active, displayName: id, taxId: 'PRIVATE', bank: 'PRIVATE' };
data['organizations/synthetic-connect-org-b/financeEntities/synthetic-entity-a'] = { active: true, displayName: 'PRIVATE other tenant' };
const evidence = `${orgPath}/financeEntities/synthetic-entity-a/universalEvidence`;
data[`${evidence}/evd_synthetic_a`] = { organizationId: org, financeEntityId: 'synthetic-entity-a', processingState: 'awaiting_upload', review: { status: 'pending' }, originalFilename: 'PRIVATE', storagePath: 'PRIVATE' };
let claims: any = { uid, mn_app_id: 'connect', mn_handoff_version: 1, mn_organization_id: org, mn_session_version: 7 };
let revoked = false, verified = 0;
admin.auth.verifyIdToken = async (token: string, checkRevoked?: boolean) => { assert.equal(token, 'synthetic-transient'); assert.equal(checkRevoked, true); verified++; if (revoked) throw new Error('PRIVATE revoked provider body'); return { ...claims }; };
const request = { method: 'POST', headers: { authorization: 'Bearer synthetic-transient', 'x-organization-id': org }, body: { financeEntityId: 'synthetic-entity-a' }, query: {} };
class Result {
  statusCode = 200; body: any; headers: Record<string, string> = {};
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader(key: string, value: string) { this.headers[key] = value; return this; }
}
try {
  assert.equal((await resolveConnectFinanceReadContext(request as any)).organizationId, org);
  // The existing mutation/shared context still refuses a Connect-bound token.
  await assert.rejects(() => resolveFinanceRequestContext(request as any, 'finance.create_drafts'), (error: any) => error.status === 401);
  const summary = new Result(); await createConnectPendingDocumentsHandler()(request as any, summary as any);
  assert.equal(summary.statusCode, 200); assert.deepEqual(summary.body, { schemaVersion: 1, summary: { awaitingUpload: 1, needsClassification: 0, pendingReview: 1 } });
  const select = async (req: any = request) => { const res = new Result(); await createConnectEntitiesHandler()({ ...req, body: {} }, res as any); return res; };
  const selector = await select(); assert.equal(selector.statusCode, 200);
  assert.deepEqual(selector.body.entities, [{ id: 'synthetic-entity-a', displayName: 'synthetic-entity-a' }]);
  assert.equal(selector.body.limited, false); assert(!JSON.stringify([selector.body, summary.body]).includes('PRIVATE'));
  assert.equal(selector.headers['Cache-Control'], 'private, no-store');
  assert(!reads.some(path => path.startsWith('organizations/synthetic-connect-org-b/')));
  const before = reads.length;
  assert.equal((await select({ ...request, headers: { ...request.headers, 'x-organization-id': 'synthetic-connect-org-b' } })).statusCode, 403);
  assert.equal(reads.length, before, 'bound tenant mismatch must fail before domain queries');
  await assert.rejects(() => resolveConnectFinanceReadContext({ ...request, body: { financeEntityId: 'synthetic-entity-b' } } as any), (error: any) => error.status === 403);
  for (const app of ['musicscale', 'nestjourney', 'unknown']) {
    claims.mn_app_id = app; assert.equal((await select()).statusCode, 401);
  }
  claims.mn_app_id = 'connect'; claims.mn_session_version = 6; assert.equal((await select()).statusCode, 401); claims.mn_session_version = 7;
  for (const value of [undefined, 0, '7', 1.5]) { claims.mn_session_version = value; assert.equal((await select()).statusCode, 401); } claims.mn_session_version = 7;
  revoked = true; assert.equal((await select()).statusCode, 401); revoked = false;
  data[memberPath].appAccess.nestFinance.permissions = []; assert.equal((await select()).statusCode, 403); data[memberPath] = member();
  data[memberPath].appAccess.nestFinance.enabled = false; assert.equal((await select()).statusCode, 403); data[memberPath] = member();
  data[memberPath].status = 'revoked'; assert.equal((await select()).statusCode, 403); data[memberPath] = member();
  data[orgPath].entitlements.nestfinance.active = false; assert.equal((await select()).statusCode, 403); data[orgPath].entitlements.nestfinance.active = true;
  claims.systemRole = 'ceo'; claims.permissions = ['*']; data[memberPath].appAccess.nestFinance.permissions = []; assert.equal((await select()).statusCode, 403); data[memberPath] = member();
  claims = { uid }; assert.equal((await select()).statusCode, 200, 'unbound direct Firebase identity still requires canonical finance authority');
  claims = { uid, mn_app_id: 'nestfinance', mn_handoff_version: 1, mn_organization_id: org, mn_session_version: 7 }; assert.equal((await select()).statusCode, 200);
  const forwarded = await select({ ...request, headers: { 'x-connect-user-authorization': 'Bearer synthetic-transient', 'x-organization-id': org } }); assert.equal(forwarded.statusCode, 200);
  for (const token of ['', 'Bearer token extra', ['Bearer synthetic-transient'], 'Basic no']) assert.equal((await select({ ...request, headers: { ...request.headers, 'x-connect-user-authorization': token } })).statusCode, 401);
  const calls = verified; const injected = new Result(); await createConnectEntitiesHandler()({ ...request, body: { organizationId: 'other' } } as any, injected as any); assert.equal(injected.statusCode, 400); assert.equal(verified, calls);
  for (const state of [true, false]) { data[userPath].disabled = state; assert.equal((await select()).statusCode, state ? 403 : 200); }
  await assert.rejects(() => resolveConnectFinanceReadIdentity({ ...request, headers: { authorization: 'Bearer synthetic-transient', 'x-organization-id': '../other' } } as any), (error: any) => error.status === 400);
  outage = true; const unavailable = await select(); assert.equal(unavailable.statusCode, 503); assert(!JSON.stringify(unavailable.body).includes('PRIVATE')); outage = false;
  data[memberPath].appAccess.nestFinance.scopes.financeEntityIds = ['*'];
  for (let i = 0; i < 30; i++) data[`${orgPath}/financeEntities/synthetic-visible-${i}`] = { active: true, displayName: `Synthetic visible ${i}`, taxId: 'PRIVATE' };
  const bounded = await select(); assert.equal(bounded.body.entities.length, 25); assert.equal(bounded.body.limited, true); assert(!JSON.stringify(bounded.body).includes('PRIVATE'));
  console.log('Connect Finance read entry: real canonical resolver/selector/summary, revocation, app/session/org/entity binding, grants, entitlement, forwarded identity, minimal DTO and unchanged mutation rejection passed.');
} finally { admin.auth.verifyIdToken = originalVerify; }
