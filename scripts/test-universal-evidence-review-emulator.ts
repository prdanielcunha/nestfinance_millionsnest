import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import universalEvidenceClassify from '../server/vercel-handlers/finance/universalEvidenceClassify.js';
import universalEvidenceReview from '../server/vercel-handlers/finance/universalEvidenceReview.js';
import universalEvidenceList from '../server/vercel-handlers/finance/universalEvidenceList.js';
import { buildFinanceFactEventId } from '../server/vercel-handlers/finance/factStream.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-inbox-review-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Inbox review test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;

const suffix = randomBytes(4).toString('hex');
const orgId = `org_review_${suffix}`;
const entityId = `ent_review_${suffix}`;
const uid = `usr_review_${suffix}`;
const ownerUid = `usr_owner_${suffix}`;
const evidenceId = `evd_${randomBytes(16).toString('hex')}`;
const duplicateId = `evd_${randomBytes(16).toString('hex')}`;

await db.collection('organizations').doc(orgId).set({
  name: 'Inbox Review Org',
  status: 'active',
});
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('users').doc(ownerUid).set({ systemRole: 'owner' });
await db
  .collection('organizations')
  .doc(orgId)
  .collection('financeEntities')
  .doc(entityId)
  .set({ name: 'Main', active: true });

const evidenceRef = db
  .collection('organizations')
  .doc(orgId)
  .collection('financeEntities')
  .doc(entityId)
  .collection('universalEvidence');

await evidenceRef.doc(evidenceId).set({
  evidenceId,
  organizationId: orgId,
  financeEntityId: entityId,
  originalFilename: 'comprovante.pdf',
  declaredMimeType: 'application/pdf',
  verifiedMimeType: 'application/pdf',
  byteSize: 2048,
  sourceKind: 'file',
  processingState: 'accepted',
  duplicate: false,
  original: {
    path: 'private/review/original.pdf',
    immutable: true,
    verifiedByteSize: 2048,
    verifiedSha256: 'a'.repeat(64),
  },
  createdAt: Timestamp.now(),
  validatedAt: Timestamp.now(),
  version: 2,
});
await evidenceRef.doc(duplicateId).set({
  evidenceId: duplicateId,
  organizationId: orgId,
  financeEntityId: entityId,
  processingState: 'duplicate',
  duplicate: true,
  version: 2,
  createdAt: Timestamp.now(),
});

const originalVerify = admin.auth.verifyIdToken;
let verifiedUid = uid;
admin.auth.verifyIdToken = async () =>
  ({ uid: verifiedUid, mn_organization_id: orgId }) as any;

const call = async (
  handler: typeof universalEvidenceClassify | typeof universalEvidenceReview,
  body: any,
) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer inbox-review-test',
      'x-organization-id': orgId,
    },
    body: { financeEntityId: entityId, ...body },
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
  const classifyRequestId = `req_classify_${suffix}`;
  const classifyBody = {
    evidenceId,
    expectedVersion: 2,
    documentType: 'payment_proof',
    idempotencyKey: `idem_classify_${suffix}`,
    requestId: classifyRequestId,
  };
  const classified = await call(universalEvidenceClassify, classifyBody);
  verify(classified.statusCode === 200, 'accepted evidence can be classified');
  verify(
    classified.body.version === 3 &&
      classified.body.documentType === 'payment_proof' &&
      classified.body.reviewStatus === 'pending',
    'classification returns a pending human-review state',
  );

  let live = (await evidenceRef.doc(evidenceId).get()).data()!;
  verify(
    live.classification?.documentType === 'payment_proof' &&
      live.classification?.source === 'human' &&
      live.review?.status === 'pending',
    'classification is stored as human-confirmed and resets review to pending',
  );

  const classificationFactId = buildFinanceFactEventId({
    organizationId: orgId,
    eventType: 'DOCUMENT_CLASSIFIED',
    entityType: 'universal_evidence',
    entityId: evidenceId,
    correlationId: classifyRequestId,
  });
  const classificationFact = (
    await db.collection('intelligenceFacts').doc(classificationFactId).get()
  ).data();
  verify(
    classificationFact?.eventType === 'DOCUMENT_CLASSIFIED' &&
      classificationFact?.organizationId === orgId &&
      classificationFact?.payload?.financialRecognition === false &&
      Array.isArray(classificationFact?.sourceRefs) &&
      classificationFact.sourceRefs.length === 2,
    'classification emits a source-backed canonical fact without financial recognition',
  );

  const replay = await call(universalEvidenceClassify, classifyBody);
  verify(
    replay.statusCode === 200 && replay.body.version === 3,
    'classification retries are idempotent',
  );
  live = (await evidenceRef.doc(evidenceId).get()).data()!;
  verify(live.version === 3, 'idempotent replay does not increment evidence version');

  const reviewRequestId = `req_review_${suffix}`;
  const reviewed = await call(universalEvidenceReview, {
    evidenceId,
    expectedVersion: 3,
    note: '  conferido   com o extrato  ',
    idempotencyKey: `idem_review_${suffix}`,
    requestId: reviewRequestId,
  });
  verify(
    reviewed.statusCode === 200 &&
      reviewed.body.version === 4 &&
      reviewed.body.reviewStatus === 'reviewed',
    'finance review can resolve a classified Inbox item',
  );

  live = (await evidenceRef.doc(evidenceId).get()).data()!;
  verify(
    live.review?.status === 'reviewed' &&
      live.review?.note === 'conferido com o extrato',
    'review stores normalized accountant-facing evidence note',
  );

  const resolutionFactId = buildFinanceFactEventId({
    organizationId: orgId,
    eventType: 'INBOX_ITEM_RESOLVED',
    entityType: 'universal_evidence',
    entityId: evidenceId,
    correlationId: reviewRequestId,
  });
  const resolutionFact = (
    await db.collection('intelligenceFacts').doc(resolutionFactId).get()
  ).data();
  verify(
    resolutionFact?.eventType === 'INBOX_ITEM_RESOLVED' &&
      resolutionFact?.payload?.resolution === 'reviewed' &&
      resolutionFact?.payload?.financialRecognition === false,
    'review resolution emits a canonical fact without posting',
  );

  const reviewedList = await call(universalEvidenceList as any, { pageSize: 25 });
  const reviewedItem = reviewedList.body.items.find((item: any) => item.evidenceId === evidenceId);
  verify(
    reviewedList.statusCode === 200 &&
      reviewedList.body.summary.reviewed === 1 &&
      reviewedList.body.summary.needsReview === 0,
    'Inbox summary moves reviewed accepted evidence out of the attention count',
  );
  verify(
    reviewedItem?.review?.status === 'reviewed' &&
      !Object.prototype.hasOwnProperty.call(reviewedItem.review, 'note'),
    'Inbox list exposes review status without leaking accountant notes',
  );

  const reclassified = await call(universalEvidenceClassify, {
    evidenceId,
    expectedVersion: 4,
    documentType: 'invoice',
    idempotencyKey: `idem_reclassify_${suffix}`,
    requestId: `req_reclassify_${suffix}`,
  });
  verify(
    reclassified.statusCode === 200 &&
      reclassified.body.version === 5 &&
      reclassified.body.reviewStatus === 'pending',
    'changing document type invalidates the previous review',
  );
  live = (await evidenceRef.doc(evidenceId).get()).data()!;
  verify(
    live.classification?.documentType === 'invoice' &&
      live.review?.status === 'pending' &&
      live.review?.reviewedAt === null,
    'reclassification removes stale reviewed state',
  );

  const pendingList = await call(universalEvidenceList as any, { pageSize: 25 });
  verify(
    pendingList.statusCode === 200 &&
      pendingList.body.summary.reviewed === 0 &&
      pendingList.body.summary.needsReview === 1,
    'reclassification immediately returns the item to the Inbox attention count',
  );

  const duplicate = await call(universalEvidenceClassify, {
    evidenceId: duplicateId,
    expectedVersion: 2,
    documentType: 'receipt',
    idempotencyKey: `idem_duplicate_${suffix}`,
    requestId: `req_duplicate_${suffix}`,
  });
  verify(
    duplicate.statusCode === 409 && duplicate.body.error === 'EVIDENCE_NOT_READY',
    'duplicate evidence cannot be classified as an actionable Inbox item',
  );

  const oversizedNote = await call(universalEvidenceReview, {
    evidenceId,
    expectedVersion: 5,
    note: 'x'.repeat(501),
    idempotencyKey: `idem_long_note_${suffix}`,
    requestId: `req_long_note_${suffix}`,
  });
  verify(
    oversizedNote.statusCode === 400 &&
      oversizedNote.body.error === 'EVIDENCE_INVALID_REVIEW_NOTE',
    'oversized review notes fail closed',
  );

  verifiedUid = ownerUid;
  const unauthorized = await call(universalEvidenceReview, {
    evidenceId,
    expectedVersion: 5,
    note: null,
    idempotencyKey: `idem_owner_${suffix}`,
    requestId: `req_owner_${suffix}`,
  });
  verify(unauthorized.statusCode === 403, 'non-canonical owner access does not bypass finance review');
  verifiedUid = uid;

  const audits = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeAuditLogs')
    .where('resourceId', '==', evidenceId)
    .get();
  const actions = audits.docs.map((doc) => doc.data().action);
  verify(
    actions.includes('evidence.classified') && actions.includes('evidence.reviewed'),
    'classification and review remain independently auditable',
  );

  const sideEffects = await Promise.all(
    [
      'financeTransactions',
      'financeJournalEntries',
      'financeJournalLines',
      'financeAggregates',
      'financeBalances',
      'postingPlans',
    ].map((name) => db.collection('organizations').doc(orgId).collection(name).get()),
  );
  verify(
    sideEffects.every((snapshot) => snapshot.empty),
    'Inbox review creates zero transaction, journal, aggregate, balance, or posting side effects',
  );

  console.log(`\nUniversal Evidence Human Review Emulator totals: ${passed} Passed`);
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
