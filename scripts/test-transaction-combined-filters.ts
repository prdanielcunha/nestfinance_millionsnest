import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeTransactionWorkspaceFilters,
} from '../shared/finance/transactionWorkspaceView.js';
import { getTransactionListQueryBounds } from '../shared/finance/ledger/listQueryKeys.js';

assert.deepStrictEqual(
  normalizeTransactionWorkspaceFilters({
    direction: 'expense',
    status: 'posted',
    occurredFrom: '2026-09-01',
    occurredTo: '2026-09-30',
    order: 'oldest',
  }),
  {
    direction: 'expense',
    status: 'posted',
    occurredFrom: '2026-09-01',
    occurredTo: '2026-09-30',
    order: 'oldest',
  },
);
assert.deepStrictEqual(
  normalizeTransactionWorkspaceFilters({
    direction: 'income',
    status: 'draft',
  }),
  {
    direction: 'income',
    status: 'draft',
    occurredFrom: null,
    occurredTo: null,
    order: 'newest',
  },
  'legacy saved views default to no date limit and newest ordering',
);
assert.equal(
  normalizeTransactionWorkspaceFilters({
    direction: 'income',
    status: 'draft',
    occurredFrom: '2026-09-31',
    occurredTo: null,
    order: 'newest',
  }),
  null,
  'invalid calendar dates are rejected',
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
  'inverted date ranges are rejected',
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
  'unknown ordering is rejected',
);

const bounded = getTransactionListQueryBounds(
  'entity-a',
  'expense',
  'posted',
  '2026-09-01T00:00:00.000Z',
  '2026-09-30T23:59:59.999Z',
);
assert.equal(
  bounded.field,
  'listQueryKeys.directionStatus',
  'direction + status + period remain a single canonical listQueryKey range',
);
assert.ok(bounded.startAt.startsWith('entity-a|expense|posted|'));
assert.ok(bounded.endBefore.startsWith('entity-a|expense|posted|'));

const [handler, page, savedViews, savedViewsList] = await Promise.all([
  readFile('server/vercel-handlers/finance/transactionsList.ts', 'utf8'),
  readFile('src/pages/finance/transactions/TransactionsListPage.tsx', 'utf8'),
  readFile('src/components/finance/TransactionSavedViews.tsx', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionWorkspaceViewsList.ts', 'utf8'),
]);

assert.ok(handler.includes('normalizeDateFilter'));
assert.ok(handler.includes("error: 'INVALID_TRANSACTION_DATE_RANGE'"));
assert.ok(handler.includes("error: 'INVALID_TRANSACTION_ORDER'"));
assert.ok(handler.includes("filters?.order === 'oldest' ? 'desc' : 'asc'"));
assert.ok(handler.includes('getTransactionListQueryBounds('));

assert.ok(page.includes("searchParams.get('from')"));
assert.ok(page.includes("searchParams.get('to')"));
assert.ok(page.includes("searchParams.get('order') === 'oldest'"));
assert.ok(page.includes('dateOnlyStartIso(fromFilter)'));
assert.ok(page.includes('dateOnlyEndIso(toFilter)'));
assert.ok(page.includes('type="date"'));
assert.ok(page.includes("updateDateFilter('from'"));
assert.ok(page.includes("updateDateFilter('to'"));
assert.ok(page.includes('max={toFilter || undefined}'));
assert.ok(page.includes('min={fromFilter || undefined}'));
assert.ok(page.includes("updateOrder(option.value)"));
assert.ok(page.includes("next.set('from', filters.occurredFrom)"));
assert.ok(page.includes("next.set('to', filters.occurredTo)"));
assert.ok(page.includes("next.set('order', 'oldest')"));

assert.ok(savedViews.includes('(a.occurredFrom || null) === (b.occurredFrom || null)'));
assert.ok(savedViews.includes("(a.order || 'newest') === (b.order || 'newest')"));
assert.ok(
  savedViewsList.includes('normalizeTransactionWorkspaceFilters(data.filters)'),
  'stored legacy views are normalized on read before reaching clients',
);

console.log('✅ Combined transaction filters are URL-backed, saved-view compatible and index-stable');
