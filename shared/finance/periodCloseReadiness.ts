export const PERIOD_CLOSE_READINESS_VERSION = 1 as const;
export const PERIOD_CLOSE_MAX_TRANSACTIONS = 1000;
export const PERIOD_CLOSE_MAX_COUNT_SESSIONS = 500;
export const PERIOD_CLOSE_MAX_EVIDENCE = 500;

export type PeriodCloseReadinessState = 'attention_required' | 'ready_for_review';

export type PeriodCloseBlockerCode =
  | 'draft_transactions'
  | 'transactions_waiting_review'
  | 'transactions_waiting_posting'
  | 'incomplete_count_sessions'
  | 'divergent_count_sessions'
  | 'documents_waiting_review'
  | 'unfinished_document_uploads'
  | 'bank_transactions_unreconciled';

export type PeriodCloseBlocker = {
  code: PeriodCloseBlockerCode;
  count: number;
  routeHint: 'transactions' | 'review' | 'count' | 'inbox' | 'balance';
};

export type PeriodCloseTransactionInput = {
  transactionKind: string;
  status: string;
  amountCents: number;
  reconciliationStatus?: string | null;
  accountId?: string | null;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
};

export type PeriodCloseCountInput = {
  status: string;
};

export type PeriodCloseEvidenceInput = {
  processingState: string;
  duplicate: boolean;
  humanClassified: boolean;
  reviewStatus: string | null;
};

export type PeriodCloseReadinessResponse = {
  version: typeof PERIOD_CLOSE_READINESS_VERSION;
  financeEntityId: string;
  period: {
    key: string;
    startDate: string;
    endDateExclusive: string;
  };
  scope: {
    transactions: 'occurred_at_in_period';
    countSessions: 'service_date_in_period';
    documents: 'captured_in_period';
    reconciliation: 'posted_bank_account_transactions_in_period';
  };
  authority: {
    readOnly: true;
    financialMutation: false;
    closeMutation: false;
    canClosePeriod: false;
    canDeclarePeriodClosed: false;
    officialReport: false;
  };
  readiness: {
    state: PeriodCloseReadinessState;
    blockerCount: number;
    blockers: PeriodCloseBlocker[];
  };
  humanReview: {
    state: 'not_reviewed' | 'reviewed_current_snapshot';
    reviewId: string | null;
    reviewedAt: string | null;
    reviewedByDisplayName: string | null;
    sourceSnapshotMatches: boolean;
  };
  transactions: {
    total: number;
    capturedIncomeCents: number;
    capturedExpenseCents: number;
    postedIncomeCents: number;
    postedExpenseCents: number;
    statusCounts: {
      draft: number;
      readyForReview: number;
      approvedForPosting: number;
      posted: number;
      reversed: number;
      other: number;
    };
  };
  countSessions: {
    total: number;
    matched: number;
    divergent: number;
    incomplete: number;
  };
  documents: {
    total: number;
    reviewed: number;
    waitingReview: number;
    unfinishedUploads: number;
  };
  reconciliation: {
    configuredBankAccounts: number;
    postedBankTransactions: number;
    reconciledBankTransactions: number;
    unreconciledBankTransactions: number;
  };
};

const nonNegativeInteger = (value: unknown) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
};

export function buildPeriodCloseReadiness(input: {
  financeEntityId: string;
  periodKey: string;
  startDate: string;
  endDateExclusive: string;
  configuredBankAccountIds: string[];
  transactions: PeriodCloseTransactionInput[];
  countSessions: PeriodCloseCountInput[];
  evidence: PeriodCloseEvidenceInput[];
}): PeriodCloseReadinessResponse {
  const bankIds = new Set(input.configuredBankAccountIds);
  const statusCounts = {
    draft: 0,
    readyForReview: 0,
    approvedForPosting: 0,
    posted: 0,
    reversed: 0,
    other: 0,
  };

  let capturedIncomeCents = 0;
  let capturedExpenseCents = 0;
  let postedIncomeCents = 0;
  let postedExpenseCents = 0;
  let postedBankTransactions = 0;
  let reconciledBankTransactions = 0;
  let unreconciledBankTransactions = 0;

  for (const tx of input.transactions) {
    const amount = nonNegativeInteger(tx.amountCents);
    if (tx.status === 'draft') statusCounts.draft++;
    else if (tx.status === 'ready_for_review') statusCounts.readyForReview++;
    else if (tx.status === 'approved_for_posting') statusCounts.approvedForPosting++;
    else if (tx.status === 'posted') statusCounts.posted++;
    else if (tx.status === 'reversed') statusCounts.reversed++;
    else statusCounts.other++;

    if (tx.status !== 'reversed') {
      if (tx.transactionKind === 'income') capturedIncomeCents += amount;
      if (tx.transactionKind === 'expense') capturedExpenseCents += amount;
    }
    if (tx.status === 'posted') {
      if (tx.transactionKind === 'income') postedIncomeCents += amount;
      if (tx.transactionKind === 'expense') postedExpenseCents += amount;
    }

    const touchesBankAccount = [tx.accountId, tx.sourceAccountId, tx.destinationAccountId]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => bankIds.has(value));

    if (tx.status === 'posted' && touchesBankAccount) {
      postedBankTransactions++;
      if (tx.reconciliationStatus === 'reconciled') reconciledBankTransactions++;
      else unreconciledBankTransactions++;
    }
  }

  let matched = 0;
  let divergent = 0;
  let incomplete = 0;
  for (const session of input.countSessions) {
    if (session.status === 'matched') matched++;
    else if (session.status === 'divergent') divergent++;
    else incomplete++;
  }

  let reviewed = 0;
  let waitingReview = 0;
  let unfinishedUploads = 0;
  for (const document of input.evidence) {
    if (document.duplicate) continue;
    if (document.processingState === 'awaiting_upload') {
      unfinishedUploads++;
      continue;
    }
    if (document.processingState !== 'accepted') continue;
    if (document.humanClassified && document.reviewStatus === 'reviewed') reviewed++;
    else waitingReview++;
  }

  const blockers: PeriodCloseBlocker[] = [];
  const add = (code: PeriodCloseBlockerCode, count: number, routeHint: PeriodCloseBlocker['routeHint']) => {
    if (count > 0) blockers.push({ code, count, routeHint });
  };

  add('draft_transactions', statusCounts.draft, 'transactions');
  add('transactions_waiting_review', statusCounts.readyForReview, 'review');
  add('transactions_waiting_posting', statusCounts.approvedForPosting, 'transactions');
  add('incomplete_count_sessions', incomplete, 'count');
  add('divergent_count_sessions', divergent, 'count');
  add('documents_waiting_review', waitingReview, 'inbox');
  add('unfinished_document_uploads', unfinishedUploads, 'inbox');
  add('bank_transactions_unreconciled', unreconciledBankTransactions, 'balance');

  return {
    version: PERIOD_CLOSE_READINESS_VERSION,
    financeEntityId: input.financeEntityId,
    period: {
      key: input.periodKey,
      startDate: input.startDate,
      endDateExclusive: input.endDateExclusive,
    },
    scope: {
      transactions: 'occurred_at_in_period',
      countSessions: 'service_date_in_period',
      documents: 'captured_in_period',
      reconciliation: 'posted_bank_account_transactions_in_period',
    },
    authority: {
      readOnly: true,
      financialMutation: false,
      closeMutation: false,
      canClosePeriod: false,
      canDeclarePeriodClosed: false,
      officialReport: false,
    },
    readiness: {
      state: blockers.length === 0 ? 'ready_for_review' : 'attention_required',
      blockerCount: blockers.reduce((sum, blocker) => sum + blocker.count, 0),
      blockers,
    },
    humanReview: {
      state: 'not_reviewed',
      reviewId: null,
      reviewedAt: null,
      reviewedByDisplayName: null,
      sourceSnapshotMatches: false,
    },
    transactions: {
      total: input.transactions.length,
      capturedIncomeCents,
      capturedExpenseCents,
      postedIncomeCents,
      postedExpenseCents,
      statusCounts,
    },
    countSessions: {
      total: input.countSessions.length,
      matched,
      divergent,
      incomplete,
    },
    documents: {
      total: input.evidence.filter((item) => !item.duplicate).length,
      reviewed,
      waitingReview,
      unfinishedUploads,
    },
    reconciliation: {
      configuredBankAccounts: bankIds.size,
      postedBankTransactions,
      reconciledBankTransactions,
      unreconciledBankTransactions,
    },
  };
}
