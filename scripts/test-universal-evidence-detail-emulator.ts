import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import universalEvidenceDetail from '../server/vercel-handlers/finance/universalEvidenceDetail.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nestfinance-inbox-i2b-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Inbox I2B detail test requires Firestore Emulator');

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = `org_i2b_${suffix}`;
const entityA = `ent_a_${suffix}`;
const entityB = `ent_b_${suffix}`;
const uid = `usr_i2b_${suffix}`;
const ownerUid = `usr_owner_${suffix}`;
const acceptedId = `evd_${randomBytes(16).toString('hex')}`;
const pendingId = `evd_${randomBytes(16).toString('hex')}`;
const entityBId = `evd_${randomBytes(16).toString('hex')}`;
const privateHash = 'a'.repeat(64);
const privatePath = 'organizations/private/path/original.png';

await db.collection('organizations').doc(orgId).set({ name: 'Inbox I2B Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('users').doc(ownerUid).set({ systemRole: 'owner' });
for (const id of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(id).set({ name: id, active: true });
}

const ref = (entity: string) => db.collection('organizations').doc(orgId).collection('financeEntities').doc(entity).collection('universalEvidence');
const now = Timestamp.now();
await ref(entityA).doc(acceptedId).set({
  evidenceId: acceptedId, organizationId: orgId, financeEntityId: entityA,
  originalFilename: 'receipt.png', declaredMimeType: 'image/png', verifiedMimeType: 'image/png', byteSize: 2048,
  sourceKind: 'photo', processingState: 'accepted', duplicate: false,
  imageMetadata: { width: 1200, height: 1600, orientation: 1 }, originalSha256: privateHash,
  original: { path: privatePath, immutable: true, verifiedByteSize: 2048, verifiedSha256: privateHash },
  createdByUid: 'private-creator', validatedByUid: 'private-validator', createdAt: now, validatedAt: now, version: 2,
});
await ref(entityA).doc(pendingId).set({
  evidenceId: pendingId, organizationId: orgId, financeEntityId: entityA,
  originalFilename: 'pending.pdf', declaredMimeType: 'application/pdf', byteSize: 1024,
  sourceKind: 'file', processingState: 'awaiting_upload', duplicate: false,
  originalSha256: 'b'.repeat(64), original: { path: 'private/pending.pdf', immutable: true }, createdAt: now, version: 1,
});
await ref(entityB).doc(entityBId).set({
  evidenceId: entityBId, organizationId: orgId, financeEntityId: entityB,
  originalFilename: 'other.png', declaredMimeType: 'image/png', verifiedMimeType: 'image/png', byteSize: 512,
  sourceKind: 'camera', processingState: 'accepted', duplicate: false,
  original: { path: 'private/entity-b.png', immutable: true, verifiedByteSize: 512, verifiedSha256: 'c'.repeat(64) },
  createdAt: now, validatedAt: now, version: 2,
});

const originalVerify = admin.auth.verifyIdToken;
let verifiedUid = uid;
admin.auth.verifyIdToken = async () => ({ uid: verifiedUid, mn_organization_id: orgId }) as any;
const call = async (body: any, headerOrg = orgId) => {
  const req = { method: 'POST', headers: { authorization: 'Bearer i2b_test', 'x-organization-id': headerOrg }, body, query: {} };
  const res = new MockRes();
  await universalEvidenceDetail(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => { if (!condition) throw new Error(message); passed++; console.log(`✅ ${message}`); };

try {
  const accepted = await call({ financeEntityId: entityA, evidenceId: acceptedId });
  verify(accepted.statusCode === 200 && accepted.body.evidence.evidenceId === acceptedId, 'finance.view caller can read same-entity evidence detail');
  verify(accepted.body.evidence.verification.immutableOriginal && accepted.body.evidence.verification.mimeVerified && accepted.body.evidence.verification.sizeVerified && accepted.body.evidence.verification.contentHashVerified, 'accepted evidence exposes deterministic verification booleans');
  const serialized = JSON.stringify(accepted.body);
  verify(!serialized.includes(privatePath) && !serialized.includes(privateHash) && !serialized.includes('private-creator') && !serialized.includes('private-validator'), 'detail DTO does not leak path, hash values, or internal UIDs');
  verify(!('original' in accepted.body.evidence) && !('originalSha256' in accepted.body.evidence) && !('duplicateOfEvidenceId' in accepted.body.evidence), 'private evidence fields are absent from DTO');

  const pending = await call({ financeEntityId: entityA, evidenceId: pendingId });
  verify(pending.statusCode === 200 && pending.body.evidence.processingState === 'awaiting_upload', 'pending evidence remains readable as metadata');
  verify(pending.body.evidence.verification.immutableOriginal === true && pending.body.evidence.verification.mimeVerified === false && pending.body.evidence.verification.sizeVerified === false && pending.body.evidence.verification.contentHashVerified === false, 'pending evidence does not claim validations that did not happen');

  const bodySpoof = await call({ financeEntityId: entityA, evidenceId: acceptedId, organizationId: 'body-org-must-not-win' });
  verify(bodySpoof.statusCode === 200 && bodySpoof.body.evidence.evidenceId === acceptedId, 'organizationId in body cannot retarget canonical tenant');
  const headerSpoof = await call({ financeEntityId: entityA, evidenceId: acceptedId }, 'another-org');
  verify(headerSpoof.statusCode === 403, 'conflicting organization header fails closed');

  verifiedUid = ownerUid;
  const ownerDenied = await call({ financeEntityId: entityA, evidenceId: acceptedId });
  verify(ownerDenied.statusCode === 403, 'organizational owner is not treated as canonical global role');
  verifiedUid = uid;

  const malformed = await call({ financeEntityId: entityA, evidenceId: 'not-evidence' });
  verify(malformed.statusCode === 400, 'malformed evidence id fails closed');
  const missing = await call({ financeEntityId: entityA, evidenceId: `evd_${'f'.repeat(32)}` });
  verify(missing.statusCode === 404, 'missing evidence returns controlled not-found');
  const crossEntity = await call({ financeEntityId: entityA, evidenceId: entityBId });
  verify(crossEntity.statusCode === 404, 'Entity B evidence cannot be read through Entity A context');
  const ownEntityB = await call({ financeEntityId: entityB, evidenceId: entityBId });
  verify(ownEntityB.statusCode === 200 && ownEntityB.body.evidence.evidenceId === entityBId, 'Entity B can read its own evidence without cross-entity leakage');

  const sideEffects = await Promise.all(['financeTransactions','financeJournalEntries','financeJournalLines','financeAggregates','financeBalances','postingPlans','countSessions'].map((name) => db.collection('organizations').doc(orgId).collection(name).get()));
  verify(sideEffects.every((snapshot) => snapshot.empty), 'detail reads create zero transaction, journal, aggregate, balance, PostingPlan or Count side effects');
  console.log(`\nUniversal Evidence Detail Emulator totals: ${passed} Passed`);
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
