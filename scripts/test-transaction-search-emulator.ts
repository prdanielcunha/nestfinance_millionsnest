import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import transactionSearch from '../server/vercel-handlers/finance/transactionSearch.js';
import transactionSearchApply from '../server/vercel-handlers/finance/transactionSearchApply.js';
import transactionSearchVerify from '../server/vercel-handlers/finance/transactionSearchVerify.js';
import transactionSearchPreview from '../server/vercel-handlers/finance/transactionSearchPreview.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader() { return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-transaction-search-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Transaction search test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = 'org_tx_search_' + suffix;
const entityA = 'ent_tx_search_a_' + suffix;
const entityB = 'ent_tx_search_b_' + suffix;
const uid = 'usr_tx_search_' + suffix;

await db.collection('organizations').doc(orgId).set({ name: 'Search Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
for (const entityId of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId).set({
    name: entityId,
    active: true,
  });
}

const txA1 = 'tx_search_a1_' + suffix;
const txA2 = 'tx_search_a2_' + suffix;
const txA3 = 'tx_search_a3_' + suffix;
const txB1 = 'tx_search_b1_' + suffix;

async function seedTx(id: string, entityId: string, overrides: Record<string, unknown>) {
  await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(id).set({
    id,
    organizationId: orgId,
    financeEntityId: entityId,
    transactionKind: 'income',
    direction: 'income',
    status: 'posted',
    amountCents: 10000,
    currency: 'BRL',
    occurredAt: '2026-09-10T12:00:00.000Z',
    recordedAt: '2026-09-10T12:01:00.000Z',
    paymentMethod: 'pix',
    sourceContext: 'manual',
    description: 'Oferta Missionária',
    counterparty: 'José da Silva',
    accountId: 'acc-main',
    accountSnapshot: {
      id: 'acc-main',
      name: 'Conta Principal',
      type: 'bank_checking',
      nature: 'asset',
    },
    reconciliationStatus: 'unreconciled',
    evidenceIds: [],
    allocationIds: [],
    createdBy: uid,
    updatedBy: uid,
    version: 1,
    contentVersion: 1,
    schemaVersion: 1,
    ...overrides,
  });
}

await seedTx(txA1, entityA, {});
await seedTx(txA2, entityA, {
  transactionKind: 'expense',
  direction: 'expense',
  description: 'Aluguel do templo',
  counterparty: 'Imobiliária Central',
  occurredAt: '2026-09-15T12:00:00.000Z',
});

await db.collection('organizations').doc(orgId).collection('financeAccounts').doc('acc-review').set({
  id: 'acc-review',
  organizationId: orgId,
  financeEntityId: entityA,
  name: 'Conta Review',
  active: true,
  configurationStatus: 'complete',
  type: 'bank_checking',
  nature: 'asset',
  templateKey: 'main_checking',
  supportedPaymentInstruments: ['pix'],
});
await seedTx(txA3, entityA, {
  status: 'ready_for_review',
  accountId: 'acc-review',
  accountSnapshot: {
    id: 'acc-review',
    name: 'Conta Review',
    type: 'bank_checking',
    nature: 'asset',
  },
  description: 'Review signal ready',
  counterparty: 'Fornecedor Review',
  occurredAt: '2026-09-20T12:00:00.000Z',
  evidenceIds: ['evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  allocationIds: ['alloc-review-' + suffix],
});
await db.collection('organizations').doc(orgId).collection('financeAllocations').doc('alloc-review-' + suffix).set({
  id: 'alloc-review-' + suffix,
  organizationId: orgId,
  financeEntityId: entityA,
  transactionId: txA3,
  categoryId: 'cat-review',
  amountCents: 10000,
});

await seedTx(txB1, entityB, {
  description: 'Oferta outra entidade',
  counterparty: 'José da Silva',
});

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

const call = async (handler: any, body: any) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer transaction-search-test',
      'x-organization-id': orgId,
    },
    body,
    query: {},
  };
  const res = new MockRes();
  await handler(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const before = await call(transactionSearchPreview, { financeEntityId: entityA });
  verify(
    before.statusCode === 200 &&
      before.body.ready === false &&
      before.body.missingOrStale === 3,
    'preview detects historical transactions missing from search index',
  );

  const fallback = await call(transactionSearch, {
    financeEntityId: entityA,
    query: 'jose miss',
    filters: { direction: 'all', status: 'all', order: 'newest' },
  });
  verify(
    fallback.statusCode === 200 &&
      fallback.body.searchMode === 'canonical_fallback' &&
      fallback.body.indexCertified === false &&
      fallback.body.items.length === 1 &&
      fallback.body.items[0].id === txA1,
    'search works safely from canonical source before index certification',
  );
  verify(
    fallback.body.items.every((item: any) => item.id !== txB1),
    'canonical fallback never leaks another finance entity',
  );

  const applied = await call(transactionSearchApply, {
    financeEntityId: entityA,
    batchSize: 50,
  });
  verify(
    applied.statusCode === 200 &&
      applied.body.applied === 3 &&
      applied.body.complete === true,
    'manager backfill creates all missing index documents',
  );

  const certified = await call(transactionSearchVerify, { financeEntityId: entityA });
  verify(
    certified.statusCode === 200 &&
      certified.body.certified === true &&
      certified.body.missingOrStaleCount === 0,
    'coverage is certified only after exact source/index verification',
  );

  const indexed = await call(transactionSearch, {
    financeEntityId: entityA,
    query: 'oferta',
    filters: { direction: 'income', status: 'posted', order: 'newest' },
  });
  verify(
    indexed.statusCode === 200 &&
      indexed.body.searchMode === 'index' &&
      indexed.body.indexCertified === true &&
      indexed.body.items.length === 1 &&
      indexed.body.items[0].id === txA1,
    'certified search switches to derived index and preserves filters',
  );

  const accent = await call(transactionSearch, {
    financeEntityId: entityA,
    query: 'jose',
    filters: { direction: 'all', status: 'all', order: 'newest' },
  });
  verify(
    accent.body.items.length === 1 && accent.body.items[0].id === txA1,
    'accent-insensitive lookup returns José when searching jose',
  );

  const reviewSearch = await call(transactionSearch, {
    financeEntityId: entityA,
    query: 'review signal',
    filters: { direction: 'income', status: 'ready_for_review', order: 'newest' },
  });
  verify(
    reviewSearch.statusCode === 200 &&
      reviewSearch.body.items.length === 1 &&
      reviewSearch.body.items[0].id === txA3 &&
      reviewSearch.body.items[0].blockerCount === 0 &&
      reviewSearch.body.items[0].warningCount === 0 &&
      reviewSearch.body.items[0].isReady === true,
    'review search preserves deterministic readiness metadata',
  );

  const noLeak = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityA)
    .collection('transactionSearchIndex')
    .doc(txB1)
    .get();
  verify(!noLeak.exists, 'entity A index never receives entity B transactions');

  console.log('\nTransaction Search Emulator totals: ' + passed + ' Passed');
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
