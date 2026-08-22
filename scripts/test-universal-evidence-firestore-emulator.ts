import { createHash, randomBytes } from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import universalEvidenceStart from '../server/vercel-handlers/finance/universalEvidenceStart.js';
import universalEvidenceFinalize from '../server/vercel-handlers/finance/universalEvidenceFinalize.js';

class MockRes { statusCode = 200; body: any = null; status(code: number) { this.statusCode = code; return this; } json(body: any) { this.body = body; return this; } }
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,2,0,0,0,3]);
process.env.NODE_ENV = 'test'; process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nestfinance-i1-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Universal Evidence test requires Firestore Emulator');
resetFirebaseAdminForTests(); const admin = getFirebaseAdmin(); const db = admin.firestore;
const orgId = `org_i1_${randomBytes(4).toString('hex')}`, entityA = `ent_a_${randomBytes(4).toString('hex')}`, entityB = `ent_b_${randomBytes(4).toString('hex')}`, uid = `usr_i1_${randomBytes(4).toString('hex')}`, deniedUid = `usr_denied_${randomBytes(4).toString('hex')}`;
const objects = new Map<string, { bytes: Buffer; contentType: string }>();
(globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')] = {
  async createUploadUrl(path: string) { return { url: `memory://${path}`, requiredHeaders: { 'x-goog-if-generation-match': '0' } }; },
  async inspectAndHash(path: string) { const object = objects.get(path); if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING'); return { path, contentType: object.contentType, size: object.bytes.length, sha256: sha(object.bytes), headerBytes: object.bytes.subarray(0, 65536) }; },
};
await db.collection('organizations').doc(orgId).set({ name: 'I1 Org', status: 'active' }); await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
for (const id of [entityA, entityB]) await db.collection('organizations').doc(orgId).collection('financeEntities').doc(id).set({ name: id, active: true });
const originalVerify = admin.auth.verifyIdToken;
let verifiedUid = uid;
admin.auth.verifyIdToken = async () => ({ uid: verifiedUid, mn_organization_id: orgId }) as any;
const call = async (handler: any, body: any, headerOrg = orgId) => { const req = { method: 'POST', headers: { authorization: 'Bearer i1_test', 'x-organization-id': headerOrg }, body, query: {} }; const res = new MockRes(); await handler(req as any, res as any); return res; };
const key = () => `idevidence_${randomBytes(12).toString('hex')}`, request = () => `req_${randomBytes(12).toString('hex')}`;
const startBody = (entity: string, idempotencyKey = key()) => ({ financeEntityId: entity, originalFilename: 'receipt.png', declaredMimeType: 'image/png', byteSize: png.length, originalSha256: sha(png), sourceKind: 'photo', idempotencyKey, requestId: request() });
let passed = 0; const verify = (value: unknown, message: string) => { if (!value) throw new Error(message); passed++; console.log(`✅ ${message}`); };
try {
  const badMime = await call(universalEvidenceStart, { ...startBody(entityA), declaredMimeType: 'text/plain' }); verify(badMime.statusCode === 400, 'invalid MIME is rejected before persistence');
  const tooLarge = await call(universalEvidenceStart, { ...startBody(entityA), byteSize: 10 * 1024 * 1024 + 1 }); verify(tooLarge.statusCode === 400, 'oversized declaration is rejected');
  const spoofedOrg = await call(universalEvidenceStart, startBody(entityA), 'another-org'); verify(spoofedOrg.statusCode === 403, 'organization authority comes from signed token');

  verifiedUid = deniedUid;
  const denied = await call(universalEvidenceStart, startBody(entityA)); verify(denied.statusCode === 403, 'session without canonical finance authority fails closed');
  verifiedUid = uid;

  const missingEntity = await call(universalEvidenceStart, startBody('ent_missing')); verify(missingEntity.statusCode === 404, 'unknown finance entity returns controlled not-found');
  const spoofedBody = await call(universalEvidenceStart, { ...startBody(entityA), organizationId: 'body-org-must-not-win' }); verify(spoofedBody.statusCode === 200 && String(spoofedBody.body.upload.url).includes(`/organizations/${orgId}/`), 'organizationId in body cannot retarget canonical organization');

  const startKey = key(); const started = await call(universalEvidenceStart, startBody(entityA, startKey)); verify(started.statusCode === 200 && /^evd_[a-f0-9]{32}$/.test(started.body.evidenceId), 'server creates opaque evidence in Entity A');
  const retriedStart = await call(universalEvidenceStart, startBody(entityA, startKey)); verify(retriedStart.body.evidenceId === started.body.evidenceId, 'start retry is idempotent');
  const pathA = String(started.body.upload.url).replace('memory://', ''); objects.set(pathA, { bytes: png, contentType: 'image/png' });
  const finalizeKey = key(); const finalized = await call(universalEvidenceFinalize, { financeEntityId: entityA, evidenceId: started.body.evidenceId, expectedVersion: 1, idempotencyKey: finalizeKey, requestId: request() }); verify(finalized.body.processingState === 'accepted' && finalized.body.duplicate === false, 'valid evidence is accepted deterministically');
  const retriedFinal = await call(universalEvidenceFinalize, { financeEntityId: entityA, evidenceId: started.body.evidenceId, expectedVersion: 1, idempotencyKey: finalizeKey, requestId: request() }); verify(retriedFinal.body.processingState === 'accepted', 'finalize retry creates no parallel evidence');
  const stored = (await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).collection('universalEvidence').doc(started.body.evidenceId).get()).data(); verify(stored?.organizationId === orgId && stored?.financeEntityId === entityA && stored?.verifiedMimeType === 'image/png' && stored?.original?.immutable === true && stored?.imageMetadata?.width === 2, 'canonical metadata is consistent and immutable-marked');
  const duplicate = await call(universalEvidenceStart, startBody(entityA)); objects.set(String(duplicate.body.upload.url).replace('memory://', ''), { bytes: png, contentType: 'image/png' }); const duplicateFinal = await call(universalEvidenceFinalize, { financeEntityId: entityA, evidenceId: duplicate.body.evidenceId, expectedVersion: 1, idempotencyKey: key(), requestId: request() }); verify(duplicateFinal.body.duplicate === true && !('duplicateOfEvidenceId' in duplicateFinal.body), 'same-entity duplicate is detected without returning private canonical metadata');
  const other = await call(universalEvidenceStart, startBody(entityB)); objects.set(String(other.body.upload.url).replace('memory://', ''), { bytes: png, contentType: 'image/png' }); const otherFinal = await call(universalEvidenceFinalize, { financeEntityId: entityB, evidenceId: other.body.evidenceId, expectedVersion: 1, idempotencyKey: key(), requestId: request() }); verify(otherFinal.body.duplicate === false, 'same content in another entity does not leak duplicate existence');
  const corruptBytes = Buffer.from([1,2,3,4]); const corrupt = await call(universalEvidenceStart, { ...startBody(entityA), byteSize: corruptBytes.length, originalSha256: sha(corruptBytes) }); objects.set(String(corrupt.body.upload.url).replace('memory://', ''), { bytes: corruptBytes, contentType: 'image/png' }); const corruptFinal = await call(universalEvidenceFinalize, { financeEntityId: entityA, evidenceId: corrupt.body.evidenceId, expectedVersion: 1, idempotencyKey: key(), requestId: request() }); verify(corruptFinal.statusCode === 415, 'corrupt/spoofed content is rejected by byte signature');
  const sideEffects = await Promise.all(['financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'financeBalances', 'postingPlans', 'countSessions'].map((name) => db.collection('organizations').doc(orgId).collection(name).get())); verify(sideEffects.every((snapshot) => snapshot.empty), 'acceptance has zero transaction, journal, aggregate, balance, PostingPlan or Count side effects');
  console.log(`\nUniversal Evidence Firestore Emulator totals: ${passed} Passed`);
} finally { admin.auth.verifyIdToken = originalVerify; delete (globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')]; }
