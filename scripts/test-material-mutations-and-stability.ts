import './setup.js';
import { FakeFirestore } from './fakeFirestore.js';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { computeApprovalSourceHash, buildApprovalMaterial } from '../shared/finance/ledger/approvalSourceHash.js';
import { buildPostingPlan } from '../shared/finance/ledger/postingPlan.js';
import transactionsUpdateDraft from '../server/vercel-handlers/finance/transactionsUpdateDraft.js';
import transactionsRepairApprovalVerification from '../server/vercel-handlers/finance/transactionsRepairApprovalVerification.js';
import transactionsPostingPlanPreview from '../server/vercel-handlers/finance/transactionsPostingPlanPreview.js';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';

class MockRes {
  statusCode: number = 200;
  body: any;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  send(body: any) { this.body = body; return this; }
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const originalVerify = admin.auth.verifyIdToken;
const userId = 'user-integration';
admin.auth.verifyIdToken = async () => ({ uid: userId }) as any;

const TEST_FIRESTORE_SYMBOL = Symbol.for('TEST_FIRESTORE');
(globalThis as any)[TEST_FIRESTORE_SYMBOL] = new FakeFirestore();
resetFirebaseAdminForTests();
const admin2 = getFirebaseAdmin();
const db = admin2.firestore;

const orgId = 'org-tests';
const entId = 'ent-tests';

async function runTests() {
  let passed = 0;
  let failed = 0;
  let total = 0;
  
  console.log(`SUÍTE\tARQUIVO\tTOTAL\tPASS\tFAIL`);

  // Setup basic data
  await db.collection('organizations').doc(orgId).set({ active: true });
  await db.collection('users').doc(userId).set({ displayName: 'Integration User' });
  await db.collection('organizations').doc(orgId).collection('users').doc(userId).set({
    capabilities: ['finance.create_drafts', 'finance.approve_for_posting', 'finance.view', 'finance.manage', 'finance.review', 'finance.return_to_draft'],
    organizationRole: 'admin'
  });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entId).set({
    active: true, name: 'Test Entity'
  });
  await db.collection('organizations').doc(orgId).collection('financeAccounts').doc('acc-1').set({
    active: true, financeEntityId: entId, systemType: 'cash', accountType: 'asset:current', currency: 'BRL', configurationStatus: 'complete'
  });
  await db.collection('organizations').doc(orgId).collection('financeAccounts').doc('acc-2').set({
    active: true, financeEntityId: entId, systemType: 'cash', accountType: 'asset:current', currency: 'BRL', configurationStatus: 'complete'
  });
  await db.collection('organizations').doc(orgId).collection('financeSettings').doc('config').set({
    mappings: {
      categoryToAccount: { 'cat-1': 'la_default_expense_cat-1' },
      fundToAccount: {},
      defaultAssetAccount: 'la_default_asset_acc-1'
    }
  });
  await db.collection('organizations').doc(orgId).collection('financeCategories').doc('cat-1').set({ active: true, financeEntityId: entId, kind: 'expense', configurationStatus: 'complete' });
  await db.collection('organizations').doc(orgId).collection('financeFunds').doc('f1').set({ active: true, financeEntityId: entId });
  await db.collection('organizations').doc(orgId).collection('financeFunds').doc('f2').set({ active: true, financeEntityId: entId });
  await db.collection('organizations').doc(orgId).collection('financeCostCenters').doc('c1').set({ active: true, financeEntityId: entId });
  await db.collection('organizations').doc(orgId).collection('financeCostCenters').doc('c2').set({ active: true, financeEntityId: entId });
  await db.collection('organizations').doc(orgId).collection('financeCategories').doc('cat-2').set({
    active: true, financeEntityId: entId, kind: 'expense', configurationStatus: 'complete'
  });
  await db.collection('organizations').doc(orgId).collection('financeAccountMappings').doc('map-acc1').set({
    accountId: 'acc-1', postingType: 'default', logicalAccount: 'cash', active: true, financeEntityId: entId
  });
  await db.collection('organizations').doc(orgId).collection('financeAccountMappings').doc('map-acc2').set({
    accountId: 'acc-2', postingType: 'default', logicalAccount: 'cash', active: true, financeEntityId: entId
  });
  await db.collection('organizations').doc(orgId).collection('financeCategoryMappings').doc('map-cat1').set({
    categoryId: 'cat-1', postingType: 'expense', logicalAccount: 'expense', active: true, financeEntityId: entId
  });
  await db.collection('organizations').doc(orgId).collection('financeCategoryMappings').doc('map-cat2').set({
    categoryId: 'cat-2', postingType: 'expense', logicalAccount: 'expense', active: true, financeEntityId: entId
  });

  const baseReq = {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'x-organization-id': orgId }
  };

  // 1. MATERIAL MUTATIONS
  const mutations = [
    { field: 'amountCents', old: 1000, new: 2000, payload: { amountCents: 2000 } },
    { field: 'occurredAt', old: '2023-01-01', new: '2023-01-02', payload: { occurredAt: '2023-01-02' } },
    { field: 'competenceDate', old: '2023-01', new: '2023-02', payload: { competenceDate: '2023-02' } },
    { field: 'accountId', old: 'acc-1', new: 'acc-2', payload: { accountId: 'acc-2' } },
    { field: 'destinationAccountId', old: 'acc-1', new: 'acc-2', payload: { destinationAccountId: 'acc-2', transactionKind: 'transfer' }, baseKind: 'transfer' },
    { field: 'paymentMethod', old: 'pix', new: 'ted', payload: { paymentMethod: 'ted' } },
    { field: 'description', old: 'desc 1', new: 'desc 2', payload: { description: 'desc 2' } },
    { field: 'counterparty', old: 'cp 1', new: 'cp 2', payload: { counterparty: 'cp 2' } },
    { field: 'evidenceIds', old: ['e1'], new: ['e1', 'e2'], payload: { evidenceIds: ['e1', 'e2'] } },
    { field: 'evidenceJustification', old: 'j1', new: 'j2', payload: { evidenceJustification: 'j2' } },
    { field: 'categoryId', old: 'cat-1', new: 'cat-2', payload: { allocations: [{ amountCents: 1000, categoryId: 'cat-2' }] } },
    { field: 'fundId', old: 'f1', new: 'f2', payload: { allocations: [{ amountCents: 1000, categoryId: 'cat-1', fundId: 'f2' }] } },
    { field: 'costCenterId', old: 'c1', new: 'c2', payload: { allocations: [{ amountCents: 1000, categoryId: 'cat-1', costCenterId: 'c2' }] } },
    { field: 'allocations', old: 1, new: 2, payload: { allocations: [{ amountCents: 500, categoryId: 'cat-1' }, { amountCents: 500, categoryId: 'cat-1' }] } },
    { field: 'sourceContext', old: 's1', new: 's2', payload: { sourceContext: 's2' } },
  ];

  let mutPassed = 0;
  for (const mut of mutations) {
    try {
      const txId = `tx-mut-${mut.field}`;
      const isTransfer = mut.baseKind === 'transfer';
      const fakeTx = {
        id: txId, organizationId: orgId, financeEntityId: entId,
        transactionKind: isTransfer ? 'transfer' : 'expense', direction: isTransfer ? 'transfer' : 'expense',
        cashFlowDirection: 'outflow', amountCents: 1000, occurredAt: '2023-01-01',
        description: 'mut test', accountId: 'acc-1', status: 'approved_for_posting',
        version: 1, contentVersion: 1, createdBy: userId,
        competenceDate: mut.field === 'competenceDate' ? mut.old : undefined,
        destinationAccountId: isTransfer ? mut.old : undefined,
        paymentMethod: mut.field === 'paymentMethod' ? mut.old : undefined,
        counterparty: mut.field === 'counterparty' ? mut.old : undefined,
        evidenceIds: mut.field === 'evidenceIds' ? mut.old : undefined,
        evidenceJustification: mut.field === 'evidenceJustification' ? mut.old : undefined,
        sourceContext: mut.field === 'sourceContext' ? mut.old : undefined,
      };
      await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).set(fakeTx);
      
      const allocs = mut.field === 'categoryId' || mut.field === 'fundId' || mut.field === 'costCenterId' || mut.field === 'allocations' 
        ? [{ id: `a-${txId}`, organizationId: orgId, financeEntityId: entId, transactionId: txId, categoryId: 'cat-1', amountCents: 1000, fundId: mut.field === 'fundId' ? mut.old : undefined, costCenterId: mut.field === 'costCenterId' ? mut.old : undefined }]
        : [{ id: `a-${txId}`, organizationId: orgId, financeEntityId: entId, transactionId: txId, categoryId: 'cat-1', amountCents: 1000 }];
      
      for (const a of allocs) {
        await db.collection('organizations').doc(orgId).collection('financeAllocations').doc(a.id).set(a);
      }
      
      const hashV1 = computeApprovalSourceHash(fakeTx as any, allocs as any, 1);
      const matV1 = buildApprovalMaterial(fakeTx as any, allocs as any, 1);
      
      await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).collection('approvals').doc('latest').set({
        approvedVersion: 1, approvalAlgorithmVersion: 1, approvalSourceHash: hashV1,
        materialSnapshot: matV1, status: 'approved'
      });

      // Return to draft
      const resReturn = new MockRes();
      const { default: transactionsReturnToDraft } = await import('../server/vercel-handlers/finance/transactionsReturnToDraft.js');
      await transactionsReturnToDraft({
        ...baseReq, body: { operation: 'transactions-return-to-draft', organizationId: orgId, financeEntityId: entId, transactionId: txId, expectedVersion: 1, reasonCode: 'other', comment: 'test', idempotencyKey: `idem-ret-${txId}`, requestId: `req-ret-${txId}` }
      } as any, resReturn as any);

      if (resReturn.statusCode !== 200) {
        throw new Error('Return to draft failed: ' + JSON.stringify(resReturn.body));
      }

      // Update draft
      const resMut = new MockRes();
      const payloadBase = isTransfer ? { expectedVersion: 2, transactionKind: 'transfer', accountId: 'acc-1', destinationAccountId: 'acc-1', amountCents: 1000, occurredAt: '2023-01-01', allocations: [] }
                                   : { expectedVersion: 2, transactionKind: 'expense', accountId: 'acc-1', amountCents: 1000, occurredAt: '2023-01-01', allocations: [{categoryId: 'cat-1', amountCents: 1000}] };
                                   
      await transactionsUpdateDraft({
        ...baseReq, body: { operation: 'transactions-update-draft', organizationId: orgId, financeEntityId: entId, transactionId: txId, expectedVersion: 2, idempotencyKey: `idem-${txId}`, requestId: `req-${txId}`, payload: { ...payloadBase, ...mut.payload } }
      } as any, resMut as any);
      
      const updatedTx = (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).get()).data();
      const updatedApp = (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).collection('approvals').doc('latest').get()).data();
      
      let passMut = true;
      if (updatedTx.contentVersion <= 1) passMut = false; // did not increment
      if (updatedApp.status !== 'invalidated') passMut = false; // did not invalidate

      
      const resPrev = new MockRes();
      await transactionsPostingPlanPreview({
        ...baseReq, body: { operation: 'transactions-posting-plan-preview', organizationId: orgId, financeEntityId: entId, transactionId: txId }
      } as any, resPrev as any);
      
      if (resPrev.statusCode === 200 && resPrev.body.status === 'verified') passMut = false; // preview should NOT be verified
      
      if (passMut) { mutPassed++; passed++; console.log(`Mutation PASS: ${mut.field}`); }
      else { failed++; console.log(`Mutation FAIL: ${mut.field}`, { resStatusCode: resMut.statusCode, resBody: resMut.body }); }
      total++;
    } catch(e) {
      failed++; total++;
      console.log(`Mutation FAIL Exception: ${mut.field}`, e);
    }
  }
  
  // 3. COMPLETE STABILITY TEST AFTER REPAIR
  try {
      total++;
      const txIdStab = 'tx-stab';
      const fakeTxStab = {
        id: txIdStab, organizationId: orgId, financeEntityId: entId,
        transactionKind: 'expense', direction: 'expense',
        cashFlowDirection: 'outflow', amountCents: 1000, occurredAt: '2023-01-01',
        description: 'stab test', accountId: 'acc-1', status: 'approved_for_posting',
        version: 1, contentVersion: 1, createdBy: userId,
        approvedVersion: 1, approvalSourceHash: 'fake-to-be-replaced'
      };
      await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdStab).set(fakeTxStab);
      const allocsStab = [{ id: `a-stab`, organizationId: orgId, financeEntityId: entId, transactionId: txIdStab, categoryId: 'cat-1', amountCents: 1000 }];
      await db.collection('organizations').doc(orgId).collection('financeAllocations').doc('a-stab').set(allocsStab[0]);
      
      const hashV1Stab = computeApprovalSourceHash(fakeTxStab as any, allocsStab as any, 1);
      const matV1Stab = buildApprovalMaterial(fakeTxStab as any, allocsStab as any, 1);
      
      fakeTxStab.approvalSourceHash = hashV1Stab;
      await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdStab).set(fakeTxStab);
      
      const planFake = buildPostingPlan({
        transaction: fakeTxStab as any,
        allocations: allocsStab as any,
        approval: { approvedVersion: 1, approvalAlgorithmVersion: 1, approvalSourceHash: hashV1Stab } as any,
        mappings: {
          financeAccounts: [{ accountId: 'acc-1', ledgerAccountId: 'la_default_asset_acc-1', type: 'asset' }],
          categories: [{ categoryId: 'cat-1', ledgerAccountId: 'la_default_expense_cat-1', kind: 'expense' }]
        } as any,
        policy: {
          ledgerAccounts: [{ id: 'la_default_asset_acc-1', active: true, postingAllowed: true, organizationId: orgId, financeEntityId: entId },
                           { id: 'la_default_expense_cat-1', active: true, postingAllowed: true, organizationId: orgId, financeEntityId: entId }]
        } as any,
        isPreview: false
      });
      
      const originalApproval = {
        approvedVersion: 1, approvalAlgorithmVersion: 1, approvalSourceHash: hashV1Stab,
        materialSnapshot: matV1Stab, approvedPlanHash: planFake.planHash || 'sha256:e3b31da9fbaffd98776c23937061a31df02e5fbae9d259e43712523bcee8e5b6', status: 'approved',
        approvalId: 'app-stab', approvedBy: userId, approvedAt: '2023-01-01T10:00:00Z'
      };
      
      await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdStab).collection('approvals').doc('latest').set(originalApproval);
      await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdStab).collection('approvals').doc('app-stab').set(originalApproval);
      
      // Mutate transaction slightly so it's a false stale
      await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdStab).update({ version: 2 });
      
      // Step 1: Preview before repair
      const resPrev1 = new MockRes();
      await transactionsPostingPlanPreview({
        ...baseReq, body: { operation: 'transactions-posting-plan-preview', organizationId: orgId, financeEntityId: entId, transactionId: txIdStab }
      } as any, resPrev1 as any);
      
      let stabPass = resPrev1.body.verificationState?.status === 'legacy_false_stale' && resPrev1.body.verificationState?.repairEligible === true;
      if (!stabPass) console.log('Stab Fail Prev1', resPrev1.body);
      
      // Step 2: Repair
      const resRepair = new MockRes();
      await transactionsRepairApprovalVerification({
        ...baseReq, body: { operation: 'transactions-repair-approval-verification', organizationId: orgId, financeEntityId: entId, transactionId: txIdStab, idempotencyKey: 'idem-stab', requestId: 'req-stab' }
      } as any, resRepair as any);
      
      if (resRepair.body.repaired !== true) { stabPass = false; console.log('Stab Fail Repair1', resRepair.body); }
      
      // Compare approval
      const newApproval = (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdStab).collection('approvals').doc('latest').get()).data();
      const newTxData = (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdStab).get()).data();
      
      if (newApproval.approvalSourceHash !== originalApproval.approvalSourceHash) { stabPass = false; console.log('Stab Fail Hash was incorrectly modified on approval doc'); }
      if (newApproval.approvalAlgorithmVersion !== originalApproval.approvalAlgorithmVersion) { stabPass = false; console.log('Stab Fail Algo ver was incorrectly modified on approval doc'); }
      if (newApproval.approvedVersion !== originalApproval.approvedVersion) { stabPass = false; console.log('Stab Fail approvedVersion changed'); }
      if (newApproval.approvedBy !== originalApproval.approvedBy) { stabPass = false; console.log('Stab Fail approvedBy changed'); }
      
      if (!newTxData.approvalVerificationRepair) { stabPass = false; console.log('Stab Fail: approvalVerificationRepair not added to txData'); }
      if (newTxData.approvalVerificationRepair?.verificationAlgorithmVersion !== 2) { stabPass = false; console.log('Stab Fail: wrong verificationAlgoVer in txData'); }
      
      // Step 3: Preview again
      const resPrev2 = new MockRes();
      await transactionsPostingPlanPreview({
        ...baseReq, body: { operation: 'transactions-posting-plan-preview', organizationId: orgId, financeEntityId: entId, transactionId: txIdStab }
      } as any, resPrev2 as any);
      if (resPrev2.body.verificationState?.status !== 'verified') { stabPass = false; console.log('Stab Fail Prev2', resPrev2.body); }
      
      // Step 4: Third read
      const resPrev3 = new MockRes();
      await transactionsPostingPlanPreview({
        ...baseReq, body: { operation: 'transactions-posting-plan-preview', organizationId: orgId, financeEntityId: entId, transactionId: txIdStab }
      } as any, resPrev3 as any);
      if (resPrev3.body.verificationState?.status !== 'verified') { stabPass = false; console.log('Stab Fail Prev3', resPrev3.body); }
      
      // Step 5: Repair again (already repaired)
      const resRepair2 = new MockRes();
      await transactionsRepairApprovalVerification({
        ...baseReq, body: { operation: 'transactions-repair-approval-verification', organizationId: orgId, financeEntityId: entId, transactionId: txIdStab, idempotencyKey: 'idem-stab-2', requestId: 'req-stab-2' }
      } as any, resRepair2 as any);
      if (resRepair2.body.repaired !== false || resRepair2.body.reason !== 'Already uses current algorithm version') {
         stabPass = false; console.log('Stab Fail Repair2', resRepair2.body);
      }
      
      if (stabPass) passed++;
      else failed++;
      console.log(`[Test ${total}] Complete Stability Test After Repair: ${stabPass ? 'PASS' : 'FAIL'}`);
  } catch(e) { failed++; total++; console.log(`[Test ${total}] Complete Stability Test After Repair: FAIL`, e); }

  // Execute minimum regressions
  try {
      total++;
      // Create draft
      const resCreate = new MockRes();
      await transactionsCreateDraft({
        ...baseReq, body: { 
          operation: 'transactions-create-draft', 
          organizationId: orgId, 
          financeEntityId: entId, 
          payload: {
            transactionKind: 'expense', amountCents: 100, accountId: 'acc-1', occurredAt: '2023-01-01', allocations: [{categoryId: 'cat-1', amountCents: 100}], description: 'test draft'
          },
          idempotencyKey: 'idem-create', 
          requestId: 'req-create' 
        }
      } as any, resCreate as any);
      let regPass = resCreate.statusCode === 200 && resCreate.body.transactionId;
      if (!regPass) console.log('Create Draft Error:', resCreate.body);
      
      if (regPass) passed++;
      else failed++;
      console.log(`[Test ${total}] P06B - Regressões Mínimas (Create Draft): ${regPass ? 'PASS' : 'FAIL'}`);
  } catch(e) { failed++; total++; console.log(`[Test ${total}] P06B: FAIL`, e); }

  console.log(`\n============================`);
  console.log(`material mutations\ttest-material-mutations-and-stability.ts\t${mutations.length}\t${mutPassed}\t${mutations.length - mutPassed}`);
  console.log(`stability\ttest-material-mutations-and-stability.ts\t1\t${failed === 0 ? 1 : 0}\t${failed > 0 ? 1 : 0}`);
  
}

runTests();
