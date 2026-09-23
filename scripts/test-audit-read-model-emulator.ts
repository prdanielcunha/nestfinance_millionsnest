import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import auditList from '../server/vercel-handlers/finance/auditList.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers: Record<string, string> = {};
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader(name: string, value: string) { this.headers[name] = value; return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-audit-read-model-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Audit read-model test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = `org_audit_${suffix}`;
const entityA = `ent_audit_a_${suffix}`;
const entityB = `ent_audit_b_${suffix}`;
const uid = `usr_audit_${suffix}`;

await db.collection('organizations').doc(orgId).set({ name: 'Audit Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('user_profiles').doc(uid).set({ name: 'Revisor Teste' });

for (const entityId of [entityA, entityB]) {
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityId)
    .set({ name: entityId, active: true });
}

const auditRef = db.collection('organizations').doc(orgId).collection('financeAuditLogs');
await auditRef.doc('audit_a_old').set({
  eventId: 'audit_a_old',
  organizationId: orgId,
  financeEntityId: entityA,
  actor: uid,
  resource: 'transaction',
  resourceId: 'tx_old',
  action: 'transaction.created',
  requestId: 'req_old',
  beforeHash: 'must-not-leak-before',
  afterHash: 'must-not-leak-after',
  idempotencyKey: 'must-not-leak-idempotency',
  metadata: {
    status: 'draft',
    amountCents: 884422,
    comment: 'must-not-leak-comment',
    versionAfter: 1,
  },
  createdAt: Timestamp.fromMillis(1_700_000_000_000),
});
await auditRef.doc('audit_a_new').set({
  eventId: 'audit_a_new',
  organizationId: orgId,
  financeEntityId: entityA,
  actor: uid,
  resource: 'universal_evidence',
  resourceId: 'evd_test',
  action: 'evidence.reviewed',
  requestId: 'req_new',
  metadata: { documentType: 'receipt', versionBefore: 2, versionAfter: 3 },
  createdAt: Timestamp.fromMillis(1_800_000_000_000),
});
await auditRef.doc('audit_b').set({
  eventId: 'audit_b',
  organizationId: orgId,
  financeEntityId: entityB,
  actor: 'system',
  resource: 'count_session',
  resourceId: 'count_b',
  action: 'count.second_count_sealed',
  requestId: 'req_b',
  createdAt: Timestamp.fromMillis(1_900_000_000_000),
});

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () =>
  ({ uid, mn_app_id: 'nestfinance', mn_handoff_version: 1, mn_organization_id: orgId, mn_session_version: 1 }) as any;

const call = async (financeEntityId: string) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer audit-test',
      'x-organization-id': orgId,
    },
    body: { financeEntityId },
    query: {},
  };
  const res = new MockRes();
  await auditList(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const before = await auditRef.where('financeEntityId', '==', entityA).get();
  const resultA = await call(entityA);
  const after = await auditRef.where('financeEntityId', '==', entityA).get();

  verify(resultA.statusCode === 200, 'authorized finance viewer can read audit history');
  verify(
    resultA.body.readOnly === true &&
      resultA.body.financialMutation === false &&
      resultA.body.auditMutation === false,
    'audit endpoint explicitly declares read-only authority',
  );
  verify(resultA.body.items.length === 2, 'entity A receives only its two audit events');
  verify(
    resultA.body.items[0].eventId === 'audit_a_new' &&
      resultA.body.items[1].eventId === 'audit_a_old',
    'audit events are ordered newest first',
  );
  verify(
    resultA.body.items.every((item: any) => item.actorDisplayName === 'Revisor Teste'),
    'known user actors are enriched with a human display name',
  );
  const serialized = JSON.stringify(resultA.body);
  for (const secret of [
    'must-not-leak-before',
    'must-not-leak-after',
    'must-not-leak-idempotency',
    '884422',
    'must-not-leak-comment',
  ]) {
    verify(!serialized.includes(secret), 'audit response excludes sensitive/internal value ' + secret);
  }
  verify(before.size === after.size, 'repeated audit read does not create or delete audit records');

  const resultB = await call(entityB);
  verify(
    resultB.statusCode === 200 &&
      resultB.body.items.length === 1 &&
      resultB.body.items[0].eventId === 'audit_b' &&
      resultB.body.items[0].actorKind === 'system',
    'finance entity isolation is preserved and system actor remains explicit',
  );

  const methodRes = new MockRes();
  await auditList({ method: 'GET', headers: {}, body: {}, query: {} } as any, methodRes as any);
  verify(methodRes.statusCode === 405, 'audit endpoint rejects non-POST methods');
} finally {
  admin.auth.verifyIdToken = originalVerify;
}

console.log('\nAudit Read Model Firestore Emulator totals: ' + passed + ' Passed');
