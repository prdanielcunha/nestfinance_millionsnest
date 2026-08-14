import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import * as crypto from 'crypto';

import transactionsList from '../server/vercel-handlers/finance/transactionsList.js';
import transactionsDetail from '../server/vercel-handlers/finance/transactionsDetail.js';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';
import transactionsUpdateDraft from '../server/vercel-handlers/finance/transactionsUpdateDraft.js';
import transactionsSubmitForReview from '../server/vercel-handlers/finance/transactionsSubmitForReview.js';
import transactionsReturnToDraft from '../server/vercel-handlers/finance/transactionsReturnToDraft.js';
import { buildIdempotencyKeyHash } from '../server/vercel-handlers/finance/idempotencyHelper.js';

export class MockRes {
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

async function runEmulatorTests() {
  process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';

  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('❌ Emulator tests must run with FIRESTORE_EMULATOR_HOST defined');
    process.exit(1);
  }

  console.log('Running Emulator Verified Suite against:', process.env.FIRESTORE_EMULATOR_HOST);

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
  const firestore = admin.firestore;

  const orgId = 'org_' + crypto.randomBytes(4).toString('hex');
  const entId = 'ent_' + crypto.randomBytes(4).toString('hex');
  const uid = 'usr_' + crypto.randomBytes(4).toString('hex');
  const accountId = 'acc_' + crypto.randomBytes(4).toString('hex');
  const category1Id = 'cat_' + crypto.randomBytes(4).toString('hex');
  const category2Id = 'cat_' + crypto.randomBytes(4).toString('hex');

  console.log('Org:', orgId, 'Entity:', entId, 'UID:', uid);

  await firestore.collection('organizations').doc(orgId).set({ name: 'Emul Org' });
  // Canonical current Hub development contract: NestFinance access is granted through systemRole.
  // No legacy organizations/{org}/users membership is seeded, so this journey would fail if the
  // NestFinance backend accidentally depended on the superseded membership path.
  await firestore.collection('users').doc(uid).set({
    displayName: 'Emulator User',
    systemRole: 'ceo'
  });

  await firestore.collection('organizations').doc(orgId).collection('financeEntities').doc(entId).set({
    name: 'Entidade Emulada',
    active: true
  });

  await firestore.collection('organizations').doc(orgId).collection('financeAccounts').doc(accountId).set({
    financeEntityId: entId,
    name: 'Conta Teste',
    active: true,
    kind: 'asset:current'
  });

  await firestore.collection('organizations').doc(orgId).collection('financeCategories').doc(category1Id).set({
    financeEntityId: entId,
    name: 'Dízimos',
    kind: 'income',
    active: true
  });

  await firestore.collection('organizations').doc(orgId).collection('financeCategories').doc(category2Id).set({
    financeEntityId: entId,
    name: 'Ofertas',
    kind: 'income',
    active: true
  });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({
    uid,
    email: `${uid}@test.com`,
    mn_organization_id: orgId
  }) as any;

  async function testCall(handler: any, reqData: any, headers: any = {}) {
    const req = {
      method: reqData.method || 'POST',
      headers: {
        authorization: 'Bearer integration_token',
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

  const randomKey = () => 'idsm_' + crypto.randomBytes(8).toString('hex');
  const randomRequestId = () => 'req_' + crypto.randomBytes(8).toString('hex');

  try {
    const listRes = await testCall(transactionsList, {
      body: { financeEntityId: entId, status: 'draft' }
    });
    verify(listRes.statusCode === 200 && listRes.body.items.length === 0, 'listar entidade vazia');

    const createKey = randomKey();
    const createRes = await testCall(transactionsCreateDraft, {
      body: {
        financeEntityId: entId,
        idempotencyKey: createKey,
        requestId: randomRequestId(),
        payload: {
          direction: 'income',
          amountCents: 9500,
          occurredAt: new Date().toISOString(),
          description: 'Oferta teste',
          accountId,
          allocations: [
            { amountCents: 6500, categoryId: category1Id, description: 'Dízimos' },
            { amountCents: 3000, categoryId: category2Id, description: 'Ofertas' }
          ]
        }
      }
    });

    verify(createRes.statusCode === 200 && Boolean(createRes.body.transactionId), 'cria uma transação de Entrada de 9500 centavos');
    const txId = createRes.body.transactionId;

    const txDoc = await firestore.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).get();
    const allocationQuery = await firestore.collection('organizations').doc(orgId).collection('financeAllocations').where('transactionId', '==', txId).get();
    verify(txDoc.exists && txDoc.data()?.amountCents === 9500, 'transação persistida corretamente');
    verify(allocationQuery.docs.length === 2, 'allocations persistidas (6500 e 3000)');

    const detailRes = await testCall(transactionsDetail, {
      body: { financeEntityId: entId, transactionId: txId }
    });
    verify(detailRes.body.transaction.status === 'draft', 'confirma status draft');

    let currentVersion = detailRes.body.transaction.version;
    verify(currentVersion === 1, 'confirma version inicial exata (1)');

    const initialAllocId = detailRes.body.allocations[0].id;
    const updateRes = await testCall(transactionsUpdateDraft, {
      body: {
        financeEntityId: entId,
        transactionId: txId,
        expectedVersion: currentVersion,
        idempotencyKey: randomKey(),
        requestId: randomRequestId(),
        payload: {
          description: 'Atualizado',
          allocations: [
            { id: initialAllocId, amountCents: 6500, categoryId: category1Id, description: 'Dízimos Editado' },
            { amountCents: 3000, categoryId: category2Id, description: 'Ofertas' }
          ]
        }
      }
    });
    verify(updateRes.statusCode === 200 && updateRes.body.changed === true && updateRes.body.version === 2, 'confirma version incrementada exatamente uma vez');
    currentVersion = updateRes.body.version;

    const updatedDetailRes = await testCall(transactionsDetail, {
      body: { financeEntityId: entId, transactionId: txId }
    });
    const allocationsForNoOp = updatedDetailRes.body.allocations;
    verify(Array.isArray(allocationsForNoOp) && allocationsForNoOp.length === 2, 'detail retorna allocations atualizadas');

    const noOpRes = await testCall(transactionsUpdateDraft, {
      body: {
        financeEntityId: entId,
        transactionId: txId,
        expectedVersion: currentVersion,
        idempotencyKey: randomKey(),
        requestId: randomRequestId(),
        payload: {
          description: 'Atualizado',
          allocations: allocationsForNoOp.map((allocation: any) => ({
            id: allocation.id,
            amountCents: allocation.amountCents,
            categoryId: allocation.categoryId,
            fundId: allocation.fundId,
            costCenterId: allocation.costCenterId
          }))
        }
      }
    });
    verify(noOpRes.statusCode === 200 && noOpRes.body.changed === false, 'confirma changed:false');

    const submitRes = await testCall(transactionsSubmitForReview, {
      body: {
        financeEntityId: entId,
        transactionId: txId,
        expectedVersion: currentVersion,
        idempotencyKey: randomKey(),
        requestId: randomRequestId()
      }
    });
    verify(submitRes.statusCode === 200 && submitRes.body.version === 3, 'confirma version após submit');
    currentVersion = submitRes.body.version;

    const afterSubmit = await firestore.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).get();
    verify(afterSubmit.data()?.status === 'ready_for_review', 'confirma ready_for_review');

    const returnRes = await testCall(transactionsReturnToDraft, {
      body: {
        financeEntityId: entId,
        transactionId: txId,
        expectedVersion: currentVersion,
        idempotencyKey: randomKey(),
        requestId: randomRequestId(),
        reasonCode: 'correction_requested',
        comment: 'Correção solicitada pelo teste do Emulator'
      }
    });
    verify(returnRes.statusCode === 200 && returnRes.body.version === 4, 'confirma version exata após retornar');
    currentVersion = returnRes.body.version;

    const afterReturn = await firestore.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).get();
    verify(afterReturn.data()?.status === 'draft', 'confirma status draft após retorno');

    const journalQuery = await firestore.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregatesQuery = await firestore.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(journalQuery.docs.length === 0, 'zero financeJournalEntries');
    verify(aggregatesQuery.docs.length === 0, 'zero financeAggregates');

    console.log('--- Idempotencia Real no Emulator ---');
    const repeatKey = randomKey();
    const firstRepeat = await testCall(transactionsSubmitForReview, {
      body: {
        financeEntityId: entId,
        transactionId: txId,
        expectedVersion: currentVersion,
        idempotencyKey: repeatKey,
        requestId: randomRequestId()
      }
    });
    verify(firstRepeat.statusCode === 200 && firstRepeat.body.version === 5, 'primeira chamada idempotente avança para version 5');
    currentVersion = 5;

    const repeatRes = await testCall(transactionsSubmitForReview, {
      body: {
        financeEntityId: entId,
        transactionId: txId,
        expectedVersion: 4,
        idempotencyKey: repeatKey,
        requestId: randomRequestId()
      }
    });
    verify(repeatRes.statusCode === 200 && repeatRes.body.version === 5, 'mesma chave + mesmo payload retorna o resultado anterior');

    const keyHash = buildIdempotencyKeyHash(orgId, entId, uid, 'submit_review', repeatKey);
    const idempotencyDoc = await firestore.collection('organizations').doc(orgId).collection('financeIdempotency').doc(keyHash).get();
    verify(idempotencyDoc.exists, 'registro de idempotência criado');

    console.log('--- Concorrencia Real no Emulator ---');
    const returnForConcurrency = await testCall(transactionsReturnToDraft, {
      body: {
        financeEntityId: entId,
        transactionId: txId,
        expectedVersion: currentVersion,
        idempotencyKey: randomKey(),
        requestId: randomRequestId(),
        reasonCode: 'correction_requested',
        comment: 'Preparar cenário de concorrência'
      }
    });
    verify(returnForConcurrency.statusCode === 200 && returnForConcurrency.body.version === 6, 'retorna para draft antes do cenário concorrente');
    currentVersion = 6;

    const [p1, p2] = await Promise.all([
      testCall(transactionsUpdateDraft, {
        body: {
          financeEntityId: entId,
          transactionId: txId,
          expectedVersion: currentVersion,
          payload: { description: 'P1 Vence' },
          idempotencyKey: randomKey(),
          requestId: randomRequestId()
        }
      }),
      testCall(transactionsUpdateDraft, {
        body: {
          financeEntityId: entId,
          transactionId: txId,
          expectedVersion: currentVersion,
          payload: { description: 'P2 Vence' },
          idempotencyKey: randomKey(),
          requestId: randomRequestId()
        }
      })
    ]);

    const concurrentResults = [p1, p2];
    const succeeded = concurrentResults.filter((result) => result.statusCode === 200);
    const conflicts = concurrentResults.filter((result) => result.statusCode === 400 && result.body?.error === 'FINANCE_VERSION_CONFLICT');
    verify(succeeded.length === 1, `exatamente um update vence (length=${succeeded.length})`);
    verify(conflicts.length === 1, 'concorrente perde com FINANCE_VERSION_CONFLICT');
  } catch (error: any) {
    console.error('Emulator Test Error:', error);
    if (failed === 0) failed++;
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }

  console.log(`\nEmulator Totals: ${passed} Passed, ${failed} Failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runEmulatorTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
