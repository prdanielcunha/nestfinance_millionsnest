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

const amountException = buildReconciliationMatchPreview(
  [line()],
  [tx('tx_amount_exception', { amountCents: 10400 })],
  'acc_main',
);
verify(
  amountException.noCandidateLines === 1 &&
    amountException.divergentLines === 1 &&
    amountException.lines[0]?.exceptionCandidates[0]?.exceptionKind === 'amount_difference' &&
    amountException.lines[0]?.exceptionCandidates[0]?.amountDifferenceCents === 400 &&
    amountException.lines[0]?.exceptionCandidates[0]?.confirmable === false &&
    amountException.lines[0]?.suggestedAction === 'review_possible_transaction',
  'near amount mismatch is surfaced as a deterministic non-confirmable exception',
);

const dateException = buildReconciliationMatchPreview(
  [line()],
  [tx('tx_date_exception', { occurredAt: '2026-09-05T12:00:00.000Z' })],
  'acc_main',
);
verify(
  dateException.lines[0]?.exceptionCandidates[0]?.exceptionKind === 'date_difference' &&
    dateException.lines[0]?.exceptionCandidates[0]?.dateOffsetDays === 3 &&
    dateException.lines[0]?.exceptionCandidates[0]?.absoluteDateDifferenceDays === 3,
  'near date mismatch remains visible with an explicit day difference',
);

const combinedException = buildReconciliationMatchPreview(
  [line()],
  [tx('tx_combined_exception', {
    amountCents: 9700,
    occurredAt: '2026-09-06T12:00:00.000Z',
  })],
  'acc_main',
);
verify(
  combinedException.lines[0]?.exceptionCandidates[0]?.exceptionKind === 'amount_and_date_difference' &&
    combinedException.lines[0]?.exceptionCandidates[0]?.amountDifferenceCents === -300 &&
    combinedException.lines[0]?.exceptionCandidates[0]?.dateOffsetDays === 4,
  'amount and date differences stay explicit instead of being collapsed into a hidden ranking',
);

const noNearbyException = buildReconciliationMatchPreview(
  [line()],
  [
    tx('tx_amount_far', { amountCents: 12000 }),
    tx('tx_date_far', { occurredAt: '2026-09-20T12:00:00.000Z' }),
    tx('tx_other_account', { accountId: 'acc_other' }),
  ],
  'acc_main',
);
verify(
  noNearbyException.lines[0]?.exceptionCandidates.length === 0 &&
    noNearbyException.lines[0]?.suggestedAction === 'locate_or_register_transaction',
  'out-of-bounds or wrong-account records are not presented as nearby possibilities',
);

const exceptionOrdering = buildReconciliationMatchPreview(
  [line()],
  [
    tx('tx_two_dimensions', {
      amountCents: 10100,
      occurredAt: '2026-09-05T12:00:00.000Z',
    }),
    tx('tx_amount_only', { amountCents: 10200 }),
  ],
  'acc_main',
);
verify(
  exceptionOrdering.lines[0]?.exceptionCandidates[0]?.transactionId === 'tx_amount_only',
  'exception ordering is deterministic and favors fewer differing dimensions before distance',
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
  !/reconciliationStatus\s*=(?!=)/u.test(engineSource) &&
    !engineSource.includes('financeJournalEntries') &&
    !engineSource.includes('financeBalances'),
  'matching engine has no reconciliation or accounting mutation path',
);

console.log('\nReconciliation Match Preview Engine totals: ' + passed + ' Passed');
