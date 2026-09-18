import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildReconciliationMatchPreview,
  RECONCILIATION_MATCH_MAX_CANDIDATES_PER_LINE,
  type ReconciliationMatchableTransaction,
} from '../shared/finance/reconciliationMatchPreview.js';
import type { PreparedStatementLine } from '../shared/finance/reconciliationStatementLines.js';

function line(input: Partial<PreparedStatementLine> = {}): PreparedStatementLine {
  return {
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
    ...input,
  };
}

function tx(
  id: string,
  overrides: Partial<ReconciliationMatchableTransaction> = {},
): ReconciliationMatchableTransaction {
  return {
    transactionId: id,
    transactionKind: 'income',
    status: 'posted',
    reconciliationStatus: 'unreconciled',
    amountCents: 10000,
    occurredAt: '2026-09-02T12:00:00.000Z',
    cashFlowDirection: 'inflow',
    accountId: 'acc_main',
    sourceAccountId: null,
    destinationAccountId: null,
    description: 'PIX recebido',
    accountName: 'Conta principal',
    ...overrides,
  };
}

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

const exact = buildReconciliationMatchPreview([line()], [tx('tx_exact')], 'acc_main');
verify(
  exact.singleCandidateLines === 1 &&
    exact.lines[0]?.state === 'single_candidate' &&
    exact.lines[0]?.candidates[0]?.evidence.date === 'exact',
  'exact amount/account/direction/date yields one possible correspondence',
);
verify(
  exact.lines[0]?.candidates[0]?.reconciliationEligible === true &&
    exact.lines[0]?.candidates[0]?.postingState === 'posted',
  'only posted explicitly unreconciled transaction is marked eligible for future reconciliation',
);
verify(
  exact.autoSelected === false &&
    exact.requiresHumanConfirmation === true &&
    exact.lines[0]?.requiresHumanConfirmation === true,
  'even one candidate is never auto-selected and always requires a person',
);

const adjacent = buildReconciliationMatchPreview(
  [line()],
  [tx('tx_adjacent', { occurredAt: '2026-09-03T08:00:00.000Z' })],
  'acc_main',
);
verify(
  adjacent.lines[0]?.candidates[0]?.evidence.date === 'adjacent_day' &&
    adjacent.lines[0]?.candidates[0]?.evidence.dateDifferenceDays === 1,
  'one-day date difference remains visible evidence rather than hidden scoring',
);

const multiple = buildReconciliationMatchPreview(
  [line()],
  [
    tx('tx_a'),
    tx('tx_b', { occurredAt: '2026-09-03T12:00:00.000Z' }),
  ],
  'acc_main',
);
verify(
  multiple.multipleCandidateLines === 1 &&
    multiple.lines[0]?.state === 'multiple_candidates' &&
    multiple.lines[0]?.totalCandidates === 2 &&
    multiple.lines[0]?.candidates.length === 2,
  'two plausible transactions remain two possibilities instead of producing a winner',
);
verify(
  multiple.lines[0]?.candidates[0]?.transactionId === 'tx_a' &&
    multiple.lines[0]?.candidates[1]?.transactionId === 'tx_b',
  'sorting is deterministic and transparent: exact date before adjacent date',
);

const excluded = buildReconciliationMatchPreview(
  [line()],
  [
    tx('tx_reconciled', { reconciliationStatus: 'reconciled' }),
    tx('tx_wrong_amount', { amountCents: 9999 }),
    tx('tx_wrong_account', { accountId: 'acc_other' }),
    tx('tx_wrong_direction', { cashFlowDirection: 'outflow' }),
    tx('tx_too_far', { occurredAt: '2026-09-05T12:00:00.000Z' }),
  ],
  'acc_main',
);
verify(
  excluded.noCandidateLines === 1 && excluded.lines[0]?.totalCandidates === 0,
  'already reconciled, wrong amount/account/direction and dates beyond one day are excluded',
);

const unknownLegacy = buildReconciliationMatchPreview(
  [line()],
  [tx('tx_legacy', { reconciliationStatus: 'unknown' })],
  'acc_main',
);
verify(
  unknownLegacy.lines[0]?.candidates[0]?.reconciliationStatus === 'unknown' &&
    unknownLegacy.lines[0]?.candidates[0]?.reconciliationEligible === false,
  'legacy missing reconciliation state is preserved as unknown, never inferred as unreconciled',
);

const draft = buildReconciliationMatchPreview(
  [line()],
  [tx('tx_draft', { status: 'draft' })],
  'acc_main',
);
verify(
  draft.lines[0]?.candidates[0]?.postingState === 'not_posted' &&
    draft.lines[0]?.candidates[0]?.reconciliationEligible === false,
  'non-posted transaction may aid review but is never marked reconciliation-eligible',
);

const ambiguousLine = line({
  parseState: 'needs_amount_choice',
  selectedAmountCents: null,
});
const skipped = buildReconciliationMatchPreview(
  [ambiguousLine],
  [tx('tx_exact')],
  'acc_main',
);
verify(
  skipped.matchedPreparedLines === 0 &&
    skipped.skippedUnconfirmedLines === 1 &&
    skipped.lines.length === 0,
  'ambiguous statement lines never enter matching preview',
);

const manyTransactions = Array.from(
  { length: RECONCILIATION_MATCH_MAX_CANDIDATES_PER_LINE + 3 },
  (_, index) => tx('tx_' + String(index).padStart(2, '0')),
);
const capped = buildReconciliationMatchPreview([line()], manyTransactions, 'acc_main');
verify(
  capped.lines[0]?.totalCandidates === RECONCILIATION_MATCH_MAX_CANDIDATES_PER_LINE + 3 &&
    capped.lines[0]?.candidates.length === RECONCILIATION_MATCH_MAX_CANDIDATES_PER_LINE &&
    capped.lines[0]?.candidateLimitReached === true,
  'candidate fan-out is capped without hiding the true total',
);

const transferOut = buildReconciliationMatchPreview(
  [line({ selectedDirection: 'outflow' })],
  [tx('tx_transfer', {
    transactionKind: 'transfer',
    cashFlowDirection: null,
    accountId: null,
    sourceAccountId: 'acc_main',
    destinationAccountId: 'acc_other',
  })],
  'acc_main',
);
verify(
  transferOut.singleCandidateLines === 1,
  'transfer direction is derived from selected source account rather than guessed from description',
);

const engineSource = await readFile('shared/finance/reconciliationMatchPreview.ts', 'utf8');
for (const forbidden of [
  'generateContent',
  '@google/genai',
  'OpenAI',
  'firebase-admin',
  'firestore',
  'fetch(',
  'Math.random',
  'score',
  'confidence',
]) {
  verify(!engineSource.includes(forbidden), 'matching engine has no dependency on ' + forbidden);
}
verify(
  !engineSource.includes('reconciliationStatus =') &&
    !engineSource.includes('financeJournalEntries') &&
    !engineSource.includes('financeBalances'),
  'matching engine has no reconciliation or accounting mutation path',
);

console.log('\nReconciliation Match Preview Engine totals: ' + passed + ' Passed');
