import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeTransactionWorkspaceFilters,
} from '../shared/finance/transactionWorkspaceView.js';
import { getTransactionListQueryBounds } from '../shared/finance/ledger/listQueryKeys.js';

const legacy = normalizeTransactionWorkspaceFilters({
  direction: 'expense',
  status: 'posted',
  occurredFrom: '2026-09-01',
  occurredTo: '2026-09-30',
  order: 'oldest',
});
assert.deepStrictEqual(legacy, {
  direction: 'expense',
  status: 'posted',
  occurredFrom: '2026-09-01',
  occurredTo: '2026-09-30',
  order: 'oldest',
});

const complete = normalizeTransactionWorkspaceFilters({
  direction: 'income',
  status: 'ready_for_review',
  occurredFrom: '2026-01-01',
  occurredTo: '2026-12-31',
  order: 'newest',
  dateBase: 'competence',
  categoryId: 'cat_tithe',
  accountId: 'acc_main',
  fundId: 'fund_general',
  costCenterId: 'cc_worship',
  paymentMethod: 'pix',
  sourceContext: 'manual',
  origin: 'manual',
  evidence: 'with_evidence',
  quality: 'unreconciled',
  amountMinCents: 1000,
  amountMaxCents: 500000,
  searchQuery: 'dízimo',
});
assert.equal(complete?.dateBase, 'competence');
assert.equal(complete?.categoryId, 'cat_tithe');
assert.equal(complete?.accountId, 'acc_main');
assert.equal(complete?.fundId, 'fund_general');
assert.equal(complete?.costCenterId, 'cc_worship');
assert.equal(complete?.paymentMethod, 'pix');
assert.equal(complete?.origin, 'manual');
assert.equal(complete?.evidence, 'with_evidence');
assert.equal(complete?.quality, 'unreconciled');
assert.equal(complete?.amountMinCents, 1000);
assert.equal(complete?.amountMaxCents, 500000);
assert.equal(complete?.searchQuery, 'dízimo');

assert.equal(
  normalizeTransactionWorkspaceFilters({
    direction: 'income',
    status: 'draft',
    occurredFrom: '2026-09-31',
    occurredTo: null,
    order: 'newest',
  }),
  null,
);
assert.equal(
  normalizeTransactionWorkspaceFilters({
    direction: 'income',
    status: 'draft',
    occurredFrom: '2026-10-01',
    occurredTo: '2026-09-01',
    order: 'newest',
  }),
  null,
);
assert.equal(
  normalizeTransactionWorkspaceFilters({
    direction: 'income',
    status: 'draft',
    occurredFrom: null,
    occurredTo: null,
    order: 'sideways',
  }),
  null,
);
assert.equal(
  normalizeTransactionWorkspaceFilters({
    direction: 'income',
    status: 'draft',
    occurredFrom: null,
    occurredTo: null,
    order: 'newest',
    amountMinCents: 5000,
    amountMaxCents: 1000,
  }),
  null,
);

const bounded = getTransactionListQueryBounds(
  'entity-a',
  'expense',
  'posted',
  '2026-09-01T00:00:00.000Z',
  '2026-09-30T23:59:59.999Z',
);
assert.equal(bounded.field, 'listQueryKeys.directionStatus');
assert.ok(bounded.startAt.startsWith('entity-a|expense|posted|'));
assert.ok(bounded.endBefore.startsWith('entity-a|expense|posted|'));

const [handler, page, filtersUi, savedViews, savedViewsList, indexes] = await Promise.all([
  readFile('server/vercel-handlers/finance/transactionsList.ts', 'utf8'),
  readFile('src/pages/finance/transactions/TransactionsListPage.tsx', 'utf8'),
  readFile('src/pages/finance/transactions/TransactionHistoryFilters.tsx', 'utf8'),
  readFile('src/components/finance/TransactionSavedViews.tsx', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionWorkspaceViewsList.ts', 'utf8'),
  readFile('firestore.indexes.json', 'utf8'),
]);

for (const token of [
  'dateBase',
  'categoryId',
  'accountId',
  'fundId',
  'costCenterId',
  'paymentMethod',
  'origin',
  'evidence',
  'quality',
  'amountMinCents',
  'amountMaxCents',
]) {
  assert.ok(handler.includes(token), `transactionsList must support ${token}`);
}
assert.ok(handler.includes('loadAllocations('));
assert.ok(handler.includes('getAllocationsQuery()'));
assert.ok(handler.includes('MAX_SCANNED_DOCS'));
assert.ok(handler.includes('sourceTruncated'));
assert.ok(handler.includes("financialMutation: false"));
assert.ok(handler.includes('getTransactionListQueryBounds('));
assert.ok(handler.includes("dateBase === 'competence'"));
assert.ok(handler.includes("dateBase === 'recorded'"));

for (const param of [
  "searchParams.get('dateBase')",
  "searchParams.get('categoryId')",
  "searchParams.get('accountId')",
  "searchParams.get('fundId')",
  "searchParams.get('costCenterId')",
  "searchParams.get('paymentMethod')",
  "searchParams.get('origin')",
  "searchParams.get('evidence')",
  "searchParams.get('quality')",
  "searchParams.get('minCents')",
  "searchParams.get('maxCents')",
]) {
  assert.ok(page.includes(param), `URL-backed filter missing: ${param}`);
}
assert.ok(page.includes('<TransactionHistoryFilters'));
assert.ok(page.includes("applyPeriodPreset"));
assert.ok(page.includes("applyMonth"));
assert.ok(page.includes("setAmountFilter"));
assert.ok(page.includes("lg:hidden"));
assert.ok(page.includes('role="dialog"'));

assert.ok(filtersUi.includes("type=\"month\""));
assert.ok(filtersUi.includes("type=\"date\""));
assert.ok(filtersUi.includes("dateBase"));
assert.ok(filtersUi.includes("quickCategories"));
assert.ok(filtersUi.includes("amountMinCents"));
assert.ok(filtersUi.includes("amountMaxCents"));

for (const field of [
  'dateBase',
  'categoryId',
  'accountId',
  'fundId',
  'costCenterId',
  'paymentMethod',
  'origin',
  'evidence',
  'quality',
  'amountMinCents',
  'amountMaxCents',
  'searchQuery',
]) {
  assert.ok(savedViews.includes(`a.${field}`) || savedViews.includes(`a.${field} `), `saved-view equality must include ${field}`);
}
assert.ok(savedViewsList.includes('normalizeTransactionWorkspaceFilters(data.filters)'));
assert.ok(indexes.includes('"fieldPath": "competenceDate"'));
assert.ok(indexes.includes('"fieldPath": "recordedAt"'));

console.log('✅ Historical transaction filters cover date bases, allocations, provenance, quality, saved views and incomplete-source disclosure');
