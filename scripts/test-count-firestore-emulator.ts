import * as crypto from 'crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import countSessionsList from '../server/vercel-handlers/finance/countSessionsList.js';
import countSessionsCreate from '../server/vercel-handlers/finance/countSessionsCreate.js';
import countSessionsDetail from '../server/vercel-handlers/finance/countSessionsDetail.js';
import countSessionsSaveFirstCount from '../server/vercel-handlers/finance/countSessionsSaveFirstCount.js';

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

    const sessionDoc = await db
      .collection('organizations')
      .doc(orgId)
      .collection('financeEntities')
      .doc(entityA)
      .collection('countSessions')
      .doc(sessionId)
      .get();
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

    const saveKey = randomKey();
    const saveBody = {
      financeEntityId: entityA,
      countSessionId: sessionId,
      expectedVersion: 1,
      entries: [
        {
          type: 'tithe',
          method: 'denominations',
          totalCents: 999999,
          denominations: { '10000': 2, '5000': 1, '200': 3 },
        },
        { type: 'offering', method: 'total', totalCents: 12345 },
        { type: 'pix', method: 'total', totalCents: 6789 },
      ],
      idempotencyKey: saveKey,
      requestId: randomRequest(),
    };
    const saved = await call(countSessionsSaveFirstCount, saveBody);
    verify(saved.statusCode === 200 && saved.body.version === 2, 'first Count save advances optimistic version');
    verify(saved.body.entries.find((entry: any) => entry.type === 'tithe')?.totalCents === 25600, 'server recomputes denomination total instead of trusting client subtotal');
    verify(saved.body.totalCents === 44734, 'server computes deterministic first-count grand total');

    const afterSave = await db
      .collection('organizations')
      .doc(orgId)
      .collection('financeEntities')
      .doc(entityA)
      .collection('countSessions')
      .doc(sessionId)
      .get();
    verify(afterSave.data()?.countA?.countedByUid === uid, 'countedByUid is persisted explicitly');
    verify(afterSave.data()?.countA?.enteredByUid === uid, 'enteredByUid is persisted as a distinct field');
    verify(afterSave.data()?.status === 'counting_a', 'saving Count A does not close or advance the session');

    const retriedSave = await call(countSessionsSaveFirstCount, { ...saveBody, requestId: randomRequest() });
    verify(retriedSave.statusCode === 200 && retriedSave.body.version === 2 && retriedSave.body.totalCents === 44734, 'ambiguous first-count retry returns the same idempotent result');

    const staleSave = await call(countSessionsSaveFirstCount, {
      ...saveBody,
      idempotencyKey: randomKey(),
      requestId: randomRequest(),
    });
    verify(staleSave.statusCode === 409 && staleSave.body.error === 'COUNT_VERSION_CONFLICT', 'new stale write is rejected by expectedVersion');

    const transactionDocs = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journalDocs = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregateDocs = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(transactionDocs.empty && journalDocs.empty && aggregateDocs.empty, 'Count H1 creates no transactions, journal entries or aggregates');

    const audits = await db.collection('organizations').doc(orgId).collection('financeAuditLogs').get();
    const actions = audits.docs.map((doc: any) => doc.data()?.action);
    verify(actions.includes('count.session_created') && actions.includes('count.first_count_saved'), 'Count create/save actions are auditable');
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
