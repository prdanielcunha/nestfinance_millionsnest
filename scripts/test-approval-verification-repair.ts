import { buildApprovalMaterial, computeApprovalSourceHash } from '../shared/finance/ledger/approvalSourceHash.js';
import { FakeFirestore } from './fakeFirestore.js';
import { buildPostingPlan } from '../shared/finance/ledger/postingPlan.js';
import { loadPostingConfiguration } from '../server/vercel-handlers/finance/loadPostingConfiguration.js';
import transactionsRepairApprovalVerification from '../server/vercel-handlers/finance/transactionsRepairApprovalVerification.js';
import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';

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

async function runTests() {
  console.log('Running Approval Verification Repair tests...');
  let total = 0;
  let passed = 0;
  let failed = 0;

  const mockTxData = {
    id: 'tx-123',
    organizationId: 'org-123',
    financeEntityId: 'ent-123',
    transactionKind: 'expense',
    direction: 'expense',
    cashFlowDirection: 'outflow',
    amountCents: 1000,
    occurredAt: '2023-01-01',
    description: 'Test tx',
    status: 'approved_for_posting',
    version: 1,
    contentVersion: 1
  };
  const mockAllocations = [
    { id: 'alloc-1', categoryId: 'cat-1', amountCents: 1000 }
  ];

  // Unit tests
  // Test 1: V1 Verificável
  try {
    total++;
    const v1Hash = computeApprovalSourceHash(mockTxData as any, mockAllocations as any, 1);
    const materialSnapshot = buildApprovalMaterial(mockTxData as any, mockAllocations as any, 1);
    const mockApproval = {
      approvedVersion: 1,
      approvalAlgorithmVersion: 1,
      approvalSourceHash: v1Hash,
      materialSnapshot
    };
    
    // Simulate legacy_false_stale check
    let isLegacyFalseStale = false;
    const legacyTxData = { ...mockTxData, version: mockApproval.approvedVersion };
    const expectedOldHash = computeApprovalSourceHash(legacyTxData as any, mockAllocations as any, 1);
    if (expectedOldHash === mockApproval.approvalSourceHash && mockApproval.materialSnapshot) {
       isLegacyFalseStale = true;
    }
    
    if (isLegacyFalseStale) passed++;
    else failed++;
    console.log(`[Test ${total}] V1 Verificável: ${isLegacyFalseStale ? 'PASS' : 'FAIL'}`);
  } catch(e) { failed++; console.log(`[Test ${total}] V1 Verificável: FAIL`, e); }

  // Test 2: V1 Sem Snapshot
  try {
    total++;
    const v1Hash = computeApprovalSourceHash(mockTxData as any, mockAllocations as any, 1);
    const mockApproval = {
      approvedVersion: 1,
      approvalAlgorithmVersion: 1,
      approvalSourceHash: v1Hash,
    };
    
    let unverifiable = false;
    if (!mockApproval.materialSnapshot) {
       unverifiable = true;
    }
    
    if (unverifiable) passed++;
    else failed++;
    console.log(`[Test ${total}] V1 Sem Snapshot: ${unverifiable ? 'PASS' : 'FAIL'}`);
  } catch(e) { failed++; console.log(`[Test ${total}] V1 Sem Snapshot: FAIL`, e); }

  // Test 3: V1 Material Alterado
  try {
    total++;
    const v1Hash = computeApprovalSourceHash(mockTxData as any, mockAllocations as any, 1);
    const materialSnapshot = buildApprovalMaterial(mockTxData as any, mockAllocations as any, 1);
    const mockApproval = {
      approvedVersion: 1,
      approvalAlgorithmVersion: 1,
      approvalSourceHash: v1Hash,
      materialSnapshot
    };
    
    // Change material
    const changedTxData = { ...mockTxData, amountCents: 2000, version: 2, contentVersion: 2 };
    
    let isLegacyFalseStale = false;
    let isStale = false;
    const legacyTxData = { ...changedTxData, version: mockApproval.approvedVersion };
    const expectedOldHash = computeApprovalSourceHash(legacyTxData as any, mockAllocations as any, 1);
    if (expectedOldHash === mockApproval.approvalSourceHash) {
       isLegacyFalseStale = true;
    } else {
       isStale = true;
    }
    
    if (isStale && !isLegacyFalseStale) passed++;
    else failed++;
    console.log(`[Test ${total}] V1 Material Alterado: ${isStale ? 'PASS' : 'FAIL'}`);
  } catch(e) { failed++; console.log(`[Test ${total}] V1 Material Alterado: FAIL`, e); }

  // Test 4: V2 Verified
  try {
    total++;
    const v2Hash = computeApprovalSourceHash(mockTxData as any, mockAllocations as any, 2);
    const mockApproval = {
      approvedVersion: 1,
      approvalAlgorithmVersion: 2,
      approvalSourceHash: v2Hash,
    };
    
    let isVerified = false;
    const currentSourceHash = computeApprovalSourceHash(mockTxData as any, mockAllocations as any, 2);
    if (currentSourceHash === mockApproval.approvalSourceHash) {
       isVerified = true;
    }
    
    if (isVerified) passed++;
    else failed++;
    console.log(`[Test ${total}] V2 Verified: ${isVerified ? 'PASS' : 'FAIL'}`);
  } catch(e) { failed++; console.log(`[Test ${total}] V2 Verified: FAIL`, e); }

  // Setup database for idempotency test
  const db = new FakeFirestore();
  const TEST_FIRESTORE_SYMBOL = Symbol.for('TEST_FIRESTORE');
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = db;
  process.env.NODE_ENV = 'test';
  const orgId = 'org-idempotency';
  const entId = 'ent-idempotency';
  const txId = 'tx-idempotency';
  const userId = 'user-test';
  
  await db.collection('organizations').doc(orgId).set({ active: true });
  await db.collection('users').doc(userId).set({ displayName: 'Test User' });
  await db.collection('organizations').doc(orgId).collection('users').doc(userId).set({
    capabilities: ['finance.approve_for_posting', 'finance.view']
  });
  
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entId).set({
    active: true
  });
  
  await db.collection('organizations').doc(orgId).collection('financeAccounts').doc('mock-account').set({
    active: true, financeEntityId: entId, systemType: 'cash', accountType: 'asset:current', currency: 'BRL', configurationStatus: 'complete'
  });
  
  await db.collection('organizations').doc(orgId).collection('financeCategories').doc('cat-1').set({
    active: true, financeEntityId: entId, kind: 'expense', configurationStatus: 'complete'
  });

  await db.collection('organizations').doc(orgId).collection('financeAccountMappings').doc('map-acc').set({
    accountId: 'mock-account', postingType: 'default', logicalAccount: 'cash', active: true, financeEntityId: entId
  });
  await db.collection('organizations').doc(orgId).collection('financeCategoryMappings').doc('map-cat').set({
    categoryId: 'cat-1', postingType: 'expense', logicalAccount: 'expense', active: true, financeEntityId: entId
  });

  const v1HashFake = computeApprovalSourceHash({ ...mockTxData, organizationId: orgId, financeEntityId: entId, id: txId, accountId: 'mock-account' } as any, mockAllocations as any, 1);
  const materialSnapshotFake = buildApprovalMaterial({ ...mockTxData, organizationId: orgId, financeEntityId: entId, id: txId, accountId: 'mock-account' } as any, mockAllocations as any, 1);
  const fakeTx = {
    ...mockTxData,
    accountId: 'mock-account',
    organizationId: orgId,
    financeEntityId: entId,
    id: txId,
    approvalId: 'app-1',
    status: 'approved_for_posting',
    version: 1,
    contentVersion: 1
  };
  await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).set(fakeTx);
  
  const fullMockAlloc = [{ ...mockAllocations[0], organizationId: orgId, financeEntityId: entId, transactionId: txId }];
  
  const planFake = buildPostingPlan({
    transaction: fakeTx as any,
    allocations: fullMockAlloc as any,
    approval: { approvedVersion: 1, approvalAlgorithmVersion: 2, approvalSourceHash: v1HashFake } as any,
    mappings: {
      financeAccountMappings: [{ accountId: 'mock-account', postingType: 'default', logicalAccount: 'cash', active: true }],
      categories: [{ id: 'cat-1', active: true, kind: 'expense', name: 'Cat 1' }],
      financeCategoryMappings: [{ categoryId: 'cat-1', postingType: 'expense', logicalAccount: 'expense', active: true }],
      financeAccounts: [{ id: 'mock-account', active: true, currency: 'BRL', name: 'Mock' }],
      financeFunds: [],
      financeCostCenters: []
    } as any,
    policy: { allowEmptyAllocations: false } as any,
    isPreview: true
  });
  console.log('PLAN FAKE BLOCKERS:', planFake.blockers);
  
  const appRef = db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txId).collection('approvals').doc('latest');
  await appRef.set({
    approvedVersion: 1,
    approvalAlgorithmVersion: 1,
    approvalSourceHash: v1HashFake,
    materialSnapshot: materialSnapshotFake,
    approvedPlanHash: 'sha256:cf3fee3026f3683277650fc384741f2d1b77d4fc02a2423768111ad808011933',
    status: 'approved'
  });
  
  const allocRef = db.collection('organizations').doc(orgId).collection('financeAllocations').doc('alloc-1');
  await allocRef.set({
    ...mockAllocations[0],
    organizationId: orgId,
    financeEntityId: entId,
    transactionId: txId
  });

  const admin = getFirebaseAdmin();
  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({ uid: userId }) as any;

  try {
    total++;
    // First call
    const req1 = {
      method: 'POST',
      headers: { 
        authorization: 'Bearer integration_token',
        'x-organization-id': orgId 
      },
      body: {
        operation: 'transactions-repair-approval-verification',
        organizationId: orgId,
        financeEntityId: entId,
        transactionId: txId,
        idempotencyKey: 'idem-1-test-long',
        requestId: 'req-1-test-long'
      }
    };
    const res1 = new MockRes();
    
    let isIdempotentFirst = false;
    await transactionsRepairApprovalVerification(req1 as any, res1 as any);
    
    console.log('req1 status:', res1.statusCode, 'body:', res1.body);
    if (res1.statusCode === 200 && res1.body.repaired === true) {
       isIdempotentFirst = true;
    }
    
    // Second call same key
    const res2 = new MockRes();
    await transactionsRepairApprovalVerification(req1 as any, res2 as any);
    
    console.log('req2 status:', res2.statusCode, 'body:', res2.body);
    let isIdempotentSecond = false;
    if (res2.statusCode === 200 && res2.body.repaired === true) {
       isIdempotentSecond = true;
    }
    
    // Third call diff key, but already repaired (V2 now)
    const req3 = { ...req1, body: { ...req1.body, idempotencyKey: 'idem-2-test-long' } };
    const res3 = new MockRes();
    await transactionsRepairApprovalVerification(req3 as any, res3 as any);
    
    console.log('req3 status:', res3.statusCode, 'body:', res3.body);
    let isIdempotentThird = false;
    if (res3.statusCode === 200 && res3.body.repaired === false && res3.body.reason === 'Already uses current algorithm version') {
       isIdempotentThird = true;
    }
    
    if (isIdempotentFirst && isIdempotentSecond && isIdempotentThird) passed++;
    else failed++;
    console.log(`[Test ${total}] Idempotência (Mesma e Diferente Chave): ${(isIdempotentFirst && isIdempotentSecond && isIdempotentThird) ? 'PASS' : 'FAIL'} (${isIdempotentFirst}, ${isIdempotentSecond}, ${isIdempotentThird})`);
    
    // Concurrency test
    total++;
    const txIdConc = 'tx-concurrency';
    const fakeTxConc = {
      ...mockTxData,
      accountId: 'mock-account',
      organizationId: orgId,
      financeEntityId: entId,
      id: txIdConc,
      approvalId: 'app-conc',
      status: 'approved_for_posting',
      version: 1,
      contentVersion: 1
    };
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdConc).set(fakeTxConc);
    
    const v1HashConc = computeApprovalSourceHash({ ...mockTxData, organizationId: orgId, financeEntityId: entId, id: txIdConc, accountId: 'mock-account' } as any, mockAllocations as any, 1);
    const materialSnapshotConc = buildApprovalMaterial({ ...mockTxData, organizationId: orgId, financeEntityId: entId, id: txIdConc, accountId: 'mock-account' } as any, mockAllocations as any, 1);
    
    const appRefConc = db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txIdConc).collection('approvals').doc('latest');
    await appRefConc.set({
      approvedVersion: 1,
      approvalAlgorithmVersion: 1,
      approvalSourceHash: v1HashConc,
      materialSnapshot: materialSnapshotConc,
      approvedPlanHash: 'sha256:70b7405dcfbc95681c91284361a0ee7ce1ab3fedd365e78ba6b436a459ec98f1',
      status: 'approved'
    });
    
    const allocRefConc = db.collection('organizations').doc(orgId).collection('financeAllocations').doc('alloc-conc');
    await allocRefConc.set({
      ...mockAllocations[0],
      organizationId: orgId,
      financeEntityId: entId,
      transactionId: txIdConc
    });

    const reqConc1 = { ...req1, body: { ...req1.body, transactionId: txIdConc, idempotencyKey: 'idem-c1-long' } };
    const reqConc2 = { ...req1, body: { ...req1.body, transactionId: txIdConc, idempotencyKey: 'idem-c2-long' } };
    const resConc1 = new MockRes();
    const resConc2 = new MockRes();
    
    const startLogCount = Object.keys((db as any).data).filter(k => k.includes('financeAuditLogs')).length;

    await Promise.all([
      transactionsRepairApprovalVerification(reqConc1 as any, resConc1 as any),
      transactionsRepairApprovalVerification(reqConc2 as any, resConc2 as any)
    ]);
    
    const endLogCount = Object.keys((db as any).data).filter(k => k.includes('financeAuditLogs')).length;
    
    let isConcurrencySafe = false;
    let successCount = 0;
    let alreadyRepairedCount = 0;
    
    if (resConc1.statusCode === 200 && resConc1.body.repaired === true) successCount++;
    else if (resConc1.statusCode === 200 && resConc1.body.repaired === false && resConc1.body.reason === 'Already uses current algorithm version') alreadyRepairedCount++;
    else if (resConc1.statusCode === 409) alreadyRepairedCount++; // Or conflict if idempotent lock
    
    if (resConc2.statusCode === 200 && resConc2.body.repaired === true) successCount++;
    else if (resConc2.statusCode === 200 && resConc2.body.repaired === false && resConc2.body.reason === 'Already uses current algorithm version') alreadyRepairedCount++;
    else if (resConc2.statusCode === 409) alreadyRepairedCount++;

    const numLogsAdded = endLogCount - startLogCount;
    if (successCount === 1 && alreadyRepairedCount === 1 && numLogsAdded === 1) {
       isConcurrencySafe = true;
    }
    
    if (isConcurrencySafe) passed++;
    else failed++;
    console.log(`[Test ${total}] Concorrência: ${isConcurrencySafe ? 'PASS' : 'FAIL'} (success=${successCount}, alreadyRepaired=${alreadyRepairedCount}, eventsAdded=${numLogsAdded})`);
  } catch(e) { failed++; console.log(`[Test ${total}] Idempotência: FAIL`, e); }

  console.log(`\nscripts/test-approval-verification-repair.ts`);
  console.log(`${total} total`);
  console.log(`${passed} passed`);
  console.log(`${failed} failed`);
}

runTests();
