import assert from 'node:assert/strict';
import { FakeFirestore } from './fakeFirestore.js';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import directEntry from '../server/vercel-handlers/auth/directEntry.js';

process.env.NODE_ENV = 'test';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers: Record<string, string> = {};
  setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; }
  status(code: number) { this.statusCode = code; return this; }
  json(body: unknown) { this.body = body; return this; }
}

const db: any = new FakeFirestore();
(globalThis as any)[Symbol.for('TEST_FIRESTORE')] = db;
resetFirebaseAdminForTests();

const admin = getFirebaseAdmin();
const uid = 'direct-session-user';
const orgId = 'direct-session-org';

await db.collection('users').doc(uid).set({
  displayName: 'Direct Session User',
  systemRole: 'ceo',
  ecosystemSessionVersion: 7,
});
await db.collection('organizations').doc(orgId).set({
  name: 'Direct Session Org',
  slug: 'direct-session-org',
  status: 'active',
  enabledApps: ['nestfinance'],
  entitlements: { nestfinance: { active: true, status: 'active' } },
});

const originalVerify = admin.auth.verifyIdToken;
const originalCreateCustomToken = admin.auth.createCustomToken;

let decoded: Record<string, unknown> = { uid };
let capturedClaims: Record<string, unknown> | null = null;
let createCalls = 0;

admin.auth.verifyIdToken = async () => decoded as any;
admin.auth.createCustomToken = async (_uid: string, claims: Record<string, unknown>) => {
  createCalls++;
  capturedClaims = claims;
  return 'direct-entry-custom-token';
};

async function call() {
  const req: any = {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: { organizationId: orgId },
  };
  const res = new MockRes();
  await directEntry(req, res as any);
  return res;
}

try {
  decoded = { uid };
  capturedClaims = null;
  createCalls = 0;
  const directGoogle = await call();
  assert.equal(directGoogle.statusCode, 200);
  assert.equal(directGoogle.body.status, 'ready');
  assert.equal(createCalls, 1);
  assert.equal(capturedClaims?.mn_app_id, 'nestfinance');
  assert.equal(capturedClaims?.mn_organization_id, orgId);
  assert.equal(capturedClaims?.mn_handoff_version, 1);
  assert.equal(capturedClaims?.mn_session_version, 7);

  decoded = {
    uid,
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: orgId,
    mn_session_version: 6,
  };
  capturedClaims = null;
  createCalls = 0;
  const stale = await call();
  assert.equal(stale.statusCode, 401);
  assert.equal(stale.body.error, 'UNAUTHORIZED');
  assert.equal(createCalls, 0);

  decoded = {
    uid,
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: orgId,
    mn_session_version: 7,
  };
  capturedClaims = null;
  createCalls = 0;
  const current = await call();
  assert.equal(current.statusCode, 200);
  assert.equal(current.body.status, 'ready');
  assert.equal(createCalls, 1);
  assert.equal(capturedClaims?.mn_session_version, 7);

  decoded = {
    uid,
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: orgId,
  };
  capturedClaims = null;
  createCalls = 0;
  const partial = await call();
  assert.equal(partial.statusCode, 401);
  assert.equal(createCalls, 0);

  console.log('✅ Direct entry and in-app organization switching are bound to the canonical ecosystem session version.');
} finally {
  admin.auth.verifyIdToken = originalVerify;
  admin.auth.createCustomToken = originalCreateCustomToken;
}
