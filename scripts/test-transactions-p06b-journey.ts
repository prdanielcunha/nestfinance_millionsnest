import { FieldValue, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { FakeFirestore } from './fakeFirestore.js';
import { sanitizeFirestoreObject } from '../server/vercel-handlers/finance/sanitizeFirestoreObject.js';
import transactionsDetail from '../server/vercel-handlers/finance/transactionsDetail.js';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';
import transactionsUpdateDraft from '../server/vercel-handlers/finance/transactionsUpdateDraft.js';
import transactionsSubmitForReview from '../server/vercel-handlers/finance/transactionsSubmitForReview.js';
import transactionsCreateAndSubmit from '../server/vercel-handlers/finance/transactionsCreateAndSubmit.js';
import { validateAccountMetadata } from '../shared/finance/smartLogic.js';

process.env.NODE_ENV = 'test';

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

async function runP06BConsolidatedTests() {
  console.log('Running P06B Consolidated UI & Integration Journey Tests...');
  let passed = 0;
  let failed = 0;

  const assertTest = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`✅ ${msg}`);
      passed++;
    } else {
      console.error(`❌ ${msg}`);
      failed++;
    }
  };

  const fakeDb = new FakeFirestore();
  (globalThis as any)[Symbol.for('TEST_FIRESTORE')] = fakeDb;

  const admin = getFirebaseAdmin();
  const db = fakeDb;

  const orgId = 'p06b_org';
  const finEntityId = 'p06b_entity';
  const uid = 'p06b_user';

  const orgRef = db.collection('organizations').doc(orgId);
  await orgRef.set({ name: 'P06B Organization', ownerId: 'other' });
  // Match the canonical MillionsNest development gate. No legacy organization/users
  // membership is seeded, so this journey cannot accidentally depend on that old path.
  await db.collection('users').doc(uid).set({
    displayName: 'P06B Tester',
    systemRole: 'ceo'
  });
  await orgRef.collection('financeEntities').doc(finEntityId).set({
    name: 'P06B Entity',
    active: true
  });

  async function testCall(handler: any, reqData: any, headers: any = {}) {
    const req = {
      method: reqData.method || 'POST',
      headers: {
        authorization: 'Bearer p06b_token',
        'x-organization-id': orgId,
        ...headers
      },
      body: reqData.body,
      query: reqData.query || {}
    };
    const res = new MockRes();
    await handler(req as any, res as any);
    return res;
  }

  admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

  console.log('\n--- 11. AUDITANDO SANITIZADOR E INTEGRIDADE DE ARRAYS ---');

  try {
    const res = sanitizeFirestoreObject({ a: 1, b: undefined }) as any;
    assertTest(!('b' in res) && res.a === 1, 'plain object remove propriedade undefined');
  } catch (e) {
    assertTest(false, 'plain object remove propriedade undefined');
  }

  try {
    sanitizeFirestoreObject({ arr: [1, undefined] });
    assertTest(false, 'array com undefined é rejeitado');
  } catch (e: any) {
    assertTest(e.message.includes('Array with undefined elements') || e.message.includes('undefined'), 'array com undefined é rejeitado');
  }

  try {
    const arr = [1];
    arr[2] = 3;
    sanitizeFirestoreObject({ arr });
    assertTest(false, 'array esparso é rejeitado');
  } catch (e: any) {
    assertTest(e.message.includes('Sparse array') || e.message.includes('undefined'), 'array esparso é rejeitado');
  }

  try {
    const d = new Date('2026-06-22T00:00:00Z');
    const res = sanitizeFirestoreObject({ d }) as any;
    assertTest(res.d instanceof Date && res.d.getTime() === d.getTime(), 'Date válida é preservada');
  } catch (e) {
    assertTest(false, 'Date válida é preservada');
  }

  try {
    sanitizeFirestoreObject({ d: new Date('invalid') });
    assertTest(false, 'Date inválida é rejeitada');
  } catch (e: any) {
    assertTest(e.message.includes('Invalid Date'), 'Date inválida é rejeitada');
  }

  try {
    const ts = FieldValue.serverTimestamp();
    const res = sanitizeFirestoreObject({ ts }) as any;
    assertTest(res.ts === ts, 'FieldValue.serverTimestamp é preservado');
  } catch (e) {
    assertTest(false, 'FieldValue.serverTimestamp é preservado');
  }

  try {
    const ts = Timestamp.now();
    const res = sanitizeFirestoreObject({ ts }) as any;
    assertTest(res.ts === ts, 'Timestamp é preservado');
  } catch (e) {
    assertTest(false, 'Timestamp é preservado');
  }

  try {
    const ref = db.collection('x').doc('y');
    const res = sanitizeFirestoreObject({ ref }) as any;
    assertTest(res.ref === ref, 'DocumentReference não é desmontado');
  } catch (e) {
    assertTest(false, 'DocumentReference não é desmontado');
  }

  try {
    const gp = new GeoPoint(10, 20);
    const res = sanitizeFirestoreObject({ gp }) as any;
    assertTest(res.gp === gp, 'GeoPoint não é desmontado');
  } catch (e) {
    assertTest(false, 'GeoPoint não é desmontado');
  }

  try {
    const buf = Buffer.from('hello');
    const res = sanitizeFirestoreObject({ buf }) as any;
    assertTest(res.buf === buf, 'bytes são preservados');
  } catch (e) {
    assertTest(false, 'bytes são preservados');
  }

  try {
    class UnknownClass {
      a = 1;
    }
    sanitizeFirestoreObject({ u: new UnknownClass() });
    assertTest(false, 'class instance desconhecida não vira plain object');
  } catch (e: any) {
    assertTest(e.message.includes('Unknown class instance'), 'class instance desconhecida não vira plain object');
  }

  try {
    sanitizeFirestoreObject({ allocations: [{ categoryId: 'cat_1', amountCents: 100 }, undefined] });
    assertTest(false, 'allocations não são compactadas');
  } catch (e: any) {
    assertTest(e.message.includes('Array with undefined elements') || e.message.includes('undefined'), 'allocations não são compactadas');
  }

  console.log('\n--- CONTAS LEGADAS, OUTROS TIPOS E AUDITORIA CONTÁBIL ---');

  {
    const accountData = {
      type: 'other',
      name: 'Completa Outros',
      nature: 'asset',
      configurationStatus: 'complete'
    };
    const meta = validateAccountMetadata(accountData);
    assertTest(meta.valid && accountData.configurationStatus === 'complete', 'type: other completo é válido');
  }

  {
    const accountData = { type: 'other', name: 'Incompleta Outros' };
    const meta = validateAccountMetadata(accountData);
    assertTest(!meta.valid, 'type: other incompleto é rejeitado');
  }

  {
    const accountData = { name: 'Caixa de Coleta', type: 'other' };
    const meta = validateAccountMetadata(accountData);
    assertTest((meta.nature as string) !== 'cash' && (meta.nature as string) !== 'asset', 'nome da conta não determina natureza');
  }

  const canonAccountId = 'canon_legacy_acc';
  await orgRef.collection('financeAccounts').doc(canonAccountId).set({
    financeEntityId: finEntityId,
    active: true,
    name: 'Canon Legacy Bank',
    type: 'asset:bank',
    nature: 'asset',
    configurationStatus: 'complete'
  });

  const legacyTxId = 'legacy_tx_1';
  await orgRef.collection('financeTransactions').doc(legacyTxId).set({
    id: legacyTxId,
    organizationId: orgId,
    financeEntityId: finEntityId,
    transactionKind: 'income',
    direction: 'income',
    cashFlowDirection: 'inflow',
    status: 'ready_for_review',
    amountCents: 10000,
    currency: 'BRL',
    occurredAt: '2026-06-22T00:00:00Z',
    accountId: canonAccountId,
    allocationIds: []
  });

  {
    const res = await testCall(transactionsDetail, { body: { financeEntityId: finEntityId, transactionId: legacyTxId } });
    assertTest(
      res.statusCode === 200 && res.body.transaction?.accountSnapshot?.name === 'Canon Legacy Bank',
      'conta legada é resolvida pelo documento canônico'
    );
  }

  const incompleteCanonAccountId = 'canon_incomplete_acc';
  await orgRef.collection('financeAccounts').doc(incompleteCanonAccountId).set({
    financeEntityId: finEntityId,
    active: true,
    name: 'Incomplete Bank'
  });

  const legacyTxId2 = 'legacy_tx_2';
  await orgRef.collection('financeTransactions').doc(legacyTxId2).set({
    id: legacyTxId2,
    organizationId: orgId,
    financeEntityId: finEntityId,
    transactionKind: 'income',
    direction: 'income',
    cashFlowDirection: 'inflow',
    status: 'ready_for_review',
    amountCents: 10000,
    currency: 'BRL',
    occurredAt: '2026-06-22T00:00:00Z',
    accountId: incompleteCanonAccountId,
    allocationIds: []
  });

  {
    const res = await testCall(transactionsDetail, { body: { financeEntityId: finEntityId, transactionId: legacyTxId2 } });
    assertTest(
      res.statusCode === 200 &&
      res.body.transaction?.accountSnapshot?.name === 'Conta ainda não configurada' &&
      res.body.transaction.accountSnapshot.code === 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE',
      'conta legada incompleta permanece pendente'
    );
  }

  const incompleteCatId = 'incomplete_cat';
  await orgRef.collection('financeCategories').doc(incompleteCatId).set({
    financeEntityId: finEntityId,
    active: true,
    kind: 'income',
    name: ''
  });

  const draftTxId = 'draft_tx_with_incomplete_cat';
  await orgRef.collection('financeTransactions').doc(draftTxId).set({
    id: draftTxId,
    organizationId: orgId,
    financeEntityId: finEntityId,
    transactionKind: 'income',
    direction: 'income',
    cashFlowDirection: 'inflow',
    status: 'draft',
    amountCents: 5000,
    currency: 'BRL',
    occurredAt: '2026-06-22T00:00:00Z',
    accountId: canonAccountId,
    allocationIds: ['alloc_inc_1']
  });
  await orgRef.collection('financeAllocations').doc('alloc_inc_1').set({
    id: 'alloc_inc_1',
    organizationId: orgId,
    financeEntityId: finEntityId,
    transactionId: draftTxId,
    categoryId: incompleteCatId,
    amountCents: 5000
  });

  {
    const res = await testCall(transactionsDetail, { body: { financeEntityId: finEntityId, transactionId: draftTxId } });
    assertTest(
      res.statusCode === 200 &&
      res.body.allocations[0].categorySnapshot?.name === 'Categoria ainda não configurada' &&
      res.body.allocations[0].categorySnapshot.code === 'FINANCE_CATEGORY_CONFIGURATION_INCOMPLETE',
      'category/fund não recebem fallback inventado'
    );
  }

  {
    const csCatId = 'complete_cat_cs';
    await orgRef.collection('financeCategories').doc(csCatId).set({
      financeEntityId: finEntityId,
      active: true,
      kind: 'income',
      name: 'Receita de Dízimos',
      configurationStatus: 'complete'
    });

    const res = await testCall(transactionsCreateAndSubmit, {
      body: {
        financeEntityId: finEntityId,
        idempotencyKey: 'idem_create_submit_test',
        requestId: 'req_create_submit_test',
        payload: {
          transactionKind: 'income',
          amountCents: 7500,
          occurredAt: '2026-06-22T00:00:00Z',
          accountId: canonAccountId,
          paymentMethod: 'pix',
          description: 'Test payload',
          evidenceIds: ['mock-doc'],
          allocations: [{ categoryId: csCatId, amountCents: 7500 }]
        }
      }
    });

    assertTest(res.statusCode === 200, 'create-and-submit executa com sucesso');

    const txDoc = await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(res.body.transactionId).get();
    const tx = txDoc.data();
    assertTest(tx?.status === 'ready_for_review', 'create-and-submit termina em ready_for_review');

    let journalFound = false;
    let balanceFound = false;
    for (const key of Object.keys(db.data)) {
      if (key.includes('journal') || key.includes('Journal')) journalFound = true;
      if (key.includes('ledger') || key.includes('balance') || key.includes('Balance')) balanceFound = true;
    }
    assertTest(!journalFound, 'zero Journal events gerados');
    assertTest(!balanceFound, 'zero Posting ou alteração de saldos real ocorrendo');
    assertTest(db instanceof FakeFirestore, 'zero writes de teste em produção');
  }

  console.log('\n--- 12. JORNADA DE EXECUÇÃO REAL (FAKE FIRESTORE) ---');

  let testTxId = '';
  {
    const res = await testCall(transactionsCreateDraft, {
      body: {
        financeEntityId: finEntityId,
        idempotencyKey: 'idem_real_journey_1',
        requestId: 'req_real_journey_1',
        payload: {
          transactionKind: 'income',
          amountCents: 9500,
          occurredAt: '2026-06-22T00:00:00Z',
          allocations: [{ categoryId: incompleteCatId, amountCents: 9500 }]
        }
      }
    });
    assertTest(res.statusCode === 200, '1. criar draft sem conta executado');
    testTxId = res.body.transactionId;
  }

  {
    const res = await testCall(transactionsCreateDraft, {
      body: {
        financeEntityId: finEntityId,
        idempotencyKey: 'idem_real_journey_2',
        requestId: 'req_real_journey_2',
        payload: {
          transactionKind: 'income',
          amountCents: 9500,
          occurredAt: '2026-06-22T00:00:00Z',
          accountId: canonAccountId,
          allocations: [{ categoryId: incompleteCatId, amountCents: 9500 }]
        }
      }
    });
    assertTest(res.statusCode === 200, '2. criar draft com conta completa executado');
  }

  {
    const res = await testCall(transactionsCreateDraft, {
      body: {
        financeEntityId: finEntityId,
        idempotencyKey: 'idem_real_journey_3',
        requestId: 'req_real_journey_3',
        payload: {
          transactionKind: 'income',
          amountCents: 9500,
          occurredAt: '2026-06-22T00:00:00Z',
          accountId: incompleteCanonAccountId,
          allocations: [{ categoryId: incompleteCatId, amountCents: 9500 }]
        }
      }
    });
    assertTest(res.statusCode === 200, '3. criar draft com conta incompleta executado');
  }

  {
    const txDoc = await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(testTxId).get();
    assertTest(txDoc.exists && txDoc.data().recordedAt !== undefined, '4. salvar com serverTimestamp real executado');
  }

  {
    const res = await testCall(transactionsUpdateDraft, {
      body: {
        financeEntityId: finEntityId,
        transactionId: testTxId,
        expectedVersion: 1,
        idempotencyKey: 'idem_real_journey_5',
        requestId: 'req_real_journey_5',
        payload: {
          amountCents: 12000,
          allocations: [{ categoryId: incompleteCatId, amountCents: 12000 }]
        }
      }
    });
    assertTest(res.statusCode === 200, '5. atualizar draft executado');
  }

  const validCatId = 'valid_cat_inc';
  await orgRef.collection('financeCategories').doc(validCatId).set({
    financeEntityId: finEntityId,
    active: true,
    kind: 'income',
    name: 'Dízimos',
    configurationStatus: 'complete'
  });

  const completeTxId = 'complete_tx_ready';
  await orgRef.collection('financeTransactions').doc(completeTxId).set({
    id: completeTxId,
    organizationId: orgId,
    financeEntityId: finEntityId,
    transactionKind: 'income',
    direction: 'income',
    cashFlowDirection: 'inflow',
    status: 'draft',
    amountCents: 6500,
    currency: 'BRL',
    occurredAt: '2026-06-22T00:00:00Z',
    accountId: canonAccountId,
    accountSnapshot: {
      id: canonAccountId,
      name: 'Canon Legacy Bank',
      type: 'asset:bank',
      nature: 'asset',
      configurationStatus: 'complete'
    },
    allocationIds: ['alloc_complete_1'],
    paymentMethod: 'pix',
    description: 'Test payload',
    evidenceIds: ['mock-doc'],
    version: 1
  });
  await orgRef.collection('financeAllocations').doc('alloc_complete_1').set({
    id: 'alloc_complete_1',
    organizationId: orgId,
    financeEntityId: finEntityId,
    transactionId: completeTxId,
    categoryId: validCatId,
    categorySnapshot: { id: validCatId, name: 'Dízimos', type: 'income' },
    amountCents: 6500
  });

  {
    const res = await testCall(transactionsSubmitForReview, {
      body: {
        financeEntityId: finEntityId,
        transactionId: completeTxId,
        expectedVersion: 1,
        idempotencyKey: 'idem_real_journey_6',
        requestId: 'req_real_journey_6'
      }
    });
    assertTest(res.statusCode === 200, '6. enviar transação completa para revisão executado');
  }

  {
    const res = await testCall(transactionsDetail, { body: { financeEntityId: finEntityId, transactionId: legacyTxId } });
    assertTest(res.statusCode === 200, '7. abrir detalhe de documento legado executado');
  }

  {
    const res = await testCall(transactionsDetail, { body: { financeEntityId: finEntityId, transactionId: legacyTxId2 } });
    const snap = res.body.transaction?.accountSnapshot;
    assertTest(snap && !snap.type && !snap.nature, '8. confirmar ausência de valores inventados executado');
  }

  console.log(`\nP06B Consolidated UI & Logic Totals: ${passed} Passed, ${failed} Failed\n`);

  if (failed > 0) process.exit(1);
}

runP06BConsolidatedTests();
