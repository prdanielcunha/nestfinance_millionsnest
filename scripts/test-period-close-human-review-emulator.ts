import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { buildTransactionListQueryKeys } from '../shared/finance/ledger/listQueryKeys.js';
import periodCloseReadiness from '../server/vercel-handlers/finance/periodCloseReadiness.js';
import periodCloseReviewConfirm from '../server/vercel-handlers/finance/periodCloseReviewConfirm.js';

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
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-period-close-review-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Period close review test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = 'org_pcr_' + suffix;
const entityId = 'ent_pcr_' + suffix;
const uid = 'usr_pcr_' + suffix;
const bankId = 'acc_pcr_' + suffix;
const txId = 'tx_' + randomBytes(12).toString('hex');

await db.collection('organizations').doc(orgId).set({ name: 'Review Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('user_profiles').doc(uid).set({ name: 'Revisor Teste' });
await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId).set({
  name: 'Entity',
  active: true,
});
await db.collection('organizations').doc(orgId).collection('financeAccounts').doc(bankId).set({
  organizationId: orgId,
  financeEntityId: entityId,
  name: 'Conta principal',
  type: 'bank_checking',
  nature: 'asset',
  configurationStatus: 'complete',
  active: true,
});

const occurredAt = Timestamp.fromDate(new Date('2026-09-10T12:00:00.000Z'));
const txRef = db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId);
await txRef.set({
  id: txId,
  organizationId: orgId,
  financeEntityId: entityId,
  transactionKind: 'income',
  direction: 'income',
  status: 'posted',
  amountCents: 15000,
  occurredAt,
  accountId: bankId,
  reconciliationStatus: 'reconciled',
  reconciliationId: 'rec_' + randomBytes(12).toString('hex'),
  version: 3,
  contentVersion: 2,
  listQueryKeys: buildTransactionListQueryKeys(entityId, txId, 'income', 'posted', occurredAt as any),
});

await db.collection('organizations').doc(orgId)
  .collection('financeEntities').doc(entityId)
  .collection('countSessions').doc('count_' + suffix).set({
    financeEntityId: entityId,
    serviceDate: '2026-09-12',
    status: 'matched',
    version: 2,
    updatedAt: Timestamp.now(),
  });

await db.collection('organizations').doc(orgId)
  .collection('financeEntities').doc(entityId)
  .collection('universalEvidence').doc('evidence_' + suffix).set({
    organizationId: orgId,
    financeEntityId: entityId,
    version: 4,
    processingState: 'accepted',
    duplicate: false,
    classification: { source: 'human', documentType: 'receipt' },
    review: { status: 'reviewed', reviewedAt: Timestamp.now() },
    createdAt: Timestamp.fromDate(new Date('2026-09-13T12:00:00.000Z')),
  });

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({
  uid,
  mn_app_id: 'nestfinance',
  mn_handoff_version: 1,
  mn_organization_id: orgId,
  mn_session_version: 1,
}) as any;

const call = async (handler: any, body: any) => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer period-review-test', 'x-organization-id': orgId },
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
  const before = await txRef.get();
  const initial = await call(periodCloseReadiness, { financeEntityId: entityId, period: '2026-09' });
  verify(initial.statusCode === 200 && initial.body.readiness.state === 'ready_for_review', 'clean period is ready for human review');
  verify(initial.body.humanReview.state === 'not_reviewed', 'clean period starts without a current human review');

  const first = await call(periodCloseReviewConfirm, {
    financeEntityId: entityId,
    period: '2026-09',
    requestId: 'pcr-request-' + suffix,
  });
  verify(first.statusCode === 200 && first.body.currentSnapshot === true, 'authorized reviewer can record review for exact current snapshot');
  verify(first.body.replayed === false, 'first exact-snapshot review is newly created');
  verify(first.body.authority.periodClosed === false, 'review confirmation does not close period');
  verify(first.body.authority.financialMutation === false, 'review confirmation does not mutate financial content');

  const reviewsRef = db.collection('organizations').doc(orgId).collection('financePeriodCloseReviews');
  const auditsRef = db.collection('organizations').doc(orgId).collection('financeAuditLogs');
  const factsRef = db.collection('intelligenceFacts');
  const reviewsAfterFirst = await reviewsRef.where('financeEntityId', '==', entityId).get();
  const auditsAfterFirst = await auditsRef.where('financeEntityId', '==', entityId).get();
  verify(reviewsAfterFirst.size === 1, 'exact source snapshot creates one immutable review record');
  verify(auditsAfterFirst.docs.some((doc) => doc.data().action === 'period.close_review_confirmed'), 'review appends canonical audit event');
  const factsAfterFirst = await factsRef.where('organizationId', '==', orgId).get();
  const reportReadyAfterFirst = factsAfterFirst.docs.filter((doc) => doc.data().eventType === 'REPORT_READY');
  verify(reportReadyAfterFirst.length === 1, 'clean human review atomically emits one REPORT_READY fact');
  verify(reportReadyAfterFirst[0]?.data()?.payload?.officialReport === false, 'REPORT_READY does not claim an official report');
  verify(reportReadyAfterFirst[0]?.data()?.payload?.periodClosed === false, 'REPORT_READY does not claim a closed period');

  const second = await call(periodCloseReviewConfirm, {
    financeEntityId: entityId,
    period: '2026-09',
    requestId: 'pcr-retry-' + suffix,
  });
  const reviewsAfterRetry = await reviewsRef.where('financeEntityId', '==', entityId).get();
  const auditsAfterRetry = await auditsRef.where('financeEntityId', '==', entityId).get();
  verify(second.statusCode === 200 && second.body.replayed === true, 'same exact source snapshot is idempotently replayed');
  verify(second.body.reviewId === first.body.reviewId, 'same source snapshot keeps the same deterministic review identity');
  verify(reviewsAfterRetry.size === 1, 'retry does not duplicate review records');
  verify(auditsAfterRetry.size === auditsAfterFirst.size, 'retry does not duplicate audit events');
  const factsAfterRetry = await factsRef.where('organizationId', '==', orgId).get();
  verify(
    factsAfterRetry.docs.filter((doc) => doc.data().eventType === 'REPORT_READY').length === 1,
    'exact-snapshot replay does not duplicate REPORT_READY',
  );

  const current = await call(periodCloseReadiness, { financeEntityId: entityId, period: '2026-09' });
  verify(current.body.humanReview.state === 'reviewed_current_snapshot', 'readiness recognizes review only for the matching source snapshot');
  verify(current.body.humanReview.reviewedByDisplayName === 'Revisor Teste', 'current review exposes human reviewer label');

  const txData = before.data() || {};
  await txRef.update({
    status: 'draft',
    version: 4,
    listQueryKeys: buildTransactionListQueryKeys(entityId, txId, 'income', 'draft', occurredAt as any),
  });

  const changed = await call(periodCloseReadiness, { financeEntityId: entityId, period: '2026-09' });
  verify(changed.body.readiness.state === 'attention_required', 'source mutation immediately restores objective blockers');
  verify(changed.body.humanReview.state === 'review_outdated', 'previous review remains visible but is no longer treated as current');
  verify(changed.body.humanReview.sourceSnapshotMatches === false, 'stale review explicitly fails current-source match');
  verify(changed.body.humanReview.changedAreas.includes('transactions'), 'stale review identifies transaction drift');

  const blocked = await call(periodCloseReviewConfirm, {
    financeEntityId: entityId,
    period: '2026-09',
    requestId: 'pcr-blocked-' + suffix,
  });
  verify(blocked.statusCode === 409 && blocked.body.error === 'PERIOD_CLOSE_REVIEW_BLOCKED', 'changed blocked period cannot be reviewed as clean');

  await txRef.update({
    status: 'posted',
    amountCents: 16000,
    version: 5,
    listQueryKeys: buildTransactionListQueryKeys(entityId, txId, 'income', 'posted', occurredAt as any),
  });

  const cleanAgain = await call(periodCloseReadiness, { financeEntityId: entityId, period: '2026-09' });
  verify(cleanAgain.body.readiness.state === 'ready_for_review', 'period can become clean again after blockers are resolved');
  verify(cleanAgain.body.humanReview.state === 'review_outdated', 'old human review remains stale after cleanup until reviewed again');
  verify(cleanAgain.body.humanReview.changedAreas.includes('transactions'), 'clean-again state still explains transaction drift from prior review');

  const third = await call(periodCloseReviewConfirm, {
    financeEntityId: entityId,
    period: '2026-09',
    requestId: 'pcr-new-snapshot-' + suffix,
  });
  verify(third.statusCode === 200 && third.body.replayed === false, 'new clean source snapshot can receive a new human review');
  verify(third.body.reviewId !== first.body.reviewId, 'changed source snapshot receives a new deterministic review identity');
  const factsAfterNewSnapshot = await factsRef.where('organizationId', '==', orgId).get();
  verify(
    factsAfterNewSnapshot.docs.filter((doc) => doc.data().eventType === 'REPORT_READY').length === 2,
    'new clean source snapshot emits a new source-bound REPORT_READY fact',
  );

  const reviewsAfterNewSnapshot = await reviewsRef.where('financeEntityId', '==', entityId).get();
  verify(reviewsAfterNewSnapshot.size === 2, 'review history preserves both source snapshots instead of overwriting');

  const currentAgain = await call(periodCloseReadiness, { financeEntityId: entityId, period: '2026-09' });
  verify(currentAgain.body.humanReview.state === 'reviewed_current_snapshot', 'new review becomes current for the new source snapshot');
  verify(currentAgain.body.humanReview.changedAreas.length === 0, 'current review has no stale drift areas');

  const finalTx = await txRef.get();
  verify(finalTx.data()?.amountCents === 16000, 'review journey preserves the user-originated transaction amount change');
  verify(finalTx.data()?.accountId === txData.accountId, 'review journey never changes transaction account');
} finally {
  admin.auth.verifyIdToken = originalVerify;
}

console.log('\nPeriod Close Human Review Firestore Emulator totals: ' + passed + ' Passed');
