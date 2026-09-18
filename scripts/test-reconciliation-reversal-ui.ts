import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  reverseHandler,
  confirmHandler,
  traceCard,
  detailPage,
  detailHandler,
  service,
  rules,
  factContract,
] = await Promise.all([
  readFile('server/vercel-handlers/finance/reconciliationReverse.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/reconciliationConfirm.ts', 'utf8'),
  readFile('src/pages/finance/transactions/TransactionReconciliationTraceCard.tsx', 'utf8'),
  readFile('src/pages/finance/transactions/TransactionDetailPage.tsx', 'utf8'),
  readFile('server/vercel-handlers/finance/transactionsDetail.ts', 'utf8'),
  readFile('src/services/reconciliationService.ts', 'utf8'),
  readFile('firestore.rules', 'utf8'),
  readFile('shared/intelligence/canonicalFact.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

verify(
  traceCard.includes("PT: {") &&
    traceCard.includes("EN: {") &&
    traceCard.includes("ES: {"),
  'undo flow has PT/EN/ES user-facing language',
);
verify(
  traceCard.includes("undoAction: 'Desfazer conferência'") &&
    traceCard.includes("undoTitle: 'Desfazer esta conferência?'") &&
    traceCard.includes("confirmUndo: 'Sim, desfazer conferência'"),
  'Portuguese primary action is plain-language instead of technical reconciliation jargon',
);
verify(
  traceCard.includes('Isso não apaga o histórico') &&
    traceCard.includes('não muda valor nem saldo') &&
    traceCard.includes("reversedTitle: 'Conferência desfeita'"),
  'layperson is told exactly what undo changes and what it preserves',
);
verify(
  traceCard.includes("wrong_transaction: 'Escolhi a movimentação errada'") &&
    traceCard.includes("wrong_statement_item: 'Escolhi o item errado do extrato'") &&
    traceCard.includes("duplicate_confirmation: 'Confirmei em duplicidade'"),
  'undo reasons use concrete human language',
);
verify(
  traceCard.includes("hasEffectiveCapability(accessState, 'finance.review')") &&
    traceCard.includes('reconciliationService.reverseMatch'),
  'only finance reviewers receive the certified undo action',
);
verify(
  traceCard.includes("generateLedgerId('idem')") &&
    traceCard.includes("generateLedgerId('req')") &&
    !traceCard.includes('Math.random'),
  'undo uses cryptographic idempotency/request IDs',
);
verify(
  traceCard.includes('maxLength={300}') &&
    traceCard.includes("note: note.trim() || null"),
  'optional free-text note is bounded and normalized client-side before server validation',
);

verify(
  reverseHandler.includes("resolveFinanceRequestContext(req, 'finance.review')"),
  'server reversal requires finance.review',
);
verify(
  reverseHandler.includes("txData.reconciliationStatus !== 'reconciled'") &&
    reverseHandler.includes('txData.reconciliationId !== reconciliationId'),
  'server reverses only the exact currently active reconciliation',
);
verify(
  reverseHandler.includes("reconciliation.status !== 'confirmed'") &&
    reverseHandler.includes('RECONCILIATION_LINE_LOCK_MISMATCH'),
  'server validates immutable confirmation and active line-lock consistency',
);
verify(
  reverseHandler.includes("reasonCode") &&
    reverseHandler.includes('normalizedNote') &&
    reverseHandler.includes('normalized.length > 300'),
  'server requires a controlled reason and bounds optional note',
);
verify(
  reverseHandler.includes("status: 'released'") &&
    reverseHandler.includes('activeReconciliationId: null') &&
    reverseHandler.includes('releaseReversalId: reversalId'),
  'undo releases active line lock without deleting immutable history',
);
verify(
  reverseHandler.includes("reconciliationStatus: 'unreconciled'") &&
    reverseHandler.includes('FieldValue.delete()') &&
    reverseHandler.includes('lastReconciliationReversalId'),
  'transaction returns to unreconciled and moves current pointers into historical trace metadata',
);

const updateStart = reverseHandler.indexOf('t.update(transactionRef');
const updateEnd = reverseHandler.indexOf('const auditId', updateStart);
const updateBlock = reverseHandler.slice(updateStart, updateEnd);
for (const forbidden of [
  'amountCents:',
  'accountId:',
  'categoryId:',
  'currency:',
  'cashFlowDirection:',
  'contentVersion:',
  "status: 'posted'",
  "status: 'draft'",
]) {
  verify(
    !updateBlock.includes(forbidden),
    'reversal transaction update does not mutate financial field/state ' + forbidden,
  );
}
verify(
  updateBlock.includes("reconciliationStatus: 'unreconciled'") &&
    updateBlock.includes('version: newVersion'),
  'reversal update is limited to reconciliation/history metadata and transaction version',
);

verify(
  reverseHandler.includes("action: 'transaction.reconciliation_reversed'") &&
    reverseHandler.includes("eventType: 'RECONCILIATION_REVERSED'") &&
    reverseHandler.includes("eventType: 'reconciliation_reversed'"),
  'undo records audit, canonical fact and human-readable transaction history',
);
verify(
  reverseHandler.includes('balanceChanged: false') &&
    reverseHandler.includes('journalChanged: false'),
  'undo explicitly declares no balance or journal authority',
);
for (const forbidden of [
  "collection('financeJournalEntries')",
  "collection('financeBalances')",
  "collection('financeAggregates')",
  'generateContent',
  '@google/genai',
  'OpenAI',
]) {
  verify(!reverseHandler.includes(forbidden), 'reversal handler has no dependency/write to ' + forbidden);
}

verify(
  confirmHandler.includes('buildReconciliationAttemptId') &&
    confirmHandler.includes('buildReconciliationLineLockId') &&
    confirmHandler.includes('legacyReconciliationSnapshot') &&
    confirmHandler.includes("lineLockData.status === 'active'"),
  'confirmation supports immutable attempts, active locks and legacy compatibility',
);
verify(
  confirmHandler.includes("lineLockData.status !== 'active'") &&
    confirmHandler.includes("lineLockData.status !== 'released'") &&
    confirmHandler.includes('t.set(lineLockRef'),
  'released line can be safely reactivated for a corrected confirmation',
);

verify(
  rules.includes("'financeReconciliationLineLocks'") &&
    rules.includes("'financeReconciliationReversals'") &&
    rules.includes('match /financeReconciliationLineLocks/{id=**}') &&
    rules.includes('match /financeReconciliationReversals/{id=**}') &&
    rules.includes('allow write: if false;'),
  'line locks and reversal history are protected from direct browser writes',
);
verify(
  service.includes('operation=reconciliation-reverse') &&
    service.includes('reverseMatch('),
  'client undo uses only the certified finance gateway',
);
verify(
  factContract.includes("'RECONCILIATION_REVERSED'"),
  'canonical fact taxonomy includes reconciliation reversal',
);
verify(
  detailHandler.includes('lastReconciliationReversalId:') &&
    detailHandler.includes('lastReconciliationEvidenceId:') &&
    detailHandler.includes('lastReconciliationReversalReason:'),
  'transaction detail exposes accountant-grade reversal trace metadata',
);
verify(
  detailPage.includes("case 'reconciliation_reversed'") &&
    detailPage.includes('Conferência desfeita') &&
    detailPage.includes('O histórico anterior foi preservado'),
  'transaction history explains reversal without raw internal codes',
);
verify(
  traceCard.includes('lastReconciliationEvidenceId') &&
    traceCard.includes('lastReconciliationReversalReason') &&
    traceCard.includes('copy.reversedTitle'),
  'primary trace card shows current undone state and preserves source drill-down',
);

console.log('\nReconciliation Reversal UI/Authority totals: ' + passed + ' Passed');
