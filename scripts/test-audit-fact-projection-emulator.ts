import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import auditFactProjectionPreview from '../server/vercel-handlers/finance/auditFactProjectionPreview.js';
import auditFactProjectionApply from '../server/vercel-handlers/finance/auditFactProjectionApply.js';
import auditFactProjectionVerify from '../server/vercel-handlers/finance/auditFactProjectionVerify.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader() { return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-audit-projection-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Audit fact projection test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = 'org_auditproj_' + suffix;
const entityId = 'ent_auditproj_' + suffix;
const otherEntityId = 'ent_other_' + suffix;
const uid = 'usr_auditproj_' + suffix;
const occurredAtA = Timestamp.fromDate(new Date('2026-09-19T12:34:56.000Z'));
const occurredAtB = Timestamp.fromDate(new Date('2026-09-20T08:00:00.000Z'));

await db.collection('organizations').doc(orgId).set({ name: 'Audit Projection Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
for (const id of [entityId, otherEntityId]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(id).set({
    name: id,
    active: true,
  });
}
const legacyAccountId = 'acc_legacy_' + suffix;
await db.collection('organizations').doc(orgId).collection('financeAccounts').doc(legacyAccountId).set({
  organizationId: orgId,
  financeEntityId: entityId,
  name: 'Legacy Account',
  active: true,
});

const audits = db.collection('organizations').doc(orgId).collection('financeAuditLogs');
await audits.doc('audit_a_' + suffix).set({
  organizationId: orgId,
  financeEntityId: entityId,
  actor: uid,
  resource: 'transaction',
  resourceId: 'tx_' + 'a'.repeat(16),
  action: 'transaction.reviewed',
  requestId: 'req_a_' + suffix,
  metadata: {
    status: 'reviewed',
    amountCents: 7654321,
    note: 'private free form',
    contributorName: 'Sensitive Person',
    versionBefore: 2,
    versionAfter: 3,
  },
  createdAt: occurredAtA,
});
await audits.doc('audit_b_' + suffix).set({
  organizationId: orgId,
  financeEntityId: entityId,
  actor: 'system',
  resource: 'period_close_review',
  resourceId: 'pcr_' + suffix,
  action: 'period.close_review_confirmed',
  requestId: 'req_b_' + suffix,
  metadata: { periodKey: '2026-09', status: 'reviewed_current_snapshot' },
  createdAt: occurredAtB,
});
await audits.doc('audit_legacy_' + suffix).set({
  organizationId: orgId,
  actorUid: uid,
  entityType: 'financeAccount',
  entityId: legacyAccountId,
  action: 'finance.account.updated',
  requestId: 'req_legacy_' + suffix,
  metadata: { status: 'legacy' },
  createdAt: occurredAtA,
});
await audits.doc('audit_setup_' + suffix).set({
  organizationId: orgId,
  actorUid: uid,
  entityType: 'financeSettings',
  entityId: 'config',
  action: 'finance.setup.initialized',
  requestId: 'req_setup_' + suffix,
  createdAt: occurredAtA,
});
await audits.doc('audit_other_' + suffix).set({
  organizationId: orgId,
  financeEntityId: otherEntityId,
  actor: uid,
  resource: 'transaction',
  action: 'other.entity.event',
  createdAt: occurredAtB,
});

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

const call = async (handler: any, body: any) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer audit-projection-test',
      'x-organization-id': orgId,
    },
    body,
    query: {},
  };
  const res = new MockRes();
  await handler(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const preview = await call(auditFactProjectionPreview, { financeEntityId: entityId });
  verify(
    preview.statusCode === 200 &&
      preview.body.totalAuditEvents === 3 &&
      preview.body.missingProjection === 3 &&
      preview.body.unresolvedLegacyScopeCount === 0 &&
      preview.body.organizationScopedCount === 1 &&
      preview.body.truncated === false &&
      preview.body.safeToVerify === false,
    'preview finds only current-entity audit events and reports missing facts',
  );

  const applied = await call(auditFactProjectionApply, {
    financeEntityId: entityId,
    batchSize: 50,
  });
  verify(
    applied.statusCode === 200 &&
      applied.body.applied === 3 &&
      applied.body.remaining === 0 &&
      applied.body.unresolvedLegacyScopeCount === 0 &&
      applied.body.organizationScopedCount === 1 &&
      applied.body.complete === true,
    'apply projects the full bounded audit history without financial mutation',
  );

  const facts = await db.collection('intelligenceFacts')
    .where('organizationId', '==', orgId)
    .where('eventType', '==', 'AUDIT_EVENT_RECORDED')
    .get();
  verify(facts.size === 3, 'three canonical audit facts are created for the scoped entity, including resolvable legacy history');

  const projectedA = facts.docs.map((doc) => doc.data()).find(
    (data) => data.payload?.auditEventId === 'audit_a_' + suffix,
  );
  verify(
    projectedA?.actorUserId === uid &&
      projectedA?.payload?.action === 'transaction.reviewed' &&
      projectedA?.payload?.metadata?.versionBefore === 2 &&
      projectedA?.payload?.metadata?.versionAfter === 3,
    'projected fact keeps safe actor/action/version audit context',
  );
  verify(
    projectedA?.occurredAt?.toMillis?.() === occurredAtA.toMillis(),
    'projected fact preserves the original audit occurrence time',
  );

  const serialized = JSON.stringify(projectedA);
  for (const forbidden of ['7654321', 'private free form', 'Sensitive Person', 'amountCents', 'note']) {
    verify(!serialized.includes(forbidden), 'projected fact excludes sensitive field: ' + forbidden);
  }

  const projectedSystem = facts.docs.map((doc) => doc.data()).find(
    (data) => data.payload?.auditEventId === 'audit_b_' + suffix,
  );
  verify(projectedSystem?.actorUserId === null, 'system audit actor is not fabricated as a user identity');

  const projectedLegacy = facts.docs.map((doc) => doc.data()).find(
    (data) => data.payload?.auditEventId === 'audit_legacy_' + suffix,
  );
  verify(
    projectedLegacy?.actorUserId === uid &&
      projectedLegacy?.payload?.resource === 'financeAccount' &&
      projectedLegacy?.payload?.resourceId === legacyAccountId,
    'legacy actorUid audit without financeEntityId resolves scope through its canonical account',
  );
  verify(
    !facts.docs.some((doc) => doc.data().payload?.auditEventId === 'audit_setup_' + suffix),
    'organization-scoped setup audit stays internal instead of being misclassified as an entity event',
  );

  const retry = await call(auditFactProjectionApply, {
    financeEntityId: entityId,
    batchSize: 50,
  });
  verify(
    retry.statusCode === 200 &&
      retry.body.attempted === 0 &&
      retry.body.applied === 0 &&
      retry.body.remaining === 0,
    'projection retry is idempotent',
  );

  const certified = await call(auditFactProjectionVerify, { financeEntityId: entityId });
  verify(
    certified.statusCode === 200 &&
      certified.body.verified === true &&
      certified.body.status === 'certified' &&
      certified.body.verifiedFactCount === 3 &&
      certified.body.unresolvedLegacyScopeCount === 0 &&
      certified.body.organizationScopedCount === 1,
    'verify certifies complete bounded audit fact coverage',
  );

  const coverage = await db.collection('intelligenceCoverage').doc(certified.body.coverageId).get();
  verify(
    coverage.exists &&
      coverage.data()?.coverageKind === 'audit_fact_projection' &&
      coverage.data()?.financialMutation === false &&
      coverage.data()?.auditMutation === false,
    'coverage record is explicit and non-mutating',
  );

  await audits.doc('audit_unresolved_' + suffix).set({
    organizationId: orgId,
    actorUid: uid,
    entityType: 'financeAccount',
    entityId: 'acc_missing_' + suffix,
    action: 'finance.account.updated',
    createdAt: occurredAtB,
  });
  const unsafePreview = await call(auditFactProjectionPreview, { financeEntityId: entityId });
  verify(
    unsafePreview.statusCode === 200 &&
      unsafePreview.body.unresolvedLegacyScopeCount === 1 &&
      unsafePreview.body.safeToVerify === false,
    'unresolvable legacy audit scope blocks certification instead of disappearing from coverage',
  );
  const unsafeVerify = await call(auditFactProjectionVerify, { financeEntityId: entityId });
  verify(
    unsafeVerify.statusCode === 200 &&
      unsafeVerify.body.verified === false &&
      unsafeVerify.body.status === 'incomplete' &&
      unsafeVerify.body.unresolvedLegacyScopeCount === 1,
    'verify fails closed when legacy audit scope cannot be proven',
  );

  console.log('\nAudit Fact Projection Emulator totals: ' + passed + ' Passed');
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
