import * as crypto from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import countCapturesApplyToCount from '../server/vercel-handlers/finance/countCapturesApplyToCount.js';
import countSessionsJoinSecondCount from '../server/vercel-handlers/finance/countSessionsJoinSecondCount.js';
import { buildCountPaperIdentity } from '../server/vercel-handlers/finance/countPaperHelpers.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers: Record<string, string> = {};
  status(code: number) { this.statusCode = code; return this; }
  json(data: any) { this.body = data; return this; }
  setHeader(name: string, value: string) { this.headers[name] = value; return this; }
}

async function run() {
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Paper-first apply test requires Firestore Emulator');

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const suffix = crypto.randomBytes(4).toString('hex');
  const orgId = 'org_paperapply_' + suffix;
  const entityA = 'ent_paper_a_' + suffix;
  const entityB = 'ent_paper_b_' + suffix;
  const uidA = 'usr_paper_a_' + suffix;
  const uidB = 'usr_paper_b_' + suffix;

  await db.collection('organizations').doc(orgId).set({ name: 'Paper First Org', status: 'active' });
  await db.collection('users').doc(uidA).set({ displayName: 'Paper First A', systemRole: 'ceo' });
  await db.collection('users').doc(uidB).set({ displayName: 'Paper First B', systemRole: 'ceo' });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).set({ name: 'Entity A', active: true });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB).set({ name: 'Entity B', active: true });

  const originalVerify = admin.auth.verifyIdToken;
  let activeUid = uidA;
  admin.auth.verifyIdToken = async () => ({
    uid: activeUid,
    name: activeUid === uidA ? 'Paper First A' : 'Paper First B',
    email: activeUid + '@test.com',
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: orgId,
    mn_session_version: 1,
  }) as any;

  const callHandler = async (handler: any, body: any) => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer paper_apply_test', 'x-organization-id': orgId },
      body,
      query: {},
    };
    const res = new MockRes();
    await handler(req as any, res as any);
    return res;
  };

  const call = async (body: any) => {
    return callHandler(countCapturesApplyToCount, body);
  };

  const joinSecond = async (body: any) => callHandler(countSessionsJoinSecondCount, body);

  const randomKey = () => 'idpaperapply_' + crypto.randomBytes(12).toString('hex');
  const randomRequest = () => 'req_' + crypto.randomBytes(12).toString('hex');
  const entitiesRef = db.collection('organizations').doc(orgId).collection('financeEntities');

  const reviewedFields = (offering = 40000) => [
    { key: 'tithe', decision: 'corrected', valueCents: 30000, candidateValueCents: null, candidateState: 'unresolved' },
    { key: 'offering', decision: 'corrected', valueCents: offering, candidateValueCents: null, candidateState: 'unresolved' },
    { key: 'other_income', decision: 'corrected', valueCents: 5000, candidateValueCents: null, candidateState: 'unresolved' },
    { key: 'pix', decision: 'corrected', valueCents: 12000, candidateValueCents: null, candidateState: 'unresolved' },
  ];

  async function seedReviewedPaper(input: {
    sessionId: string;
    stage: 'count_a' | 'count_b';
    captureId: string;
    formId: string;
    offering?: number;
  }) {
    const identity = buildCountPaperIdentity({
      organizationId: orgId,
      financeEntityId: entityA,
      countSessionId: input.sessionId,
      formId: input.formId,
      stage: input.stage,
      locale: 'PT',
    });
    const entityRef = entitiesRef.doc(entityA);
    await entityRef.collection('countPaperForms').doc(input.formId).set({
      id: input.formId,
      organizationId: orgId,
      financeEntityId: entityA,
      countSessionId: input.sessionId,
      serviceLabel: 'Culto Paper First',
      serviceDate: '2026-09-19',
      stage: input.stage,
      locale: 'PT',
      templateVersion: identity.templateVersion,
      checksum: identity.checksum,
      qrPayload: identity.qrPayload,
      status: 'issued',
    });
    await entityRef.collection('countCaptures').doc(input.captureId).set({
      id: input.captureId,
      organizationId: orgId,
      financeEntityId: entityA,
      formId: input.formId,
      countSessionId: input.sessionId,
      stage: input.stage,
      templateVersion: identity.templateVersion,
      checksum: identity.checksum,
      status: 'reviewed',
      version: 3,
      review: { fields: reviewedFields(input.offering) },
      candidates: [],
    });
  }

  let passed = 0;
  const verify = (condition: unknown, message: string) => {
    if (!condition) throw new Error('Assertion failed: ' + message);
    passed += 1;
    console.log('✅ ' + message);
  };

  try {
    const sessionA = 'cnt_' + crypto.randomBytes(12).toString('hex');
    const formA = 'cpf_' + crypto.randomBytes(8).toString('hex');
    const captureA = 'cpc_' + crypto.randomBytes(12).toString('hex');
    const sessionRef = entitiesRef.doc(entityA).collection('countSessions').doc(sessionA);
    await sessionRef.set({
      id: sessionA,
      organizationId: orgId,
      financeEntityId: entityA,
      serviceLabel: 'Culto Paper First',
      serviceDate: '2026-09-19',
      status: 'counting_a',
      policySnapshot: { doubleCountRequired: true, source: 'safe_default_v1', policyVersion: 1 },
      version: 1,
    });
    await seedReviewedPaper({ sessionId: sessionA, stage: 'count_a', captureId: captureA, formId: formA });

    const applyKey = randomKey();
    const appliedA = await call({
      financeEntityId: entityA,
      captureId: captureA,
      expectedCaptureVersion: 3,
      idempotencyKey: applyKey,
      requestId: randomRequest(),
    });
    verify(appliedA.statusCode === 200 && appliedA.body.stage === 'count_a' && appliedA.body.replayed === false, 'reviewed Count A paper applies once');

    const firstDoc = (await sessionRef.get()).data() || {};
    verify(firstDoc.status === 'counting_a' && firstDoc.version === 2, 'paper Count A keeps safe first-count state');
    verify(firstDoc.countA?.entries?.length === 4 && firstDoc.countA?.totalCents === 87000, 'paper Count A fills all four reviewed categories');
    verify(firstDoc.countA?.entries?.find((entry: any) => entry.type === 'tithe')?.totalCents === 30000, 'paper Count A preserves tithe value');
    verify(firstDoc.countA?.entries?.find((entry: any) => entry.type === 'offering')?.totalCents === 40000, 'paper Count A preserves offering value');
    verify(firstDoc.countA?.source === 'count_capture' && firstDoc.countA?.sourceCaptureId === captureA, 'Count A stores paper evidence lineage');
    verify(firstDoc.countA?.countedByUid === null && firstDoc.countA?.enteredByUid === uidA, 'paper counter identity is not falsely inferred from authenticated typist');

    const captureAfterA = (await entitiesRef.doc(entityA).collection('countCaptures').doc(captureA).get()).data() || {};
    verify(captureAfterA.appliedToCount?.countSessionId === sessionA && captureAfterA.appliedToCount?.stage === 'count_a', 'capture stores immutable application lineage');

    const replayA = await call({
      financeEntityId: entityA,
      captureId: captureA,
      expectedCaptureVersion: 3,
      idempotencyKey: applyKey,
      requestId: randomRequest(),
    });
    verify(replayA.statusCode === 200 && replayA.body.replayed === true, 'paper apply retry is material-free and idempotent');
    const afterReplay = (await sessionRef.get()).data() || {};
    verify(afterReplay.version === 2, 'paper retry does not mutate Count A twice');

    const crossEntity = await call({
      financeEntityId: entityB,
      captureId: captureA,
      expectedCaptureVersion: 3,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(crossEntity.statusCode === 404, 'paper capture cannot cross finance entities');

    const joinCode = '7K4M9P2XQH';
    const joinCodeHash = crypto.createHash('sha256').update(joinCode).digest('hex');
    await sessionRef.update({
      status: 'counting_b',
      version: 3,
      policySnapshot: {
        doubleCountRequired: true,
        requireIndependentCounter: true,
        source: 'safe_default_v2',
        policyVersion: 2,
      },
      secondCountInviteRequired: true,
      secondCountInviteCodeHash: joinCodeHash,
      secondCountInviteCode: joinCode,
      secondCountInviteExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      secondCountStartedByUid: uidA,
      secondCountStartedByLabel: 'Paper First A',
    });
    await entitiesRef.doc(entityA).collection('countSecondInvites').doc(joinCodeHash).set({
      organizationId: orgId,
      financeEntityId: entityA,
      countSessionId: sessionA,
      codeHash: joinCodeHash,
      createdByUid: uidA,
      createdByLabel: 'Paper First A',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      claimedByUid: null,
      claimedByLabel: null,
      claimedAt: null,
    });

    const samePersonJoin = await joinSecond({
      financeEntityId: entityA,
      joinCode,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(
      samePersonJoin.statusCode === 403 && samePersonJoin.body.error === 'COUNT_INDEPENDENT_COUNTER_REQUIRED',
      'paper Count B cannot be assumed by the first accountable user',
    );

    activeUid = uidB;
    const joined = await joinSecond({
      financeEntityId: entityA,
      joinCode,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(
      joined.statusCode === 200 && joined.body.countSessionId === sessionA,
      'second paper counter assumes the blind session through the invite',
    );

    const assignedSession = (await sessionRef.get()).data() || {};
    verify(
      assignedSession.secondCountAssignedToUid === uidB && assignedSession.version === 4,
      'second-counter assignment is bound to the verified second identity',
    );

    const formB = 'cpf_' + crypto.randomBytes(8).toString('hex');
    const captureB = 'cpc_' + crypto.randomBytes(12).toString('hex');
    await seedReviewedPaper({ sessionId: sessionA, stage: 'count_b', captureId: captureB, formId: formB });

    const appliedB = await call({
      financeEntityId: entityA,
      captureId: captureB,
      expectedCaptureVersion: 3,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(appliedB.statusCode === 200 && appliedB.body.status === 'matched', 'matching reviewed Count B paper completes double count');
    const matchedDoc = (await sessionRef.get()).data() || {};
    verify(matchedDoc.status === 'matched' && matchedDoc.countB?.totalCents === 87000, 'paper Count B is sealed into canonical session');
    verify(matchedDoc.comparison?.matched === true, 'paper Count B uses canonical comparison semantics');

    const sessionD = 'cnt_' + crypto.randomBytes(12).toString('hex');
    const divergentRef = entitiesRef.doc(entityA).collection('countSessions').doc(sessionD);
    await divergentRef.set({
      id: sessionD,
      organizationId: orgId,
      financeEntityId: entityA,
      serviceLabel: 'Culto Divergente',
      serviceDate: '2026-09-19',
      status: 'counting_b',
      countA: {
        entries: [
          { type: 'tithe', channel: 'cash', method: 'total', totalCents: 30000, denominations: {} },
          { type: 'offering', channel: 'cash', method: 'total', totalCents: 40000, denominations: {} },
          { type: 'other', channel: 'cash', method: 'total', totalCents: 5000, denominations: {} },
          { type: 'pix', channel: 'pix', method: 'total', totalCents: 12000, denominations: {} },
        ],
        totalCents: 87000,
        countedByUid: null,
        enteredByUid: uidA,
        enteredByLabel: 'Paper First A',
      },
      policySnapshot: {
        doubleCountRequired: true,
        requireIndependentCounter: true,
        source: 'safe_default_v2',
        policyVersion: 2,
      },
      secondCountInviteRequired: true,
      secondCountAssignedToUid: uidB,
      secondCountAssignedToLabel: 'Paper First B',
      version: 2,
    });
    const formD = 'cpf_' + crypto.randomBytes(8).toString('hex');
    const captureD = 'cpc_' + crypto.randomBytes(12).toString('hex');
    await seedReviewedPaper({ sessionId: sessionD, stage: 'count_b', captureId: captureD, formId: formD, offering: 40100 });

    const divergent = await call({
      financeEntityId: entityA,
      captureId: captureD,
      expectedCaptureVersion: 3,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(divergent.statusCode === 200 && divergent.body.status === 'divergent', 'paper Count B never hides a real difference');
    const divergentDoc = (await divergentRef.get()).data() || {};
    verify(divergentDoc.comparison?.differences?.length === 1 && divergentDoc.comparison.differences[0]?.type === 'offering', 'paper divergence identifies the exact category only after seal');
    const signals = await db.collection('intelligenceSignals').get();
    const divergenceSignal = signals.docs.map((doc: any) => doc.data()).find((signal: any) =>
      signal.organizationId === orgId &&
      signal.financeEntityId === entityA &&
      signal.entityType === 'count_session' &&
      signal.entityId === sessionD &&
      signal.signalType === 'COUNT_DIVERGENCE_REVIEW_REQUIRED'
    );
    verify(divergenceSignal?.status === 'open', 'paper divergence opens the normal human-review attention signal');

    const audits = await db.collection('organizations').doc(orgId).collection('financeAuditLogs').get();
    const actions = audits.docs.map((doc: any) => doc.data()?.action);
    verify(actions.includes('count.first_count_imported_from_reviewed_sheet'), 'paper Count A application is auditable');
    verify(actions.includes('count.second_count_imported_from_reviewed_sheet'), 'paper Count B application is auditable');
    verify(actions.includes('count.capture_applied_to_count'), 'capture-to-count lineage is auditable');

    const transactions = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journals = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregates = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(transactions.empty && journals.empty && aggregates.empty, 'paper-first flow creates no transaction, journal entry, or balance aggregate');

    const facts = await db.collection('intelligenceFacts').get();
    const paperFacts = facts.docs.map((doc: any) => doc.data()).filter((fact: any) =>
      fact.organizationId === orgId &&
      [sessionA, sessionD].includes(fact.entityId)
    );
    verify(paperFacts.every((fact: any) => fact.payload?.totalCents === undefined), 'paper Count facts never duplicate sensitive amounts');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }

  console.log('\nCount Paper-First Apply Firestore Emulator totals: ' + passed + ' Passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
