import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [list, inspector] = await Promise.all([
  readFile('src/pages/finance/transactions/TransactionsListPage.tsx', 'utf8'),
  readFile('src/components/finance/TransactionInspector.tsx', 'utf8'),
]);

assert.ok(
  list.includes("const inspectedTransactionId = searchParams.get('inspect')"),
  'transaction list derives inspector selection from the URL',
);
assert.ok(
  list.includes("next.set('inspect', transactionId)") &&
    list.includes("next.delete('inspect')"),
  'opening and closing quick view preserves the existing filter query string',
);
assert.ok(
  list.includes('onClick={() => openInspector(item.id)}'),
  'transaction rows open the inspector instead of discarding list context',
);
assert.ok(
  list.includes('<TransactionInspector') &&
    list.includes('transactionId={inspectedTransactionId}'),
  'transaction list renders the inspector from URL state',
);
assert.ok(
  !list.includes("onClick={() => navigate(APP_ROUTES.transactionDetail.replace(':transactionId', item.id))}"),
  'row click no longer performs a hard context switch to detail',
);

assert.ok(inspector.includes('role="dialog"'));
assert.ok(inspector.includes('aria-modal="true"'));
assert.ok(inspector.includes("if (event.key === 'Escape') onClose()"));
assert.ok(inspector.includes("document.body.style.overflow = 'hidden'"));
assert.ok(
  inspector.includes('sm:w-[min(92vw,32rem)]') &&
    inspector.includes('max-h-[92vh]') &&
    inspector.includes('sm:h-full'),
  'inspector has distinct mobile sheet and desktop side-panel behavior',
);
assert.ok(inspector.includes('getTransactionDetail(transactionId)'));
assert.ok(inspector.includes("APP_ROUTES.transactionDetail.replace(':transactionId', transactionId)"));
assert.ok(inspector.includes("APP_ROUTES.transactionEdit.replace(':transactionId', transactionId)"));
assert.ok(inspector.includes('const canEdit = Boolean(detail?.capabilities?.canEdit)'));
assert.ok(
  inspector.includes("setDetail(null)") &&
    inspector.includes('setFailed(false)') &&
    inspector.includes('setLoading(true)'),
  'inspector clears stale detail before a new fetch',
);
assert.ok(
  inspector.includes("PT: {") &&
    inspector.includes("EN: {") &&
    inspector.includes("ES: {"),
  'inspector ships localized copy in all supported languages',
);

console.log('✅ Premium transaction inspector preserves context, authority and responsive behavior');
