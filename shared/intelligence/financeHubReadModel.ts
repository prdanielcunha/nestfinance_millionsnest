import type {
  PeriodCloseBlockerCode,
  PeriodCloseReadinessResponse,
} from '../finance/periodCloseReadiness.js';

export const FINANCE_HUB_READ_MODEL_VERSION = 1 as const;

export type FinanceHubReadModelState =
  | 'attention_required'
  | 'ready_for_review'
  | 'reviewed_current_snapshot'
  | 'review_outdated';

export type FinanceHubReadModel = {
  version: typeof FINANCE_HUB_READ_MODEL_VERSION;
  sourceApp: 'NESTFINANCE';
  organizationId: string;
  financeEntityId: string;
  periodKey: string;
  generatedAt: string;
  authority: {
    readOnly: true;
    requiredCapability: 'finance.view';
    financialMutation: false;
    closeMutation: false;
    officialReport: false;
    pastoralClassification: false;
    journeySignalSource: false;
  };
  privacy: {
    hubSafe: true;
    containsMonetaryAmounts: false;
    containsDocumentContents: false;
    containsContributorIdentity: false;
    containsFreeFormDescriptions: false;
  };
  state: FinanceHubReadModelState;
  attention: {
    blockerCount: number;
    blockerCodes: PeriodCloseBlockerCode[];
  };
  transactions: {
    drafts: number;
    waitingReview: number;
    waitingPosting: number;
  };
  count: {
    matched: number;
    divergent: number;
    incomplete: number;
  };
  documents: {
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
  report: {
    state:
      | 'blocked'
      | 'ready_for_human_review'
      | 'reviewed_current_snapshot'
      | 'review_outdated';
    officialReport: false;
  };
  source: {
    periodCloseReadinessVersion: number;
    humanReviewState: PeriodCloseReadinessResponse['humanReview']['state'];
  };
};

function deriveState(
  readiness: PeriodCloseReadinessResponse,
): FinanceHubReadModelState {
  if (readiness.readiness.blockerCount > 0) return 'attention_required';
  if (readiness.humanReview.state === 'reviewed_current_snapshot') {
    return 'reviewed_current_snapshot';
  }
  if (readiness.humanReview.state === 'review_outdated') {
    return 'review_outdated';
  }
  return 'ready_for_review';
}

function deriveReportState(
  readiness: PeriodCloseReadinessResponse,
): FinanceHubReadModel['report']['state'] {
  if (readiness.readiness.blockerCount > 0) return 'blocked';
  if (readiness.humanReview.state === 'reviewed_current_snapshot') {
    return 'reviewed_current_snapshot';
  }
  if (readiness.humanReview.state === 'review_outdated') {
    return 'review_outdated';
  }
  return 'ready_for_human_review';
}

export function buildFinanceHubReadModel(args: {
  organizationId: string;
  readiness: PeriodCloseReadinessResponse;
  generatedAt: string;
}): FinanceHubReadModel {
  const { organizationId, readiness, generatedAt } = args;

  return {
    version: FINANCE_HUB_READ_MODEL_VERSION,
    sourceApp: 'NESTFINANCE',
    organizationId,
    financeEntityId: readiness.financeEntityId,
    periodKey: readiness.period.key,
    generatedAt,
    authority: {
      readOnly: true,
      requiredCapability: 'finance.view',
      financialMutation: false,
      closeMutation: false,
      officialReport: false,
      pastoralClassification: false,
      journeySignalSource: false,
    },
    privacy: {
      hubSafe: true,
      containsMonetaryAmounts: false,
      containsDocumentContents: false,
      containsContributorIdentity: false,
      containsFreeFormDescriptions: false,
    },
    state: deriveState(readiness),
    attention: {
      blockerCount: readiness.readiness.blockerCount,
      blockerCodes: readiness.readiness.blockers.map((blocker) => blocker.code),
    },
    transactions: {
      drafts: readiness.transactions.statusCounts.draft,
      waitingReview: readiness.transactions.statusCounts.readyForReview,
      waitingPosting: readiness.transactions.statusCounts.approvedForPosting,
    },
    count: {
      matched: readiness.countSessions.matched,
      divergent: readiness.countSessions.divergent,
      incomplete: readiness.countSessions.incomplete,
    },
    documents: {
      reviewed: readiness.documents.reviewed,
      waitingReview: readiness.documents.waitingReview,
      unfinishedUploads: readiness.documents.unfinishedUploads,
    },
    reconciliation: {
      configuredBankAccounts: readiness.reconciliation.configuredBankAccounts,
      postedBankTransactions: readiness.reconciliation.postedBankTransactions,
      reconciledBankTransactions: readiness.reconciliation.reconciledBankTransactions,
      unreconciledBankTransactions: readiness.reconciliation.unreconciledBankTransactions,
    },
    report: {
      state: deriveReportState(readiness),
      officialReport: false,
    },
    source: {
      periodCloseReadinessVersion: readiness.version,
      humanReviewState: readiness.humanReview.state,
    },
  };
}
