import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore } from './fakeFirestore.js';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import handoffRedeem from '../server/vercel-handlers/auth/handoffRedeem.js';
import {
  enforceRedeemRateLimit,
  resolveRedeemNetworkFingerprint,
  validateRedeemOrigin,
} from '../server/vercel-handlers/auth/handoffSecurity.js';

process.env.NODE_ENV = 'test';
process.env.NESTFINANCE_HANDOFF_REDEEM_ENABLED = 'true';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers: Record<string, string> = {};
  setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; }
  status(code: number) { this.statusCode = code; return this; }
  json(body: unknown) { this.body = body; return this; }
}

assert.deepEqual(
  validateRedeemOrigin('https://nestfinance.millionsnest.com', { NODE_ENV: 'production' } as NodeJS.ProcessEnv),
  { allowed: true, origin: 'https://nestfinance.millionsnest.com' },
);
assert.equal(
  validateRedeemOrigin('https://evil.example', { NODE_ENV: 'production' } as NodeJS.ProcessEnv).allowed,
  false,
);
const fingerprint = resolveRedeemNetworkFingerprint({
  'x-forwarded-for': '203.0.113.10, 10.0.0.1',
});
assert.match(fingerprint, /^[a-f0-9]{64}$/);
assert.equal(fingerprint.includes('203.0.113.10'), false);

const limiterDb: any = new FakeFirestore();
const limiterInput = {
  db: limiterDb,
  networkFingerprint: fingerprint,
  nowMs: 1_800_000_000_000,
  limit: 2,
  windowMs: 60_000,
};
assert.equal((await enforceRedeemRateLimit(limiterInput)).allowed, true);
assert.equal((await enforceRedeemRateLimit(limiterInput)).allowed, true);
const limited = await enforceRedeemRateLimit(limiterInput);
assert.equal(limited.allowed, false);
assert.equal((await enforceRedeemRateLimit({ ...limiterInput, nowMs: limiterInput.nowMs + 60_001 })).allowed, true);

const db: any = new FakeFirestore();
(globalThis as any)[Symbol.for('TEST_FIRESTORE')] = db;
resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();

const uid = 'redeem-security-user';
const orgId = 'redeem-security-org';
const code = 'A'.repeat(43);
const codeHash = createHash('sha256').update(code).digest('hex');

await db.collection('users').doc(uid).set({
  systemRole: 'ceo',
  ecosystemSessionVersion: 7,
});
await db.collection('ecosystemHandoffs').doc(codeHash).set({
  version: 1,
  appId: 'nestfinance',
  uid,
  organizationId: orgId,
  status: 'issued',
  accessSource: 'global_system_role',
  sessionVersion: 7,
  issuedAt: Timestamp.now(),
  expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  consumedAt: null,
});

const originalCreateCustomToken = admin.auth.createCustomToken;
let createCalls = 0;
let capturedClaims: Record<string, unknown> | null = null;
admin.auth.createCustomToken = async (_uid: string, claims: Record<string, unknown>) => {
  createCalls++;
  capturedClaims = claims;
  return 'redeem-security-custom-token';
};

async function call(requestCode: string, origin = 'https://nestfinance.millionsnest.com') {
  const req: any = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-forwarded-for': '203.0.113.11',
    },
    body: { code: requestCode },
  };
  const res = new MockRes();
  await handoffRedeem(req, res as any);
  return res;
}

try {
  const malformed = await call('invalid');
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.error, 'HANDOFF_INVALID_OR_EXPIRED');
  const rateLimitsAfterMalformed = await db.collection('ecosystemHandoffRateLimits').get();
  assert.equal(
    rateLimitsAfterMalformed.docs.length,
    0,
    'malformed handoff must be rejected before durable rate limiting or Firestore lookup',
  );

  const wrongOrigin = await call(code, 'https://evil.example');
  assert.equal(wrongOrigin.statusCode, 403);
  assert.equal(wrongOrigin.body.error, 'ORIGIN_NOT_ALLOWED');
  assert.equal((await db.collection('ecosystemHandoffs').doc(codeHash).get()).data()?.status, 'issued');
  assert.equal(createCalls, 0);

  const success = await call(code);
  assert.equal(success.statusCode, 200);
  assert.equal(success.body.customToken, 'redeem-security-custom-token');
  assert.equal(createCalls, 1);
  assert.equal(capturedClaims?.mn_app_id, 'nestfinance');
  assert.equal(capturedClaims?.mn_organization_id, orgId);
  assert.equal(capturedClaims?.mn_handoff_version, 1);
  assert.equal(capturedClaims?.mn_session_version, 7);

  const consumed = await db.collection('ecosystemHandoffs').doc(codeHash).get();
  assert.equal(consumed.data()?.status, 'consumed');

  const audit = await db.collection('ecosystemHandoffAudit').get();
  assert.ok(
    audit.docs.some((doc: any) => {
      const data = doc.data();
      return data.eventType === 'handoff.redeemed' &&
        data.organizationId === orgId &&
        data.handoffRefHash === codeHash &&
        data.sessionVersion === 7;
    }),
    'successful redemption must atomically persist a durable audit event',
  );

  const replay = await call(code);
  assert.equal(replay.statusCode, 400);
  assert.equal(replay.body.error, 'HANDOFF_INVALID_OR_EXPIRED');
  assert.equal(createCalls, 1);

  console.log('✅ NestFinance handoff redeem origin, rate-limit, one-time consumption and durable audit are certified.');
} finally {
  admin.auth.createCustomToken = originalCreateCustomToken;
}
