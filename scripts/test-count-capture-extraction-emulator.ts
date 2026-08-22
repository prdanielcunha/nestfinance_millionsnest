import * as crypto from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import countCapturesExtractCandidates from '../server/vercel-handlers/finance/countCapturesExtractCandidates.js';
import countCapturesDetail from '../server/vercel-handlers/finance/countCapturesDetail.js';
import countSessionsStartSecondCount from '../server/vercel-handlers/finance/countSessionsStartSecondCount.js';
import countSessionsSubmitSecondCount from '../server/vercel-handlers/finance/countSessionsSubmitSecondCount.js';
import { buildCountPaperIdentity } from '../server/vercel-handlers/finance/countPaperHelpers.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(data: any) { this.body = data; return this; }
}

const sha = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const key = () => `idextract_${crypto.randomBytes(12).toString('hex')}`;
const requestId = () => `req_${crypto.randomBytes(12).toString('hex')}`;
const regionMap = {
  tithe: { x: 0.015, y: 0.195, width: 0.245, height: 0.17 },
  offering: { x: 0.255, y: 0.195, width: 0.245, height: 0.17 },
  other_income: { x: 0.495, y: 0.195, width: 0.245, height: 0.17 },
  pix: { x: 0.735, y: 0.195, width: 0.25, height: 0.17 },
} as const;

function regionInputs() {
  return Object.keys(regionMap).map((field, index) => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, index + 1, 0x10, 0x20, 0x30, 0xff, 0xd9]);
    return { key: field, mimeType: 'image/jpeg', dataBase64: bytes.toString('base64'), sha256: sha(bytes) };
  });
}

function fakeResult() {
  return {
    provider: 'test', model: 'fake-count-reader', revision: 'test-v1',
    result: { fields: [
      { key: 'tithe', status: 'recognized', observation: 'R$ 1.234,56' },
      { key: 'offering', status: 'recognized', observation: '1,234' },
      { key: 'other_income', status: 'unreadable', observation: '' },
      { key: 'pix', status: 'recognized', observation: '0' },
    ] },
  };
}

async function run() {
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';
  process.env.NESTFINANCE_COUNT_CAPTURE_AI_ENABLED = 'false';
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Count Capture extraction emulator test requires FIRESTORE_EMULATOR_HOST');

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const orgId = `org_extract_${crypto.randomBytes(4).toString('hex')}`;
  const entityA = `ent_extract_a_${crypto.randomBytes(4).toString('hex')}`;
  const entityB = `ent_extract_b_${crypto.randomBytes(4).toString('hex')}`;
  const uid = `usr_extract_${crypto.randomBytes(4).toString('hex')}`;
  const sessionId = `cnt_${crypto.randomBytes(12).toString('hex')}`;
  const captureAId = `cpc_${crypto.randomBytes(12).toString('hex')}`;
  const captureBId = `cpc_${crypto.randomBytes(12).toString('hex')}`;
  const tamperedCaptureId = `cpc_${crypto.randomBytes(12).toString('hex')}`;
  const normalizedA = 'a'.repeat(64);
  const normalizedB = 'b'.repeat(64);
  const entityARef = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA);
  const sessionRef = entityARef.collection('countSessions').doc(sessionId);

  await db.collection('organizations').doc(orgId).set({ name: 'Extraction Org', status: 'active' });
  await db.collection('users').doc(uid).set({ displayName: 'Extraction User', systemRole: 'ceo' });
  await entityARef.set({ name: 'Entity A', active: true });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB).set({ name: 'Entity B', active: true });
  await sessionRef.set({
    id: sessionId, organizationId: orgId, financeEntityId: entityA, serviceLabel: 'Culto Extraction', serviceDate: '2026-08-14', status: 'counting_a',
    countA: { entries: [{ type: 'tithe', method: 'total', totalCents: 1000 }], totalCents: 1000, savedAt: '2026-08-14T18:00:00.000Z' }, version: 2,
  });

  async function createCanonicalForm(stage: 'count_a' | 'count_b') {
    const formId = `cpf_${crypto.randomBytes(8).toString('hex')}`;
    const identity = buildCountPaperIdentity({ organizationId: orgId, financeEntityId: entityA, countSessionId: sessionId, formId, stage, locale: 'PT' });
    const form = {
      id: formId,
      organizationId: orgId,
      financeEntityId: entityA,
      countSessionId: sessionId,
      serviceLabel: 'Culto Extraction',
      serviceDate: '2026-08-14',
      stage,
      locale: 'PT',
      templateVersion: identity.templateVersion,
      checksum: identity.checksum,
      qrPayload: identity.qrPayload,
    };
    await entityARef.collection('countPaperForms').doc(formId).set(form);
    return form;
  }

  const baseCapture = (id: string, form: Awaited<ReturnType<typeof createCanonicalForm>>, normalizedSha256: string) => ({
    id, organizationId: orgId, financeEntityId: entityA, countSessionId: sessionId, formId: form.id,
    stage: form.stage, locale: form.locale, templateVersion: form.templateVersion, checksum: form.checksum, status: 'captured', version: 2,
    normalized: { path: `capture/${id}.jpg`, contentType: 'image/jpeg', size: 100, sha256: normalizedSha256 },
    normalization: { sourceWidth: 1200, sourceHeight: 1800, normalizedWidth: 1381, normalizedHeight: 2000, rotationDegrees: 0, perspectiveApplied: true, geometry: { mode: 'manual', confidence: null, corners: [{ x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }] } },
    candidates: Object.entries(regionMap).map(([field, region]) => ({ key: field, state: 'unresolved', valueCents: null, confidence: null, source: 'none', region })),
  });

  const formA = await createCanonicalForm('count_a');
  await entityARef.collection('countCaptures').doc(captureAId).set(baseCapture(captureAId, formA, normalizedA));
  await entityARef.collection('countCaptures').doc(tamperedCaptureId).set({ ...baseCapture(tamperedCaptureId, formA, 'c'.repeat(64)), checksum: '0'.repeat(24) });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({ uid, email: `${uid}@test.com`, mn_organization_id: orgId }) as any;
  const call = async (handler: any, body: any) => {
    const req = { method: 'POST', headers: { authorization: 'Bearer extraction_test', 'x-organization-id': orgId }, body, query: {} };
    const res = new MockRes(); await handler(req as any, res as any); return res;
  };
  let passed = 0;
  const verify = (condition: boolean, message: string) => { if (!condition) throw new Error(`Assertion failed: ${message}`); passed++; console.log(`✅ ${message}`); };
  const providerSymbol = Symbol.for('TEST_COUNT_CAPTURE_EXTRACTION_PROVIDER');

  try {
    (globalThis as any)[providerSymbol] = { async extract() { throw new Error('provider must not run for tampered form'); } };
    const tampered = await call(countCapturesExtractCandidates, { financeEntityId: entityA, captureId: tamperedCaptureId, expectedVersion: 2, normalizedSha256: 'c'.repeat(64), regions: regionInputs(), idempotencyKey: key(), requestId: requestId() });
    verify(tampered.statusCode === 400 && tampered.body.error === 'COUNT_CAPTURE_FORM_INTEGRITY_FAILED', 'tampered H3A form identity is rejected before provider execution');

    let releaseA!: () => void;
    let startedA!: () => void;
    const providerStartedA = new Promise<void>((resolve) => { startedA = resolve; });
    const providerReleaseA = new Promise<void>((resolve) => { releaseA = resolve; });
    (globalThis as any)[providerSymbol] = { async extract({ regions }: any) { verify(regions.length === 4 && regions.every((region: any) => !('organizationId' in region) && !('financeEntityId' in region)), 'provider receives only data-minimized region inputs'); startedA(); await providerReleaseA; return fakeResult(); } };

    const extractKeyA = key();
    const extractBodyA = { financeEntityId: entityA, captureId: captureAId, expectedVersion: 2, normalizedSha256: normalizedA, regions: regionInputs(), idempotencyKey: extractKeyA, requestId: requestId() };
    const extractionPromiseA = call(countCapturesExtractCandidates, extractBodyA);
    await providerStartedA;
    const blockedStartB = await call(countSessionsStartSecondCount, { financeEntityId: entityA, countSessionId: sessionId, expectedVersion: 2, idempotencyKey: key(), requestId: requestId() });
    verify(blockedStartB.statusCode === 409 && blockedStartB.body.error === 'COUNT_CAPTURE_EXTRACTION_IN_PROGRESS', 'blind Count B cannot start while Count A extraction lease is active');
    releaseA();
    const extractedA = await extractionPromiseA;
    verify(extractedA.statusCode === 200 && extractedA.body.version === 3 && extractedA.body.extracted === true, 'Count A advisory extraction completes without financial posting');
    const captureADoc = await entityARef.collection('countCaptures').doc(captureAId).get();
    const captureA = captureADoc.data() || {};
    verify(captureA.candidates?.[0]?.state === 'recognized' && captureA.candidates?.[0]?.valueCents === 123456, 'unambiguous BRL observation becomes deterministic integer cents');
    verify(captureA.candidates?.[1]?.state === 'uncertain' && captureA.candidates?.[1]?.valueCents === null, 'ambiguous separator never becomes a monetary value');
    verify(captureA.candidates?.[2]?.state === 'unresolved' && captureA.candidates?.[2]?.valueCents === null, 'unreadable field remains unresolved rather than zero');
    verify(captureA.candidates?.[3]?.state === 'recognized' && captureA.candidates?.[3]?.valueCents === 0, 'explicit visible zero can become candidate zero');
    verify(captureA.extraction?.fields?.[0]?.observation === 'R$ 1.234,56' && captureA.extraction?.fields?.[0]?.provenance === 'client_derived_verified_region_request', 'raw observation and provenance remain auditable separately from deterministic cents');

    const retryA = await call(countCapturesExtractCandidates, { ...extractBodyA, requestId: requestId() });
    verify(retryA.statusCode === 200 && retryA.body.version === 3 && !('candidates' in retryA.body), 'idempotent retry returns only safe minimal result and never candidate values');
    const crossEntity = await call(countCapturesExtractCandidates, { ...extractBodyA, financeEntityId: entityB, idempotencyKey: key(), requestId: requestId() });
    verify(crossEntity.statusCode === 404, 'candidate extraction cannot cross finance-entity boundary');

    const startedB = await call(countSessionsStartSecondCount, { financeEntityId: entityA, countSessionId: sessionId, expectedVersion: 2, idempotencyKey: key(), requestId: requestId() });
    verify(startedB.statusCode === 200 && startedB.body.status === 'counting_b', 'Count B starts after extraction lease is cleared');
    const hiddenA = await call(countCapturesDetail, { financeEntityId: entityA, captureId: captureAId });
    verify(hiddenA.statusCode === 200 && hiddenA.body.capture.materialHidden === true && hiddenA.body.capture.candidates === null && hiddenA.body.capture.extraction === null && hiddenA.body.capture.normalizedSha256 === null, 'Count A AI observations and candidates are blind-masked during Count B');
    const blindRetryA = await call(countCapturesExtractCandidates, { ...extractBodyA, requestId: requestId() });
    verify(blindRetryA.statusCode === 200 && blindRetryA.body.version === 3 && !('candidates' in blindRetryA.body), 'blind-stage idempotent replay remains value-free');

    const formB = await createCanonicalForm('count_b');
    await entityARef.collection('countCaptures').doc(captureBId).set(baseCapture(captureBId, formB, normalizedB));
    delete (globalThis as any)[providerSymbol];
    const unavailableB = await call(countCapturesExtractCandidates, { financeEntityId: entityA, captureId: captureBId, expectedVersion: 2, normalizedSha256: normalizedB, regions: regionInputs(), idempotencyKey: key(), requestId: requestId() });
    verify(unavailableB.statusCode === 503 && unavailableB.body.error === 'COUNT_CAPTURE_EXTRACTION_UNAVAILABLE', 'external provider is disabled by default');
    verify(!(await sessionRef.get()).data()?.captureExtractionLease, 'disabled provider cleanup releases blind-count lease');

    (globalThis as any)[providerSymbol] = { async extract() { throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_TIMEOUT'); } };
    const timeoutB = await call(countCapturesExtractCandidates, { financeEntityId: entityA, captureId: captureBId, expectedVersion: 2, normalizedSha256: normalizedB, regions: regionInputs(), idempotencyKey: key(), requestId: requestId() });
    verify(timeoutB.statusCode === 503 && timeoutB.body.error === 'COUNT_CAPTURE_EXTRACTION_TEMPORARILY_UNAVAILABLE', 'provider timeout maps to a safe temporary-unavailable error');
    verify(!(await sessionRef.get()).data()?.captureExtractionLease, 'provider timeout cleanup releases blind-count lease');

    let releaseB!: () => void;
    let startedProviderB!: () => void;
    const providerStartedB = new Promise<void>((resolve) => { startedProviderB = resolve; });
    const providerReleaseB = new Promise<void>((resolve) => { releaseB = resolve; });
    (globalThis as any)[providerSymbol] = { async extract() { startedProviderB(); await providerReleaseB; return fakeResult(); } };
    const extractionPromiseB = call(countCapturesExtractCandidates, { financeEntityId: entityA, captureId: captureBId, expectedVersion: 2, normalizedSha256: normalizedB, regions: regionInputs(), idempotencyKey: key(), requestId: requestId() });
    await providerStartedB;
    const blockedSealB = await call(countSessionsSubmitSecondCount, { financeEntityId: entityA, countSessionId: sessionId, expectedVersion: 3, entries: [{ type: 'tithe', method: 'total', totalCents: 1000 }], idempotencyKey: key(), requestId: requestId() });
    verify(blockedSealB.statusCode === 409 && blockedSealB.body.error === 'COUNT_CAPTURE_EXTRACTION_IN_PROGRESS', 'Count B cannot be sealed while its extraction lease is active');
    releaseB();
    const extractedB = await extractionPromiseB;
    verify(extractedB.statusCode === 200, 'Count B extraction completes after race protection');
    const sealedB = await call(countSessionsSubmitSecondCount, { financeEntityId: entityA, countSessionId: sessionId, expectedVersion: 3, entries: [{ type: 'tithe', method: 'total', totalCents: 1000 }], idempotencyKey: key(), requestId: requestId() });
    verify(sealedB.statusCode === 200, 'Count B can be sealed after extraction lease is cleared');

    const transactions = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journal = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregates = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(transactions.empty && journal.empty && aggregates.empty, 'H3B3 creates no transaction, journal entry or aggregate');
    console.log(`\nCount Capture Extraction Emulator totals: ${passed} Passed`);
  } finally {
    admin.auth.verifyIdToken = originalVerify;
    delete (globalThis as any)[providerSymbol];
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
