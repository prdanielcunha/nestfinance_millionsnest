import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../api/_lib/ecosystemSessionResolver.js';
import * as assert from 'assert';
import { FakeFirestore } from './fakeFirestore.js';
import admin from 'firebase-admin';
import { buildTransactionListQueryKeys } from '../shared/finance/ledger/listQueryKeys.js';

// Import our target gateway handler
import gatewayHandler from '../api/finance-gateway.js';

process.env.NODE_ENV = 'test';

class MockRes {
  statusCode: number = 200;
  body: any = null;
  headers: Record<string, string> = {};

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(data: any) {
    this.body = data;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name] = value;
    return this;
  }
}

async function runGatewayTests() {
  console.log('Starting Hardened Finance Gateway Integration Tests...\n');

  const fakeDb: any = new FakeFirestore();
  const TEST_FIRESTORE_SYMBOL = Symbol.for('TEST_FIRESTORE');
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = fakeDb;

  const adminInst = getFirebaseAdmin();
  const authInstance = adminInst.auth;
  const originalVerifyInstance = authInstance.verifyIdToken;

  // Hook verifyIdToken for tests
  let mockUid = 'user_gateway_1';
  authInstance.verifyIdToken = async () => ({ uid: mockUid }) as any;

  // Setup basic orgs, entities, and users
  const org1Id = 'org_alpha';
  const org2Id = 'org_beta';
  const entity1Id = 'ent_1';
  const entity2Id = 'ent_2';

  // Org 1 Data
  await fakeDb.collection('organizations').doc(org1Id).set({ name: 'Organization Alpha', ownerId: 'other' });
  await fakeDb.collection('organizations').doc(org1Id).collection('users').doc(mockUid).set({
    capabilities: ['finance.view', 'finance.review', 'finance.create_drafts']
  });
  await fakeDb.collection('organizations').doc(org1Id).collection('financeEntities').doc(entity1Id).set({
    name: 'Finance Entity Alpha 1',
    active: true
  });

  // Org 2 Data
  await fakeDb.collection('organizations').doc(org2Id).set({ name: 'Organization Beta', ownerId: 'other' });
  await fakeDb.collection('organizations').doc(org2Id).collection('financeEntities').doc(entity2Id).set({
    name: 'Finance Entity Beta 1',
    active: true
  });
  // Note: mockUid is NOT a member of Org 2

  // Global collections
  await fakeDb.collection('users').doc(mockUid).set({ displayName: 'Gateway User' });

  // Add an account in Org 1
  const accountId = 'acc_1';
  await fakeDb.collection('organizations').doc(org1Id).collection('financeAccounts').doc(accountId).set({
    financeEntityId: entity1Id,
    active: true,
    currency: 'BRL',
    name: 'Cash Safe',
    systemType: 'cash',
    accountType: 'asset:current'
  });

  let passed = 0;
  let failed = 0;

  function runAssert(desc: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`✅ ${desc}`);
      passed++;
    } catch (e: any) {
      console.log(`❌ ${desc} - FAILED:`, e.message);
      failed++;
    }
  }

  async function runAssertAsync(desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✅ ${desc}`);
      passed++;
    } catch (e: any) {
      console.log(`❌ ${desc} - FAILED:`, e.message);
      failed++;
    }
  }

  // 1. Empty List Returns 200 and Empty Array
  await runAssertAsync('Lista vazia real retorna 200 e array vazio', async () => {
    const req = {
      method: 'POST',
      query: { operation: 'transactions-list' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.items, []);
  });

  // 2. Add item with ready_for_review status
  const txId = 'tx_review_1';
  const mockTimestamp = (iso: string) => ({
    toDate: () => new Date(iso),
    isEqual: () => true
  });

  const listQueryKeys = buildTransactionListQueryKeys(entity1Id, txId, 'income', 'ready_for_review', '2026-06-24T18:00:00Z');

  await fakeDb.collection('organizations').doc(org1Id).collection('financeTransactions').doc(txId).set({
    id: txId,
    financeEntityId: entity1Id,
    status: 'ready_for_review',
    amountCents: 1500,
    direction: 'income',
    occurredAt: mockTimestamp('2026-06-24T18:00:00Z'),
    createdAt: mockTimestamp('2026-06-24T18:00:00Z'),
    version: 1,
    accountId,
    accountSnapshot: { name: 'Cash Safe' },
    listQueryKeys
  });

  // Add allocation for it
  await fakeDb.collection('organizations').doc(org1Id).collection('financeAllocations').doc('alloc_1').set({
    transactionId: txId,
    financeEntityId: entity1Id,
    amountCents: 1500,
    categoryId: 'cat_inc_1',
    categorySnapshot: { name: 'Sales' },
    sequence: 1
  });

  // 3. List with items ready_for_review returns 200
  await runAssertAsync('Lista com item ready_for_review retorna 200', async () => {
    const req = {
      method: 'POST',
      query: { operation: 'transactions-list' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        filters: { status: 'ready_for_review' }
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.items.length, 1);
    assert.strictEqual(res.body.items[0].status, 'ready_for_review');
  });

  // 4. Operation Inexistente
  await runAssertAsync('Operation inexistente retorna erro correto', async () => {
    const req = {
      method: 'POST',
      query: { operation: 'non-existent-op' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {}
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.error, 'ROUTE_NOT_FOUND');
  });

  // 5. Entidade Inválida Rejeitada
  await runAssertAsync('Entidade inválida é rejeitada', async () => {
    const req = {
      method: 'POST',
      query: { operation: 'transactions-list' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: 'invalid_entity_id'
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.error, 'NOT_FOUND');
  });

  // 6. Entidade de Outra Organização Rejeitada (Ataque Cross-Org)
  await runAssertAsync('Entidade de outra organização é rejeitada', async () => {
    const req = {
      method: 'POST',
      query: { operation: 'transactions-list' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org2Id // User is NOT a member of Org 2
      },
      body: {
        financeEntityId: entity2Id
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FORBIDDEN');
  });

  // 7. Capability Ausente é Rejeitada
  await runAssertAsync('Capability ausente é rejeitada', async () => {
    // Mock user with zero capabilities in Org 1
    await fakeDb.collection('organizations').doc(org1Id).collection('users').doc(mockUid).set({
      capabilities: []
    });

    const req = {
      method: 'POST',
      query: { operation: 'transactions-list' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FORBIDDEN');

    // Restore capabilities
    await fakeDb.collection('organizations').doc(org1Id).collection('users').doc(mockUid).set({
      capabilities: ['finance.view', 'finance.review', 'finance.create_drafts']
    });
  });

  // 8. Firestore Indisponível Retorna Erro Coerente
  await runAssertAsync('Firestore indisponível retorna erro SERVICE_UNAVAILABLE', async () => {
    // Intercept database call temporarily
    const originalCollection = fakeDb.collection;
    fakeDb.collection = () => {
      throw new Error('Firestore is down / Timeout');
    };

    const req = {
      method: 'POST',
      query: { operation: 'transactions-list' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id,
        'x-vercel-id': 'req_error_test_123'
      },
      body: {
        financeEntityId: entity1Id
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    
    // Restore
    fakeDb.collection = originalCollection;

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.error, 'SERVICE_UNAVAILABLE');
    assert.strictEqual(res.body.details.requestId, 'req_error_test_123');
  });

  // 9. Detalhe Válido Retorna 200
  await runAssertAsync('Detalhe válido retorna 200', async () => {
    const req = {
      method: 'POST',
      query: { operation: 'transactions-detail' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: txId
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.transaction.id, txId);
  });

  // 10. Detalhe de Outra Entidade Rejeitado
  await runAssertAsync('Detalhe de outra entidade é rejeitado', async () => {
    const req = {
      method: 'POST',
      query: { operation: 'transactions-detail' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: 'some_other_id' // Does not exist inside Org 1 entity1Id, hence NOT_FOUND
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 404);
  });

  // Restore verification hook
  authInstance.verifyIdToken = originalVerifyInstance;

  console.log(`\nGateway Integration Totals: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
}

runGatewayTests();
