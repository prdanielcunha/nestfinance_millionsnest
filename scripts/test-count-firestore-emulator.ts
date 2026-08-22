import * as crypto from 'crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import countSessionsList from '../server/vercel-handlers/finance/countSessionsList.js';
import countSessionsCreate from '../server/vercel-handlers/finance/countSessionsCreate.js';
import countSessionsDetail from '../server/vercel-handlers/finance/countSessionsDetail.js';
import countSessionsSaveFirstCount from '../server/vercel-handlers/finance/countSessionsSaveFirstCount.js';
import countSessionsStartSecondCount from '../server/vercel-handlers/finance/countSessionsStartSecondCount.js';
import countSessionsSubmitSecondCount from '../server/vercel-handlers/finance/countSessionsSubmitSecondCount.js';
import countSessionsStartRecount from '../server/vercel-handlers/finance/countSessionsStartRecount.js';
import countSessionsSubmitRecount from '../server/vercel-handlers/finance/countSessionsSubmitRecount.js';

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
    console.error('❌ Count emulator tests require FIRESTORE_EMULATOR_HOST');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const verify = (condition: boolean, message: string) => {
    if (!condition) {
      failed++;
      console.error(`❌ ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    passed++;
    console.log(`✅ ${message}`);
  };

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const orgId = `org_count_${crypto.randomBytes(4).toString('hex')}`;
  const entityA = `ent_a_${crypto.randomBytes(4).toString('hex')}`;
  const entityB = `ent_b_${crypto.randomBytes(4).toString('hex')}`;
  const uid = `usr_count_${crypto.randomBytes(4).toString('hex')}`;

  await db.collection('organizations').doc(orgId).set({ name: 'Count Emulator Org', status: 'active' });
  await db.collection('users').doc(uid).set({ displayName: 'Count Emulator User', systemRole: 'ceo' });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).set({ name: 'Entity A', active: true });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB).set({ name: 'Entity B', active: true });

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
        authorization: 'Bearer count_emulator_token',
        'x-organization-id': orgId,
      },
      body,
      query: {},
    };
    const res = new MockRes();
    await handler(req as any, res as any);
    return res;
  }

  const randomKey = () => `idcount_${crypto.randomBytes(12).toString('hex')}`;
  const randomRequest = () => `req_${crypto.randomBytes(12).toString('hex')}`;

  try {
    const empty = await call(countSessionsList, { financeEntityId: entityA });
    verify(empty.statusCode === 200 && empty.body.items.length === 0, 'Count A starts with empty entity-scoped list');

    const createKey = randomKey();
    const createBody = {
      financeEntityId: entityA,
      serviceLabel: 'Culto piloto',
      serviceDate: '2026-08-14',
      idempotencyKey: createKey,
      requestId: randomRequest(),
    };
    const created = await call(countSessionsCreate, createBody);
    verify(created.statusCode === 200 && /^cnt_[a-f0-9]{24}$/.test(created.body.sessionId), 'creates a Count session with opaque id');
    const sessionId = created.body.sessionId;
    verify(created.body.version === 1 && created.body.status === 'counting_a', 'new Count session is version 1 and counting_a');

    const retriedCreate = await call(countSessionsCreate, { ...createBody, requestId: randomRequest() });
    verify(retriedCreate.statusCode === 200 && retriedCreate.body.sessionId === sessionId, 'create retry with same idempotency key returns same Count session');

    const sessionRef = db
      .collection('organizations')
      .doc(orgId)
      .collection('financeEntities')
      .doc(entityA)
      .collection('countSessions')
      .doc(sessionId);
    const sessionDoc = await sessionRef.get();
    verify(sessionDoc.exists, 'Count session persisted below the requested finance entity');
    verify(sessionDoc.data()?.policySnapshot?.doubleCountRequired === true, 'session snapshot requires second count by safe default');
    verify(sessionDoc.data()?.policySnapshot?.source === 'safe_default_v1', 'session stores explicit safe-default policy source');

    const listed = await call(countSessionsList, { financeEntityId: entityA });
    verify(listed.statusCode === 200 && listed.body.items.some((item: any) => item.id === sessionId), 'entity A lists its Count session');
    const otherList = await call(countSessionsList, { financeEntityId: entityB });
    verify(otherList.statusCode === 200 && !otherList.body.items.some((item: any) => item.id === sessionId), 'entity B list cannot see entity A Count session');

    const detail = await call(countSessionsDetail, { financeEntityId: entityA, countSessionId: sessionId });
    verify(detail.statusCode === 200 && detail.body.session.id === sessionId, 'Count detail resolves inside entity A');
    const crossDetail = await call(countSessionsDetail, { financeEntityId: entityB, countSessionId: sessionId });
    verify(crossDetail.statusCode === 404, 'same Count session id cannot be read through entity B');

    const firstEntries = [
      {
        type: 'tithe',
        method: 'denominations',
        totalCents: 999999,
        denominations: { '10000': 2, '5000': 1, '200': 3 },
      },
      { type: 'offering', method: 'total', totalCents: 12345 },
      { type: 'pix', method: 'total', totalCents: 6789 },
    ];
    const saveKey = randomKey();
    const saveBody = {
      financeEntityId: entityA,
      countSessionId: sessionId,
      expectedVersion: 1,
      entries: firstEntries,
      idempotencyKey: saveKey,
      requestId: randomRequest(),
    };
    const saved = await call(countSessionsSaveFirstCount, saveBody);
    verify(saved.statusCode === 200 && saved.body.version === 2, 'first Count save advances optimistic version');
    verify(saved.body.totalCents === undefined && saved.body.entries === undefined, 'first-count mutation response keeps idempotency cache material-free');

    const afterSave = await sessionRef.get();
    verify(afterSave.data()?.countA?.entries?.find((entry: any) => entry.type === 'tithe')?.totalCents === 25600, 'server recomputes denomination total instead of trusting client subtotal');
    verify(afterSave.data()?.countA?.totalCents === 44734, 'server computes deterministic first-count grand total');
    verify(afterSave.data()?.countA?.countedByUid === uid, 'countedByUid is persisted explicitly');
    verify(afterSave.data()?.countA?.enteredByUid === uid, 'enteredByUid is persisted as a distinct field');
    verify(afterSave.data()?.status === 'counting_a', 'saving Count A does not close or advance the session');

    const retriedSave = await call(countSessionsSaveFirstCount, { ...saveBody, requestId: randomRequest() });
    verify(retriedSave.statusCode === 200 && retriedSave.body.version === 2 && retriedSave.body.totalCents === undefined && retriedSave.body.entries === undefined, 'ambiguous first-count retry remains material-free');

    const staleSave = await call(countSessionsSaveFirstCount, {
      ...saveBody,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(staleSave.statusCode === 409 && staleSave.body.error === 'COUNT_VERSION_CONFLICT', 'new stale first-count write is rejected by expectedVersion');

    const startSecondKey = randomKey();
    const startSecondBody = {
      financeEntityId: entityA,
      countSessionId: sessionId,
      expectedVersion: 2,
      idempotencyKey: startSecondKey,
      requestId: randomRequest(),
    };
    const secondStarted = await call(countSessionsStartSecondCount, startSecondBody);
    verify(secondStarted.statusCode === 200 && secondStarted.body.version === 3 && secondStarted.body.status === 'counting_b', 'explicit transition starts blind Count B');
    const secondStartedRetry = await call(countSessionsStartSecondCount, { ...startSecondBody, requestId: randomRequest() });
    verify(secondStartedRetry.statusCode === 200 && secondStartedRetry.body.version === 3, 'second-count start is idempotent');

    const blindFirstSaveReplay = await call(countSessionsSaveFirstCount, { ...saveBody, requestId: randomRequest() });
    verify(blindFirstSaveReplay.statusCode === 200 && blindFirstSaveReplay.body.totalCents === undefined && blindFirstSaveReplay.body.entries === undefined, 'replaying Count A idempotency key during blind Count B cannot recover Count A material');

    const blindDetail = await call(countSessionsDetail, { financeEntityId: entityA, countSessionId: sessionId });
    verify(blindDetail.statusCode === 200 && blindDetail.body.session.materialHidden === true, 'Count detail marks material hidden during Count B');
    verify(blindDetail.body.session.countA === null && blindDetail.body.session.countB === null && blindDetail.body.session.comparison === null, 'Count B detail does not leak Count A/B material or comparison values');
    const blindList = await call(countSessionsList, { financeEntityId: entityA });
    const blindItem = blindList.body.items.find((item: any) => item.id === sessionId);
    verify(blindItem?.materialHidden === true && blindItem?.firstCountTotalCents === null && blindItem?.firstCountEntryTypes.length === 0, 'Count home list does not leak first-count totals or entry types during blind Count B');

    const crossSecondSubmit = await call(countSessionsSubmitSecondCount, {
      financeEntityId: entityB,
      countSessionId: sessionId,
      expectedVersion: 3,
      entries: [{ type: 'offering', method: 'total', totalCents: 1 }],
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(crossSecondSubmit.statusCode === 404, 'Count B cannot be submitted through another finance entity');

    const secondKey = randomKey();
    const secondEntries = [
      { type: 'tithe', method: 'total', totalCents: 25600 },
      { type: 'offering', method: 'total', totalCents: 12445 },
      { type: 'pix', method: 'total', totalCents: 6789 },
    ];
    const secondBody = {
      financeEntityId: entityA,
      countSessionId: sessionId,
      expectedVersion: 3,
      entries: secondEntries,
      idempotencyKey: secondKey,
      requestId: randomRequest(),
    };
    const secondSealed = await call(countSessionsSubmitSecondCount, secondBody);
    verify(secondSealed.statusCode === 200 && secondSealed.body.version === 4 && secondSealed.body.status === 'divergent' && secondSealed.body.matched === false, 'Count B seal compares and records divergent state');
    verify(secondSealed.body.comparison === undefined && secondSealed.body.totalCents === undefined && secondSealed.body.entries === undefined, 'second-count mutation response keeps idempotency cache free of A/B material');
    const secondRetry = await call(countSessionsSubmitSecondCount, { ...secondBody, requestId: randomRequest() });
    verify(secondRetry.statusCode === 200 && secondRetry.body.version === 4 && secondRetry.body.status === 'divergent' && secondRetry.body.comparison === undefined, 'ambiguous Count B retry remains material-free');

    const divergentDetail = await call(countSessionsDetail, { financeEntityId: entityA, countSessionId: sessionId });
    verify(divergentDetail.body.session.materialHidden === false && divergentDetail.body.session.countA?.totalCents === 44734 && divergentDetail.body.session.countB?.totalCents === 44834, 'sealed divergent detail may reveal both preserved counts');
    verify(divergentDetail.body.session.comparison?.differences?.length === 1 && divergentDetail.body.session.comparison.differences[0].type === 'offering' && divergentDetail.body.session.comparison.differences[0].deltaCents === 100, 'server identifies exact per-entry divergence in integer cents');

    const recountStartKey = randomKey();
    const recountStartBody = {
      financeEntityId: entityA,
      countSessionId: sessionId,
      expectedVersion: 4,
      idempotencyKey: recountStartKey,
      requestId: randomRequest(),
    };
    const recountStarted = await call(countSessionsStartRecount, recountStartBody);
    verify(recountStarted.statusCode === 200 && recountStarted.body.version === 5 && recountStarted.body.status === 'recounting' && recountStarted.body.attemptNumber === 1, 'divergence starts a numbered blind recount');
    const recountStartRetry = await call(countSessionsStartRecount, { ...recountStartBody, requestId: randomRequest() });
    verify(recountStartRetry.statusCode === 200 && recountStartRetry.body.version === 5 && recountStartRetry.body.attemptNumber === 1, 'recount start is idempotent');

    const blindSecondReplay = await call(countSessionsSubmitSecondCount, { ...secondBody, requestId: randomRequest() });
    verify(blindSecondReplay.statusCode === 200 && blindSecondReplay.body.comparison === undefined && blindSecondReplay.body.totalCents === undefined && blindSecondReplay.body.entries === undefined, 'replaying sealed Count B during blind recount cannot recover prior comparison material');

    const blindRecountDetail = await call(countSessionsDetail, { financeEntityId: entityA, countSessionId: sessionId });
    verify(blindRecountDetail.body.session.materialHidden === true && blindRecountDetail.body.session.countA === null && blindRecountDetail.body.session.countB === null, 'recount hides both original counts again');
    verify(blindRecountDetail.body.session.activeRecountAttemptNumber === 1 && blindRecountDetail.body.session.recountAttempts.length === 0, 'blind recount exposes only safe attempt metadata before seal');

    const recountKey = randomKey();
    const recountBody = {
      financeEntityId: entityA,
      countSessionId: sessionId,
      expectedVersion: 5,
      entries: [
        { type: 'tithe', method: 'total', totalCents: 25600 },
        { type: 'offering', method: 'total', totalCents: 12345 },
        { type: 'pix', method: 'total', totalCents: 6789 },
      ],
      idempotencyKey: recountKey,
      requestId: randomRequest(),
    };
    const recountSealed = await call(countSessionsSubmitRecount, recountBody);
    verify(recountSealed.statusCode === 200 && recountSealed.body.version === 6 && recountSealed.body.status === 'matched' && recountSealed.body.resolvedBy === 'recount_matches_a', 'recount resolves only when it matches preserved Count A or B');
    const recountRetry = await call(countSessionsSubmitRecount, { ...recountBody, requestId: randomRequest() });
    verify(recountRetry.statusCode === 200 && recountRetry.body.version === 6 && recountRetry.body.resolvedBy === 'recount_matches_a', 'sealed recount retry is idempotent');

    const finalDoc = await sessionRef.get();
    const finalData = finalDoc.data() || {};
    verify(finalData.status === 'matched' && finalData.countA?.totalCents === 44734 && finalData.countB?.totalCents === 44834, 'recount resolution never overwrites original A/B evidence');
    verify(Array.isArray(finalData.recountAttempts) && finalData.recountAttempts.length === 1 && finalData.recountAttempts[0]?.totalCents === 44734, 'sealed recount attempt is preserved as separate evidence');

    const staleRecount = await call(countSessionsSubmitRecount, {
      ...recountBody,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(staleRecount.statusCode === 400 && staleRecount.body.error === 'COUNT_INVALID_STATE', 'new write cannot mutate a resolved count session');

    const transactionDocs = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journalDocs = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregateDocs = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(transactionDocs.empty && journalDocs.empty && aggregateDocs.empty, 'Count H1/H2 creates no transactions, journal entries or aggregates');

    const audits = await db.collection('organizations').doc(orgId).collection('financeAuditLogs').get();
    const auditByAction = new Map(audits.docs.map((doc: any) => [doc.data()?.action, doc.data()]));
    const actions = [...auditByAction.keys()];
    verify(
      ['count.session_created', 'count.first_count_saved', 'count.second_count_started', 'count.second_count_sealed', 'count.recount_started', 'count.recount_sealed'].every((action) => actions.includes(action)),
      'Count H1/H2 transitions are auditable',
    );
    const firstAuditMetadata = auditByAction.get('count.first_count_saved')?.metadata || {};
    const secondAuditMetadata = auditByAction.get('count.second_count_sealed')?.metadata || {};
    verify(firstAuditMetadata.materialRedacted === true && firstAuditMetadata.totalCents === undefined, 'first-count audit metadata does not expose Count A amounts');
    verify(secondAuditMetadata.materialRedacted === true && secondAuditMetadata.differenceEntryTypes === undefined && secondAuditMetadata.totalCents === undefined, 'second-count audit metadata does not expose comparison material to a later blind recount');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }

  console.log(`\nCount Firestore Emulator totals: ${passed} Passed, ${failed} Failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
