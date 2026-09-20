import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY,
  normalizeTransactionWorkspaceFilters,
  normalizeTransactionWorkspaceViewName,
} from '../shared/finance/transactionWorkspaceView.js';

assert.equal(TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY, 12);
assert.equal(normalizeTransactionWorkspaceViewName('  Pendências   da semana  '), 'Pendências da semana');
assert.equal(normalizeTransactionWorkspaceViewName('   '), null);
assert.equal(normalizeTransactionWorkspaceViewName('x'.repeat(49)), null);
assert.deepStrictEqual(
  normalizeTransactionWorkspaceFilters({ direction: 'income', status: 'ready_for_review' }),
  { direction: 'income', status: 'ready_for_review' },
);
assert.equal(
  normalizeTransactionWorkspaceFilters({ direction: 'invalid', status: 'draft' }),
  null,
);

const [listHandler, saveHandler, deleteHandler, gateway, contracts, service, hook, page, component, rules] =
  await Promise.all([
    readFile('server/vercel-handlers/finance/transactionWorkspaceViewsList.ts', 'utf8'),
    readFile('server/vercel-handlers/finance/transactionWorkspaceViewsSave.ts', 'utf8'),
    readFile('server/vercel-handlers/finance/transactionWorkspaceViewsDelete.ts', 'utf8'),
    readFile('api/finance-gateway.ts', 'utf8'),
    readFile('scripts/check-api-contracts.mjs', 'utf8'),
    readFile('src/services/transactionsService.ts', 'utf8'),
    readFile('src/hooks/finance/useTransactions.ts', 'utf8'),
    readFile('src/pages/finance/transactions/TransactionsListPage.tsx', 'utf8'),
    readFile('src/components/finance/TransactionSavedViews.tsx', 'utf8'),
    readFile('firestore.rules', 'utf8'),
  ]);

for (const source of [listHandler, saveHandler, deleteHandler]) {
  assert.ok(source.includes("resolveFinanceRequestContext(req, 'finance.view')"));
  assert.ok(source.includes(".collection('workspaceViewOwners')"));
  assert.ok(source.includes('.doc(uid)'));
  assert.ok(!source.includes('financeAuditLogs'));
}

assert.ok(saveHandler.includes('db.runTransaction'));
assert.ok(saveHandler.includes('transaction.get('));
assert.ok(saveHandler.includes('WORKSPACE_VIEW_LIMIT_REACHED'));
assert.ok(saveHandler.includes('TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY'));
assert.ok(deleteHandler.includes("data.ownerUid !== uid"));
assert.ok(gateway.includes("case 'transaction-workspace-views-list'"));
assert.ok(gateway.includes("case 'transaction-workspace-views-save'"));
assert.ok(gateway.includes("case 'transaction-workspace-views-delete'"));
assert.ok(contracts.includes("operation: 'transaction-workspace-views-list'"));
assert.ok(contracts.includes("operation: 'transaction-workspace-views-save'"));
assert.ok(contracts.includes("operation: 'transaction-workspace-views-delete'"));
assert.ok(service.includes('listWorkspaceViews('));
assert.ok(service.includes('saveWorkspaceView('));
assert.ok(service.includes('deleteWorkspaceView('));
assert.ok(hook.includes('listWorkspaceViews'));
assert.ok(hook.includes('saveWorkspaceView'));
assert.ok(hook.includes('deleteWorkspaceView'));
assert.ok(page.includes('<TransactionSavedViews'));
assert.ok(page.includes('onApply={applySavedView}'));
assert.ok(component.includes("PT: {") && component.includes("EN: {") && component.includes("ES: {"));
assert.ok(component.includes('activeFinanceEntityId'));
assert.ok(component.includes('views.length >= limit'));
assert.ok(
  rules.includes('match /financeEntities/{entityId}/workspaceViewOwners/{ownerId}/{document=**}') &&
    rules.includes('allow read, create, update, delete: if false;'),
);

console.log('✅ Transaction saved views contract is scoped, synchronized and server-owned');
