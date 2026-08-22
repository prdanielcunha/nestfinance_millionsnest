import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import universalEvidenceList from '../server/vercel-handlers/finance/universalEvidenceList.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nestfinance-inbox-i2a-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Inbox I2A test requires Firestore Emulator');

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;

const suffix = randomBytes(4).toString('hex');
const orgId = `org_inbox_${suffix}`;
const entityA = `ent_a_${suffix}`;
const entityB = `ent_b_${suffix}`;
const uid = `usr_inbox_${suffix}`;
const ownerUid = `usr_owner_${suffix}`;
const evidenceId = () => `evd_${randomBytes(16).toString('hex')}`;

await db.collection('organizations').doc(orgId).set({ name: 'Inbox I2A Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('users').doc(ownerUid).set({ systemRole: 'owner' });
for (const id of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(id).set({ name: id, active: true });
}

const refA = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).collection('universalEvidence');
const refB = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB).collection('universalEvidence');
const now = Date.now();
const acceptedId = evidenceId();
const duplicateId = evidenceId();
const awaitingId = evidenceId();
const entityBId = evidenceId();

await refA.doc(acceptedId).set({
  evidenceId: acceptedId,
  organizationId: orgId,
  financeEntityId: entityA,
  originalFilename: 'latest-receipt.png',
  declaredMimeType: 'image/png',
  verifiedMimeType: 'image/png',
  byteSize: 2048,
  sourceKind: 'photo',
  processingState: 'accepted',
  duplicate: false,
  imageMetadata: { width: 1200, height: 1600, orientation: 1 },
  originalSha256: 'a'.repeat(64),
  original: { path: 'private/storage/path', immutable: true },
  createdAt: Timestamp.fromMillis(now - 1000),
  validatedAt: Timestamp.fromMillis(now - 900),
  version: 2,
});
await refA.doc(duplicateId).set({
  evidenceId: duplicateId,
  organizationId: orgId,
  financeEntityId: entityA,
  originalFilename: 'duplicate.pdf',
  declaredMimeType: 'application/pdf',
  verifiedMimeType: 'application/pdf',
  byteSize: 4096,
  sourceKind: 'file',
  processingState: 'duplicate',
  duplicate: true,
  duplicateOfEvidenceId: acceptedId,
  originalSha256: 'b'.repeat(64),
  original: { path: 'private/duplicate/path', immutable: true },
  createdAt: Timestamp.fromMillis(now - 2000),
  validatedAt: Timestamp.fromMillis(now - 1900),
  version: 2,
});
await refA.doc(awaitingId).set({
  evidenceId: awaitingId,
  organizationId: orgId,
  financeEntityId: entityA,
  originalFilename: 'pending.webp',
  declaredMimeType: 'image/webp',
  byteSize: 1024,
  sourceKind: 'camera',
  processingState: 'awaiting_upload',
  duplicate: false,
  originalSha256: 'c'.repeat(64),
  original: { path: 'private/pending/path', immutable: true },
  createdAt: Timestamp.fromMillis(now - 3000),
  version: 1,
});
await refB.doc(entityBId).set({
  evidenceId: entityBId,
  organizationId: orgId,
  financeEntityId: entityB,
  originalFilename: 'other-entity.png',
  declaredMimeType: 'image/png',
  verifiedMimeType: 'image/png',
  byteSize: 512,
  sourceKind: 'photo',
  processingState: 'accepted',
  duplicate: false,
  createdAt: Timestamp.fromMillis(now),
  version: 2,
});

const originalVerify = admin.auth.verifyIdToken;
let verifiedUid = uid;
admin.auth.verifyIdToken = async () => ({ uid: verifiedUid, mn_organization_id: orgId }) as any;

const call = async (body: any, headerOrg = orgId) => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer inbox_test', 'x-organization-id': headerOrg },
    body,
    query: {},
  };
  const res = new MockRes();
  await universalEvidenceList(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed++;
  console.log(`✅ ${message}`);
};

try {
  const first = await call({ financeEntityId: entityA, pageSize: 2 });
  verify(first.statusCode === 200, 'finance.view caller can list Inbox evidence');
  verify(first.body.items.length === 2 && first.body.hasMore === true && typeof first.body.nextCursor === 'string', 'first page uses bounded lookahead pagination');
  verify(first.body.items[0].evidenceId === acceptedId && first.body.items[1].evidenceId === duplicateId, 'evidence is ordered newest first');
  verify(first.body.summary.total === 3 && first.body.summary.accepted === 1 && first.body.summary.duplicate === 1 && first.body.summary.awaitingUpload === 1, 'summary counts are entity-scoped and exact');
  verify(first.body.items.every((item: any) => !('originalSha256' in item) && !('original' in item) && !('duplicateOfEvidenceId' in item)), 'DTO does not expose storage paths, hashes, or canonical duplicate ids');

  const second = await call({ financeEntityId: entityA, pageSize: 2, cursor: first.body.nextCursor });
  verify(second.statusCode === 200 && second.body.items.length === 1 && second.body.items[0].evidenceId === awaitingId, 'cursor returns the next page without duplicates');
  verify(second.body.hasMore === false && second.body.nextCursor === undefined, 'final page closes pagination deterministically');

  const otherEntity = await call({ financeEntityId: entityB, pageSize: 25 });
  verify(otherEntity.statusCode === 200 && otherEntity.body.summary.total === 1 && otherEntity.body.items[0].evidenceId === entityBId, 'Entity B sees only Entity B evidence');
  verify(!first.body.items.some((item: any) => item.evidenceId === entityBId), 'Entity A never leaks Entity B evidence');

  const bodySpoof = await call({ financeEntityId: entityA, pageSize: 25, organizationId: 'body-org-must-not-win' });
  verify(bodySpoof.statusCode === 200 && bodySpoof.body.summary.total === 3, 'organizationId in body cannot retarget the canonical tenant');

  const headerSpoof = await call({ financeEntityId: entityA, pageSize: 25 }, 'another-org');
  verify(headerSpoof.statusCode === 403, 'conflicting organization header fails closed');

  verifiedUid = ownerUid;
  const ownerDenied = await call({ financeEntityId: entityA, pageSize: 25 });
  verify(ownerDenied.statusCode === 403, 'organizational owner is not treated as a canonical global role');
  verifiedUid = uid;

  const invalidCursor = await call({ financeEntityId: entityA, pageSize: 25, cursor: 'not-an-evidence-id' });
  verify(invalidCursor.statusCode === 400 && invalidCursor.body.error === 'INVALID_CURSOR', 'malformed cursor fails closed');
  const crossEntityCursor = await call({ financeEntityId: entityA, pageSize: 25, cursor: entityBId });
  verify(crossEntityCursor.statusCode === 400 && crossEntityCursor.body.error === 'INVALID_CURSOR', 'cursor from another entity cannot cross the entity boundary');

  const sideEffects = await Promise.all([
    'financeTransactions',
    'financeJournalEntries',
    'financeJournalLines',
    'financeAggregates',
    'financeBalances',
    'postingPlans',
    'countSessions',
  ].map((name) => db.collection('organizations').doc(orgId).collection(name).get()));
  verify(sideEffects.every((snapshot) => snapshot.empty), 'Inbox reads create zero transaction, journal, aggregate, balance, PostingPlan or Count side effects');

  console.log(`\nUniversal Evidence Inbox Emulator totals: ${passed} Passed`);
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
