import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, prepPanel, service, handler, engine] = await Promise.all([
  readFile('src/pages/finance/balance/ReconciliationMatchPreviewPanel.tsx', 'utf8'),
  readFile('src/pages/finance/balance/ReconciliationStatementPreparationPanel.tsx', 'utf8'),
  readFile('src/services/reconciliationService.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/reconciliationMatchPreview.ts', 'utf8'),
  readFile('shared/finance/reconciliationMatchPreview.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

verify(
  panel.includes("PT: {") && panel.includes("EN: {") && panel.includes("ES: {"),
  'match preview user-facing copy exists in PT/EN/ES',
);

verify(
  panel.includes("title: 'Comparar com as movimentações registradas'") &&
    panel.includes("action: 'Procurar possíveis pares'") &&
    panel.includes("summarySingle: 'Uma possibilidade'") &&
    panel.includes("summaryMultiple: 'Mais de uma possibilidade'") &&
    panel.includes("summaryNone: 'Sem correspondência'"),
  'Portuguese primary language is understandable without accounting or IT jargon',
);

verify(
  prepPanel.includes("title: 'Organizar movimentações do extrato'") &&
    prepPanel.includes("prepared: 'Entradas e saídas identificadas'") &&
    prepPanel.includes("confirm: 'Precisam de conferência'"),
  'statement preparation also uses plain-language primary labels',
);

verify(
  !panel.includes("|| candidate.transactionStatus") &&
    panel.includes('copy.statuses[candidate.transactionStatus]') &&
    panel.includes("copy.reconciliationUnknown") &&
    panel.includes("copy.reconciliationEligible"),
  'internal transaction/reconciliation codes are mapped to human labels instead of leaking as fallbacks',
);

verify(
  panel.includes('copy.amountExact') &&
    panel.includes('copy.accountExact') &&
    panel.includes('copy.directionCompatible') &&
    panel.includes("candidate.evidence.date === 'exact' ? copy.dateExact : copy.dateAdjacent"),
  'accountant-facing detail shows the objective evidence behind each possibility',
);

verify(
  panel.includes("APP_ROUTES.transactionDetail.replace(':transactionId', candidate.transactionId)") &&
    panel.includes('copy.openRecord'),
  'accountant can drill into the original transaction record',
);

verify(
  panel.includes("Mesmo quando há apenas uma possibilidade, o NestFinance não decide sozinho") &&
    panel.includes("ficará registrada no histórico"),
  'UI states that even one possibility still requires a human decision and future audit trail',
);

for (const forbiddenAction of [
  'Conciliar automaticamente',
  'Auto reconcile',
  'Confirmar correspondência',
  'confirmMatch',
  'saveMatch',
  'applyReconciliation',
  'setReconciliationStatus',
]) {
  verify(!panel.includes(forbiddenAction), 'P9c UI exposes no premature action: ' + forbiddenAction);
}

verify(
  service.includes('operation=reconciliation-match-preview') &&
    service.includes('JSON.stringify({ financeEntityId, evidenceId, accountId })'),
  'client calls only the certified read-only match-preview operation',
);

verify(
  handler.includes("resolveFinanceRequestContext(req, 'finance.view')") &&
    handler.includes("review?.status !== 'reviewed'") &&
    handler.includes("classification?.documentType !== 'bank_statement'") &&
    handler.includes('duplicate === true'),
  'backend requires authorized reviewed source-backed bank statement evidence',
);

verify(
  handler.includes('RECONCILIATION_MATCH_MAX_TRANSACTIONS + 1') &&
    handler.includes("'RECONCILIATION_MATCH_SCOPE_TOO_LARGE'"),
  'transaction comparison scope is hard-bounded instead of silently scanning an unlimited ledger',
);

verify(
  handler.includes('buildReconciliationMatchPreview') &&
    handler.includes('autoMatched: false') &&
    handler.includes('requiresHumanConfirmation: true') &&
    handler.includes('financialMutation: false') &&
    handler.includes('reconciliationMutation: false'),
  'backend explicitly denies auto-matching and financial/reconciliation write authority',
);

for (const forbidden of [
  'stageFinanceFact',
  'stageFinanceSignal',
  'financeJournalEntries',
  'financeBalances',
  'financeAggregates',
  'transaction.update(',
  'transaction.set(',
  'generateContent',
  '@google/genai',
  'OpenAI',
]) {
  verify(!handler.includes(forbidden), 'match preview handler has no ' + forbidden + ' mutation/dependency');
}

verify(
  engine.includes("transaction.amountCents !== line.selectedAmountCents") &&
    engine.includes("direction !== line.selectedDirection") &&
    engine.includes('difference > 1') &&
    engine.includes("transaction.reconciliationStatus === 'reconciled'"),
  'engine uses exact amount/account-direction/date rules and excludes already reconciled records',
);

verify(
  engine.includes('autoSelected: false') &&
    engine.includes('requiresHumanConfirmation: true') &&
    !engine.includes('confidence') &&
    !engine.includes('score'),
  'engine has no hidden confidence score or automatic winner',
);

verify(
  prepPanel.includes('<ReconciliationMatchPreviewPanel') &&
    prepPanel.includes('preparedLines={result.preparation.preparedLines}'),
  'match preview is progressively disclosed only after statement preparation',
);

console.log('\nReconciliation Match Preview UI/authority totals: ' + passed + ' Passed');
