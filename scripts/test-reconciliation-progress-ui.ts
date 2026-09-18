import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, prepPanel, handler, service, contract, builder] = await Promise.all([
  readFile('src/pages/finance/balance/ReconciliationProgressPanel.tsx', 'utf8'),
  readFile('src/pages/finance/balance/ReconciliationStatementPreparationPanel.tsx', 'utf8'),
  readFile('server/vercel-handlers/finance/reconciliationProgress.ts', 'utf8'),
  readFile('src/services/reconciliationService.ts', 'utf8'),
  readFile('shared/finance/reconciliationProgress.ts', 'utf8'),
  readFile('shared/finance/reconciliationProgressBuilder.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

verify(
  panel.includes("PT: {") && panel.includes("EN: {") && panel.includes("ES: {"),
  'reconciliation progress is localized in PT/EN/ES',
);
verify(
  panel.includes("title: 'Andamento da conferência'") &&
    panel.includes("identified: 'Itens identificados'") &&
    panel.includes("confirmed: 'Já conferidos'") &&
    panel.includes("remaining: 'Ainda faltam'") &&
    panel.includes("attention: 'Precisam de atenção'"),
  'Portuguese primary progress language is understandable to a layperson',
);
verify(
  panel.includes("confirmed: 'Conferido'") &&
    panel.includes("needs_recheck: 'Conferência desfeita — revisar novamente'") &&
    panel.includes("one_possibility: 'Uma possibilidade encontrada'") &&
    panel.includes("multiple_possibilities: 'Mais de uma possibilidade'") &&
    panel.includes("no_match: 'Sem correspondência encontrada'") &&
    panel.includes("needs_review: 'Dados precisam de conferência'"),
  'all progress states are expressed as human workflow language rather than internal codes',
);
verify(
  panel.includes('Não significa que o saldo bancário inteiro foi conciliado') &&
    contract.includes('canDeclareStatementFullyReconciled: false') &&
    contract.includes("scope: 'recognized_native_text_items_only'"),
  'UI and contract explicitly refuse a false full-bank-balance reconciliation claim',
);
verify(
  !panel.includes('100%') &&
    !panel.includes('fully reconciled') &&
    !panel.includes('reconciliationStatus'),
  'primary UI contains no misleading percentage or internal reconciliation field names',
);
verify(
  panel.includes('line.sourceDate') &&
    panel.includes('line.sourceAmountCents') &&
    panel.includes('line.sourceDirection') &&
    panel.includes('line.candidateCount') &&
    panel.includes('line.activeTransactionId'),
  'accountant depth preserves source date, amount, direction, candidate count and transaction drill-down',
);
verify(
  prepPanel.includes('<ReconciliationProgressPanel') &&
    prepPanel.indexOf('<ReconciliationProgressPanel') <
      prepPanel.indexOf('<ReconciliationMatchPreviewPanel'),
  'progress is shown before deeper matching actions in progressive disclosure order',
);
verify(
  service.includes('operation=reconciliation-progress') &&
    service.includes('progress('),
  'client progress uses only the certified finance gateway',
);
verify(
  handler.includes("resolveFinanceRequestContext(req, 'finance.view')") &&
    handler.includes("classification?.documentType !== 'bank_statement'") &&
    handler.includes("review?.status !== 'reviewed'"),
  'server requires authorized reviewed bank-statement source',
);
verify(
  handler.includes("lock?.status === 'active'") &&
    handler.includes("lock?.status === 'released'") &&
    handler.includes('legacyReconciliationId') &&
    handler.includes("transaction.reconciliationStatus === 'reconciled'"),
  'server verifies active, released and legacy reconciliation state against current transaction truth',
);
verify(
  handler.includes('MAX_RECONCILIATION_TRACE_RECORDS + 1') &&
    handler.includes('RECONCILIATION_PROGRESS_SCOPE_TOO_LARGE'),
  'progress trace scanning is bounded and fails closed',
);
for (const forbidden of [
  'stageFinanceFact',
  'stageFinanceSignal',
  'financeJournalEntries',
  'financeBalances',
  'financeAggregates',
  'generateContent',
  '@google/genai',
  'OpenAI',
]) {
  verify(!handler.includes(forbidden), 'progress handler has no mutation/dependency on ' + forbidden);
}
verify(
  !/\bt\.update\s*\(/u.test(handler),
  'progress handler has no Firestore transaction update call',
);
verify(
  !/\bt\.set\s*\(/u.test(handler),
  'progress handler has no Firestore transaction set call',
);
verify(
  builder.includes("state = 'confirmed'") &&
    builder.includes("state = 'needs_recheck'") &&
    builder.includes("state = 'needs_review'"),
  'pure builder keeps current-state precedence explicit and inspectable',
);

console.log('\nReconciliation Progress UI/Authority totals: ' + passed + ' Passed');
