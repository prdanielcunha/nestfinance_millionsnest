import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPeriodCloseReadiness,
  PERIOD_CLOSE_MAX_COUNT_SESSIONS,
  PERIOD_CLOSE_MAX_EVIDENCE,
  PERIOD_CLOSE_MAX_TRANSACTIONS,
} from '../shared/finance/periodCloseReadiness.js';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

const blocked = buildPeriodCloseReadiness({
  financeEntityId: 'entity-a',
  periodKey: '2026-09',
  startDate: '2026-09-01',
  endDateExclusive: '2026-10-01',
  configuredBankAccountIds: ['bank-a'],
  transactions: [
    { transactionKind: 'income', status: 'draft', amountCents: 10000, accountId: 'bank-a' },
    { transactionKind: 'expense', status: 'ready_for_review', amountCents: 2500, accountId: 'bank-a' },
    { transactionKind: 'income', status: 'approved_for_posting', amountCents: 3000, accountId: 'bank-a' },
    { transactionKind: 'expense', status: 'posted', amountCents: 1200, accountId: 'bank-a', reconciliationStatus: 'unreconciled' },
  ],
  countSessions: [{ status: 'matched' }, { status: 'divergent' }, { status: 'counting_b' }],
  evidence: [
    { processingState: 'accepted', duplicate: false, humanClassified: true, reviewStatus: 'reviewed' },
    { processingState: 'accepted', duplicate: false, humanClassified: false, reviewStatus: null },
    { processingState: 'awaiting_upload', duplicate: false, humanClassified: false, reviewStatus: null },
  ],
});

verify(blocked.readiness.state === 'attention_required', 'open operational work blocks close review readiness');
verify(blocked.authority.readOnly === true, 'read model explicitly declares read-only authority');
verify(blocked.authority.canClosePeriod === false, 'read model cannot close a period');
verify(blocked.authority.canDeclarePeriodClosed === false, 'read model cannot declare a period closed');
verify(blocked.authority.officialReport === false, 'read model cannot claim an official accounting report');
verify(blocked.transactions.capturedIncomeCents === 13000, 'captured income includes non-reversed recorded income');
verify(blocked.transactions.capturedExpenseCents === 3700, 'captured expense includes non-reversed recorded expenses');
verify(blocked.transactions.postedExpenseCents === 1200, 'posted totals remain separately visible');
verify(blocked.reconciliation.unreconciledBankTransactions === 1, 'posted unreconciled bank activity is an explicit blocker');
verify(blocked.countSessions.divergent === 1 && blocked.countSessions.incomplete === 1, 'count divergence and incomplete work stay distinct');
verify(blocked.documents.waitingReview === 1 && blocked.documents.unfinishedUploads === 1, 'document review and unfinished upload stay distinct');

const ready = buildPeriodCloseReadiness({
  financeEntityId: 'entity-a',
  periodKey: '2026-09',
  startDate: '2026-09-01',
  endDateExclusive: '2026-10-01',
  configuredBankAccountIds: ['bank-a'],
  transactions: [
    { transactionKind: 'income', status: 'posted', amountCents: 10000, accountId: 'bank-a', reconciliationStatus: 'reconciled' },
    { transactionKind: 'expense', status: 'posted', amountCents: 2500, accountId: 'bank-a', reconciliationStatus: 'reconciled' },
  ],
  countSessions: [{ status: 'matched' }],
  evidence: [{ processingState: 'accepted', duplicate: false, humanClassified: true, reviewStatus: 'reviewed' }],
});

verify(ready.readiness.state === 'ready_for_review', 'clean operational state becomes ready for human close review');
verify(ready.readiness.blockerCount === 0, 'ready state has no objective blockers');
verify(ready.authority.canClosePeriod === false, 'even clean readiness never silently becomes a close mutation');

verify(PERIOD_CLOSE_MAX_TRANSACTIONS === 1000, 'transaction scope is explicitly bounded');
verify(PERIOD_CLOSE_MAX_COUNT_SESSIONS === 500, 'count scope is explicitly bounded');
verify(PERIOD_CLOSE_MAX_EVIDENCE === 500, 'evidence scope is explicitly bounded');

const handler = readFileSync('server/vercel-handlers/finance/periodCloseReadiness.ts', 'utf8');
const page = readFileSync('src/pages/finance/ReportsPage.tsx', 'utf8');
const service = readFileSync('src/services/periodCloseService.ts', 'utf8');
const gateway = readFileSync('api/finance-gateway.ts', 'utf8');
const contracts = readFileSync('scripts/check-api-contracts.mjs', 'utf8');

verify(handler.includes("resolveFinanceRequestContext(req, 'finance.view')"), 'endpoint requires finance.view');
verify(handler.includes("Cache-Control', 'private, no-store"), 'endpoint disables shared caching');
verify(handler.includes('PERIOD_CLOSE_MAX_TRANSACTIONS + 1'), 'endpoint fails closed instead of silently truncating transactions');
verify(handler.includes('PERIOD_CLOSE_MAX_COUNT_SESSIONS + 1'), 'endpoint fails closed instead of silently truncating counts');
verify(handler.includes('PERIOD_CLOSE_MAX_EVIDENCE + 1'), 'endpoint fails closed instead of silently truncating documents');

for (const forbidden of [
  'stageFinanceFact',
  'stageFinanceSignal',
  'financeJournalEntries',
  'financeBalances',
  'financeAggregates',
  '.delete(',
]) {
  verify(!handler.includes(forbidden), 'period close handler has no mutation dependency on ' + forbidden);
}
verify(!/\b(?:t|transaction)\.set\s*\(/u.test(handler), 'period close handler has no Firestore transaction set call');
verify(!/\b(?:t|transaction)\.update\s*\(/u.test(handler), 'period close handler has no Firestore transaction update call');
verify(!/\b(?:t|transaction)\.delete\s*\(/u.test(handler), 'period close handler has no Firestore transaction delete call');

verify(page.includes("PT: {") && page.includes("EN: {") && page.includes("ES: {"), 'Reports workspace is localized in PT/EN/ES');
verify(page.includes('type="month"'), 'Reports workspace provides a native month selector');
verify(page.includes('Fechamento oficial protegido'), 'primary PT UX explicitly protects official close semantics');
verify(page.includes('não são um demonstrativo contábil oficial'), 'primary PT UX does not overstate operational amounts');
verify(service.includes('operation=period-close-readiness'), 'client uses the period close gateway operation');
verify(gateway.includes("case 'period-close-readiness'"), 'gateway exposes period close readiness');
verify(contracts.includes("operation: 'period-close-readiness'"), 'API contract inventory certifies period close readiness');

console.log('\nPeriod Close Readiness totals: ' + passed + ' Passed');
