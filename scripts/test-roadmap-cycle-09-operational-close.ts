import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTodayWorkspace } from '../src/pages/finance/todayWorkspaceModel';
import { parseTransactionNaturalQuery } from '../shared/finance/transactionSearch';
import { buildTodayOperationalBalance } from '../shared/finance/todayOperationalSummary';
import { buildReconciliationMatchPreview } from '../shared/finance/reconciliationMatchPreview';
import type { PreparedStatementLine } from '../shared/finance/reconciliationStatementLines';
import type { ReconciliationMatchableTransaction } from '../shared/finance/reconciliationMatchPreview';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed += 1;
  console.log('✅ ' + message);
};

const snapshot = {
  returnedCorrections: 3,
  drafts: 4,
  readyForReview: 5,
  approvedForPosting: 6,
  inboxNeedsClassification: 7,
  inboxPendingReview: 8,
  countDivergences: 9,
  countChecks: 10,
};
const authority = {
  canView: true,
  canCreate: true,
  canReview: true,
  canApprove: true,
  canManage: true,
  canClassifyInbox: true,
  canReviewInbox: true,
  canCount: true,
};
for (const mode of ['ecosystem', 'organization_admin', 'review', 'operation', 'read_only'] as const) {
  verify(buildTodayWorkspace(mode, snapshot, authority).tasks.length <= 3, mode + ' never shows more than three Faça agora tasks');
}

const natural = parseTransactionNaturalQuery('saídas acima de R$ 500 em setembro 2026 fornecedor luz', new Date('2026-09-24T12:00:00Z'));
verify(natural.understood === true, 'local natural-language parser recognizes structured finance intent');
verify(natural.filters.direction === 'expense', 'local parser recognizes expense direction');
verify(natural.filters.amountMinCents === 50001, 'local parser recognizes amount floor without AI');
verify(natural.filters.occurredFrom?.startsWith('2026-09-01') === true, 'local parser recognizes named month deterministically');
verify(natural.residualQuery.includes('fornecedor') && natural.residualQuery.includes('luz'), 'unrecognized text remains available for canonical text search');

const availableBalance = buildTodayOperationalBalance({
  activeAssetAccounts: [{ openingBalanceCents: 100000 }, { openingBalanceCents: 25000 }],
  postedIncomeCents: 50000,
  postedExpenseCents: 20000,
  postedLiabilitySettlementCents: 5000,
  postedAdjustmentCount: 0,
});
verify(availableBalance.state === 'available' && availableBalance.amountCents === 150000, 'Today balance is deterministic from configured openings and posted effects');
const unavailableBalance = buildTodayOperationalBalance({
  activeAssetAccounts: [{ openingBalanceCents: null }],
  postedIncomeCents: 0,
  postedExpenseCents: 0,
  postedLiabilitySettlementCents: 0,
  postedAdjustmentCount: 0,
});
verify(unavailableBalance.state === 'unavailable', 'Today balance fails closed when opening balance is not provable');

const line: PreparedStatementLine = {
  lineNumber: 1,
  raw: '02/09/2026 PIX 100,00 C',
  lineLimited: false,
  dateCandidates: [{ raw: '02/09/2026', normalized: '2026-09-02', start: 0, end: 10, evidence: 'validated' }],
  amountCandidates: [{ raw: '100,00 C', normalized: 'BRL:10000', amountCents: 10000, start: 15, end: 23, currency: null, direction: 'inflow', directionEvidence: 'credit_marker' }],
  selectedDate: '2026-09-02',
  selectedAmountCents: 10000,
  selectedDirection: 'inflow',
  descriptionCandidate: 'PIX',
  parseState: 'prepared',
  semanticState: 'unconfirmed',
  requiresConfirmation: true,
  source: 'native_text',
  derivedBy: 'deterministic_rule',
  aiUsed: false,
  ocrUsed: false,
  userConfirmed: false,
};
const tx: ReconciliationMatchableTransaction = {
  transactionId: 'tx_exception',
  transactionKind: 'income',
  status: 'posted',
  reconciliationStatus: 'unreconciled',
  amountCents: 10400,
  occurredAt: '2026-09-05T12:00:00.000Z',
  cashFlowDirection: 'inflow',
  accountId: 'acc_main',
  sourceAccountId: null,
  destinationAccountId: null,
  description: 'PIX recebido',
  accountName: 'Conta principal',
};
const exception = buildReconciliationMatchPreview([line], [tx], 'acc_main').lines[0]?.exceptionCandidates?.[0];
verify(exception?.exceptionKind === 'amount_and_date_difference', 'reconciliation exposes amount/date differences instead of hidden scoring');
verify(exception?.confirmable === false, 'nearby exception can never silently become a reconciliation');

const todayPage = readFileSync('src/pages/finance/TodayActionCenter.tsx', 'utf8');
const summaryHandler = readFileSync('server/vercel-handlers/finance/transactionsSummary.ts', 'utf8');
const listPage = readFileSync('src/pages/finance/transactions/TransactionsListPage.tsx', 'utf8');
const exceptionHandler = readFileSync('server/vercel-handlers/finance/reconciliationExceptionJustify.ts', 'utf8');
const exceptionPanel = readFileSync('src/pages/finance/balance/ReconciliationExceptionsPanel.tsx', 'utf8');
const updateDraft = readFileSync('server/vercel-handlers/finance/transactionsUpdateDraft.ts', 'utf8');
const reportsPage = readFileSync('src/pages/finance/ReportsPage.tsx', 'utf8');
const periodClose = readFileSync('server/vercel-handlers/finance/periodCloseReviewConfirm.ts', 'utf8');

for (const phrase of ['Entradas hoje', 'Saídas hoje', 'Vencem em 7 dias', 'Saldo registrado']) {
  verify(todayPage.includes(phrase), 'Today exposes roadmap operational metric: ' + phrase);
}
verify(summaryHandler.includes('AggregateField.sum'), 'Today totals use server-side deterministic aggregates instead of an AI call');
verify(summaryHandler.includes("settlement === 'unpaid'"), 'upcoming due items come from explicit unpaid evidence state');
verify(summaryHandler.includes('balanceUsesPostedTransactionsOnly: true'), 'balance contract explicitly uses posted effects only');
verify(listPage.includes('parseTransactionNaturalQuery'), 'transaction search parses natural language locally before server search');
verify(exceptionHandler.includes('stageCanonicalAuditCreate') || exceptionHandler.includes('stageCanonicalAuditRecord'), 'exception justification is auditable');
verify(exceptionPanel.includes('justifyException'), 'reconciliation exception review supports explicit human justification');
for (const field of ['competenceDate', 'counterparty', 'categoryId', 'fundId', 'costCenterId']) {
  verify(updateDraft.includes(field), 'draft update supports accounting-ready field ' + field);
}
verify(reportsPage.includes('Registrar revisão do período'), 'monthly close is guided through explicit human review');
verify(reportsPage.includes('Fechamento oficial protegido'), 'monthly close does not overstate official accounting authority');
verify(periodClose.includes('financialMutation: false'), 'period review cannot mutate financial balances');
verify(periodClose.includes('periodClosed: false'), 'period review cannot silently declare the month closed');

console.log('\nRoadmap Cycle 09 totals: ' + passed + ' Passed');
