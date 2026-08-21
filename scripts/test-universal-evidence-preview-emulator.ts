import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import universalEvidencePreview from '../server/vercel-handlers/finance/universalEvidencePreview.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers = new Map<string, string>();
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), String(value)); return this; }
  send(body: any) { this.body = body; return this; }
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,2,0,0,0,3]);
const mutatedPng = Buffer.concat([png, Buffer.from([1])]);

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nestfinance-inbox-i2c-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Inbox I2C preview test requires Firestore Emulator');

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = `org_i2c_${suffix}`;
const entityA = `ent_a_${suffix}`;
const entityB = `ent_b_${suffix}`;
const uid = `usr_i2c_${suffix}`;
const ownerUid = `usr_owner_${suffix}`;
const acceptedId = `evd_${randomBytes(16).toString('hex')}`;
const duplicateId = `evd_${randomBytes(16).toString('hex')}`;
const pendingId = `evd_${randomBytes(16).toString('hex')}`;
const crossEntityId = `evd_${randomBytes(16).toString('hex')}`;
const corruptId = `evd_${randomBytes(16).toString('hex')}`;
const wrongContentTypeId = `evd_${randomBytes(16).toString('hex')}`;

const objects = new Map<string, { bytes: Buffer; contentType: string }>();
const previewPaths: string[] = [];
(globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')] = {
  async createUploadUrl(path: string) {
    return { url: `memory://${path}`, requiredHeaders: { 'x-goog-if-generation-match': '0' } };
  },
  async inspectAndHash(path: string) {
    const object = objects.get(path);
    if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING');
    return { path, contentType: object.contentType, size: object.bytes.length, sha256: sha(object.bytes), headerBytes: object.bytes.subarray(0, 65536) };
  },
  async readPreview(path: string) {
    previewPaths.push(path);
    const object = objects.get(path);
    if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING');
    return { bytes: object.bytes, contentType: object.contentType, size: object.bytes.length, sha256: sha(object.bytes) };
  },
};

await db.collection('organizations').doc(orgId).set({ name: 'Inbox I2C Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('users').doc(ownerUid).set({ systemRole: 'owner' });
for (const id of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(id).set({ name: id, active: true });
}

const evidenceCollection = (entity: string) => db
  .collection('organizations')
  .doc(orgId)
  .collection('financeEntities')
  .doc(entity)
  .collection('universalEvidence');
const now = Timestamp.now();

function acceptedData(entity: string, evidenceId: string, path: string, overrides: Record<string, any> = {}) {
  return {
    evidenceId,
    organizationId: orgId,
    financeEntityId: entity,
    originalFilename: 'receipt.png',
    declaredMimeType: 'image/png',
    verifiedMimeType: 'image/png',
    byteSize: png.length,
    sourceKind: 'photo',
    processingState: 'accepted',
    duplicate: false,
    imageMetadata: { width: 2, height: 3, orientation: 1 },
    originalSha256: sha(png),
    original: {
      path,
      immutable: true,
      verifiedMimeType: 'image/png',
      verifiedByteSize: png.length,
      verifiedSha256: sha(png),
    },
    createdByUid: 'private-creator',
    validatedByUid: 'private-validator',
    createdAt: now,
    validatedAt: now,
    version: 2,
    ...overrides,
  };
}

const acceptedPath = `organizations/${orgId}/financeEntities/${entityA}/evidence/${acceptedId}/original.png`;
const duplicatePath = `organizations/${orgId}/financeEntities/${entityA}/evidence/${duplicateId}/original.png`;
const crossPath = `organizations/${orgId}/financeEntities/${entityB}/evidence/${crossEntityId}/original.png`;
const corruptPath = `organizations/${orgId}/financeEntities/${entityA}/evidence/${corruptId}/original.png`;
const wrongContentTypePath = `organizations/${orgId}/financeEntities/${entityA}/evidence/${wrongContentTypeId}/original.png`;
objects.set(acceptedPath, { bytes: png, contentType: 'image/png' });
objects.set(duplicatePath, { bytes: png, contentType: 'image/png' });
objects.set(crossPath, { bytes: png, contentType: 'image/png' });
objects.set(corruptPath, { bytes: mutatedPng, contentType: 'image/png' });
objects.set(wrongContentTypePath, { bytes: png, contentType: 'application/pdf' });

await evidenceCollection(entityA).doc(acceptedId).set(acceptedData(entityA, acceptedId, acceptedPath));
await evidenceCollection(entityA).doc(duplicateId).set(acceptedData(entityA, duplicateId, duplicatePath, { processingState: 'duplicate', duplicate: true, duplicateOfEvidenceId: acceptedId }));
await evidenceCollection(entityA).doc(pendingId).set({
  evidenceId: pendingId,
  organizationId: orgId,
  financeEntityId: entityA,
  originalFilename: 'pending.pdf',
  declaredMimeType: 'application/pdf',
  byteSize: 128,
  sourceKind: 'file',
  processingState: 'awaiting_upload',
  duplicate: false,
  originalSha256: 'b'.repeat(64),
  original: { path: `private/${pendingId}.pdf`, immutable: true },
  createdAt: now,
  version: 1,
});
await evidenceCollection(entityB).doc(crossEntityId).set(acceptedData(entityB, crossEntityId, crossPath));
await evidenceCollection(entityA).doc(corruptId).set(acceptedData(entityA, corruptId, corruptPath));
await evidenceCollection(entityA).doc(wrongContentTypeId).set(acceptedData(entityA, wrongContentTypeId, wrongContentTypePath));

const originalVerify = admin.auth.verifyIdToken;
let verifiedUid = uid;
admin.auth.verifyIdToken = async () => ({ uid: verifiedUid, mn_organization_id: orgId }) as any;
const call = async (body: any, headerOrg = orgId) => {
  const req = { method: 'POST', headers: { authorization: 'Bearer i2c_test', 'x-organization-id': headerOrg }, body, query: {} };
  const res = new MockRes();
  await universalEvidencePreview(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed++;
  console.log(`✅ ${message}`);
};

try {
  const accepted = await call({ financeEntityId: entityA, evidenceId: acceptedId });
  verify(accepted.statusCode === 200 && Buffer.isBuffer(accepted.body) && accepted.body.equals(png), 'same-entity accepted evidence returns the verified original bytes');
  verify(accepted.headers.get('content-type') === 'image/png', 'preview returns the verified MIME type');
  verify(accepted.headers.get('cache-control') === 'private, no-store, max-age=0' && accepted.headers.get('x-content-type-options') === 'nosniff', 'preview is private no-store and nosniff');
  verify(!JSON.stringify([...accepted.headers.entries()]).includes(acceptedPath), 'preview headers never expose the private Storage path');
  verify(previewPaths.at(-1) === acceptedPath, 'server resolves the private path internally only after authorization');

  const duplicate = await call({ financeEntityId: entityA, evidenceId: duplicateId });
  verify(duplicate.statusCode === 200 && Buffer.isBuffer(duplicate.body) && duplicate.body.equals(png), 'finalized duplicate evidence can preview its own preserved original');

  const bodySpoof = await call({ financeEntityId: entityA, evidenceId: acceptedId, organizationId: 'body-org-must-not-win' });
  verify(bodySpoof.statusCode === 200, 'organizationId in body cannot retarget canonical tenant');
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
  const crossEntity = await call({ financeEntityId: entityA, evidenceId: crossEntityId });
  verify(crossEntity.statusCode === 404, 'Entity B original cannot be previewed through Entity A context');
  const ownEntityB = await call({ financeEntityId: entityB, evidenceId: crossEntityId });
  verify(ownEntityB.statusCode === 200 && Buffer.isBuffer(ownEntityB.body), 'Entity B can preview its own original without cross-entity leakage');

  const pending = await call({ financeEntityId: entityA, evidenceId: pendingId });
  verify(pending.statusCode === 409 && pending.body.error === 'EVIDENCE_PREVIEW_NOT_READY', 'awaiting-upload evidence cannot be previewed');
  const corrupt = await call({ financeEntityId: entityA, evidenceId: corruptId });
  verify(corrupt.statusCode === 422 && corrupt.body.error === 'EVIDENCE_CORRUPT', 'post-validation byte or hash drift fails closed');
  const wrongContentType = await call({ financeEntityId: entityA, evidenceId: wrongContentTypeId });
  verify(wrongContentType.statusCode === 415 && wrongContentType.body.error === 'EVIDENCE_UNSUPPORTED', 'Storage content-type drift fails closed');

  const sideEffects = await Promise.all([
    'financeTransactions',
    'financeJournalEntries',
    'financeJournalLines',
    'financeAggregates',
    'financeBalances',
    'postingPlans',
    'countSessions',
  ].map((name) => db.collection('organizations').doc(orgId).collection(name).get()));
  verify(sideEffects.every((snapshot) => snapshot.empty), 'preview creates zero transaction, journal, aggregate, balance, PostingPlan or Count side effects');

  console.log(`\nUniversal Evidence Preview Emulator totals: ${passed} Passed`);
} finally {
  admin.auth.verifyIdToken = originalVerify;
  delete (globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')];
}
