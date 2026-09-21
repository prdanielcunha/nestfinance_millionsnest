import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildTransactionSearchKeys,
  normalizeTransactionSearchQuery,
  normalizeTransactionSearchText,
  transactionMatchesSearchQuery,
} from '../shared/finance/transactionSearch.js';

assert.equal(normalizeTransactionSearchText('  José da SILVA  '), 'jose da silva');
assert.equal(normalizeTransactionSearchText('PIX • Oferta'), 'pix oferta');
assert.equal(normalizeTransactionSearchQuery('a'), null);
assert.equal(normalizeTransactionSearchQuery(' '.repeat(3)), null);
assert.equal(normalizeTransactionSearchQuery('José')?.lookupKey, 'jose');

const keys = buildTransactionSearchKeys({
  id: 'tx_abc123',
  description: 'Oferta Missionária',
  counterparty: 'José da Silva',
  paymentMethod: 'PIX',
  accountSnapshot: { name: 'Conta Principal' },
});
assert.ok(keys.includes('of'));
assert.ok(keys.includes('oferta'));
assert.ok(keys.includes('mi'));
assert.ok(keys.includes('missionaria'));
assert.ok(keys.includes('jo'));
assert.ok(keys.includes('jose'));
assert.ok(keys.includes('pi'));
assert.ok(keys.includes('pix'));

assert.equal(
  transactionMatchesSearchQuery(
    {
      description: 'Oferta Missionária',
      counterparty: 'José da Silva',
      paymentMethod: 'PIX',
    },
    'jose miss',
  ),
  true,
);
assert.equal(
  transactionMatchesSearchQuery(
    { amountCents: 35000, occurredAt: '2026-08-12T12:00:00.000Z' },
    '350,00',
  ),
  true,
);
assert.equal(
  transactionMatchesSearchQuery(
    { amountCents: 35000, occurredAt: '2026-08-12T12:00:00.000Z' },
    '12/08',
  ),
  true,
);
assert.equal(
  transactionMatchesSearchQuery(
    { description: 'Oferta Missionária', counterparty: 'José da Silva' },
    'jo aluguel',
  ),
  false,
);

const [
  createDraft,
  createAndSubmit,
  updateDraft,
  searchHandler,
  preview,
  apply,
  verify,
  gateway,
  contracts,
  page,
  reviewPage,
  reviewCopy,
  service,
  hook,
  rules,
] = await Promise.all([
  readFile('server/vercel-handlers/finance/transactionsCreateDraft.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionsCreateAndSubmit.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionsUpdateDraft.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionSearch.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionSearchPreview.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionSearchApply.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionSearchVerify.ts', 'utf8'),
  readFile('api/finance-gateway.ts', 'utf8'),
  readFile('scripts/check-api-contracts.mjs', 'utf8'),
  readFile('src/pages/finance/transactions/TransactionsListPage.tsx', 'utf8'),
  readFile('src/pages/finance/transactions/ReviewPage.tsx', 'utf8'),
  readFile('src/pages/finance/transactions/transactionReviewCopy.ts', 'utf8'),
  readFile('src/services/transactionsService.ts', 'utf8'),
  readFile('src/hooks/finance/useTransactions.ts', 'utf8'),
  readFile('firestore.rules', 'utf8'),
]);

for (const writer of [createDraft, createAndSubmit, updateDraft]) {
  assert.ok(writer.includes("import { stageTransactionSearchIndex } from './transactionSearchIndex.js'"));
  assert.ok(writer.includes('stageTransactionSearchIndex('));
}
assert.ok(searchHandler.includes("searchMode: 'index' | 'canonical_fallback'"));
assert.ok(searchHandler.includes("coverage.status === 'certified'"));
assert.ok(searchHandler.includes(".where('searchKeys', 'array-contains', normalizedQuery.lookupKey)"));
assert.ok(searchHandler.includes('FALLBACK_SCAN_LIMIT = 1000'));
assert.ok(searchHandler.includes('transactionMatchesSearchQuery('));
assert.ok(searchHandler.includes("resolveFinanceRequestContext(req, 'finance.view')"));
assert.ok(preview.includes("resolveFinanceRequestContext(req, 'finance.view')"));
for (const managerHandler of [apply, verify]) {
  assert.ok(managerHandler.includes("hasEffectiveCapability(sessionList, 'finance.manage')"));
  assert.ok(managerHandler.includes('FORBIDDEN_SEARCH_INDEX_MANAGEMENT'));
}
for (const operation of [
  'transaction-search',
  'transaction-search-preview',
  'transaction-search-apply',
  'transaction-search-verify',
]) {
  assert.ok(gateway.includes("case '" + operation + "'"));
  assert.ok(contracts.includes("operation: '" + operation + "'"));
}
assert.ok(service.includes('async search('));
assert.ok(hook.includes('searchTransactions'));
assert.ok(page.includes("searchParams.get('q')"));
assert.ok(page.includes('setTimeout(() =>'));
assert.ok(page.includes('searchTransactions(normalizedSearchQuery'));
assert.ok(page.includes("searchMode === 'canonical_fallback'"));
assert.ok(page.includes("PT: {") && page.includes("EN: {") && page.includes("ES: {"));
assert.ok(reviewPage.includes("searchParams.get('q')"));
assert.ok(reviewPage.includes('searchTransactions('));
assert.ok(reviewPage.includes('normalizedSearchQuery'));
assert.ok(reviewPage.includes("status: 'ready_for_review'"));
assert.ok(reviewPage.includes('setTimeout(() =>'));
assert.ok(reviewPage.includes("searchMode === 'canonical_fallback'"));
assert.ok(reviewPage.includes('sourceTruncated') && reviewPage.includes('resultTruncated'));
assert.ok(
  reviewCopy.includes("PT: {") &&
    reviewCopy.includes("EN: {") &&
    reviewCopy.includes("ES: {") &&
    reviewCopy.includes('searchPlaceholder') &&
    reviewCopy.includes('searchTruncatedHint'),
);
assert.ok(
  rules.includes('match /financeEntities/{entityId}/transactionSearchIndex/{document=**}') &&
    rules.includes('match /financeSearchCoverage/{document=**}'),
);

console.log('✅ Universal transaction search is indexed, fallback-safe, scoped, live-maintained and available in the review queue');
