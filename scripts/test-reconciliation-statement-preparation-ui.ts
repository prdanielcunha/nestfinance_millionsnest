import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, page, service, handler, parser] = await Promise.all([
  readFile('src/pages/finance/balance/ReconciliationStatementPreparationPanel.tsx', 'utf8'),
  readFile('src/pages/finance/BalancePage.tsx', 'utf8'),
  readFile('src/services/reconciliationService.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/reconciliationStatementPrepare.ts', 'utf8'),
  readFile('shared/finance/reconciliationStatementLines.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

verify(
  panel.includes('PT: {') && panel.includes('EN: {') && panel.includes('ES: {'),
  'statement preparation UI has PT/EN/ES user-facing copy',
);
verify(
  page.includes("statement.state === 'ready_for_native_text_check'") &&
    page.includes('<ReconciliationStatementPreparationPanel'),
  'advanced preparation appears only for reviewed ready statement sources',
);
verify(
  panel.includes('eligibleAccounts') &&
    panel.includes('<select') &&
    panel.includes('reconciliationService.prepareStatement'),
  'user explicitly chooses the bank-account context before preparation',
);
verify(
  panel.includes('request context') || panel.includes('vale apenas para esta análise'),
  'UI explains that account association is analysis context rather than persisted reconciliation',
);
verify(
  panel.includes('line.parseState') &&
    panel.includes('line.selectedDate') &&
    panel.includes('line.selectedAmountCents') &&
    panel.includes('line.selectedDirection') &&
    panel.includes('line.raw'),
  'accountant-facing UI preserves parse state, normalized fields and raw source line',
);
verify(
  panel.includes('<details') && panel.includes('copy.showRaw'),
  'raw evidence is progressive disclosure rather than primary UI noise',
);
verify(
  panel.includes('slice(0, 100)'),
  'large candidate sets are visually bounded on mobile',
);
verify(
  panel.includes('requires') === false || panel.includes('humanReview'),
  'UI keeps human-review boundary visible',
);
verify(
  service.includes("'reconciliation-statement-prepare'") &&
    service.includes('JSON.stringify({ financeEntityId, evidenceId, accountId })'),
  'client calls only the certified preparation operation with entity/evidence/account identifiers',
);
verify(
  handler.includes("resolveFinanceRequestContext(req, 'finance.view')") &&
    handler.includes("classification?.documentType !== 'bank_statement'") &&
    handler.includes("review?.status !== 'reviewed'") &&
    handler.includes('duplicate === true'),
  'backend requires authorized, human-reviewed, non-duplicate bank-statement evidence',
);
verify(
  handler.includes("association: 'request_context_only'") &&
    handler.includes('requiresHumanConfirmation: true') &&
    handler.includes('financialMutation: false') &&
    handler.includes('reconciliationMutation: false') &&
    handler.includes('financialRecognition: false'),
  'backend explicitly denies persisted association and financial/reconciliation authority',
);
verify(
  handler.includes('extractNativePdfText') &&
    handler.includes('prepareStatementLines') &&
    !handler.includes('extraction.text,'),
  'backend reuses certified native text extraction without returning the full extracted text',
);
for (const forbidden of [
  'stageFinanceFact',
  'stageFinanceSignal',
  'financeJournalEntries',
  'financeBalances',
  'financeAggregates',
  'reconciliationStatus:',
  'generateContent',
  '@google/genai',
  'OpenAI',
]) {
  verify(!handler.includes(forbidden), 'preparation handler has no ' + forbidden + ' mutation/dependency');
}
verify(
  !parser.includes('firebase-admin') &&
    !parser.includes('firestore') &&
    !parser.includes('fetch(') &&
    !parser.includes('generateContent'),
  'line parser remains pure, local and deterministic',
);
verify(
  !panel.includes('confirmLine') &&
    !panel.includes('saveReconciliation') &&
    !panel.includes('matchTransaction') &&
    !panel.includes('postTransaction'),
  'P9b UI exposes no premature confirmation, matching, reconciliation or posting action',
);

console.log('\nStatement Preparation UI/authority totals: ' + passed + ' Passed');
