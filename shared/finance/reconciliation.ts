export const RECONCILIATION_READINESS_VERSION = 1 as const;

export type ReconciliationReadinessState =
  | 'no_bank_account'
  | 'needs_statement'
  | 'needs_statement_review'
  | 'source_ready'
  | 'reviewed_source_not_supported';

export type ReconciliationBankAccount = {
  accountId: string;
  name: string;
  type: string;
  nature: string | null;
  institutionName: string | null;
  accountLast4: string | null;
  currency: string;
  configurationStatus: string | null;
  active: boolean;
  eligible: boolean;
};

export type ReconciliationStatementSourceState =
  | 'pending_review'
  | 'ready_for_native_text_check'
  | 'reviewed_non_pdf';

export type ReconciliationStatementSource = {
  evidenceId: string;
  originalFilename: string;
  verifiedMimeType: string | null;
  byteSize: number;
  createdAt: string | null;
  reviewedAt: string | null;
  version: number;
  state: ReconciliationStatementSourceState;
  sourceBacked: true;
};

export type ReconciliationReadiness = {
  version: typeof RECONCILIATION_READINESS_VERSION;
  financeEntityId: string;
  state: ReconciliationReadinessState;
  financialMutation: false;
  aiUsed: false;
  postingRequired: false;
  accounts: ReconciliationBankAccount[];
  statements: ReconciliationStatementSource[];
  summary: {
    eligibleBankAccounts: number;
    classifiedBankStatements: number;
    pendingStatementReview: number;
    readyPdfStatements: number;
    reviewedUnsupportedStatements: number;
  };
};
