import * as crypto from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import countFreeFormCapturesStart from '../server/vercel-handlers/finance/countFreeFormCapturesStart.js';
import countFreeFormCapturesFinalize from '../server/vercel-handlers/finance/countFreeFormCapturesFinalize.js';
import countFreeFormCapturesExtractCandidates from '../server/vercel-handlers/finance/countFreeFormCapturesExtractCandidates.js';
import countCapturesSaveReview from '../server/vercel-handlers/finance/countCapturesSaveReview.js';
import countCapturesApplyToCount from '../server/vercel-handlers/finance/countCapturesApplyToCount.js';
import countSessionsStartSecondCount from '../server/vercel-handlers/finance/countSessionsStartSecondCount.js';
import countSessionsJoinSecondCount from '../server/vercel-handlers/finance/countSessionsJoinSecondCount.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers: Record<string, string> = {};
  status(code: number) { this.statusCode = code; return this; }
  json(data: any) { this.body = data; return this; }
  setHeader(name: string, value: string) { this.headers[name] = value; return this; }
}
const sha = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const token = (prefix: string) => prefix + '_' + crypto.randomBytes(12).toString('hex');

async function run() {
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore Emulator required');

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const suffix = crypto.randomBytes(4).toString('hex');
  const orgId = 'org_freeform_' + suffix;
  const entityId = 'fent_freeform_' + suffix;
  const otherEntityId = 'fent_freeform_other_' + suffix;
  const uidA = 'usr_freeform_a_' + suffix;
  const uidB = 'usr_freeform_b_' + suffix;
  const sessionId = 'cnt_' + crypto.randomBytes(12).toString('hex');

  await db.collection('organizations').doc(orgId).set({ name: 'Free Form Test', status: 'active' });
  await db.collection('users').doc(uidA).set({ displayName: 'Count Tester A', systemRole: 'ceo' });
  await db.collection('users').doc(uidB).set({ displayName: 'Count Tester B', systemRole: 'ceo' });
  const entityRef = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId);
  await entityRef.set({ id: entityId, organizationId: orgId, displayName: 'Church A', active: true });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(otherEntityId).set({
    id: otherEntityId, organizationId: orgId, displayName: 'Church B', active: true,
  });
  const sessionRef = entityRef.collection('countSessions').doc(sessionId);
  await sessionRef.set({
    id: sessionId,
    organizationId: orgId,
    financeEntityId: entityId,
    serviceLabel: 'Culto teste',
    serviceDate: '2026-09-19',
    status: 'counting_a',
    policySnapshot: { doubleCountRequired: true, policyVersion: 1, source: 'test' },
    version: 1,
    createdByUid: uidA,
  });

  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const STORAGE_SYMBOL = Symbol.for('TEST_COUNT_CAPTURE_STORAGE');
  (globalThis as any)[STORAGE_SYMBOL] = {
    async createUploadUrl(path: string) {
      return { url: 'mock://' + path, requiredHeaders: { 'x-goog-if-generation-match': '0' } };
    },
    async createReadUrl(path: string) { return 'mock-read://' + path; },
    async inspectAndHash(path: string) {
      const object = objects.get(path);
      if (!object) throw new Error('COUNT_CAPTURE_UPLOAD_MISSING');
      return { path, contentType: object.contentType, size: object.bytes.length, sha256: sha(object.bytes) };
    },
    async readVerifiedBytes(path: string, maxBytes: number) {
      const object = objects.get(path);
      if (!object) throw new Error('COUNT_CAPTURE_UPLOAD_MISSING');
      if (object.bytes.length > maxBytes) throw new Error('COUNT_CAPTURE_NORMALIZED_TOO_LARGE');
      return { bytes: object.bytes, contentType: object.contentType, size: object.bytes.length, sha256: sha(object.bytes) };
    },
  };

  const PROVIDER_SYMBOL = Symbol.for('TEST_COUNT_FREE_FORM_EXTRACTION_PROVIDER');
  const providerQueue: any[] = [];
  (globalThis as any)[PROVIDER_SYMBOL] = {
    async extract() {
      const result = providerQueue.shift();
      if (!result) throw new Error('NO_TEST_PROVIDER_RESULT');
      return { provider: 'test', model: 'free-form-test', revision: 'count-free-form-full-frame-v1', result };
    },
  };

  const originalVerify = admin.auth.verifyIdToken;
  let activeUid = uidA;
  admin.auth.verifyIdToken = async () => ({
    uid: activeUid,
    name: activeUid === uidA ? 'Count Tester A' : 'Count Tester B',
    email: activeUid + '@test.com',
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: orgId,
    mn_session_version: 1,
  }) as any;

  const call = async (handler: any, body: any) => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer free_form_test', 'x-organization-id': orgId },
      body,
      query: {},
    };
    const res = new MockRes();
    await handler(req as any, res as any);
    return res;
  };
  const verifiedFields = (amounts = ['1000,00', '500,00', '100,00', '400,00']) => ({
    fields: [
      { key: 'tithe', status: 'recognized', observation: amounts[0] },
      { key: 'offering', status: 'recognized', observation: amounts[1] },
      { key: 'other_income', status: 'recognized', observation: amounts[2] },
      { key: 'pix', status: 'recognized', observation: amounts[3] },
    ],
  });
  const normalization = {
    sourceWidth: 1200,
    sourceHeight: 1600,
    normalizedWidth: 1200,
    normalizedHeight: 1600,
    rotationDegrees: 0,
    perspectiveApplied: false,
    geometry: { mode: 'full_frame', confidence: null, corners: null },
  };

  let passed = 0;
  const verify = (condition: unknown, message: string) => {
    if (!condition) throw new Error('Assertion failed: ' + message);
    passed += 1;
    console.log('✅ ' + message);
  };

  async function makeCapture(expectedStage: 'count_a' | 'count_b') {
    const original = Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1]), crypto.randomBytes(64)]);
    const normalized = Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1]), crypto.randomBytes(48)]);
    const started = await call(countFreeFormCapturesStart, {
      financeEntityId: entityId,
      countSessionId: sessionId,
      locale: 'PT',
      originalContentType: 'image/jpeg',
      originalSize: original.length,
      originalSha256: sha(original),
      normalizedContentType: 'image/jpeg',
      normalizedSize: normalized.length,
      normalizedSha256: sha(normalized),
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(started.statusCode === 200 && started.body.status === 'awaiting_upload', expectedStage + ' free-form capture starts');
    const captureDoc = await entityRef.collection('countCaptures').doc(started.body.captureId).get();
    const raw = captureDoc.data() || {};
    verify(raw.provenance === 'free_form_note' && raw.formId === null && raw.checksum === null, expectedStage + ' stores lower provenance without fake form identity');
    verify(raw.stage === expectedStage, expectedStage + ' is derived from canonical session state');

    objects.set(raw.original.path, { bytes: original, contentType: 'image/jpeg' });
    objects.set(raw.normalized.path, { bytes: normalized, contentType: 'image/jpeg' });

    const finalized = await call(countFreeFormCapturesFinalize, {
      financeEntityId: entityId,
      captureId: started.body.captureId,
      expectedVersion: 1,
      normalization,
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(finalized.statusCode === 200 && finalized.body.status === 'captured', expectedStage + ' original and normalized evidence finalize');
    const afterFinalize = (await entityRef.collection('countCaptures').doc(started.body.captureId).get()).data() || {};
    verify(Array.isArray(afterFinalize.denominationCandidates) && afterFinalize.denominationCandidates.length === 0, expectedStage + ' does not infer denominations');

    providerQueue.push(verifiedFields());
    const extracted = await call(countFreeFormCapturesExtractCandidates, {
      financeEntityId: entityId,
      captureId: started.body.captureId,
      expectedVersion: 2,
      normalizedSha256: sha(normalized),
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(extracted.statusCode === 200 && extracted.body.version === 3, expectedStage + ' full-frame suggestions are stored');

    const review = await call(countCapturesSaveReview, {
      financeEntityId: entityId,
      captureId: started.body.captureId,
      expectedVersion: 3,
      fields: [
        { key: 'tithe', decision: 'confirmed', valueCents: 100000 },
        { key: 'offering', decision: 'confirmed', valueCents: 50000 },
        { key: 'other_income', decision: 'confirmed', valueCents: 10000 },
        { key: 'pix', decision: 'confirmed', valueCents: 40000 },
      ],
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(review.statusCode === 200 && review.body.status === 'reviewed', expectedStage + ' requires explicit human review');

    return { captureId: started.body.captureId, version: 4 };
  }

  try {
    const first = await makeCapture('count_a');
    const applyA = await call(countCapturesApplyToCount, {
      financeEntityId: entityId,
      captureId: first.captureId,
      expectedCaptureVersion: first.version,
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(applyA.statusCode === 200 && applyA.body.stage === 'count_a', 'reviewed free-form note applies as Count A only after explicit action');
    const afterA = (await sessionRef.get()).data() || {};
    verify(afterA.countA?.sourceProvenance === 'free_form_note' && afterA.countA?.sourceFormId === null, 'Count A preserves free-form provenance without source form');
    verify(afterA.countA?.totalCents === 200000, 'Count A canonical total matches four reviewed categories');

    const startB = await call(countSessionsStartSecondCount, {
      financeEntityId: entityId,
      countSessionId: sessionId,
      expectedVersion: afterA.version,
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(startB.statusCode === 200 && startB.body.status === 'counting_b', 'canonical blind Count B starts normally');

    const samePersonJoin = await call(countSessionsJoinSecondCount, {
      financeEntityId: entityId,
      joinCode: startB.body.joinCode,
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(
      samePersonJoin.statusCode === 403 && samePersonJoin.body.error === 'COUNT_INDEPENDENT_COUNTER_REQUIRED',
      'first free-form counter cannot assume blind Count B',
    );

    activeUid = uidB;
    const joined = await call(countSessionsJoinSecondCount, {
      financeEntityId: entityId,
      joinCode: startB.body.joinCode,
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(
      joined.statusCode === 200 && joined.body.countSessionId === sessionId,
      'second free-form counter assumes Count B through the invite',
    );

    const second = await makeCapture('count_b');
    const applyB = await call(countCapturesApplyToCount, {
      financeEntityId: entityId,
      captureId: second.captureId,
      expectedCaptureVersion: second.version,
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(applyB.statusCode === 200 && applyB.body.status === 'matched', 'reviewed free-form Count B uses canonical comparison and matches');
    const afterB = (await sessionRef.get()).data() || {};
    verify(afterB.countB?.sourceProvenance === 'free_form_note', 'Count B preserves free-form provenance');
    verify(afterB.comparison?.matched === true, 'Count A/B comparison remains canonical');

    const wrongEntity = await call(countFreeFormCapturesStart, {
      financeEntityId: otherEntityId,
      countSessionId: sessionId,
      locale: 'PT',
      originalContentType: 'image/jpeg',
      originalSize: 100,
      originalSha256: 'a'.repeat(64),
      normalizedContentType: 'image/jpeg',
      normalizedSize: 100,
      normalizedSha256: 'b'.repeat(64),
      idempotencyKey: token('idem'),
      requestId: token('req'),
    });
    verify(wrongEntity.statusCode === 404, 'free-form session binding cannot cross finance entities');

    const transactions = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journals = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregates = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(transactions.empty && journals.empty && aggregates.empty, 'free-form Count creates no transaction, journal or balance aggregate');

    const audits = await db.collection('organizations').doc(orgId).collection('financeAuditLogs').get();
    verify(audits.docs.some((doc: any) => doc.data()?.action === 'count.first_count_imported_from_reviewed_note'), 'Count A free-form provenance is auditable');
    verify(audits.docs.some((doc: any) => doc.data()?.action === 'count.second_count_imported_from_reviewed_note'), 'Count B free-form provenance is auditable');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
    delete (globalThis as any)[STORAGE_SYMBOL];
    delete (globalThis as any)[PROVIDER_SYMBOL];
  }

  console.log('\nCount Free-Form Note Emulator totals: ' + passed + ' Passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
