import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import attentionBackfillPreview from '../server/vercel-handlers/finance/attentionBackfillPreview.js';
import attentionBackfillApply from '../server/vercel-handlers/finance/attentionBackfillApply.js';
import attentionBackfillVerify from '../server/vercel-handlers/finance/attentionBackfillVerify.js';
import intelligenceSignalsSummary from '../server/vercel-handlers/finance/intelligenceSignalsSummary.js';
import { buildAttentionCoverageId } from '../server/vercel-handlers/finance/attentionBackfill.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-attention-backfill-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Attention backfill tests require Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;

const suffix = randomBytes(4).toString('hex');
const orgId = `org_backfill_${suffix}`;
const entityId = `ent_backfill_${suffix}`;
const uid = `usr_backfill_${suffix}`;
const now = Timestamp.now();

await db.collection('organizations').doc(orgId).set({ name: 'Backfill Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db
  .collection('organizations')
  .doc(orgId)
  .collection('financeEntities')
  .doc(entityId)
  .set({ name: 'Legacy Entity', active: true });

const reviewTxId = `tx_${'1'.repeat(16)}${suffix}`;
const correctionTxId = `tx_${'2'.repeat(16)}${suffix}`;
await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(reviewTxId).set({
  organizationId: orgId,
  financeEntityId: entityId,
  status: 'ready_for_review',
  transactionKind: 'income',
  amountCents: 12345,
  version: 3,
});
await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(correctionTxId).set({
  organizationId: orgId,
  financeEntityId: entityId,
  status: 'draft',
  transactionKind: 'expense',
  amountCents: 6789,
  returnedToDraftReason: 'correction_requested',
  returnedToDraftAt: now,
  version: 4,
});

const identifyEvidenceId = 'evd_' + 'a'.repeat(32);
const reviewEvidenceId = 'evd_' + 'b'.repeat(32);
const evidenceRef = db
  .collection('organizations')
  .doc(orgId)
  .collection('financeEntities')
  .doc(entityId)
  .collection('universalEvidence');
await evidenceRef.doc(identifyEvidenceId).set({
  evidenceId: identifyEvidenceId,
  organizationId: orgId,
  financeEntityId: entityId,
  processingState: 'accepted',
  duplicate: false,
  version: 2,
});
await evidenceRef.doc(reviewEvidenceId).set({
  evidenceId: reviewEvidenceId,
  organizationId: orgId,
  financeEntityId: entityId,
  processingState: 'accepted',
  duplicate: false,
  classification: { documentType: 'receipt', source: 'human' },
  review: { status: 'pending' },
  version: 5,
});

const countId = 'cnt_' + 'c'.repeat(24);
await db
  .collection('organizations')
  .doc(orgId)
  .collection('financeEntities')
  .doc(entityId)
  .collection('countSessions')
  .doc(countId)
  .set({
    organizationId: orgId,
    financeEntityId: entityId,
    status: 'divergent',
    version: 4,
  });

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () =>
  ({ uid, mn_organization_id: orgId }) as any;

const call = async (handler: any, body: any) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer backfill-test',
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
  console.log(`✅ ${message}`);
};

try {
  const beforeReviewTx = (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(reviewTxId).get()).data();
  const beforeCorrectionTx = (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(correctionTxId).get()).data();

  const preview = await call(attentionBackfillPreview, { financeEntityId: entityId });
  verify(preview.statusCode === 200, 'preview succeeds for finance.manage/global operator');
  verify(
    preview.body.totalActionable === 5 &&
      preview.body.missingProjection === 5 &&
      preview.body.alreadyProjected === 0 &&
      preview.body.safeToVerify === false,
    'preview detects all five legacy attention states without mutating them',
  );
  verify(
    preview.body.byType.missing.TRANSACTION_REVIEW_REQUIRED === 1 &&
      preview.body.byType.missing.TRANSACTION_CORRECTION_REQUIRED === 1 &&
      preview.body.byType.missing.INBOX_IDENTIFICATION_REQUIRED === 1 &&
      preview.body.byType.missing.INBOX_REVIEW_REQUIRED === 1 &&
      preview.body.byType.missing.COUNT_DIVERGENCE_REVIEW_REQUIRED === 1,
    'preview classifies every current attention state deterministically',
  );

  const earlyVerify = await call(attentionBackfillVerify, { financeEntityId: entityId });
  verify(
    earlyVerify.statusCode === 200 &&
      earlyVerify.body.verified === false &&
      earlyVerify.body.status === 'incomplete' &&
      earlyVerify.body.missingSignalCount === 5,
    'verify refuses certification while projections are missing',
  );

  const firstApply = await call(attentionBackfillApply, {
    financeEntityId: entityId,
    batchSize: 2,
  });
  verify(
    firstApply.statusCode === 200 &&
      firstApply.body.attempted === 2 &&
      firstApply.body.applied === 2 &&
      firstApply.body.remaining === 3 &&
      firstApply.body.financialMutation === false,
    'apply is batched and reports remaining legacy work',
  );

  const secondApply = await call(attentionBackfillApply, {
    financeEntityId: entityId,
    batchSize: 10,
  });
  verify(
    secondApply.statusCode === 200 &&
      secondApply.body.applied === 3 &&
      secondApply.body.remaining === 0 &&
      secondApply.body.complete === true,
    'repeated apply fills only missing projections until complete',
  );

  const noOpApply = await call(attentionBackfillApply, {
    financeEntityId: entityId,
    batchSize: 10,
  });
  verify(
    noOpApply.statusCode === 200 &&
      noOpApply.body.attempted === 0 &&
      noOpApply.body.applied === 0 &&
      noOpApply.body.remaining === 0,
    'completed backfill is idempotent and becomes a no-op',
  );

  const facts = await db
    .collection('intelligenceFacts')
    .where('organizationId', '==', orgId)
    .where('eventType', '==', 'ATTENTION_STATE_OBSERVED')
    .get();
  verify(facts.size === 5, 'backfill creates exactly one immutable observation fact per legacy attention item');
  verify(
    facts.docs.every((doc) => {
      const fact = doc.data();
      return (
        fact.actorUserId === uid &&
        fact.payload?.financeEntityId === entityId &&
        fact.payload?.observationKind === 'current_state_backfill' &&
        fact.payload?.historicalEventInferred === false &&
        fact.confidence === 'verified' &&
        Array.isArray(fact.sourceRefs) &&
        fact.sourceRefs.length === 1 &&
        fact.sourceRefs[0]?.kind === 'record'
      );
    }),
    'observation facts explicitly avoid fabricated historical events and point to authoritative records',
  );

  const signals = await db
    .collection('intelligenceSignals')
    .where('organizationId', '==', orgId)
    .where('financeEntityId', '==', entityId)
    .where('status', '==', 'open')
    .get();
  verify(signals.size === 5, 'backfill creates one deterministic open signal for each current attention state');
  verify(
    signals.docs.every((doc) => {
      const signal = doc.data();
      return (
        typeof signal.lastFactId === 'string' &&
        signal.lastFactId.startsWith('fact_') &&
        Array.isArray(signal.sourceRefs) &&
        signal.sourceRefs.length === 1
      );
    }),
    'backfilled signals remain source-backed by immutable observation facts and record refs',
  );

  const finalVerify = await call(attentionBackfillVerify, { financeEntityId: entityId });
  verify(
    finalVerify.statusCode === 200 &&
      finalVerify.body.verified === true &&
      finalVerify.body.status === 'certified' &&
      finalVerify.body.expectedActionableCount === 5 &&
      finalVerify.body.verifiedSignalCount === 5 &&
      finalVerify.body.missingSignalCount === 0,
    'independent verification certifies full current attention coverage',
  );

  const coverageId = buildAttentionCoverageId(orgId, entityId);
  const coverage = (await db.collection('intelligenceCoverage').doc(coverageId).get()).data();
  verify(
    coverage?.status === 'certified' &&
      coverage?.organizationId === orgId &&
      coverage?.financeEntityId === entityId &&
      coverage?.coverageKind === 'needs_attention' &&
      coverage?.financialMutation === false,
    'certification is stored server-side with explicit tenant/entity scope',
  );

  const certifiedSummary = await call(intelligenceSignalsSummary, { financeEntityId: entityId });
  verify(
    certifiedSummary.statusCode === 200 &&
      certifiedSummary.body.coverage.mode === 'certified_projection' &&
      certifiedSummary.body.coverage.canTrustSignalAbsence === true &&
      certifiedSummary.body.coverage.canDeclareAllClear === false &&
      certifiedSummary.body.coverage.coverageId === coverageId &&
      certifiedSummary.body.coverage.coveredSignalTypes.length === 5,
    'verified backfill immediately becomes trusted signal-scope coverage without claiming global all-clear',
  );

  const afterReviewTx = (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(reviewTxId).get()).data();
  const afterCorrectionTx = (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(correctionTxId).get()).data();
  verify(
    afterReviewTx?.status === beforeReviewTx?.status &&
      afterReviewTx?.amountCents === beforeReviewTx?.amountCents &&
      afterReviewTx?.version === beforeReviewTx?.version &&
      afterCorrectionTx?.status === beforeCorrectionTx?.status &&
      afterCorrectionTx?.amountCents === beforeCorrectionTx?.amountCents &&
      afterCorrectionTx?.version === beforeCorrectionTx?.version,
    'backfill never mutates authoritative transaction state or amounts',
  );

  const [journals, balances, aggregates] = await Promise.all([
    db.collection('organizations').doc(orgId).collection('financeJournalEntries').get(),
    db.collection('organizations').doc(orgId).collection('financeBalances').get(),
    db.collection('organizations').doc(orgId).collection('financeAggregates').get(),
  ]);
  verify(
    journals.empty && balances.empty && aggregates.empty,
    'backfill creates no journal, balance or aggregate side effects',
  );

  console.log(`\nAttention Backfill Emulator totals: ${passed} Passed`);
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
