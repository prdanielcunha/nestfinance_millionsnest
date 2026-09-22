import type {
  PreparedStatementLine,
  StatementLineDirection,
} from './reconciliationStatementLines.js';

export const RECONCILIATION_MATCH_MAX_TRANSACTIONS = 1000;
export const RECONCILIATION_MATCH_MAX_CANDIDATES_PER_LINE = 5;
export const RECONCILIATION_EXCEPTION_MAX_CANDIDATES_PER_LINE = 3;
export const RECONCILIATION_EXCEPTION_MAX_DATE_DIFFERENCE_DAYS = 7;
export const RECONCILIATION_EXCEPTION_MIN_AMOUNT_TOLERANCE_CENTS = 500;
export const RECONCILIATION_EXCEPTION_MAX_AMOUNT_TOLERANCE_CENTS = 50_000;

export type ReconciliationMatchDateRelation = 'exact' | 'adjacent_day';
export type ReconciliationMatchLineState =
  | 'no_candidate'
  | 'single_candidate'
  | 'multiple_candidates';

export type ReconciliationMatchTransactionStatus =
  | 'draft'
  | 'ready_for_review'
  | 'approved_for_posting'
  | 'posted';

export type ReconciliationMatchableTransaction = {
  transactionId: string;
  transactionKind: string;
  status: ReconciliationMatchTransactionStatus;
  reconciliationStatus: 'unreconciled' | 'reconciled' | 'unknown';
  amountCents: number;
  occurredAt: string;
  cashFlowDirection: string | null;
  accountId: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  description: string | null;
  accountName: string | null;
};

export type ReconciliationMatchEvidence = {
  amount: 'exact';
  account: 'exact';
  direction: 'compatible';
  date: ReconciliationMatchDateRelation;
  dateDifferenceDays: number;
};

export type ReconciliationMatchCandidate = {
  transactionId: string;
  transactionKind: string;
  transactionStatus: ReconciliationMatchTransactionStatus;
  reconciliationStatus: 'unreconciled' | 'unknown';
  postingState: 'posted' | 'not_posted';
  reconciliationEligible: boolean;
  amountCents: number;
  occurredAt: string;
  description: string | null;
  accountName: string | null;
  evidence: ReconciliationMatchEvidence;
};

export type ReconciliationExceptionKind =
  | 'amount_difference'
  | 'date_difference'
  | 'amount_and_date_difference';

export type ReconciliationExceptionSuggestedAction =
  | 'review_possible_transaction'
  | 'locate_or_register_transaction';

export type ReconciliationExceptionCandidate = {
  transactionId: string;
  transactionKind: string;
  transactionStatus: ReconciliationMatchTransactionStatus;
  reconciliationStatus: 'unreconciled' | 'unknown';
  postingState: 'posted' | 'not_posted';
  amountCents: number;
  occurredAt: string;
  description: string | null;
  accountName: string | null;
  exceptionKind: ReconciliationExceptionKind;
  amountDifferenceCents: number;
  absoluteAmountDifferenceCents: number;
  amountToleranceCents: number;
  dateOffsetDays: number;
  absoluteDateDifferenceDays: number;
  account: 'exact';
  direction: 'compatible';
  confirmable: false;
};

export type ReconciliationLineMatchPreview = {
  lineNumber: number;
  sourceDate: string;
  sourceAmountCents: number;
  sourceDirection: Exclude<StatementLineDirection, 'unknown'>;
  sourceDescription: string | null;
  state: ReconciliationMatchLineState;
  totalCandidates: number;
  candidateLimitReached: boolean;
  candidates: ReconciliationMatchCandidate[];
  exceptionCandidates?: ReconciliationExceptionCandidate[];
  exceptionCandidateLimitReached?: boolean;
  suggestedAction?: ReconciliationExceptionSuggestedAction | null;
  requiresHumanConfirmation: true;
};

export type ReconciliationMatchPreviewResult = {
  deterministic: true;
  matchedPreparedLines: number;
  skippedUnconfirmedLines: number;
  singleCandidateLines: number;
  multipleCandidateLines: number;
  noCandidateLines: number;
  divergentLines: number;
  lines: ReconciliationLineMatchPreview[];
  requiresHumanConfirmation: true;
  autoSelected: false;
};

function isoDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    normalized: match[1] + '-' + match[2] + '-' + match[3],
    epochDay: Math.floor(date.getTime() / 86_400_000),
  };
}

function transactionDirection(
  transaction: ReconciliationMatchableTransaction,
  accountId: string,
): 'inflow' | 'outflow' | null {
  if (transaction.transactionKind === 'transfer') {
    if (transaction.sourceAccountId === accountId) return 'outflow';
    if (transaction.destinationAccountId === accountId) return 'inflow';
    return null;
  }

  if (transaction.transactionKind === 'liability_settlement') {
    return transaction.sourceAccountId === accountId ? 'outflow' : null;
  }

  if (transaction.accountId !== accountId) return null;
  if (transaction.cashFlowDirection === 'inflow') return 'inflow';
  if (transaction.cashFlowDirection === 'outflow') return 'outflow';
  return null;
}

function isSupportedLifecycleStatus(
  value: ReconciliationMatchableTransaction['status'],
): boolean {
  return (
    value === 'draft' ||
    value === 'ready_for_review' ||
    value === 'approved_for_posting' ||
    value === 'posted'
  );
}

function preparedLineValues(line: PreparedStatementLine) {
  if (
    line.parseState !== 'prepared' ||
    !line.selectedDate ||
    line.selectedAmountCents === null ||
    line.selectedDirection === 'unknown'
  ) {
    return null;
  }

  const date = isoDay(line.selectedDate);
  if (!date) return null;

  return {
    date,
    amountCents: line.selectedAmountCents,
    direction: line.selectedDirection as Exclude<StatementLineDirection, 'unknown'>,
  };
}

function candidateFor(
  line: PreparedStatementLine,
  transaction: ReconciliationMatchableTransaction,
  accountId: string,
): ReconciliationMatchCandidate | null {
  const source = preparedLineValues(line);
  if (!source) return null;
  if (!isSupportedLifecycleStatus(transaction.status)) return null;
  if (transaction.reconciliationStatus === 'reconciled') return null;
  if (transaction.amountCents !== source.amountCents) return null;

  const direction = transactionDirection(transaction, accountId);
  if (!direction || direction !== source.direction) return null;

  const transactionDate = isoDay(transaction.occurredAt);
  if (!transactionDate) return null;

  const difference = Math.abs(source.date.epochDay - transactionDate.epochDay);
  if (difference > 1) return null;

  return {
    transactionId: transaction.transactionId,
    transactionKind: transaction.transactionKind,
    transactionStatus: transaction.status,
    reconciliationStatus:
      transaction.reconciliationStatus === 'unreconciled' ? 'unreconciled' : 'unknown',
    postingState: transaction.status === 'posted' ? 'posted' : 'not_posted',
    reconciliationEligible:
      transaction.status === 'posted' && transaction.reconciliationStatus === 'unreconciled',
    amountCents: transaction.amountCents,
    occurredAt: transactionDate.normalized,
    description: transaction.description,
    accountName: transaction.accountName,
    evidence: {
      amount: 'exact',
      account: 'exact',
      direction: 'compatible',
      date: difference === 0 ? 'exact' : 'adjacent_day',
      dateDifferenceDays: difference,
    },
  };
}

function amountToleranceCents(sourceAmountCents: number) {
  const proportional = Math.round(sourceAmountCents * 0.05);
  return Math.max(
    RECONCILIATION_EXCEPTION_MIN_AMOUNT_TOLERANCE_CENTS,
    Math.min(RECONCILIATION_EXCEPTION_MAX_AMOUNT_TOLERANCE_CENTS, proportional),
  );
}

function exceptionCandidateFor(
  line: PreparedStatementLine,
  transaction: ReconciliationMatchableTransaction,
  accountId: string,
): ReconciliationExceptionCandidate | null {
  const source = preparedLineValues(line);
  if (!source) return null;
  if (!isSupportedLifecycleStatus(transaction.status)) return null;
  if (transaction.reconciliationStatus === 'reconciled') return null;

  const direction = transactionDirection(transaction, accountId);
  if (!direction || direction !== source.direction) return null;

  const transactionDate = isoDay(transaction.occurredAt);
  if (!transactionDate) return null;

  const dateOffsetDays = transactionDate.epochDay - source.date.epochDay;
  const absoluteDateDifferenceDays = Math.abs(dateOffsetDays);
  if (absoluteDateDifferenceDays > RECONCILIATION_EXCEPTION_MAX_DATE_DIFFERENCE_DAYS) {
    return null;
  }

  const amountDifferenceCents = transaction.amountCents - source.amountCents;
  const absoluteAmountDifferenceCents = Math.abs(amountDifferenceCents);
  const tolerance = amountToleranceCents(source.amountCents);
  if (absoluteAmountDifferenceCents > tolerance) return null;

  const amountDiffers = absoluteAmountDifferenceCents > 0;
  const dateDiffersBeyondMatch = absoluteDateDifferenceDays > 1;

  // Exact match candidates stay exclusively in the certified confirmation path.
  if (!amountDiffers && !dateDiffersBeyondMatch) return null;

  const exceptionKind: ReconciliationExceptionKind =
    amountDiffers && dateDiffersBeyondMatch
      ? 'amount_and_date_difference'
      : amountDiffers
        ? 'amount_difference'
        : 'date_difference';

  return {
    transactionId: transaction.transactionId,
    transactionKind: transaction.transactionKind,
    transactionStatus: transaction.status,
    reconciliationStatus:
      transaction.reconciliationStatus === 'unreconciled' ? 'unreconciled' : 'unknown',
    postingState: transaction.status === 'posted' ? 'posted' : 'not_posted',
    amountCents: transaction.amountCents,
    occurredAt: transactionDate.normalized,
    description: transaction.description,
    accountName: transaction.accountName,
    exceptionKind,
    amountDifferenceCents,
    absoluteAmountDifferenceCents,
    amountToleranceCents: tolerance,
    dateOffsetDays,
    absoluteDateDifferenceDays,
    account: 'exact',
    direction: 'compatible',
    confirmable: false,
  };
}

function sortExceptionCandidates(
  a: ReconciliationExceptionCandidate,
  b: ReconciliationExceptionCandidate,
) {
  const dimensionsA =
    (a.absoluteAmountDifferenceCents > 0 ? 1 : 0) +
    (a.absoluteDateDifferenceDays > 1 ? 1 : 0);
  const dimensionsB =
    (b.absoluteAmountDifferenceCents > 0 ? 1 : 0) +
    (b.absoluteDateDifferenceDays > 1 ? 1 : 0);

  return (
    dimensionsA - dimensionsB ||
    a.absoluteAmountDifferenceCents - b.absoluteAmountDifferenceCents ||
    a.absoluteDateDifferenceDays - b.absoluteDateDifferenceDays ||
    a.transactionId.localeCompare(b.transactionId)
  );
}

export function buildReconciliationMatchPreview(
  lines: PreparedStatementLine[],
  transactions: ReconciliationMatchableTransaction[],
  accountId: string,
): ReconciliationMatchPreviewResult {
  const preparedLines = lines.filter((line) => preparedLineValues(line) !== null);

  const previews: ReconciliationLineMatchPreview[] = preparedLines.map((line) => {
    const candidates = transactions
      .map((transaction) => candidateFor(line, transaction, accountId))
      .filter((candidate): candidate is ReconciliationMatchCandidate => candidate !== null)
      .sort((a, b) => {
        const dateCompare = a.evidence.dateDifferenceDays - b.evidence.dateDifferenceDays;
        return dateCompare !== 0 ? dateCompare : a.transactionId.localeCompare(b.transactionId);
      });

    const totalCandidates = candidates.length;
    const state: ReconciliationMatchLineState =
      totalCandidates === 0
        ? 'no_candidate'
        : totalCandidates === 1
          ? 'single_candidate'
          : 'multiple_candidates';

    const allExceptionCandidates =
      totalCandidates === 0
        ? transactions
            .map((transaction) => exceptionCandidateFor(line, transaction, accountId))
            .filter(
              (candidate): candidate is ReconciliationExceptionCandidate =>
                candidate !== null,
            )
            .sort(sortExceptionCandidates)
        : [];

    return {
      lineNumber: line.lineNumber,
      sourceDate: line.selectedDate!,
      sourceAmountCents: line.selectedAmountCents!,
      sourceDirection: line.selectedDirection as Exclude<StatementLineDirection, 'unknown'>,
      sourceDescription: line.descriptionCandidate,
      state,
      totalCandidates,
      candidateLimitReached: totalCandidates > RECONCILIATION_MATCH_MAX_CANDIDATES_PER_LINE,
      candidates: candidates.slice(0, RECONCILIATION_MATCH_MAX_CANDIDATES_PER_LINE),
      exceptionCandidates: allExceptionCandidates.slice(
        0,
        RECONCILIATION_EXCEPTION_MAX_CANDIDATES_PER_LINE,
      ),
      exceptionCandidateLimitReached:
        allExceptionCandidates.length > RECONCILIATION_EXCEPTION_MAX_CANDIDATES_PER_LINE,
      suggestedAction:
        totalCandidates === 0
          ? allExceptionCandidates.length > 0
            ? 'review_possible_transaction'
            : 'locate_or_register_transaction'
          : null,
      requiresHumanConfirmation: true,
    };
  });

  const noCandidateLines = previews.filter((line) => line.state === 'no_candidate').length;

  return {
    deterministic: true,
    matchedPreparedLines: previews.length,
    skippedUnconfirmedLines: Math.max(0, lines.length - previews.length),
    singleCandidateLines: previews.filter((line) => line.state === 'single_candidate').length,
    multipleCandidateLines: previews.filter((line) => line.state === 'multiple_candidates').length,
    noCandidateLines,
    divergentLines: noCandidateLines,
    lines: previews,
    requiresHumanConfirmation: true,
    autoSelected: false,
  };
}
