import assert from 'assert';
import { FakeFirestore } from './fakeFirestore.js';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import transactionsPostingPlanPreview from '../server/vercel-handlers/finance/transactionsPostingPlanPreview.js';

process.env.NODE_ENV = 'test';

class MockRes {
  statusCode = 200;
  body: any = null;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(body: any) {
    this.body = body;
    return this;
  }
}

async function run() {
  console.log('Running PostingPlan entity isolation tests...');

  const db: any = new FakeFirestore();
  (globalThis as any)[Symbol.for('TEST_FIRESTORE')] = db;
  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();

  const orgId = 'org_posting_isolation';
  const uid = 'user_posting_isolation';
  const entityA = 'entity_a';
  const entityB = 'entity_b';

  await db.collection('organizations').doc(orgId).set({ name: 'Posting Isolation Org' });
  await db.collection('users').doc(uid).set({ displayName: 'Posting Tester', systemRole: 'ceo' });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA).set({ active: true, name: 'Entity A' });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB).set({ active: true, name: 'Entity B' });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

  async function call(financeEntityId: string, transactionId: string) {
    const req: any = {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'x-organization-id': orgId
      },
      body: {
        financeEntityId,
        transactionId,
        requestId: 'req_posting_isolation'
      },
      query: {}
    };
    const res = new MockRes();
    await transactionsPostingPlanPreview(req, res as any);
    return res;
  }

  let passed = 0;
  let failed = 0;

  try {
    const crossEntityTxId = 'tx_cross_entity';
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(crossEntityTxId).set({
      organizationId: orgId,
      financeEntityId: entityB,
      status: 'ready_for_review',
      version: 1
    });

    try {
      const res = await call(entityA, crossEntityTxId);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'FINANCE_ENTITY_MISMATCH');
      console.log('✅ transactionId de outra entidade é bloqueado antes do preview');
      passed++;
    } catch (error: any) {
      console.error('❌ transaction cross-entity: ' + error.message);
      failed++;
    }

    const allocationMismatchTxId = 'tx_allocation_mismatch';
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(allocationMismatchTxId).set({
      organizationId: orgId,
      financeEntityId: entityA,
      status: 'ready_for_review',
      version: 1
    });
    await db.collection('organizations').doc(orgId).collection('financeAllocations').doc('alloc_wrong_entity').set({
      organizationId: orgId,
      financeEntityId: entityB,
      transactionId: allocationMismatchTxId,
      categoryId: 'cat_test',
      amountCents: 100
    });

    try {
      const res = await call(entityA, allocationMismatchTxId);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'FINANCE_ENTITY_MISMATCH');
      console.log('✅ allocation de outra entidade é bloqueada antes do cálculo contábil');
      passed++;
    } catch (error: any) {
      console.error('❌ allocation cross-entity: ' + error.message);
      failed++;
    }
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }

  console.log(`\nPostingPlan Isolation Totals: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
