import * as crypto from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import countPaperFormsGenerate from '../server/vercel-handlers/finance/countPaperFormsGenerate.js';
import countPaperFormsDetail from '../server/vercel-handlers/finance/countPaperFormsDetail.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(data: any) {
    this.body = data;
    return this;
  }
}

async function run() {
  process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('❌ Count Paper emulator tests require FIRESTORE_EMULATOR_HOST');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const verify = (condition: boolean, message: string) => {
    if (!condition) {
      failed += 1;
      console.error(`❌ ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    passed += 1;
    console.log(`✅ ${message}`);
  };

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const orgId = `org_countpaper_${crypto.randomBytes(4).toString('hex')}`;
  const entityA = `ent_a_${crypto.randomBytes(4).toString('hex')}`;
  const entityB = `ent_b_${crypto.randomBytes(4).toString('hex')}`;
  const uid = `usr_countpaper_${crypto.randomBytes(4).toString('hex')}`;
  const sessionId = `cnt_${crypto.randomBytes(12).toString('hex')}`;
  const emptySessionId = `cnt_${crypto.randomBytes(12).toString('hex')}`;

  await db.collection('organizations').doc(orgId).set({ name: 'Count Paper Emulator Org', status: 'active' });
  await db.collection('users').doc(uid).set({ displayName: 'Count Paper User', systemRole: 'ceo' });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).set({ name: 'Entity A', active: true });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB).set({ name: 'Entity B', active: true });

  const sessionsRef = db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityA)
    .collection('countSessions');

  await sessionsRef.doc(sessionId).set({
    id: sessionId,
    organizationId: orgId,
    financeEntityId: entityA,
    serviceLabel: 'Culto Folha Count',
    serviceDate: '2026-08-14',
    status: 'counting_a',
    countA: {
      entries: [
        { type: 'tithe', method: 'total', totalCents: 12500 },
        { type: 'offering', method: 'total', totalCents: 8300 },
      ],
      totalCents: 20800,
    },
    version: 2,
  });
  await sessionsRef.doc(emptySessionId).set({
    id: emptySessionId,
    organizationId: orgId,
    financeEntityId: entityA,
    serviceLabel: 'Culto sem primeira contagem',
    serviceDate: '2026-08-14',
    status: 'counting_a',
    countA: { entries: [], totalCents: 0 },
    version: 1,
  });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({
    uid,
    email: `${uid}@test.com`,
    mn_organization_id: orgId,
  }) as any;

  async function call(handler: any, body: any) {
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer count_paper_emulator_token',
        'x-organization-id': orgId,
      },
      body,
      query: {},
    };
    const res = new MockRes();
    await handler(req as any, res as any);
    return res;
  }

  const randomKey = () => `idpaper_${crypto.randomBytes(12).toString('hex')}`;
  const randomRequest = () => `req_${crypto.randomBytes(12).toString('hex')}`;

  try {
    const generateAKey = randomKey();
    const generateABody = {
      financeEntityId: entityA,
      countSessionId: sessionId,
      stage: 'count_a',
      locale: 'PT',
      idempotencyKey: generateAKey,
      requestId: randomRequest(),
    };
    const generatedA = await call(countPaperFormsGenerate, generateABody);
    verify(generatedA.statusCode === 200 && /^cpf_[a-f0-9]{16}$/.test(generatedA.body.formId), 'generates an opaque official Count A paper form');
    verify(generatedA.body.totalCents === undefined && generatedA.body.entries === undefined, 'generation response contains no Count material');

    const retriedA = await call(countPaperFormsGenerate, { ...generateABody, requestId: randomRequest() });
    verify(retriedA.statusCode === 200 && retriedA.body.formId === generatedA.body.formId, 'paper generation is idempotent for the same key/payload');

    const formsRef = db
      .collection('organizations')
      .doc(orgId)
      .collection('financeEntities')
      .doc(entityA)
      .collection('countPaperForms');
    const storedA = await formsRef.doc(generatedA.body.formId).get();
    const storedAData = storedA.data() || {};
    verify(storedA.exists && storedAData.stage === 'count_a' && storedAData.templateVersion === 1, 'paper form is persisted below the selected finance entity');
    const qrA = JSON.parse(storedAData.qrPayload);
    verify(JSON.stringify(Object.keys(qrA)) === JSON.stringify(['formId', 'templateVersion', 'checksum']), 'persisted QR payload has only opaque identity/version/checksum');
    verify(!/(organizationId|financeEntityId|countSessionId|totalCents|12500|8300|20800)/.test(storedAData.qrPayload), 'persisted QR payload cannot reveal tenant ids or Count values');
    verify(storedAData.countA === undefined && storedAData.countB === undefined && storedAData.entries === undefined && storedAData.totalCents === undefined, 'paper record persists no Count A/B financial material');

    const detailA = await call(countPaperFormsDetail, { financeEntityId: entityA, formId: generatedA.body.formId });
    verify(detailA.statusCode === 200 && detailA.body.form.formId === generatedA.body.formId, 'paper detail resolves through canonical entity scope');
    verify(detailA.body.form.organizationId === undefined && detailA.body.form.financeEntityId === undefined, 'paper detail DTO does not expose tenant identifiers');
    verify(detailA.body.form.qrPayload === storedAData.qrPayload, 'paper detail returns the integrity-checked QR payload');

    const crossDetail = await call(countPaperFormsDetail, { financeEntityId: entityB, formId: generatedA.body.formId });
    verify(crossDetail.statusCode === 404, 'paper form cannot be read through another finance entity');

    const crossGenerate = await call(countPaperFormsGenerate, {
      ...generateABody,
      financeEntityId: entityB,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(crossGenerate.statusCode === 404, 'paper form cannot be generated from another entity session id');

    const bNotReady = await call(countPaperFormsGenerate, {
      financeEntityId: entityA,
      countSessionId: emptySessionId,
      stage: 'count_b',
      locale: 'PT',
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(bNotReady.statusCode === 400 && bNotReady.body.error === 'COUNT_PAPER_SECOND_COUNT_NOT_READY', 'Count B paper requires first-count evidence');

    const generatedB = await call(countPaperFormsGenerate, {
      financeEntityId: entityA,
      countSessionId: sessionId,
      stage: 'count_b',
      locale: 'EN',
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(generatedB.statusCode === 200 && generatedB.body.stage === 'count_b', 'generates blind Count B paper after Count A evidence exists');
    const storedB = (await formsRef.doc(generatedB.body.formId).get()).data() || {};
    verify(!/(12500|8300|20800)/.test(String(storedB.qrPayload)) && storedB.countA === undefined, 'Count B paper embeds no Count A value');

    await sessionsRef.doc(sessionId).update({ status: 'counting_b', version: 3 });
    const lateA = await call(countPaperFormsGenerate, {
      ...generateABody,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(lateA.statusCode === 400 && lateA.body.error === 'COUNT_PAPER_INVALID_STATE', 'new Count A paper is blocked after blind Count B starts');

    const duringBlindB = await call(countPaperFormsGenerate, {
      financeEntityId: entityA,
      countSessionId: sessionId,
      stage: 'count_b',
      locale: 'ES',
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(duringBlindB.statusCode === 200, 'Count B paper can still be issued during the blind Count B stage');

    const transactionDocs = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journalDocs = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregateDocs = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(transactionDocs.empty && journalDocs.empty && aggregateDocs.empty, 'Count Paper H3A creates no transactions, journals or aggregates');

    const audits = await db.collection('organizations').doc(orgId).collection('financeAuditLogs').where('action', '==', 'count.paper_form_issued').get();
    verify(!audits.empty, 'paper issuance is auditable');
    verify(audits.docs.every((doc: any) => doc.data()?.metadata?.financialMaterialEmbedded === false && doc.data()?.metadata?.totalCents === undefined), 'paper audit metadata remains financial-material free');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }

  console.log(`\nCount Paper Firestore Emulator totals: ${passed} Passed, ${failed} Failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
