import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import createDrafts from '../server/vercel-handlers/finance/countVerificationsCreateProposedDrafts.js';
import previewDrafts from '../server/vercel-handlers/finance/countVerificationsProposalPreview.js';
import receivedIncomeSummary from '../server/vercel-handlers/finance/receivedIncomeSummary.js';

/**
 * Count v3 -> finance draft integration with the real Firestore emulator.
 * All identifiers and amounts are synthetic. No credential or live database use.
 */
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_PROJECT_ID?.includes('emulator')) {
  throw new Error('Isolated Firestore emulator required for Count v3 draft E2E');
}

class MockRes {
  statusCode = 200;
  body: any = null;
  headers: Record<string, string> = {};
  setHeader(name: string, value: string) { this.headers[name] = value; return this; }
  status(value: number) { this.statusCode = value; return this; }
  json(value: any) { this.body = value; return this; }
}

async function run() {
  const previousFlag = process.env.NESTFINANCE_COUNT_V3_ENABLED;
  process.env.NESTFINANCE_COUNT_V3_ENABLED = 'true';
  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const suffix = randomBytes(4).toString('hex');
  const org = 'org_countv3_draft_' + suffix;
  const entity = 'entity_countv3_draft_' + suffix;
  const otherEntity = 'entity_other_' + suffix;
  const uid = 'user_countv3_draft_' + suffix;
  const sessionId = 'cnt_' + randomBytes(12).toString('hex');
  const account = 'acc_cash_' + suffix;
  const bank = 'acc_bank_' + suffix;
  const foreign = 'acc_foreign_' + suffix;
  const category = 'cat_income_' + suffix;
  const orgRef = db.collection('organizations').doc(org);
  const entityRef = orgRef.collection('financeEntities').doc(entity);
  const sessionRef = entityRef.collection('countVerificationSessions').doc(sessionId);
  const originalVerify = admin.auth.verifyIdToken;

  await orgRef.set({ name: 'Synthetic Count v3 Organization', status: 'active' });
  await db.collection('users').doc(uid).set({ displayName: 'Synthetic Reviewer', systemRole: 'ceo' });
  await entityRef.set({ name: 'Church A', active: true });
  await orgRef.collection('financeEntities').doc(otherEntity).set({ name: 'Church B', active: true });
  for (const [id, type, target] of [
    [account, 'cash', entity],
    [bank, 'bank_checking', entity],
    [foreign, 'bank_checking', otherEntity],
  ]) {
    await orgRef.collection('financeAccounts').doc(id).set({
      financeEntityId: target, name: id, type, nature: 'asset', active: true,
    });
  }
  await orgRef.collection('financeCategories').doc(category).set({
    financeEntityId: entity, name: 'Receitas de culto', kind: 'income', active: true,
  });

  const countLines = [
    { purpose: 'tithe', receiptMethod: 'cash', amountCents: 15000, classificationSource: 'explicit' },
    { purpose: 'offering', receiptMethod: 'pix', amountCents: 7500, classificationSource: 'explicit' },
  ];
  const confirmed = (id: string) => ({
    verificationId: 'verification_' + id, mode: 'independent',
    operatorUid: id, independentCounterUid: id,
    lines: countLines, controlTotalCents: 22500,
  });
  await sessionRef.set({
    id: sessionId, organizationId: org, financeEntityId: entity,
    serviceLabel: 'Culto sintético', serviceDate: '2026-10-16', version: 5,
    status: 'matched', recountCycle: 0,
    policySnapshot: { minimumIndependentConfirmations: 2, maximumParticipants: 20 },
    confirmations: [confirmed('first'), confirmed('second')],
    treasuryReview: {
      status: 'accepted', sourceVersion: 4, reviewedByUid: uid,
      countTotalCents: 22500, schemaVersion: 1,
    },
  });

  admin.auth.verifyIdToken = async () => ({
    uid, name: 'Synthetic Reviewer', email: uid + '@example.test',
    mn_app_id: 'nestfinance', mn_handoff_version: 1,
    mn_organization_id: org, mn_session_version: 1,
  }) as any;

  async function call(handler: any, payload: Record<string, unknown>) {
    const request: any = {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic-emulator-token', 'x-organization-id': org },
      query: {}, body: { ...payload, requestId: 'req_' + randomBytes(12).toString('hex') },
    };
    const response = new MockRes();
    await handler(request, response as any);
    return response;
  }
  const key = () => 'idcountv3draft_' + randomBytes(12).toString('hex');
  const selections = [
    { purpose: 'tithe', receiptMethod: 'cash', accountId: account, categoryId: category },
    { purpose: 'offering', receiptMethod: 'pix', accountId: bank, categoryId: category, receivedDate: '2026-10-15' },
  ];
  const body = (selected: any[], idempotencyKey: string, financeEntityId = entity) => ({
    financeEntityId, countSessionId: sessionId, expectedVersion: 5,
    selections: selected, idempotencyKey,
  });

  try {
    const preview = await call(previewDrafts, { financeEntityId: entity, countSessionId: sessionId });
    assert.equal(preview.statusCode, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.preview.sourceReviewTotalCents, 22500);
    assert.equal(preview.body.preview.lines.length, 2);
    assert.equal(preview.body.preview.alreadyCreated, false);

    const wrongAccount = await call(createDrafts,
      body([{ ...selections[0], accountId: foreign }, selections[1]], key()));
    assert.equal(wrongAccount.statusCode, 400, JSON.stringify(wrongAccount.body));
    assert.equal(wrongAccount.body.error, 'FINANCE_ACCOUNT_MISMATCH');
    const wrongEntity = await call(createDrafts, body(selections, key(), otherEntity));
    assert.equal(wrongEntity.statusCode, 404, JSON.stringify(wrongEntity.body));
    assert.equal((await orgRef.collection('financeTransactions').get()).size, 0);

    const first = await call(createDrafts, body(selections, key()));
    assert.equal(first.statusCode, 200, JSON.stringify(first.body));
    assert.equal(first.body.transactionIds.length, 2);
    assert.equal(first.body.replayed, false);

    const stored = await sessionRef.get();
    assert.equal(stored.data()?.version, 6);
    assert.equal(stored.data()?.countProposal?.sourceVersion, 5);
    assert.equal(stored.data()?.countProposal?.transactionIds.length, 2);
    assert.equal(typeof stored.data()?.countProposal?.selectionHash, 'string');

    const ids = first.body.transactionIds as string[];
    const snapshots = await Promise.all(ids.map(id => orgRef.collection('financeTransactions').doc(id).get()));
    assert.deepEqual(snapshots.map(doc => doc.data()?.amountCents).sort((a,b) => a-b), [7500, 15000]);
    assert.ok(snapshots.every(doc => doc.data()?.status === 'ready_for_review'));
    assert.ok(snapshots.every(doc => doc.data()?.countSource?.countSessionId === sessionId));
    assert.ok(snapshots.every(doc => !doc.data()?.journalEntryId && !doc.data()?.postedAt));
    const pix = snapshots.find(doc => doc.data()?.paymentMethod === 'pix')?.data();
    assert.equal(pix?.occurredAt, '2026-10-15T12:00:00.000Z');
    assert.equal(pix?.countSource?.serviceDate, '2026-10-16');
    assert.equal(pix?.countSource?.receivedDate, '2026-10-15');
    const receipt = await call(receivedIncomeSummary, { financeEntityId: entity, startDate: '2026-10-15', endDate: '2026-10-15' });
    assert.equal(receipt.statusCode, 200, JSON.stringify(receipt.body));
    assert.equal(receipt.body.pendingCents, 7500);
    assert.equal(receipt.body.confirmedCents, 0);
    assert.equal(receipt.body.pendingByMethod.pix, 7500);
    const serviceDay = await call(receivedIncomeSummary, { financeEntityId: entity, startDate: '2026-10-16', endDate: '2026-10-16' });
    assert.equal(serviceDay.statusCode, 200, JSON.stringify(serviceDay.body));
    assert.equal(serviceDay.body.pendingCents, 15000);
    assert.equal(serviceDay.body.pendingByMethod.cash, 15000);
    const otherReceipts = await call(receivedIncomeSummary, { financeEntityId: otherEntity, startDate: '2026-10-15', endDate: '2026-10-16' });
    assert.equal(otherReceipts.statusCode, 200, JSON.stringify(otherReceipts.body));
    assert.equal(otherReceipts.body.pendingCents, 0);
    const unauthenticated = new MockRes();
    await receivedIncomeSummary({ method: 'POST', headers: {}, query: {}, body: { financeEntityId: entity, startDate: '2026-10-15', endDate: '2026-10-16' } } as any, unauthenticated as any);
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal((await orgRef.collection('financeAllocations').get()).size, 2);
    assert.equal((await orgRef.collection('financeJournalEntries').get()).size, 0);
    assert.equal((await orgRef.collection('financeAggregates').get()).size, 0);

    // A distinct idempotency key for the SAME selected mapping is a safe replay.
    const retried = await call(createDrafts, body(selections, key()));
    assert.equal(retried.statusCode, 200, JSON.stringify(retried.body));
    assert.equal(retried.body.replayed, true);
    assert.deepEqual(retried.body.transactionIds, ids);
    // A distinct key MUST NOT acknowledge a different mapping as if saved.
    const altered = await call(createDrafts, body([
      selections[0], { ...selections[1], accountId: account },
    ], key()));
    assert.equal(altered.statusCode, 409, JSON.stringify(altered.body));
    assert.equal(altered.body.error, 'COUNT_PROPOSAL_ALREADY_CREATED_WITH_DIFFERENT_SELECTIONS');
    const changedDate = await call(createDrafts, body([selections[0], { ...selections[1], receivedDate: '2026-10-16' }], key()));
    assert.equal(changedDate.statusCode, 409, JSON.stringify(changedDate.body));
    assert.equal((await orgRef.collection('financeTransactions').get()).size, 2);
    assert.equal((await orgRef.collection('financeJournalEntries').get()).size, 0);

    const after = await call(previewDrafts, { financeEntityId: entity, countSessionId: sessionId });
    assert.equal(after.statusCode, 200, JSON.stringify(after.body));
    assert.equal(after.body.preview.alreadyCreated, true);
    assert.deepEqual(after.body.preview.transactionIds, ids);
    console.log('✅ Count v3 emulator E2E: reviewed evidence, exact mapping, isolation, atomic drafts, no posting, safe replay and conflict');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
    if (previousFlag === undefined) delete process.env.NESTFINANCE_COUNT_V3_ENABLED;
    else process.env.NESTFINANCE_COUNT_V3_ENABLED = previousFlag;
  }
}
run().catch(error => { console.error('Count v3 draft emulator failure', error); process.exitCode = 1; });
