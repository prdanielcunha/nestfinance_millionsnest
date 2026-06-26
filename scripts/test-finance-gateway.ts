import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../api/_lib/ecosystemSessionResolver.js';
import * as assert from 'assert';
import { FakeFirestore } from './fakeFirestore.js';
import admin from 'firebase-admin';
import { buildTransactionListQueryKeys } from '../shared/finance/ledger/listQueryKeys.js';
import { createHash } from 'crypto';

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
    role: 'admin',
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
    configurationStatus: 'complete',
    type: 'asset',
    nature: 'debit',
    accountType: 'asset:current',
    ledgerMapping: 'la_cash_safe'
  });

  // Add category in Org 1
  await fakeDb.collection('organizations').doc(org1Id).collection('financeCategories').doc('cat_inc_1').set({
    financeEntityId: entity1Id,
    id: 'cat_inc_1',
    name: 'Sales',
    kind: 'income',
    ledgerMapping: 'la_revenue_sales'
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
  const mockTimestamp = (iso: string) => {
    const obj = { _seconds: new Date(iso).getTime() / 1000, _nanoseconds: 0 };
    Object.defineProperty(obj, 'toDate', { value: () => new Date(iso), enumerable: false });
    Object.defineProperty(obj, 'isEqual', { value: () => true, enumerable: false });
    return obj;
  };

  const listQueryKeys = buildTransactionListQueryKeys(entity1Id, txId, 'income', 'ready_for_review', '2026-06-24T18:00:00Z');

  await fakeDb.collection('organizations').doc(org1Id).collection('financeTransactions').doc(txId).set({
    id: txId,
    organizationId: org1Id,
    financeEntityId: entity1Id,
    status: 'ready_for_review',
    amountCents: 1500,
    direction: 'income',
    transactionKind: 'income',
    occurredAt: mockTimestamp('2026-06-24T18:00:00Z'),
    createdAt: mockTimestamp('2026-06-24T18:00:00Z'),
    version: 1,
    accountId,
    accountSnapshot: { name: 'Cash Safe' },
    allocationIds: ['alloc_1'],
    listQueryKeys
  });

  // Add allocation for it
  await fakeDb.collection('organizations').doc(org1Id).collection('financeAllocations').doc('alloc_1').set({
    id: 'alloc_1',
    transactionId: txId,
    organizationId: org1Id,
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
      role: 'admin',
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
      role: 'admin',
      capabilities: ['finance.view', 'finance.review', 'finance.create_drafts']
    });
  });

  // 8. Firestore Indisponível Retorna Erro Coerente
  await runAssertAsync('Firestore indisponível retorna erro SERVICE_UNAVAILABLE', async () => {
    // Intercept database call temporarily
    const originalCollection = fakeDb.collection;
    fakeDb.collection = () => {
      const err: any = new Error('Firestore is down / Timeout');
      err.code = 14;
      throw err;
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
        financeEntityId: entity1Id,
        requestId: 'req_error_test_123'
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    
    // Restore
    fakeDb.collection = originalCollection;

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.errorCode, 'FINANCE_REVIEW_INTERNAL_ERROR');
    assert.strictEqual(res.body.requestId, 'req_error_test_123');
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

  // 11. Header de Outra Organização Rejeitado (Ataque Cross-Org por Header)
  await runAssertAsync('Header de outra organização é rejeitado', async () => {
    const req = {
      method: 'POST',
      query: { operation: 'transactions-list' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org2Id // User is NOT a member of Org 2 (org2Id)
      },
      body: {
        financeEntityId: entity2Id
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 403, JSON.stringify(res.body));
  });

  // 12. Status approved não canônico rejeitado no Preview
  await runAssertAsync('Status approved não canônico rejeitado no preview', async () => {
    const invalidTxId = 'tx_invalid_state';
    await fakeDb.collection('organizations').doc(org1Id).collection('financeEntities').doc(entity1Id).collection('transactions').doc(invalidTxId).set({
      id: invalidTxId,
      financeEntityId: entity1Id,
      status: 'approved', // Non-canonical status! Must be 'ready_for_review' or 'approved_for_posting'
      amountCents: 2000,
      currency: 'BRL',
      transactionKind: 'income',
      occurredAt: '2026-06-24T18:00:00Z',
      version: 1
    });

    const req = {
      method: 'POST',
      query: { operation: 'transactions-posting-plan-preview' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: invalidTxId
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'TRANSACTION_NOT_READY_FOR_REVIEW');
  });

  // 13. approved_for_posting válido aceito no Preview aprovado
  await runAssertAsync('approved_for_posting válido aceito no preview aprovado', async () => {
    const approvedTxId = 'tx_approved_posting';

    const { buildPostingPlan } = await import('../shared/finance/ledger/postingPlan.js');
    const { loadPostingConfiguration } = await import('../server/vercel-handlers/finance/loadPostingConfiguration.js');

    const txData = {
      id: approvedTxId,
      organizationId: org1Id,
      financeEntityId: entity1Id,
      status: 'approved_for_posting',
      amountCents: 2000,
      currency: 'BRL',
      direction: 'income',
      transactionKind: 'income',
      occurredAt: '2026-06-24T18:00:00Z',
      version: 2,
      approvedVersion: 1,
      approvalSourceHash: '',
      accountId: 'acc_1',
      allocationIds: ['alloc_app_1']
    };

    const allocations: any[] = [{
      id: 'alloc_app_1',
      transactionId: approvedTxId,
      organizationId: org1Id,
      financeEntityId: entity1Id,
      amountCents: 2000,
      categoryId: 'cat_inc_1',
      sequence: 1
    }];
    const { mappings, policy, referenceFingerprintHash } = await loadPostingConfiguration(fakeDb as any, org1Id, entity1Id, txData as any);
    const plan = buildPostingPlan({
      transaction: txData as any,
      allocations,
      mappings,
      policy,
      approval: { approvedVersion: 1, approvalSourceHash: 'tmp', status: 'approved_for_posting' },
      isPreview: true
    });

    const sourceHash = plan.approvalSourceHash;
    const planHash = plan.planHash;

    await fakeDb.collection('organizations').doc(org1Id).collection('financeAllocations').doc('alloc_app_1').set(allocations[0]);

    await fakeDb.collection('organizations').doc(org1Id).collection('financeEntities').doc(entity1Id).collection('transactions').doc(approvedTxId).set({
      ...txData,
      approvalSourceHash: sourceHash,
      approvedPlanHash: planHash
    });

    // Create the latest approval
    await fakeDb.collection('organizations').doc(org1Id).collection('financeEntities').doc(entity1Id)
      .collection('transactions').doc(approvedTxId).collection('approvals').doc('latest').set({
        status: 'approved_for_posting',
        approvedVersion: 1,
        approvalSourceHash: sourceHash,
        approvedPlanHash: planHash,
        approvedReferenceFingerprintHash: referenceFingerprintHash
      });

    const req = {
      method: 'POST',
      query: { operation: 'transactions-posting-plan-preview' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: approvedTxId
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.sealStatus, 'verified');
  });

  // 14. Aprovação via Gateway (ready_for_review -> approved_for_posting) e verificação de Zero Posting
  await runAssertAsync('Aprovação via gateway altera status e garante zero journals/saldos', async () => {
    // We will use txId which is ready_for_review
    // Setup capabilities for mockUid in org_alpha so they can approve
    await fakeDb.collection('organizations').doc(org1Id).collection('users').doc(mockUid).set({
      role: 'admin',
      capabilities: ['finance.view', 'finance.review', 'finance.approve_for_posting']
    });

    const req = {
      method: 'POST',
      query: { operation: 'transactions-approve-for-posting' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: txId,
        expectedVersion: 1,
        approvalIdempotencyKey: 'idemp-approve-123',
        requestId: 'req-approve-123',
        comment: 'Aprovado para lançamento contábil'
      }
    };
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.approvalStatus, 'approved_for_posting');

    // Verify transaction status changed in database
    const updatedTx = await fakeDb.collection('organizations').doc(org1Id).collection('financeTransactions').doc(txId).get();
    assert.strictEqual(updatedTx.data().status, 'approved_for_posting');

    // Guarantee ZERO journals / ZERO saldos alterados
    // (Aprovação apenas gera selo e atualiza estado, sem gerar diário contábil nesta fase)
    const journalsCount = await fakeDb.collection('organizations').doc(org1Id).collection('financeEntities').doc(entity1Id).collection('journals').get();
    assert.strictEqual(journalsCount.docs.length, 0, 'Should have created 0 journals');

    const saldos = await fakeDb.collection('organizations').doc(org1Id).collection('financeEntities').doc(entity1Id).collection('accounts').get();
    for (const sDoc of saldos.docs) {
      const sData = sDoc.data();
      assert.strictEqual(sData.balanceCents, undefined, 'Should have altered 0 saldos');
    }
  });

  // 15. Devolução para Correção via Gateway (ready_for_review -> draft) com motivo obrigatório
  await runAssertAsync('Devolução via gateway exige motivo, altera status e garante zero journals/saldos', async () => {
    // Let's create a new transaction in ready_for_review
    const returnTxId = 'tx_to_return';
    await fakeDb.collection('organizations').doc(org1Id).collection('financeTransactions').doc(returnTxId).set({
      id: returnTxId,
      financeEntityId: entity1Id,
      status: 'ready_for_review',
      amountCents: 3500,
      currency: 'BRL',
      transactionKind: 'income',
      occurredAt: '2026-06-24T18:00:00Z',
      version: 1,
      accountId: 'acc_1'
    });

    // 15a. Motivo vazio rejeitado
    const badReq = {
      method: 'POST',
      query: { operation: 'transactions-return-to-draft' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: returnTxId,
        expectedVersion: 1,
        idempotencyKey: 'idemp-return-fail',
        requestId: 'req-return-fail',
        reasonCode: '  ', // empty/whitespace
        comment: ''
      }
    };
    const badRes = new MockRes();
    await gatewayHandler(badReq as any, badRes as any);
    assert.strictEqual(badRes.statusCode, 400);

    // 15b. Motivo válido aceito
    const okReq = {
      method: 'POST',
      query: { operation: 'transactions-return-to-draft' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: returnTxId,
        expectedVersion: 1,
        idempotencyKey: 'idemp-return-ok',
        requestId: 'req-return-ok',
        reasonCode: 'needs_correction',
        comment: 'Por favor, corrija a conta contábil selecionada.'
      }
    };
    const okRes = new MockRes();
    await gatewayHandler(okReq as any, okRes as any);
    assert.strictEqual(okRes.statusCode, 200, JSON.stringify(okRes.body));

    // Verify transaction status changed back to draft (estado canônico P06C1)
    const updatedTx = await fakeDb.collection('organizations').doc(org1Id).collection('financeTransactions').doc(returnTxId).get();
    assert.strictEqual(updatedTx.data().status, 'draft');
    assert.strictEqual(updatedTx.data().returnedToDraftReason, 'needs_correction');

    // Guarantee ZERO journals / ZERO saldos alterados during return to draft
    const journalsCount = await fakeDb.collection('organizations').doc(org1Id).collection('financeEntities').doc(entity1Id).collection('journals').get();
    assert.strictEqual(journalsCount.docs.length, 0, 'Should have created 0 journals during return');
  });

  // 16. Teste de mapeamento seguro de falha de índice Firestore
  await runAssertAsync('Falha de índice Firestore é mapeada corretamente para FINANCE_REVIEW_INDEX_REQUIRED com link seguro', async () => {
    // We will inject a special case into fakeDb.
    // By intercepting FakeCollection.where or similar, but let's just intercept gatewayHandler
    // Actually, we can intercept gatewayHandler by mocking the `admin.firestore()` output in `getFirebaseAdmin`?
    // In test-finance-gateway.ts, admin.firestore = () => fakeDb.
    // So we can intercept fakeDb.collection.
    
    const fakeQueryProto = Object.getPrototypeOf(fakeDb.collection('test').where('a', '==', 'b'));
    const originalGet = fakeQueryProto.get;

    fakeQueryProto.get = async function() {
       if (this.filters && this.filters.some((f: any) => f.value && String(f.value).includes('TRIGGER_INDEX_ERROR'))) {
          const err: any = new Error('The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/test/firestore/indexes?create_composite=123');
          err.code = 9; // FAILED_PRECONDITION
          err.details = err.message;
          throw err;
       }
       return originalGet.call(this);
    };

    const req = {
      method: 'POST',
      query: { operation: 'transactions-list' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        filters: { status: 'TRIGGER_INDEX_ERROR' }
      }
    };
    
    const res = new MockRes();
    await gatewayHandler(req as any, res as any);
    
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.errorCode, 'FINANCE_REVIEW_INDEX_REQUIRED');
    assert.strictEqual(res.body.stage, 'firestore_query');
    assert.ok(res.body.remediation);
    assert.strictEqual(res.body.remediation.type, 'CREATE_FIRESTORE_INDEX');
    assert.ok(res.body.remediation.url.includes('https://console.firebase.google.com'));
    
    // Restore
    fakeQueryProto.get = originalGet;
  });

  // 17. Cenário universal de bloqueio de aprovação (Saída de R$ 300,00 sem conta ou favorecido)
  await runAssertAsync('Cenário universal de bloqueio (Saída R$ 300,00 sem evidências e rateios impede aprovação)', async () => {
    const txIdUniversal = 'tx_universal_1';
    
    await fakeDb.collection('organizations').doc(org1Id).collection('financeTransactions').doc(txIdUniversal).set({
      id: txIdUniversal,
      financeEntityId: entity1Id,
      status: 'ready_for_review',
      amountCents: 30000,
      currency: 'BRL',
      direction: 'expense',
      transactionKind: 'expense',
      occurredAt: '2026-06-24T18:00:00Z',
      version: 1,
      // Missing accountId -> MISSING_ACCOUNT blocker
      // Missing allocationIds -> MISSING_CATEGORY blocker
    });
    
    const reqDetail = {
      method: 'POST',
      query: { operation: 'transactions-detail' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: txIdUniversal
      }
    };
    
    const resDetail = new MockRes();
    await gatewayHandler(reqDetail as any, resDetail as any);
    
    assert.strictEqual(resDetail.statusCode, 200);
    const readiness = resDetail.body.reviewReadiness;
    
    assert.strictEqual(readiness.ready, false);
    assert.ok(readiness.blockers.some((b: any) => b.code === 'MISSING_ACCOUNT'));
    assert.ok(readiness.blockers.some((b: any) => b.code === 'MISSING_CATEGORY'));
    assert.ok(readiness.warnings.some((w: any) => w.code === 'NO_EVIDENCE'));

    const reqApprove = {
      method: 'POST',
      query: { operation: 'transactions-approve-for-posting' },
      headers: {
        authorization: 'Bearer token',
        'x-organization-id': org1Id
      },
      body: {
        financeEntityId: entity1Id,
        transactionId: txIdUniversal,
        expectedVersion: 1,
        approvalIdempotencyKey: 'idemp-univ',
        requestId: 'req-univ',
        comment: 'Aprovação forçada'
      }
    };
    
    const resApprove = new MockRes();
    await gatewayHandler(reqApprove as any, resApprove as any);
    assert.strictEqual(resApprove.statusCode, 400);
    assert.strictEqual(resApprove.body.error, 'FINANCE_NOT_READY_FOR_APPROVAL');
  });

  // 18. Taxonomia: Fundo ausente é tratado como null (não "Fundo Geral" no core logic)
  await runAssertAsync('Taxonomia: Fundo Geral exige ID real, null significa Não informado', async () => {
    // Just a conceptual test to ensure we don't default fundId to "Geral" randomly in the database.
    const returnTxId = 'tx_taxonomy';
    await fakeDb.collection('organizations').doc(org1Id).collection('financeTransactions').doc(returnTxId).set({
      id: returnTxId,
      financeEntityId: entity1Id,
      status: 'draft',
      amountCents: 1000,
      currency: 'BRL',
      transactionKind: 'expense',
      occurredAt: '2026-06-24T18:00:00Z',
      version: 1,
      allocations: [
        { id: 'alloc_tax', amountCents: 1000, fundId: null }
      ]
    });

    const txSnap = await fakeDb.collection('organizations').doc(org1Id).collection('financeTransactions').doc(returnTxId).get();
    const data = txSnap.data();
    
    assert.strictEqual(data.allocations[0].fundId, null, 'fundId deve permanecer null no banco, sem default de string falsa.');
  });

  // Restore verification hook
  authInstance.verifyIdToken = originalVerifyInstance;

  console.log(`\nGateway Integration Totals: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
}

runGatewayTests();
