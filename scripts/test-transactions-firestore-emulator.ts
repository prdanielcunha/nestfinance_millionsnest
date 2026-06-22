import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import * as crypto from 'crypto';

// Reusing vercel-handlers for realism
import transactionsList from '../server/vercel-handlers/finance/transactionsList.js';
import transactionsDetail from '../server/vercel-handlers/finance/transactionsDetail.js';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';
import transactionsUpdateDraft from '../server/vercel-handlers/finance/transactionsUpdateDraft.js';
import transactionsSubmitForReview from '../server/vercel-handlers/finance/transactionsSubmitForReview.js';

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

async function runEmulatorTests() {
   process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';

   if (!process.env.FIRESTORE_EMULATOR_HOST) {
      console.error('❌ Emulator tests must run with FIRESTORE_EMULATOR_HOST defined');
      process.exit(1);
   }

   console.log('Running Emulator Verified Suite against:', process.env.FIRESTORE_EMULATOR_HOST);
   
   let passed = 0;
   let failed = 0;

   const assert = (condition: boolean, msg: string) => {
      if (condition) {
         console.log(`✅ ${msg}`);
         passed++;
      } else {
         console.error(`❌ ${msg}`);
         failed++;
         throw new Error(`Assertion failed: ${msg}`);
      }
   };
   
   resetFirebaseAdminForTests();
   const admin = getFirebaseAdmin();
   const firestore = admin.firestore;
   
   const orgId = 'org_' + crypto.randomBytes(4).toString('hex');
   const entId = 'ent_' + crypto.randomBytes(4).toString('hex');
   const uid = 'usr_' + crypto.randomBytes(4).toString('hex');
   
   console.log('Org:', orgId, 'Entity:', entId, 'UID:', uid);
   
   const accountId = 'acc_' + crypto.randomBytes(4).toString('hex');
   const category1Id = 'cat_' + crypto.randomBytes(4).toString('hex');
   const category2Id = 'cat_' + crypto.randomBytes(4).toString('hex');
   
   // Create basic permissions in the emulator
   await firestore.collection('organizations').doc(orgId).set({ name: 'Emul Org' });
   await firestore.collection('organizations').doc(orgId).collection('users').doc(uid).set({
      capabilities: ['finance.create_drafts', 'finance.view', 'finance.manage']
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
      active: true,
   });
   
   await firestore.collection('organizations').doc(orgId).collection('financeCategories').doc(category2Id).set({
      financeEntityId: entId,
      name: 'Ofertas',
      kind: 'income',
      active: true,
   });

   // Hook verifyIdToken for tests
   const originalVerify = admin.auth.verifyIdToken;
   admin.auth.verifyIdToken = async () => ({ uid, email: `${uid}@test.com` }) as any;

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

   try {
      // 1. listar entidade vazia
      const listRes = await testCall(transactionsList, {
         body: { financeEntityId: entId, status: 'draft' }
      });
      assert(listRes.statusCode === 200 && listRes.body.items.length === 0, 'listar entidade vazia');
      
      // 2. criar uma transação de Entrada de 9500 centavos
      const createKey = 'idsm_' + crypto.randomBytes(4).toString('hex');
      const createReqId = 'req_' + crypto.randomBytes(4).toString('hex');
      
      const createRes = await testCall(transactionsCreateDraft, {
         body: {
            financeEntityId: entId,
            idempotencyKey: createKey,
            requestId: createReqId,
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
      
      assert(createRes.statusCode === 200 && createRes.body.transactionId !== undefined, 'cria uma transação de Entrada de 9500 centavos');
      const txId = createRes.body.transactionId;
      
      // 4. ler diretamente os documentos persistidos
      const txDoc = await firestore.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).get();
      const allocsQuery = await firestore.collection('organizations').doc(orgId).collection('financeAllocations').where('transactionId', '==', txId).get();
      
      assert(txDoc.exists && txDoc.data()?.amountCents === 9500, 'transação persistida corretamente');
      assert(allocsQuery.docs.length === 2, 'allocations persistidas (6500 e 3000)');
      
      // 5. abrir detail
      const detailRes = await testCall(transactionsDetail, {
         body: { financeEntityId: entId, transactionId: txId }
      });
      
      // 6. confirmar status draft
      assert(detailRes.body.transaction.status === 'draft', 'confirma status draft');
      
      // 7. confirmar version inicial exata
      let currentVersion = detailRes.body.transaction.version;
      assert(currentVersion === 1, 'confirma version inicial exata (1)');
      
      // Wait to ensure updatedAt will be strictly greater (for our simple tests)
      await new Promise(r => setTimeout(r, 10));

      const initialAllocId = detailRes.body.allocations[0].id;

      // 8. atualizar descrição
      const updateKey = 'idsm_' + crypto.randomBytes(4).toString('hex');
      const updateReqId = 'req_' + crypto.randomBytes(4).toString('hex');
      
      const updateRes = await testCall(transactionsUpdateDraft, {
         body: {
            financeEntityId: entId,
            transactionId: txId,
            expectedVersion: currentVersion,
            idempotencyKey: updateKey,
            requestId: updateReqId,
            payload: {
               description: 'Atualizado',
               allocations: [
                  { id: initialAllocId, amountCents: 6500, categoryId: category1Id, description: 'Dízimos Editado' },
                  { amountCents: 3000, categoryId: category2Id, description: 'Ofertas' }
               ]
            }
         }
      });
      
      // 9. confirmar version incrementada exatamente uma vez
      assert(updateRes.statusCode === 200 && updateRes.body.changed === true && updateRes.body.version === 2, 'confirma version incrementada exatamente uma vez');
      currentVersion = updateRes.body.version;
      
      // 10. repetir o mesmo update como no-op
      const updateReqId2 = 'req_' + crypto.randomBytes(4).toString('hex');
      const updateNoOpRes = await testCall(transactionsUpdateDraft, {
         body: {
            financeEntityId: entId,
            transactionId: txId,
            expectedVersion: currentVersion,
            idempotencyKey: 'idsm_' + crypto.randomBytes(4).toString('hex'), // diff key
            requestId: updateReqId2,
            payload: {
               description: 'Atualizado', // same as before
               allocations: [
                  ...updateRes.body.allocations // provide exact allocations back to skip creation
               ]
            }
         }
      });
      
      // 11. confirmar changed:false
      assert(updateNoOpRes.statusCode === 200 && updateNoOpRes.body.changed === false, 'confirma changed:false');
      
      // 13. enviar para revisão
      const submitKey = 'idsm_' + crypto.randomBytes(4).toString('hex');
      const submitReqId = 'req_' + crypto.randomBytes(4).toString('hex');
      const submitRes = await testCall(transactionsSubmitForReview, {
         body: {
            financeEntityId: entId,
            transactionId: txId,
            expectedVersion: currentVersion,
            idempotencyKey: submitKey,
            requestId: submitReqId
         }
      });
      
      // 14. confirmar ready_for_review
      assert(submitRes.statusCode === 200 && submitRes.body.version === 3, 'confirma version após submit');
      currentVersion = submitRes.body.version;
      const txDoc3 = await firestore.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).get();
      assert(txDoc3.data()?.status === 'ready_for_review', 'confirma ready_for_review');
      
      // 16. retornar para draft
      const returnKey = 'idsm_' + crypto.randomBytes(4).toString('hex');
      const returnReqId = 'req_' + crypto.randomBytes(4).toString('hex');
      const returnRes = await testCall(transactionsUpdateDraft, {
         body: {
            financeEntityId: entId,
            transactionId: txId,
            expectedVersion: currentVersion,
            idempotencyKey: returnKey,
            requestId: returnReqId,
            payload: {
               intent: 'return_to_draft'
            }
         }
      });
      
      // 17. confirmar version exata do retorno
      assert(returnRes.statusCode === 200 && returnRes.body.version === 4, 'confirma version exata após retornar');
      currentVersion = returnRes.body.version;
      const txDoc4 = await firestore.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).get();
      assert(txDoc4.data()?.status === 'draft', 'confirma status draft após retorno');

      // 25. verificar zero efeito contábil
      const journalQ = await firestore.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
      const aggQ = await firestore.collection('organizations').doc(orgId).collection('financeAggregates').get();
      assert(journalQ.docs.length === 0, 'zero financeJournalEntries');
      assert(aggQ.docs.length === 0, 'zero financeAggregates');

      console.log('--- Idempotencia Real no Emulator ---');
      
      const submitAgainKey = 'idsm_' + crypto.randomBytes(4).toString('hex');
      await testCall(transactionsSubmitForReview, {
         body: {
            financeEntityId: entId, transactionId: txId, expectedVersion: currentVersion, idempotencyKey: submitAgainKey, requestId: 'req_' + crypto.randomBytes(4).toString('hex')
         }
      });
      currentVersion = 5;

      const submitRepeatRes = await testCall(transactionsSubmitForReview, {
         body: {
            financeEntityId: entId, transactionId: txId, expectedVersion: 4, idempotencyKey: submitAgainKey, requestId: 'req_' + crypto.randomBytes(4).toString('hex')
         }
      });
      
      assert(submitRepeatRes.statusCode === 200 && submitRepeatRes.body.version === 5, 'mesma chave + mesmo payload retorna o resultado anterior');
      
      const idempotencyDoc = await firestore.collection('financeIdempotency').doc(orgId + '_' + submitAgainKey).get();
      assert(idempotencyDoc.exists, 'registro de idempotência criado');

      console.log('--- Concorrencia Real no Emulator ---');
      const concUpdateKey1 = 'idsm_' + crypto.randomBytes(4).toString('hex');
      const concUpdateKey2 = 'idsm_' + crypto.randomBytes(4).toString('hex');
      
      const returnKey2 = 'idsm_' + crypto.randomBytes(4).toString('hex');
      await testCall(transactionsUpdateDraft, {
         body: {
            financeEntityId: entId, transactionId: txId, expectedVersion: currentVersion, idempotencyKey: returnKey2, requestId: 'req_' + crypto.randomBytes(4).toString('hex'),
            payload: { intent: 'return_to_draft' }
         }
      });
      currentVersion = 6;
      
      const p1 = testCall(transactionsUpdateDraft, {
         body: {
            financeEntityId: entId, transactionId: txId, expectedVersion: currentVersion,
            payload: { description: 'P1 Vence' },
            idempotencyKey: concUpdateKey1, requestId: 'req_' + crypto.randomBytes(4).toString('hex')
         }
      });
      
      const p2 = testCall(transactionsUpdateDraft, {
         body: {
            financeEntityId: entId, transactionId: txId, expectedVersion: currentVersion,
            payload: { description: 'P2 Vence' },
            idempotencyKey: concUpdateKey2, requestId: 'req_' + crypto.randomBytes(4).toString('hex')
         }
      });
      
      const settled = await Promise.allSettled([p1, p2]);
      const succeeded = settled.filter((r: any) => r.status === 'fulfilled' && r.value.statusCode === 200);
      const errs = settled.filter((r: any) => r.status === 'fulfilled' && r.value.statusCode === 409); // Version Conflict
      
      assert(succeeded.length === 1, 'exatamente um update vence (length=' + succeeded.length + ')');
      assert(errs.length === 1 && (errs[0] as any).value.body.error === 'VERSION_CONFLICT', 'concorrente perde com versão diferente');
      
      console.log(`\nEmulator Totals: ${passed} Passed, ${failed} Failed\n`);

   } catch (error) {
      console.error(error);
      failed++;
   } finally {
      admin.auth.verifyIdToken = originalVerify;
      if (failed > 0) process.exit(1);
   }
}

runEmulatorTests();
