import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import intelligenceSignalsSummary from '../server/vercel-handlers/finance/intelligenceSignalsSummary.js';
import intelligenceSignalsDetail from '../server/vercel-handlers/finance/intelligenceSignalsDetail.js';
import { buildFinanceSignalId } from '../server/vercel-handlers/finance/signalProjection.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-needs-attention-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Needs Attention read-model test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;

const suffix = randomBytes(4).toString('hex');
const orgId = `org_attention_${suffix}`;
const otherOrgId = `org_attention_other_${suffix}`;
const entityA = `ent_attention_a_${suffix}`;
const entityB = `ent_attention_b_${suffix}`;
const emptyEntity = `ent_attention_empty_${suffix}`;
const uid = `usr_attention_${suffix}`;

await db.collection('organizations').doc(orgId).set({ name: 'Attention Org', status: 'active' });
await db.collection('organizations').doc(otherOrgId).set({ name: 'Other Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });

for (const entityId of [entityA, entityB, emptyEntity]) {
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityId)
    .set({ name: entityId, active: true });
}

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () =>
  ({ uid, mn_organization_id: orgId }) as any;

const call = async (handler: any, body: any) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer needs-attention-test',
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

const now = Timestamp.now();

const reviewEntityId = 'tx_review_' + suffix;
const reviewFactId = 'fact_' + 'a'.repeat(63) + '1';
const reviewSignalId = buildFinanceSignalId({
  organizationId: orgId,
  signalType: 'TRANSACTION_REVIEW_REQUIRED',
  entityType: 'finance_transaction',
  entityId: reviewEntityId,
});
await db.collection('intelligenceFacts').doc(reviewFactId).set({
  eventId: reviewFactId,
  organizationId: orgId,
  sourceApp: 'NESTFINANCE',
  eventType: 'TRANSACTION_SUBMITTED',
  entityType: 'finance_transaction',
  entityId: reviewEntityId,
  payload: {
    financeEntityId: entityA,
    status: 'ready_for_review',
    transactionKind: 'income',
    version: 3,
    submissionKind: 'initial',
    amountCents: 999999,
    comment: 'must never leave the source',
    sourceHash: 'secret-hash',
  },
  occurredAt: now,
  recordedAt: now,
  sourceRefs: [
    { kind: 'record', ref: `organizations/${orgId}/financeTransactions/${reviewEntityId}`, version: 3 },
    { kind: 'audit', ref: `organizations/${orgId}/financeAuditLogs/audit_review` },
  ],
  version: 1,
});
await db
  .collection('organizations')
  .doc(orgId)
  .collection('financeTransactions')
  .doc(reviewEntityId)
  .set({
    organizationId: orgId,
    financeEntityId: entityA,
    status: 'ready_for_review',
    version: 3,
  });
await db.collection('intelligenceSignals').doc(reviewSignalId).set({
  signalId: reviewSignalId,
  organizationId: orgId,
  financeEntityId: entityA,
  sourceApp: 'NESTFINANCE',
  signalType: 'TRANSACTION_REVIEW_REQUIRED',
  entityType: 'finance_transaction',
  entityId: reviewEntityId,
  status: 'open',
  attentionLevel: 'action_required',
  requiredCapability: 'finance.review',
  actionCode: 'OPEN_TRANSACTION_REVIEW',
  openedAt: now,
  updatedAt: now,
  openedByFactId: reviewFactId,
  lastFactId: reviewFactId,
  sourceRefs: [],
  version: 1,
});

const correctionEntityId = 'tx_correction_' + suffix;
const correctionFactId = 'fact_' + 'b'.repeat(63) + '2';
const correctionSignalId = buildFinanceSignalId({
  organizationId: orgId,
  signalType: 'TRANSACTION_CORRECTION_REQUIRED',
  entityType: 'finance_transaction',
  entityId: correctionEntityId,
});
await db.collection('intelligenceFacts').doc(correctionFactId).set({
  eventId: correctionFactId,
  organizationId: orgId,
  sourceApp: 'NESTFINANCE',
  eventType: 'TRANSACTION_RETURNED',
  entityType: 'finance_transaction',
  entityId: correctionEntityId,
  payload: {
    financeEntityId: entityA,
    status: 'draft',
    returnKind: 'review_return',
    reasonCode: 'correction_requested',
    previousStatus: 'ready_for_review',
  },
  occurredAt: now,
  recordedAt: now,
  sourceRefs: [{ kind: 'record', ref: `organizations/${orgId}/financeTransactions/${correctionEntityId}`, version: 4 }],
  version: 1,
});
await db
  .collection('organizations')
  .doc(orgId)
  .collection('financeTransactions')
  .doc(correctionEntityId)
  .set({
    organizationId: orgId,
    financeEntityId: entityA,
    status: 'draft',
    returnedToDraftReason: 'correction_requested',
    returnedToDraftAt: now,
    version: 4,
  });
await db.collection('intelligenceSignals').doc(correctionSignalId).set({
  signalId: correctionSignalId,
  organizationId: orgId,
  financeEntityId: entityA,
  sourceApp: 'NESTFINANCE',
  signalType: 'TRANSACTION_CORRECTION_REQUIRED',
  entityType: 'finance_transaction',
  entityId: correctionEntityId,
  status: 'open',
  attentionLevel: 'action_required',
  requiredCapability: 'finance.create_drafts',
  actionCode: 'OPEN_TRANSACTION_CORRECTION',
  openedAt: now,
  updatedAt: now,
  openedByFactId: correctionFactId,
  lastFactId: correctionFactId,
  sourceRefs: [],
  version: 1,
});

const resolvedSignalId = buildFinanceSignalId({
  organizationId: orgId,
  signalType: 'INBOX_REVIEW_REQUIRED',
  entityType: 'universal_evidence',
  entityId: 'evd_' + 'c'.repeat(32),
});
await db.collection('intelligenceSignals').doc(resolvedSignalId).set({
  signalId: resolvedSignalId,
  organizationId: orgId,
  financeEntityId: entityA,
  sourceApp: 'NESTFINANCE',
  signalType: 'INBOX_REVIEW_REQUIRED',
  entityType: 'universal_evidence',
  entityId: 'evd_' + 'c'.repeat(32),
  status: 'resolved',
  attentionLevel: 'action_required',
  requiredCapability: 'finance.review',
  actionCode: 'REVIEW_INBOX_DOCUMENT',
  updatedAt: now,
  lastFactId: reviewFactId,
  version: 1,
});

const otherEntitySignalId = buildFinanceSignalId({
  organizationId: orgId,
  signalType: 'COUNT_DIVERGENCE_REVIEW_REQUIRED',
  entityType: 'count_session',
  entityId: 'cnt_' + 'd'.repeat(24),
});
await db.collection('intelligenceSignals').doc(otherEntitySignalId).set({
  signalId: otherEntitySignalId,
  organizationId: orgId,
  financeEntityId: entityB,
  sourceApp: 'NESTFINANCE',
  signalType: 'COUNT_DIVERGENCE_REVIEW_REQUIRED',
  entityType: 'count_session',
  entityId: 'cnt_' + 'd'.repeat(24),
  status: 'open',
  attentionLevel: 'warning',
  requiredCapability: 'finance.create_drafts',
  actionCode: 'REVIEW_COUNT_DIVERGENCE',
  updatedAt: now,
  lastFactId: correctionFactId,
  version: 1,
});

const unsupportedCapabilitySignalId = buildFinanceSignalId({
  organizationId: orgId,
  signalType: 'TRANSACTION_REVIEW_REQUIRED',
  entityType: 'finance_transaction',
  entityId: 'tx_unsupported_' + suffix,
});
await db.collection('intelligenceSignals').doc(unsupportedCapabilitySignalId).set({
  signalId: unsupportedCapabilitySignalId,
  organizationId: orgId,
  financeEntityId: entityA,
  sourceApp: 'NESTFINANCE',
  signalType: 'TRANSACTION_REVIEW_REQUIRED',
  entityType: 'finance_transaction',
  entityId: 'tx_unsupported_' + suffix,
  status: 'open',
  attentionLevel: 'action_required',
  requiredCapability: 'finance.approve_for_posting',
  actionCode: 'OPEN_TRANSACTION_REVIEW',
  updatedAt: now,
  lastFactId: reviewFactId,
  version: 1,
});

try {
  const summary = await call(intelligenceSignalsSummary, { financeEntityId: entityA });
  verify(summary.statusCode === 200, 'summary returns 200 for an authorized finance entity');
  verify(
    summary.body.coverage?.mode === 'partial_projection' &&
      summary.body.coverage?.canDeclareAllClear === false &&
      summary.body.coverage?.reason === 'PRE_P5_BACKFILL_NOT_CERTIFIED',
    'summary explicitly refuses to declare all-clear before certified backfill',
  );
  verify(
    summary.body.actionableOpenTotal === 2 &&
      summary.body.byType.TRANSACTION_REVIEW_REQUIRED === 1 &&
      summary.body.byType.TRANSACTION_CORRECTION_REQUIRED === 1,
    'summary counts only actionable open signals for the requested entity',
  );
  verify(
    summary.body.items.every((item: any) => item.explainable === true && item.currentStateVerified === true) &&
      !summary.body.items.some((item: any) => item.signalId === resolvedSignalId) &&
      !summary.body.items.some((item: any) => item.signalId === otherEntitySignalId) &&
      !summary.body.items.some((item: any) => item.signalId === unsupportedCapabilitySignalId),
    'summary excludes resolved, cross-entity and unsupported-capability signals',
  );

  const empty = await call(intelligenceSignalsSummary, { financeEntityId: emptyEntity });
  verify(
    empty.statusCode === 200 &&
      empty.body.actionableOpenTotal === 0 &&
      empty.body.coverage.canDeclareAllClear === false,
    'zero projected signals never becomes a false all-clear claim',
  );

  const detail = await call(intelligenceSignalsDetail, {
    financeEntityId: entityA,
    signalId: reviewSignalId,
  });
  verify(detail.statusCode === 200, 'detail resolves an authorized source-backed signal');
  verify(
    detail.body.explanation?.factId === reviewFactId &&
      detail.body.explanation?.eventType === 'TRANSACTION_SUBMITTED' &&
      detail.body.explanation?.structuredReason?.status === 'ready_for_review' &&
      detail.body.explanation?.structuredReason?.submissionKind === 'initial',
    'detail explains the signal from its latest canonical fact',
  );
  verify(
    detail.body.explanation?.structuredReason?.amountCents === undefined &&
      detail.body.explanation?.structuredReason?.comment === undefined &&
      detail.body.explanation?.structuredReason?.sourceHash === undefined,
    'detail whitelist redacts amount, free-form comment and approval hash',
  );
  verify(
    Array.isArray(detail.body.explanation?.sourceRefs) &&
      detail.body.explanation.sourceRefs.length === 2,
    'detail preserves canonical evidence pointers for accountant traceability',
  );

  const wrongEntity = await call(intelligenceSignalsDetail, {
    financeEntityId: entityB,
    signalId: reviewSignalId,
  });
  verify(wrongEntity.statusCode === 404, 'detail cannot cross finance-entity boundaries');

  const unsupported = await call(intelligenceSignalsDetail, {
    financeEntityId: entityA,
    signalId: unsupportedCapabilitySignalId,
  });
  verify(unsupported.statusCode === 403, 'unknown or unsupported signal capability fails closed');

  const staleEntityId = 'tx_stale_' + suffix;
  const staleSignalId = buildFinanceSignalId({
    organizationId: orgId,
    signalType: 'TRANSACTION_REVIEW_REQUIRED',
    entityType: 'finance_transaction',
    entityId: staleEntityId,
  });
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeTransactions')
    .doc(staleEntityId)
    .set({
      organizationId: orgId,
      financeEntityId: entityA,
      status: 'approved_for_posting',
      version: 9,
    });
  await db.collection('intelligenceSignals').doc(staleSignalId).set({
    signalId: staleSignalId,
    organizationId: orgId,
    financeEntityId: entityA,
    sourceApp: 'NESTFINANCE',
    signalType: 'TRANSACTION_REVIEW_REQUIRED',
    entityType: 'finance_transaction',
    entityId: staleEntityId,
    status: 'open',
    attentionLevel: 'action_required',
    requiredCapability: 'finance.review',
    actionCode: 'OPEN_TRANSACTION_REVIEW',
    updatedAt: now,
    lastFactId: reviewFactId,
    version: 1,
  });

  const summaryWithStale = await call(intelligenceSignalsSummary, { financeEntityId: entityA });
  verify(
    !summaryWithStale.body.items.some((item: any) => item.signalId === staleSignalId),
    'summary suppresses an open projection whose authoritative state is no longer actionable',
  );
  const staleDetail = await call(intelligenceSignalsDetail, {
    financeEntityId: entityA,
    signalId: staleSignalId,
  });
  verify(
    staleDetail.statusCode === 409 && staleDetail.body.error === 'SIGNAL_STALE',
    'detail fails closed when an open projection no longer matches authoritative state',
  );

  const missingSourceSignalId = buildFinanceSignalId({
    organizationId: orgId,
    signalType: 'INBOX_IDENTIFICATION_REQUIRED',
    entityType: 'universal_evidence',
    entityId: 'evd_' + 'e'.repeat(32),
  });
  const missingSourceEvidenceId = 'evd_' + 'e'.repeat(32);
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityA)
    .collection('universalEvidence')
    .doc(missingSourceEvidenceId)
    .set({
      evidenceId: missingSourceEvidenceId,
      organizationId: orgId,
      financeEntityId: entityA,
      processingState: 'accepted',
      duplicate: false,
      version: 2,
    });
  await db.collection('intelligenceSignals').doc(missingSourceSignalId).set({
    signalId: missingSourceSignalId,
    organizationId: orgId,
    financeEntityId: entityA,
    sourceApp: 'NESTFINANCE',
    signalType: 'INBOX_IDENTIFICATION_REQUIRED',
    entityType: 'universal_evidence',
    entityId: 'evd_' + 'e'.repeat(32),
    status: 'open',
    attentionLevel: 'action_required',
    requiredCapability: 'finance.create_drafts',
    actionCode: 'IDENTIFY_INBOX_DOCUMENT',
    updatedAt: now,
    lastFactId: 'fact_' + 'f'.repeat(64),
    version: 1,
  });
  const missingSource = await call(intelligenceSignalsDetail, {
    financeEntityId: entityA,
    signalId: missingSourceSignalId,
  });
  verify(
    missingSource.statusCode === 409 && missingSource.body.error === 'SIGNAL_SOURCE_UNAVAILABLE',
    'detail refuses a claim when its canonical source fact is unavailable',
  );

  console.log(`\nNeeds Attention Read Model Emulator totals: ${passed} Passed`);
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
