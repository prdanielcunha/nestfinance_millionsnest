import * as crypto from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import countPaperFormsGenerate from '../server/vercel-handlers/finance/countPaperFormsGenerate.js';
import countCapturesStart from '../server/vercel-handlers/finance/countCapturesStart.js';
import countCapturesFinalize from '../server/vercel-handlers/finance/countCapturesFinalize.js';
import countCapturesDetail from '../server/vercel-handlers/finance/countCapturesDetail.js';
import countCapturesSaveReview from '../server/vercel-handlers/finance/countCapturesSaveReview.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(data: any) { this.body = data; return this; }
}
const sha = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');

async function run() {
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Count Capture emulator test requires FIRESTORE_EMULATOR_HOST');

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const orgId = `org_capture_${crypto.randomBytes(4).toString('hex')}`;
  const entityA = `ent_a_${crypto.randomBytes(4).toString('hex')}`;
  const entityB = `ent_b_${crypto.randomBytes(4).toString('hex')}`;
  const uid = `usr_capture_${crypto.randomBytes(4).toString('hex')}`;
  const sessionId = `cnt_${crypto.randomBytes(12).toString('hex')}`;
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const TEST_STORAGE_SYMBOL = Symbol.for('TEST_COUNT_CAPTURE_STORAGE');
  (globalThis as any)[TEST_STORAGE_SYMBOL] = {
    async createUploadUrl(path: string) { return { url: `memory://${path}`, requiredHeaders: { 'x-goog-if-generation-match': '0' } }; },
    async createReadUrl(path: string) { return `read://${path}`; },
    async inspectAndHash(path: string) {
      const object = objects.get(path);
      if (!object) throw new Error('COUNT_CAPTURE_UPLOAD_MISSING');
      return { path, contentType: object.contentType, size: object.bytes.length, sha256: sha(object.bytes) };
    },
  };

  await db.collection('organizations').doc(orgId).set({ name: 'Capture Org', status: 'active' });
  await db.collection('users').doc(uid).set({ displayName: 'Capture User', systemRole: 'ceo' });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).set({ name: 'Entity A', active: true });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB).set({ name: 'Entity B', active: true });
  const sessionRef = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).collection('countSessions').doc(sessionId);
  await sessionRef.set({ id: sessionId, organizationId: orgId, financeEntityId: entityA, serviceLabel: 'Culto Capture', serviceDate: '2026-08-14', status: 'counting_a', countA: { entries: [{ type: 'tithe', method: 'total', totalCents: 1000 }], totalCents: 1000 }, version: 2 });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({ uid, email: `${uid}@test.com`, mn_organization_id: orgId }) as any;
  const call = async (handler: any, body: any) => {
    const req = { method: 'POST', headers: { authorization: 'Bearer count_capture_test', 'x-organization-id': orgId }, body, query: {} };
    const res = new MockRes(); await handler(req as any, res as any); return res;
  };
  const key = () => `idcapture_${crypto.randomBytes(12).toString('hex')}`;
  const request = () => `req_${crypto.randomBytes(12).toString('hex')}`;
  let passed = 0;
  const verify = (condition: boolean, message: string) => { if (!condition) throw new Error(`Assertion failed: ${message}`); passed++; console.log(`✅ ${message}`); };

  try {
    const paperA = await call(countPaperFormsGenerate, { financeEntityId: entityA, countSessionId: sessionId, stage: 'count_a', locale: 'PT', idempotencyKey: key(), requestId: request() });
    verify(paperA.statusCode === 200, 'H3A Count A paper exists for capture binding');
    const formADoc = await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).collection('countPaperForms').doc(paperA.body.formId).get();
    const qrA = formADoc.data()?.qrPayload;

    const badHashStart = await call(countCapturesStart, { financeEntityId: entityA, qrPayload: qrA, originalContentType: 'image/jpeg', originalSize: 10, originalSha256: 'bad', normalizedContentType: 'image/jpeg', normalizedSize: 10, normalizedSha256: 'bad', idempotencyKey: key(), requestId: request() });
    verify(badHashStart.statusCode === 400, 'capture start rejects malformed declared hashes');
    const tamperedQr = JSON.stringify({ formId: paperA.body.formId, templateVersion: 1, checksum: 'f'.repeat(24) });
    const tamperedStart = await call(countCapturesStart, { financeEntityId: entityA, qrPayload: tamperedQr, originalContentType: 'image/jpeg', originalSize: 10, originalSha256: 'a'.repeat(64), normalizedContentType: 'image/jpeg', normalizedSize: 10, normalizedSha256: 'b'.repeat(64), idempotencyKey: key(), requestId: request() });
    verify(tamperedStart.statusCode === 400 && tamperedStart.body.error === 'COUNT_CAPTURE_QR_TAMPERED', 'tampered QR is rejected server-side');

    const original = Buffer.from('original-a1');
    const normalized = Buffer.from('normal-a1');
    const startBody = { financeEntityId: entityA, qrPayload: qrA, originalContentType: 'image/jpeg', originalSize: original.length, originalSha256: sha(original), normalizedContentType: 'image/jpeg', normalizedSize: normalized.length, normalizedSha256: sha(normalized), idempotencyKey: key(), requestId: request() };
    const started = await call(countCapturesStart, startBody);
    verify(started.statusCode === 200 && /^cpc_[a-f0-9]{24}$/.test(started.body.captureId), 'server starts opaque entity-scoped capture');
    verify(started.body.originalUpload.requiredHeaders?.['x-goog-if-generation-match'] === '0', 'upload grant is write-once');
    const retry = await call(countCapturesStart, { ...startBody, requestId: request() });
    verify(retry.statusCode === 200 && retry.body.captureId === started.body.captureId, 'capture start retry reuses same canonical capture');

    objects.set(String(started.body.originalUpload.url).replace('memory://', ''), { bytes: original, contentType: 'image/jpeg' });
    objects.set(String(started.body.normalizedUpload.url).replace('memory://', ''), { bytes: normalized, contentType: 'image/jpeg' });
    const finalized = await call(countCapturesFinalize, { financeEntityId: entityA, captureId: started.body.captureId, expectedVersion: 1, normalization: { sourceWidth: 3000, sourceHeight: 4000, normalizedWidth: 1800, normalizedHeight: 2400, rotationDegrees: 0, perspectiveApplied: false }, idempotencyKey: key(), requestId: request() });
    verify(finalized.statusCode === 200 && finalized.body.status === 'captured', 'server verifies hashes and finalizes capture');

    const detail = await call(countCapturesDetail, { financeEntityId: entityA, captureId: started.body.captureId });
    verify(detail.statusCode === 200 && String(detail.body.capture.normalizedUrl).startsWith('read://'), 'visible Count A receives short-lived evidence URLs');
    verify(detail.body.capture.candidates.every((field: any) => field.state === 'unresolved' && field.valueCents === null), 'candidate values begin unresolved instead of zero');
    const crossDetail = await call(countCapturesDetail, { financeEntityId: entityB, captureId: started.body.captureId });
    verify(crossDetail.statusCode === 404, 'capture cannot cross finance entities');

    const reviewed = await call(countCapturesSaveReview, { financeEntityId: entityA, captureId: started.body.captureId, expectedVersion: 2, fields: [
      { key: 'tithe', decision: 'corrected', valueCents: 1000 }, { key: 'offering', decision: 'corrected', valueCents: 2500 }, { key: 'other_income', decision: 'unreadable', valueCents: null }, { key: 'pix', decision: 'corrected', valueCents: 500 },
    ], idempotencyKey: key(), requestId: request() });
    verify(reviewed.statusCode === 200 && reviewed.body.status === 'reviewed', 'human review preserves correction/unreadable decisions');

    const duplicateStart = await call(countCapturesStart, { ...startBody, idempotencyKey: key(), requestId: request() });
    objects.set(String(duplicateStart.body.originalUpload.url).replace('memory://', ''), { bytes: original, contentType: 'image/jpeg' });
    objects.set(String(duplicateStart.body.normalizedUpload.url).replace('memory://', ''), { bytes: normalized, contentType: 'image/jpeg' });
    const duplicateFinal = await call(countCapturesFinalize, { financeEntityId: entityA, captureId: duplicateStart.body.captureId, expectedVersion: 1, normalization: { sourceWidth: 3000, sourceHeight: 4000, normalizedWidth: 1800, normalizedHeight: 2400, rotationDegrees: 0, perspectiveApplied: false }, idempotencyKey: key(), requestId: request() });
    verify(duplicateFinal.statusCode === 200 && duplicateFinal.body.duplicate === true && duplicateFinal.body.canonicalCaptureId === started.body.captureId, 'exact SHA-256 duplicate resolves to canonical capture');

    const staleStart = await call(countCapturesStart, { ...startBody, idempotencyKey: key(), requestId: request() });
    await sessionRef.update({ status: 'counting_b', version: 3 });
    const lateFinalize = await call(countCapturesFinalize, { financeEntityId: entityA, captureId: staleStart.body.captureId, expectedVersion: 1, normalization: { sourceWidth: 1000, sourceHeight: 1400, normalizedWidth: 1000, normalizedHeight: 1400, rotationDegrees: 0, perspectiveApplied: false }, idempotencyKey: key(), requestId: request() });
    verify(lateFinalize.statusCode === 409 && lateFinalize.body.error === 'COUNT_CAPTURE_MATERIAL_HIDDEN', 'Count A cannot finalize after blind Count B starts');
    const lateStart = await call(countCapturesStart, { ...startBody, idempotencyKey: key(), requestId: request() });
    verify(lateStart.statusCode === 400 && lateStart.body.error === 'COUNT_CAPTURE_INVALID_STAGE_STATE', 'new Count A capture is blocked during Count B');
    const lateReview = await call(countCapturesSaveReview, { financeEntityId: entityA, captureId: started.body.captureId, expectedVersion: 3, fields: [
      { key: 'tithe', decision: 'corrected', valueCents: 1000 }, { key: 'offering', decision: 'corrected', valueCents: 2500 }, { key: 'other_income', decision: 'unreadable', valueCents: null }, { key: 'pix', decision: 'corrected', valueCents: 500 },
    ], idempotencyKey: key(), requestId: request() });
    verify(lateReview.statusCode === 409 && lateReview.body.error === 'COUNT_CAPTURE_MATERIAL_HIDDEN', 'Count A review cannot mutate during blind Count B');
    const blindA = await call(countCapturesDetail, { financeEntityId: entityA, captureId: started.body.captureId });
    verify(blindA.body.capture.materialHidden === true && blindA.body.capture.originalUrl === null && blindA.body.capture.review === null, 'Count A image/review is masked during Count B');

    const paperB = await call(countPaperFormsGenerate, { financeEntityId: entityA, countSessionId: sessionId, stage: 'count_b', locale: 'PT', idempotencyKey: key(), requestId: request() });
    const formBDoc = await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).collection('countPaperForms').doc(paperB.body.formId).get();
    const bOriginal = Buffer.from('original-b1'); const bNormalized = Buffer.from('normal-b1');
    const startB = await call(countCapturesStart, { financeEntityId: entityA, qrPayload: formBDoc.data()?.qrPayload, originalContentType: 'image/jpeg', originalSize: bOriginal.length, originalSha256: sha(bOriginal), normalizedContentType: 'image/jpeg', normalizedSize: bNormalized.length, normalizedSha256: sha(bNormalized), idempotencyKey: key(), requestId: request() });
    objects.set(String(startB.body.originalUpload.url).replace('memory://', ''), { bytes: bOriginal, contentType: 'image/jpeg' });
    objects.set(String(startB.body.normalizedUpload.url).replace('memory://', ''), { bytes: bNormalized, contentType: 'image/jpeg' });
    const finalB = await call(countCapturesFinalize, { financeEntityId: entityA, captureId: startB.body.captureId, expectedVersion: 1, normalization: { sourceWidth: 2000, sourceHeight: 2800, normalizedWidth: 1714, normalizedHeight: 2400, rotationDegrees: 0, perspectiveApplied: false }, idempotencyKey: key(), requestId: request() });
    verify(finalB.statusCode === 200, 'Count B finalizes while its blind stage is active');
    const visibleB = await call(countCapturesDetail, { financeEntityId: entityA, captureId: startB.body.captureId });
    verify(visibleB.body.capture.materialHidden === false, 'Count B can review its own evidence without Count A');
    await sessionRef.update({ status: 'recounting', version: 4 });
    const hiddenB = await call(countCapturesDetail, { financeEntityId: entityA, captureId: startB.body.captureId });
    verify(hiddenB.body.capture.materialHidden === true && hiddenB.body.capture.normalizedUrl === null, 'recount hides Count B evidence');

    const transactions = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journal = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregates = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(transactions.empty && journal.empty && aggregates.empty, 'H3B1 creates no transactions, journal entries or aggregates');
    console.log(`\nCount Capture Firestore Emulator totals: ${passed} Passed`);
  } finally {
    admin.auth.verifyIdToken = originalVerify;
    delete (globalThis as any)[TEST_STORAGE_SYMBOL];
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
