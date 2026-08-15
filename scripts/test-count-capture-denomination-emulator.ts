import * as crypto from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import countCapturesExtractDenominations from '../server/vercel-handlers/finance/countCapturesExtractDenominations.js';
import countCapturesSaveDenominationReview from '../server/vercel-handlers/finance/countCapturesSaveDenominationReview.js';
import countCapturesDetail from '../server/vercel-handlers/finance/countCapturesDetail.js';
import countSessionsStartSecondCount from '../server/vercel-handlers/finance/countSessionsStartSecondCount.js';
import { buildCountPaperIdentity } from '../server/vercel-handlers/finance/countPaperHelpers.js';
import { buildUnresolvedCountCaptureDenominationCandidates, COUNT_CAPTURE_DENOMINATION_CELL_KEYS } from '../shared/finance/countCaptureDenominations.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(data: any) { this.body = data; return this; }
}
const sha = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const key = () => `iddenom_${crypto.randomBytes(12).toString('hex')}`;
const requestId = () => `req_${crypto.randomBytes(12).toString('hex')}`;

function regionInputs() {
  return COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey, index) => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, (index % 250) + 1, 0x11, 0x22, 0x33, 0xff, 0xd9]);
    return { cellKey, mimeType: 'image/jpeg', dataBase64: bytes.toString('base64'), sha256: sha(bytes) };
  });
}
function fakeResult() {
  return {
    provider: 'test', model: 'fake-denomination-reader', revision: 'test-v1',
    result: { fields: COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey) => {
      if (cellKey === 'tithe:10000') return { cellKey, status: 'recognized', observation: '2' };
      if (cellKey === 'tithe:5000') return { cellKey, status: 'recognized', observation: '0' };
      if (cellKey === 'offering:10000') return { cellKey, status: 'recognized', observation: '1x' };
      if (cellKey === 'other:10000') return { cellKey, status: 'unreadable', observation: '' };
      return { cellKey, status: 'blank', observation: '' };
    }) },
  };
}

async function run() {
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';
  process.env.NESTFINANCE_COUNT_CAPTURE_AI_ENABLED = 'false';
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Count Capture denomination emulator test requires FIRESTORE_EMULATOR_HOST');

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const orgId = `org_denom_${crypto.randomBytes(4).toString('hex')}`;
  const entityA = `ent_denom_a_${crypto.randomBytes(4).toString('hex')}`;
  const entityB = `ent_denom_b_${crypto.randomBytes(4).toString('hex')}`;
  const uid = `usr_denom_${crypto.randomBytes(4).toString('hex')}`;
  const sessionId = `cnt_${crypto.randomBytes(12).toString('hex')}`;
  const captureId = `cpc_${crypto.randomBytes(12).toString('hex')}`;
  const normalizedSha256 = 'd'.repeat(64);
  const entityARef = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA);
  const sessionRef = entityARef.collection('countSessions').doc(sessionId);

  await db.collection('organizations').doc(orgId).set({ name: 'Denomination Org', status: 'active' });
  await db.collection('users').doc(uid).set({ displayName: 'Denomination User', systemRole: 'ceo' });
  await entityARef.set({ name: 'Entity A', active: true });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB).set({ name: 'Entity B', active: true });
  await sessionRef.set({ id: sessionId, organizationId: orgId, financeEntityId: entityA, serviceLabel: 'Culto Denominations', serviceDate: '2026-08-14', status: 'counting_a', countA: { entries: [{ type: 'tithe', method: 'total', totalCents: 1000 }], totalCents: 1000, savedAt: '2026-08-14T18:00:00.000Z' }, version: 2 });

  const formId = `cpf_${crypto.randomBytes(8).toString('hex')}`;
  const identity = buildCountPaperIdentity({ organizationId: orgId, financeEntityId: entityA, countSessionId: sessionId, formId, stage: 'count_a', locale: 'PT' });
  await entityARef.collection('countPaperForms').doc(formId).set({ id: formId, organizationId: orgId, financeEntityId: entityA, countSessionId: sessionId, serviceLabel: 'Culto Denominations', serviceDate: '2026-08-14', stage: 'count_a', locale: 'PT', templateVersion: identity.templateVersion, checksum: identity.checksum, qrPayload: identity.qrPayload });
  await entityARef.collection('countCaptures').doc(captureId).set({
    id: captureId, organizationId: orgId, financeEntityId: entityA, countSessionId: sessionId, formId, stage: 'count_a', locale: 'PT', templateVersion: 1, checksum: identity.checksum, status: 'captured', version: 2,
    normalized: { path: `capture/${captureId}.jpg`, contentType: 'image/jpeg', size: 100, sha256: normalizedSha256 },
    normalization: { sourceWidth: 1200, sourceHeight: 1800, normalizedWidth: 1381, normalizedHeight: 2000, rotationDegrees: 0, perspectiveApplied: true, geometry: { mode: 'manual', confidence: null, corners: [{ x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }] } },
    candidates: [],
    denominationCandidates: buildUnresolvedCountCaptureDenominationCandidates(1),
  });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({ uid, email: `${uid}@test.com`, mn_organization_id: orgId }) as any;
  const call = async (handler: any, body: any) => {
    const req = { method: 'POST', headers: { authorization: 'Bearer denomination_test', 'x-organization-id': orgId }, body, query: {} };
    const res = new MockRes(); await handler(req as any, res as any); return res;
  };
  let passed = 0;
  const verify = (condition: boolean, message: string) => { if (!condition) throw new Error(`Assertion failed: ${message}`); passed++; console.log(`✅ ${message}`); };
  const providerSymbol = Symbol.for('TEST_COUNT_CAPTURE_DENOMINATION_EXTRACTION_PROVIDER');

  try {
    (globalThis as any)[providerSymbol] = { async extract({ regions }: any) {
      verify(regions.length === 33 && regions.every((region: any) => !('organizationId' in region) && !('financeEntityId' in region)), 'denomination provider receives only isolated quantity-cell images');
      return fakeResult();
    } };
    const extractKey = key();
    const extractBody = { financeEntityId: entityA, captureId, expectedVersion: 2, normalizedSha256, regions: regionInputs(), idempotencyKey: extractKey, requestId: requestId() };
    const extracted = await call(countCapturesExtractDenominations, extractBody);
    verify(extracted.statusCode === 200 && extracted.body.version === 3 && extracted.body.extracted === true, 'denomination extraction completes as advisory evidence only');
    const afterExtract = (await entityARef.collection('countCaptures').doc(captureId).get()).data() || {};
    const byKey = new Map((afterExtract.denominationCandidates || []).map((item: any) => [item.cellKey, item]));
    verify(byKey.get('tithe:10000')?.state === 'recognized' && byKey.get('tithe:10000')?.quantity === 2, 'recognized quantity is stored as an integer candidate');
    verify(byKey.get('tithe:5000')?.state === 'recognized' && byKey.get('tithe:5000')?.quantity === 0, 'explicit zero may become candidate zero');
    verify(byKey.get('offering:10000')?.state === 'uncertain' && byKey.get('offering:10000')?.quantity === null, 'non-integer-looking observation stays uncertain');
    verify(byKey.get('other:10000')?.state === 'unresolved' && byKey.get('other:10000')?.quantity === null, 'unreadable quantity stays unresolved');

    const retry = await call(countCapturesExtractDenominations, { ...extractBody, requestId: requestId() });
    verify(retry.statusCode === 200 && retry.body.version === 3 && !('denominationCandidates' in retry.body), 'denomination idempotent replay is value-free');
    const crossEntity = await call(countCapturesExtractDenominations, { ...extractBody, financeEntityId: entityB, idempotencyKey: key(), requestId: requestId() });
    verify(crossEntity.statusCode === 404, 'denomination extraction cannot cross finance-entity boundary');

    const denominationReview = COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey) => {
      if (cellKey === 'tithe:10000') return { cellKey, decision: 'corrected', quantity: 3 };
      if (cellKey === 'tithe:5000') return { cellKey, decision: 'confirmed', quantity: 0 };
      if (cellKey === 'offering:10000') return { cellKey, decision: 'corrected', quantity: 4 };
      if (cellKey === 'other:10000') return { cellKey, decision: 'unreadable', quantity: null };
      return { cellKey, decision: 'blank', quantity: null };
    });
    const reviewed = await call(countCapturesSaveDenominationReview, { financeEntityId: entityA, captureId, expectedVersion: 3, denominations: denominationReview, idempotencyKey: key(), requestId: requestId() });
    verify(reviewed.statusCode === 200 && reviewed.body.version === 4 && reviewed.body.denominationReviewSaved === true, 'human denomination review saves without changing Count state');
    const afterReview = (await entityARef.collection('countCaptures').doc(captureId).get()).data() || {};
    verify(afterReview.denominationReview?.subtotalsCents?.tithe === 30000, 'tithe subtotal is recomputed deterministically from reviewed quantities');
    verify(afterReview.denominationReview?.subtotalsCents?.offering === 40000, 'offering subtotal is recomputed deterministically from reviewed quantities');
    verify(afterReview.denominationReview?.subtotalsCents?.other === null, 'subtotal remains unresolved when a reviewed row is unreadable');
    const corrected = afterReview.denominationReview?.fields?.find((row: any) => row.cellKey === 'tithe:10000');
    verify(corrected?.quantity === 3 && corrected?.candidateQuantity === 2 && corrected?.decision === 'corrected', 'human correction preserves original AI candidate separately');

    const startedB = await call(countSessionsStartSecondCount, { financeEntityId: entityA, countSessionId: sessionId, expectedVersion: 2, idempotencyKey: key(), requestId: requestId() });
    verify(startedB.statusCode === 200 && startedB.body.status === 'counting_b', 'blind Count B starts after denomination extraction/review is complete');
    const hidden = await call(countCapturesDetail, { financeEntityId: entityA, captureId });
    verify(hidden.statusCode === 200 && hidden.body.capture.materialHidden === true && hidden.body.capture.denominationCandidates === null && hidden.body.capture.denominationExtraction === null && hidden.body.capture.denominationReview === null, 'Count A denomination evidence is fully masked during blind Count B');

    const transactions = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journal = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregates = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(transactions.empty && journal.empty && aggregates.empty, 'H3B4 creates no transaction, journal entry or aggregate');
    console.log(`\nCount Capture Denomination Emulator totals: ${passed} Passed`);
  } finally {
    admin.auth.verifyIdToken = originalVerify;
    delete (globalThis as any)[providerSymbol];
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
