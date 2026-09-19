import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { buildTransactionListQueryKeys } from '../shared/finance/ledger/listQueryKeys.js';
import reportsIntelligence from '../server/vercel-handlers/finance/reportsIntelligence.js';

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
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-reports-intelligence-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Reports intelligence test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = 'org_report_' + suffix;
const entityA = 'ent_report_a_' + suffix;
const entityB = 'ent_report_b_' + suffix;
const uid = 'usr_report_' + suffix;
const bankA = 'acc_report_' + suffix;

await db.collection('organizations').doc(orgId).set({ name: 'Reports Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
for (const entityId of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId)
    .set({ name: entityId, active: true });
}
await db.collection('organizations').doc(orgId).collection('financeAccounts').doc(bankA).set({
  organizationId: orgId,
  financeEntityId: entityA,
  name: 'Bank',
  active: true,
  configurationStatus: 'complete',
  nature: 'asset',
  type: 'bank_checking',
});

const txRef = db.collection('organizations').doc(orgId).collection('financeTransactions');
const seed = async (id: string, entityId: string, iso: string, kind: string, amountCents: number, status: string, reconciliationStatus: string) => {
  const occurredAt = Timestamp.fromDate(new Date(iso));
  await txRef.doc(id).set({
    id,
    organizationId: orgId,
    financeEntityId: entityId,
    transactionKind: kind,
    direction: kind,
    status,
    amountCents,
    occurredAt,
    accountId: entityId === entityA ? bankA : 'other',
    reconciliationStatus,
    listQueryKeys: buildTransactionListQueryKeys(entityId, id, kind, status, occurredAt as any),
  });
};

await seed('sep-income-' + suffix, entityA, '2026-09-05T12:00:00.000Z', 'income', 15000, 'posted', 'reconciled');
await seed('sep-expense-' + suffix, entityA, '2026-09-06T12:00:00.000Z', 'expense', 4000, 'posted', 'reconciled');
await seed('aug-income-' + suffix, entityA, '2026-08-05T12:00:00.000Z', 'income', 10000, 'posted', 'unreconciled');
await seed('aug-expense-' + suffix, entityA, '2026-08-06T12:00:00.000Z', 'expense', 7000, 'draft', 'unreconciled');
await seed('other-entity-' + suffix, entityB, '2026-09-05T12:00:00.000Z', 'income', 99999, 'posted', 'reconciled');

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

const call = async (financeEntityId: string, period = '2026-09') => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer reports-intelligence-test', 'x-organization-id': orgId },
    body: { financeEntityId, period },
    query: {},
  };
  const res = new MockRes();
  await reportsIntelligence(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const before = await txRef.where('financeEntityId', '==', entityA).get();
  const result = await call(entityA);
  const after = await txRef.where('financeEntityId', '==', entityA).get();

  verify(result.statusCode === 200, 'authorized viewer can read monthly intelligence');
  verify(result.body.currentPeriodKey === '2026-09' && result.body.comparisonPeriodKey === '2026-08', 'endpoint compares adjacent months');
  verify(result.body.currentSnapshot.transactions.total === 2, 'current snapshot includes only current-period entity transactions');
  verify(result.body.metrics.recordedIncomeCents.current === 15000, 'current income is source-backed');
  verify(result.body.metrics.recordedIncomeCents.previous === 10000, 'previous income is source-backed');
  verify(result.body.metrics.recordedExpenseCents.current === 4000, 'current expense is source-backed');
  verify(result.body.metrics.recordedExpenseCents.previous === 7000, 'previous expense is source-backed');
  verify(result.body.metrics.recordedIncomeCents.delta === 5000, 'month-over-month delta is deterministic');
  verify(result.body.quality.postingRateBasisPoints.current === 10000, 'current posting rate is calculated correctly');
  verify(result.body.quality.postingRateBasisPoints.previous === 5000, 'previous posting rate is calculated correctly');
  verify(result.body.authority.causalInference === false, 'endpoint explicitly rejects causal inference');
  verify(before.size === after.size, 'comparison read does not create or delete transactions');

  const entityBResult = await call(entityB);
  verify(entityBResult.statusCode === 200 && entityBResult.body.currentSnapshot.transactions.total === 1, 'finance entity isolation is preserved');
  verify(entityBResult.body.metrics.recordedIncomeCents.current === 99999, 'cross-entity values never leak into comparison');

  const bad = await call(entityA, '2026-13');
  verify(bad.statusCode === 400, 'invalid period is rejected');

  const methodRes = new MockRes();
  await reportsIntelligence({ method: 'GET', headers: {}, body: {}, query: {} } as any, methodRes as any);
  verify(methodRes.statusCode === 405, 'non-POST methods are rejected');
} finally {
  admin.auth.verifyIdToken = originalVerify;
}

console.log('\nReports Intelligence Firestore Emulator totals: ' + passed + ' Passed');
