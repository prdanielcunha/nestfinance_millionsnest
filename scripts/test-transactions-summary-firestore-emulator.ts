import assert from 'assert';
import crypto from 'crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import transactionsSummary from '../server/vercel-handlers/finance/transactionsSummary.js';
import { buildTransactionListQueryKeys } from '../shared/finance/ledger/listQueryKeys.js';

process.env.NODE_ENV = 'test';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is required');
  }

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;

  const suffix = crypto.randomBytes(4).toString('hex');
  const organizationId = `org_summary_${suffix}`;
  const financeEntityId = `entity_summary_${suffix}`;
  const uid = `user_summary_${suffix}`;
  const occurredAt = '2026-08-14T10:00:00.000Z';

  await db.collection('organizations').doc(organizationId).set({ name: 'Summary Test Org' });
  await db.collection('users').doc(uid).set({ displayName: 'Summary Tester', systemRole: 'ceo' });
  await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).set({
    name: 'Summary Entity',
    active: true,
  });

  async function seedTransaction(id: string, status: 'draft' | 'ready_for_review' | 'approved_for_posting', returned = false) {
    const listQueryKeys = buildTransactionListQueryKeys(financeEntityId, id, 'income', status, occurredAt);
    await db.collection('organizations').doc(organizationId).collection('financeTransactions').doc(id).set({
      id,
      organizationId,
      financeEntityId,
      transactionKind: 'income',
      direction: 'income',
      cashFlowDirection: 'inflow',
      amountCents: 1000,
      currency: 'BRL',
      occurredAt,
      status,
      version: 1,
      listQueryKeys,
      ...(returned ? {
        returnedToDraftAt: new Date('2026-08-14T11:00:00.000Z'),
        returnedToDraftReason: 'correction_requested',
        returnedToDraftComment: 'Ajustar comprovante',
      } : {}),
    });
  }

  await seedTransaction('draft_simple_1', 'draft');
  await seedTransaction('draft_simple_2', 'draft');
  await seedTransaction('draft_returned_1', 'draft', true);
  await seedTransaction('review_1', 'ready_for_review');
  await seedTransaction('review_2', 'ready_for_review');
  await seedTransaction('approved_1', 'approved_for_posting');

  // Noise from another finance entity must never leak into the summary.
  const otherEntity = `${financeEntityId}_other`;
  await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(otherEntity).set({ active: true });
  const otherKeys = buildTransactionListQueryKeys(otherEntity, 'other_draft', 'income', 'draft', occurredAt);
  await db.collection('organizations').doc(organizationId).collection('financeTransactions').doc('other_draft').set({
    organizationId,
    financeEntityId: otherEntity,
    transactionKind: 'income',
    direction: 'income',
    amountCents: 9999,
    currency: 'BRL',
    occurredAt,
    status: 'draft',
    version: 1,
    listQueryKeys: otherKeys,
  });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async (_token: string, checkRevoked?: boolean) => ({
    uid,
    mn_organization_id: organizationId,
    checkRevoked,
  }) as any;

  try {
    const req: any = {
      method: 'POST',
      headers: {
        authorization: 'Bearer summary-test-token',
        'x-organization-id': organizationId,
      },
      query: {},
      body: {
        financeEntityId,
        requestId: 'req_summary_exact_counts',
      },
    };
    const res = new MockRes();
    await transactionsSummary(req, res as any);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.summary, {
      returnedCorrections: 1,
      simpleDrafts: 2,
      readyForReview: 2,
      approvedForPosting: 1,
      totalOpen: 6,
    });
    assert.strictEqual(res.body.requestId, 'req_summary_exact_counts');
    console.log('✅ Today summary returns exact counts and isolates the requested finance entity');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }
}

run().catch((error) => {
  console.error('❌ Transactions summary Emulator test failed', error);
  process.exit(1);
});
