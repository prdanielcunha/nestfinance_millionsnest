import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { buildTransactionListQueryKeys } from '../shared/finance/ledger/listQueryKeys.js';
import periodCloseReadiness from '../server/vercel-handlers/finance/periodCloseReadiness.js';

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
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-period-close-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Period close readiness test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = 'org_close_' + suffix;
const entityA = 'ent_close_a_' + suffix;
const entityB = 'ent_close_b_' + suffix;
const uid = 'usr_close_' + suffix;
const bankA = 'acc_bank_' + suffix;

await db.collection('organizations').doc(orgId).set({ name: 'Close Org', status: 'active' });
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
const seedTx = async (id: string, entityId: string, date: string, status: string, kind: string, amountCents: number, reconciliationStatus: string) => {
  const occurredAt = Timestamp.fromDate(new Date(date));
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

await seedTx('tx_draft_' + suffix, entityA, '2026-09-05T12:00:00.000Z', 'draft', 'income', 10000, 'unreconciled');
await seedTx('tx_bank_' + suffix, entityA, '2026-09-06T12:00:00.000Z', 'posted', 'expense', 2500, 'unreconciled');
await seedTx('tx_outside_' + suffix, entityA, '2026-10-02T12:00:00.000Z', 'posted', 'income', 99999, 'reconciled');
await seedTx('tx_other_entity_' + suffix, entityB, '2026-09-07T12:00:00.000Z', 'posted', 'income', 77777, 'reconciled');

const countRef = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).collection('countSessions');
await countRef.doc('count_' + suffix).set({
  financeEntityId: entityA,
  serviceDate: '2026-09-08',
  status: 'divergent',
});

const evidenceRef = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).collection('universalEvidence');
await evidenceRef.doc('evidence_' + suffix).set({
  organizationId: orgId,
  financeEntityId: entityA,
  processingState: 'accepted',
  duplicate: false,
  classification: { source: 'human', documentType: 'receipt' },
  review: { status: 'pending' },
  createdAt: Timestamp.fromDate(new Date('2026-09-09T12:00:00.000Z')),
});

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

const call = async (financeEntityId: string, period = '2026-09') => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer period-close-test', 'x-organization-id': orgId },
    body: { financeEntityId, period },
    query: {},
  };
  const res = new MockRes();
  await periodCloseReadiness(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const beforeTx = await txRef.where('financeEntityId', '==', entityA).get();
  const blocked = await call(entityA);
  const afterTx = await txRef.where('financeEntityId', '==', entityA).get();

  verify(blocked.statusCode === 200, 'authorized finance viewer can read period readiness');
  verify(blocked.body.financeEntityId === entityA && blocked.body.period.key === '2026-09', 'response is scoped to requested entity and period');
  verify(blocked.body.transactions.total === 2, 'only in-period entity transactions are included');
  verify(blocked.body.transactions.capturedIncomeCents === 10000, 'outside-period and cross-entity income is excluded');
  verify(blocked.body.transactions.capturedExpenseCents === 2500, 'in-period expense is included');
  verify(blocked.body.countSessions.divergent === 1, 'divergent count is detected');
  verify(blocked.body.documents.waitingReview === 1, 'pending document review is detected');
  verify(blocked.body.reconciliation.unreconciledBankTransactions === 1, 'unreconciled posted bank transaction is detected');
  verify(blocked.body.readiness.state === 'attention_required', 'objective blockers produce attention_required');
  verify(blocked.body.authority.canClosePeriod === false && blocked.body.authority.officialReport === false, 'endpoint never overstates close/report authority');
  verify(beforeTx.size === afterTx.size, 'period readiness read does not create or delete transactions');

  const entityBResult = await call(entityB);
  verify(entityBResult.statusCode === 200 && entityBResult.body.transactions.total === 1, 'entity isolation is preserved');

  const badPeriod = await call(entityA, '2026-13');
  verify(badPeriod.statusCode === 400, 'invalid period is rejected');

  const methodRes = new MockRes();
  await periodCloseReadiness({ method: 'GET', headers: {}, body: {}, query: {} } as any, methodRes as any);
  verify(methodRes.statusCode === 405, 'non-POST methods are rejected');
} finally {
  admin.auth.verifyIdToken = originalVerify;
}

console.log('\nPeriod Close Readiness Firestore Emulator totals: ' + passed + ' Passed');
