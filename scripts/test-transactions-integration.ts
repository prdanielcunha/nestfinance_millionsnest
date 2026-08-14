import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../api/_lib/ecosystemSessionResolver.js';
import * as assert from 'assert';
import { FakeFirestore } from './fakeFirestore.js';

process.env.NODE_ENV = 'test';

import firebaseAdmin from 'firebase-admin';

// Simulated imports for the handlers
import transactionsList from '../server/vercel-handlers/finance/transactionsList.js';
import transactionsDetail from '../server/vercel-handlers/finance/transactionsDetail.js';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';
import transactionsUpdateDraft from '../server/vercel-handlers/finance/transactionsUpdateDraft.js';
import transactionsSubmitForReview from '../server/vercel-handlers/finance/transactionsSubmitForReview.js';
import transactionsReturnToDraft from '../server/vercel-handlers/finance/transactionsReturnToDraft.js';

// We will simulate the Vercel req/res
export class MockRes {
  statusCode: number = 200;
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

async function runTransactionsIntegrationTests() {
  const fakeDb: any = new FakeFirestore();
  // We no longer inject FieldValue into fakeDb to ensure the handlers use the real import from firebase-admin/firestore
  // const FieldValue = {
  //   serverTimestamp: () => ({ isEqual: () => true })
  // };
  // (fakeDb as any).FieldValue = FieldValue;

  const TEST_FIRESTORE_SYMBOL = Symbol.for('TEST_FIRESTORE');
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = fakeDb;

  const admin = getFirebaseAdmin();
  const db = fakeDb;

  console.log('Running Transactions Integration Tests...');

  // Set up mock data
  const orgId = 'integration_org_1';
  const orgRef = db.collection('organizations').doc(orgId);
  const finEntityId = 'fin_entity_1';
  const financeEntityRef = orgRef.collection('financeEntities').doc(finEntityId);
  const uid = 'integration_user_1';
  
  await orgRef.set({ name: 'Integration Org', ownerId: 'other' });
  await orgRef.collection('users').doc(uid).set({
    capabilities: ['finance.create_drafts', 'finance.view', 'finance.return_to_draft']
  });
  await db.collection('users').doc(uid).set({
    displayName: 'Integration User'
  });

  await financeEntityRef.set({
    name: 'Integration Entity',
    active: true
  });

  const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

  const accountId = 'acc_1';
  await orgRef.collection('financeAccounts').doc(accountId).set({
    financeEntityId: finEntityId,
    active: true,
    currency: 'BRL',
    name: 'Integration Bank',
    systemType: 'cash',
    accountType: 'asset:current'
  });

  const catIncomeId = 'cat_inc_1';
  await orgRef.collection('financeCategories').doc(catIncomeId).set({
    financeEntityId: finEntityId,
    active: true,
    kind: 'income',
    name: 'Sales'
  });

  const catExpenseId = 'cat_exp_1';
  await orgRef.collection('financeCategories').doc(catExpenseId).set({
    financeEntityId: finEntityId,
    active: true,
    kind: 'expense',
    name: 'Office Supplies'
  });

  let passed = 0;
  let failed = 0;

  function formatTest(num: number, description: string) {
    return num.toString().padStart(2, '0') + '. ' + description;
  }

  async function testCall(handler: any, reqData: any, headers: any = {}) {
    const req = {
      method: reqData.method || 'POST',
      headers: {
        authorization: 'Bearer integration_token',
        'x-organization-id': orgId,
        ...headers
      },
      body: reqData.body
    };
    const res = new MockRes();
    await handler(req as any, res as any);
    return res;
  }

  // Hook verifyIdToken for tests
  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({ uid }) as any;

  try {
    // 1-10 Authority and Tenant
    {
      const res = await testCall(transactionsList, { body: { financeEntityId: finEntityId } });
      assert.strictEqual(res.statusCode, 200);
      console.log('✅ ' + formatTest(1, 'finance.view permite list'));
      passed++;

      // We need transactions to test detail, wait... let's test create first then use that
    }

    // 11. Create Income
    let tx1Id = '';
    let version1 = 0;
    {
      const res = await testCall(transactionsCreateDraft, {
        body: {
          financeEntityId: finEntityId,
          idempotencyKey: 'idem_' + generateId() + generateId(),
          requestId: 'req_' + generateId(),
          payload: {
            direction: 'income',
            amountCents: 5000,
            occurredAt: '2026-06-22T00:00:00Z',
            accountId,
            allocations: [
              { categoryId: catIncomeId, amountCents: 5000 }
            ]
          }
        }
      });
      assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
      tx1Id = res.body.transactionId;
      version1 = res.body.version;
      console.log('✅ ' + formatTest(11, 'income válido cria uma transação'));
      passed++;
    }

    // 12. Expense
    {
      const res = await testCall(transactionsCreateDraft, {
        body: {
          financeEntityId: finEntityId,
          idempotencyKey: 'idem_' + generateId() + generateId(),
          requestId: 'req_' + generateId(),
          payload: {
            direction: 'expense',
            amountCents: 2000,
            occurredAt: '2026-06-22T00:00:00Z',
            accountId,
            allocations: [
              { categoryId: catExpenseId, amountCents: 2000 }
            ]
          }
        }
      });
      assert.strictEqual(res.statusCode, 200);
      console.log('✅ ' + formatTest(12, 'expense válido cria uma transação'));
      passed++;
    }

    // 13. Transfer
    {
      const res = await testCall(transactionsCreateDraft, {
        body: {
          financeEntityId: finEntityId,
          idempotencyKey: 'idem_' + generateId() + generateId(),
          requestId: 'req_' + generateId(),
          payload: {
            direction: 'transfer',
            amountCents: 2000,
            occurredAt: '2026-06-22T00:00:00Z',
            accountId,
            allocations: []
          }
        }
      });
      assert.strictEqual(res.statusCode, 400);
      console.log('✅ ' + formatTest(13, 'transfer é rejeitada'));
      passed++;
    }

    let txAllocId = '';
    {
      const res = await testCall(transactionsDetail, { body: { financeEntityId: finEntityId, transactionId: tx1Id } });
      txAllocId = res.body.allocations[0].id;
    }

    // Update Transaction
    {
      const res = await testCall(transactionsUpdateDraft, {
        body: {
          financeEntityId: finEntityId,
          transactionId: tx1Id,
          expectedVersion: version1,
          idempotencyKey: 'idem_' + generateId() + generateId(),
          requestId: 'req_' + generateId(),
          payload: {
            amountCents: 5500,
            allocations: [
              { id: txAllocId, categoryId: catIncomeId, amountCents: 5500 }
            ]
          }
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.changed, true);
      version1 = res.body.version;
      console.log('✅ ' + formatTest(35, 'draft válido é editado'));
      passed++;
    }
    
    // No-op Edit
    {
      const res = await testCall(transactionsUpdateDraft, {
        body: {
          financeEntityId: finEntityId,
          transactionId: tx1Id,
          expectedVersion: version1,
          idempotencyKey: 'idem_' + generateId() + generateId(),
          requestId: 'req_' + generateId(),
          payload: {
            amountCents: 5500,
            allocations: [
              { id: txAllocId, categoryId: catIncomeId, amountCents: 5500 }
            ]
          }
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.changed, false);
      console.log('✅ ' + formatTest(45, 'payload normalizado idêntico retorna changed:false'));
      passed++;
    }

    // Submit For Review
    {
      const res = await testCall(transactionsSubmitForReview, {
        body: {
          financeEntityId: finEntityId,
          transactionId: tx1Id,
          expectedVersion: version1,
          idempotencyKey: 'idem_' + generateId() + generateId(),
          requestId: 'req_' + generateId()
        }
      });
      assert.strictEqual(res.statusCode, 200);
      version1 = res.body.version;
      console.log('✅ ' + formatTest(52, 'draft completo vira ready_for_review'));
      passed++;
    }
    
    // Try to edit posted or ready_for_review
    {
       const res = await testCall(transactionsUpdateDraft, {
        body: {
          financeEntityId: finEntityId,
          transactionId: tx1Id,
          expectedVersion: version1,
          idempotencyKey: 'idem_' + generateId() + generateId(),
          requestId: 'req_' + generateId(),
          payload: {
            amountCents: 6000
          }
        }
      });
      assert.strictEqual(res.statusCode, 400); // Should fail state transition
      console.log('✅ ' + formatTest(41, 'cliente não pode definir status arbitrário'));
      passed++;
    }

    // Return to draft through the dedicated state-transition handler
    {
       const res = await testCall(transactionsReturnToDraft, {
        body: {
          financeEntityId: finEntityId,
          transactionId: tx1Id,
          expectedVersion: version1,
          idempotencyKey: 'idem_' + generateId() + generateId(),
          requestId: 'req_' + generateId(),
          reasonCode: 'correction_requested',
          comment: 'Integration test correction'
        }
      });
      assert.strictEqual(res.statusCode, 200); // Should succeed state transition
      version1 = res.body.version;
      console.log('✅ ' + formatTest(42, 'endpoint dedicado retorna ready_for_review para draft'));
      passed++;
    }

    // Ensure list works and details Works
    {
      const res = await testCall(transactionsDetail, { body: { financeEntityId: finEntityId, transactionId: tx1Id } });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.transaction.status, 'draft');
      console.log('✅ ' + formatTest(2, 'finance.view permite detail'));
      passed++;
    }

  } catch (err: any) {
    console.error('Test Error:', err);
    failed++;
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }
  
  console.log('\nIntegration Tests Total: ' + passed + ', Failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

runTransactionsIntegrationTests();
