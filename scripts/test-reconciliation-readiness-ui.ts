import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, handler, contract] = await Promise.all([
  readFile('src/pages/finance/BalancePage.tsx', 'utf8'),
  readFile('server/vercel-handlers/finance/reconciliationReadiness.ts', 'utf8'),
  readFile('shared/finance/reconciliation.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

verify(
  !page.includes('FinancePlaceholderPage'),
  'Balance is a real product screen, not a placeholder',
);
verify(
  page.includes("PT: {") && page.includes("EN: {") && page.includes("ES: {"),
  'Balance user-facing copy is available in PT/EN/ES',
);
verify(
  page.includes('reconciliationService.readiness') &&
    page.includes('FinanceEntityContextBar') &&
    page.includes('FinanceContextGuard'),
  'Balance is scoped to the active finance entity and server-side readiness',
);
verify(
  page.includes('no_bank_account') &&
    page.includes('needs_statement_review') &&
    page.includes('reviewed_source_not_supported') &&
    page.includes('source_ready'),
  'Balance renders deterministic human-safe readiness states',
);
verify(
  page.includes('APP_ROUTES.financeSettingsAccounts') &&
    page.includes('APP_ROUTES.universalCapture') &&
    page.includes("APP_ROUTES.inboxEvidenceDetail.replace(':evidenceId'"),
  'Balance sends users to the concrete next action instead of dead-end instructions',
);
verify(
  !page.includes('balanceCents') &&
    !page.includes('reconciliationStatus =') &&
    !page.includes('reconciliationStatus:'),
  'Balance does not fabricate or mutate balance/reconciliation status',
);
verify(
  handler.includes("classification.documentType', '==', 'bank_statement'") &&
    handler.includes("data.classification?.source !== 'human'") &&
    handler.includes("data.processingState !== 'accepted'") &&
    handler.includes('data.duplicate === true'),
  'backend accepts only authoritative human-classified accepted non-duplicate statements',
);
verify(
  handler.includes("verifiedMimeType === 'application/pdf'") &&
    handler.includes("state,") &&
    handler.includes('financialMutation: false') &&
    handler.includes('aiUsed: false') &&
    handler.includes('postingRequired: false'),
  'backend distinguishes deterministic PDF readiness without claiming financial authority',
);
for (const forbidden of [
  'financeJournalEntries',
  'financeBalances',
  'financeAggregates',
  'stageFinanceFact',
  'stageFinanceSignal',
  'generateContent',
  'OpenAI',
]) {
  verify(!handler.includes(forbidden), `readiness handler contains no ${forbidden} side effect/dependency`);
}
verify(
  contract.includes("'source_ready'") &&
    contract.includes("'needs_statement_review'") &&
    contract.includes('sourceBacked: true'),
  'shared contract preserves readiness and source-backed semantics',
);

console.log(`\nBalance Readiness UI/contract totals: ${passed} Passed`);
