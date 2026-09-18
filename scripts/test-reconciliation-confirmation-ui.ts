import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [handler, panel, traceCard, detail, rules, service] = await Promise.all([
  readFile('server/vercel-handlers/finance/reconciliationConfirm.ts', 'utf8'),
  readFile('src/pages/finance/balance/ReconciliationMatchPreviewPanel.tsx', 'utf8'),
  readFile('src/pages/finance/transactions/TransactionReconciliationTraceCard.tsx', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionsDetail.ts', 'utf8'),
  readFile('firestore.rules', 'utf8'),
  readFile('src/services/reconciliationService.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

verify(
  panel.includes("PT: {") && panel.includes("EN: {") && panel.includes("ES: {"),
  'confirmation flow has PT/EN/ES user-facing language',
);
verify(
  panel.includes("confirmAction: 'Confirmar que é a mesma movimentação'") &&
    panel.includes("confirmTitle: 'Confirmar esta conferência?'") &&
    panel.includes("confirmYes: 'Sim, confirmar'") &&
    panel.includes("confirmCancel: 'Cancelar'"),
  'Portuguese flow is a clear two-step human confirmation',
);
verify(
  panel.includes('Isso não muda o valor nem o saldo') &&
    panel.includes('Nenhum valor ou saldo foi alterado'),
  'confirmation language explains the exact financial effect to a layperson',
);
verify(
  panel.includes("hasEffectiveCapability(accessState, 'finance.review')") &&
    panel.includes('candidate.reconciliationEligible') &&
    panel.includes('!line.candidateLimitReached'),
  'confirmation appears only for reviewer, eligible transaction and a fully visible candidate set',
);
verify(
  panel.includes("generateLedgerId('idem')") &&
    panel.includes("generateLedgerId('req')") &&
    !panel.includes('Math.random'),
  'confirmation uses cryptographic request/idempotency IDs rather than Math.random',
);
verify(
  panel.includes('reconciliationService.confirmMatch') &&
    panel.includes('lineNumber: pendingConfirmation.line.lineNumber') &&
    !panel.includes('selectedAmountCents:') &&
    !panel.includes('selectedDate:'),
  'browser sends only identifiers and line number, never trusted parsed financial values',
);
verify(
  panel.includes('RECONCILIATION_TOO_MANY_CANDIDATES') &&
    panel.includes('compareChanged') === false,
  'truncated candidate sets fail back to plain-language re-comparison',
);

verify(
  handler.includes("resolveFinanceRequestContext(req, 'finance.review')"),
  'server confirmation requires finance.review',
);
verify(
  handler.includes("txData.status !== 'posted'") &&
    handler.includes("txData.reconciliationStatus !== 'unreconciled'"),
  'server confirms only posted and explicitly unreconciled transactions',
);
verify(
  handler.includes('buildStatementLineFingerprint') &&
    handler.includes('buildReconciliationId') &&
    handler.includes('t.create(reconciliationRef'),
  'server gives each statement line a deterministic single confirmation record',
);
verify(
  handler.includes('RECONCILIATION_TOO_MANY_CANDIDATES') &&
    handler.includes('candidateLimitReached'),
  'server refuses confirmation when candidate visibility is truncated',
);
verify(
  handler.includes('executeWithIdempotency') &&
    handler.includes("operation: 'reconciliation_confirm'") === false &&
    handler.includes("'reconciliation_confirm'"),
  'confirmation uses scoped idempotency',
);
verify(
  handler.includes("action: 'transaction.reconciled'") &&
    handler.includes("eventType: 'RECONCILIATION_MATCHED'") &&
    handler.includes("eventType: 'reconciled'"),
  'confirmation records audit, canonical fact and transaction history event',
);
verify(
  handler.includes("balanceChanged: false") &&
    handler.includes("journalChanged: false"),
  'confirmation declares that balance and journal are unchanged',
);

const updateStart = handler.indexOf('t.update(txRef');
const updateEnd = handler.indexOf('const auditId', updateStart);
const updateBlock = handler.slice(updateStart, updateEnd);
for (const forbidden of [
  'amountCents:',
  'accountId:',
  'categoryId:',
  'status:',
  'contentVersion:',
  'currency:',
  'cashFlowDirection:',
]) {
  verify(
    !updateBlock.includes(forbidden),
    'transaction reconciliation update does not mutate financial field ' + forbidden,
  );
}
verify(
  updateBlock.includes("reconciliationStatus: 'reconciled'") &&
    updateBlock.includes('reconciliationEvidenceId') &&
    updateBlock.includes('reconciledAt') &&
    updateBlock.includes('version: newVersion'),
  'transaction update is limited to reconciliation trace metadata and version',
);

for (const forbidden of [
  "collection('financeJournalEntries')",
  "collection('financeBalances')",
  "collection('financeAggregates')",
  'generateContent',
  '@google/genai',
  'OpenAI',
]) {
  verify(!handler.includes(forbidden), 'confirmation handler has no dependency/write to ' + forbidden);
}

verify(
  rules.includes("'financeReconciliations'") &&
    rules.includes('match /financeReconciliations/{id=**}') &&
    rules.includes('allow write: if false;'),
  'direct browser writes to reconciliation records are blocked by Firestore Rules',
);
verify(
  service.includes('operation=reconciliation-confirm') &&
    service.includes('confirmMatch('),
  'client confirmation uses only the certified finance gateway',
);
verify(
  traceCard.includes("title: 'Conferida com extrato'") &&
    traceCard.includes("sourceValue: 'Extrato bancário'") &&
    traceCard.includes("EN: {") &&
    traceCard.includes("ES: {"),
  'transaction trace is plain-language and localized while preserving evidence drill-down',
);
verify(
  detail.includes('reconciliationId:') &&
    detail.includes('reconciliationEvidenceId:') &&
    detail.includes('reconciledAt:') &&
    detail.includes('reconciledByUid:'),
  'transaction detail exposes accountant-grade reconciliation trace metadata',
);

console.log('\nReconciliation Confirmation UI/Authority totals: ' + passed + ' Passed');
