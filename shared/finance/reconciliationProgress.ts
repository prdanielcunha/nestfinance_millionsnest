export const RECONCILIATION_PROGRESS_VERSION = 1 as const;

export type ReconciliationProgressLineState =
  | 'confirmed'
  | 'needs_recheck'
  | 'one_possibility'
  | 'multiple_possibilities'
  | 'no_match'
  | 'needs_review';

export type ReconciliationProgressLine = {
  lineNumber: number;
  sourceDate: string | null;
  sourceAmountCents: number | null;
  sourceDirection: 'inflow' | 'outflow' | 'unknown';
  sourceDescription: string | null;
  state: ReconciliationProgressLineState;
  candidateCount: number;
  activeTransactionId: string | null;
  activeReconciliationId: string | null;
  sourceBacked: true;
};

export type ReconciliationProgressResponse = {
  version: typeof RECONCILIATION_PROGRESS_VERSION;
  state: 'progress';
  financeEntityId: string;
  evidenceId: string;
  accountId: string;
  scope: 'recognized_native_text_items_only';
  canDeclareStatementFullyReconciled: false;
  financialMutation: false;
  reconciliationMutation: false;
  aiUsed: false;
  ocrUsed: false;
  summary: {
    recognizedItems: number;
    confirmedItems: number;
    remainingItems: number;
    needsRecheckItems: number;
    needsReviewItems: number;
    onePossibilityItems: number;
    multiplePossibilityItems: number;
    noMatchItems: number;
  };
  lines: ReconciliationProgressLine[];
};
