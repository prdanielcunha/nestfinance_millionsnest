import type {
  PreparedStatementLine,
  StatementLineDirection,
} from './reconciliationStatementLines.js';

export const RECONCILIATION_MATCH_MAX_TRANSACTIONS = 1000;
export const RECONCILIATION_MATCH_MAX_CANDIDATES_PER_LINE = 5;

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
  reconciliationStatus: 'unreconciled' | 'reconciled';
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
  reconciliationStatus: 'unreconciled';
  postingState: 'posted' | 'not_posted';
  reconciliationEligible: boolean;
  amountCents: number;
  occurredAt: string;
  description: string | null;
  accountName: string | null;
  evidence: ReconciliationMatchEvidence;
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
  requiresHumanConfirmation: true;
};

export type ReconciliationMatchPreviewResult = {
  deterministic: true;
  matchedPreparedLines: number;
  skippedUnconfirmedLines: number;
  singleCandidateLines: number;
  multipleCandidateLines: number;
  noCandidateLines: number;
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
  return { normalized: match[1] + '-' + match[2] + '-' + match[3], epochDay: Math.floor(date.getTime() / 86_400_000) };
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

function candidateFor(
  line: PreparedStatementLine,
  transaction: ReconciliationMatchableTransaction,
  accountId: string,
): ReconciliationMatchCandidate | null {
  if (
    line.parseState !== 'prepared' ||
    !line.selectedDate ||
    line.selectedAmountCents === null ||
    line.selectedDirection === 'unknown'
  ) {
    return null;
  }

  if (
    transaction.status === 'draft' ||
    transaction.status === 'ready_for_review' ||
    transaction.status === 'approved_for_posting' ||
    transaction.status === 'posted'
  ) {
    // supported non-reversed lifecycle states
  } else {
    return null;
  }

  if (transaction.reconciliationStatus === 'reconciled') return null;
  if (transaction.amountCents !== line.selectedAmountCents) return null;

  const direction = transactionDirection(transaction, accountId);
  if (!direction || direction !== line.selectedDirection) return null;

  const lineDate = isoDay(line.selectedDate);
  const transactionDate = isoDay(transaction.occurredAt);
  if (!lineDate || !transactionDate) return null;

  const difference = Math.abs(lineDate.epochDay - transactionDate.epochDay);
  if (difference > 1) return null;

  return {
    transactionId: transaction.transactionId,
    transactionKind: transaction.transactionKind,
    transactionStatus: transaction.status,
    reconciliationStatus: 'unreconciled',
    postingState: transaction.status === 'posted' ? 'posted' : 'not_posted',
    reconciliationEligible: transaction.status === 'posted',
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

export function buildReconciliationMatchPreview(
  lines: PreparedStatementLine[],
  transactions: ReconciliationMatchableTransaction[],
  accountId: string,
): ReconciliationMatchPreviewResult {
  const preparedLines = lines.filter(
    (line) =>
      line.parseState === 'prepared' &&
      Boolean(line.selectedDate) &&
      line.selectedAmountCents !== null &&
      line.selectedDirection !== 'unknown',
  );

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
      requiresHumanConfirmation: true,
    };
  });

  return {
    deterministic: true,
    matchedPreparedLines: previews.length,
    skippedUnconfirmedLines: Math.max(0, lines.length - previews.length),
    singleCandidateLines: previews.filter((line) => line.state === 'single_candidate').length,
    multipleCandidateLines: previews.filter((line) => line.state === 'multiple_candidates').length,
    noCandidateLines: previews.filter((line) => line.state === 'no_candidate').length,
    lines: previews,
    requiresHumanConfirmation: true,
    autoSelected: false,
  };
}
