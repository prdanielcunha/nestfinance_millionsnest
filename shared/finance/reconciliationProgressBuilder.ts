import type { PreparedStatementLine } from './reconciliationStatementLines.js';
import type { ReconciliationMatchPreviewResult } from './reconciliationMatchPreview.js';
import type {
  ReconciliationProgressLine,
  ReconciliationProgressResponse,
} from './reconciliationProgress.js';
import { RECONCILIATION_PROGRESS_VERSION } from './reconciliationProgress.js';

export type ReconciliationProgressConfirmation = {
  lineNumber: number;
  status: 'active' | 'released';
  transactionId: string | null;
  reconciliationId: string | null;
};

export function buildReconciliationProgress(input: {
  financeEntityId: string;
  evidenceId: string;
  accountId: string;
  preparedLines: PreparedStatementLine[];
  preview: ReconciliationMatchPreviewResult;
  confirmations: ReconciliationProgressConfirmation[];
}): ReconciliationProgressResponse {
  const confirmationByLine = new Map(
    input.confirmations.map((item) => [item.lineNumber, item]),
  );
  const previewByLine = new Map(
    input.preview.lines.map((item) => [item.lineNumber, item]),
  );

  const lines: ReconciliationProgressLine[] = input.preparedLines.map((line) => {
    const confirmation = confirmationByLine.get(line.lineNumber);
    const preview = previewByLine.get(line.lineNumber);

    let state: ReconciliationProgressLine['state'];
    if (confirmation?.status === 'active') {
      state = 'confirmed';
    } else if (confirmation?.status === 'released') {
      state = 'needs_recheck';
    } else if (line.parseState !== 'prepared') {
      state = 'needs_review';
    } else if (preview?.state === 'single_candidate') {
      state = 'one_possibility';
    } else if (preview?.state === 'multiple_candidates') {
      state = 'multiple_possibilities';
    } else {
      state = 'no_match';
    }

    return {
      lineNumber: line.lineNumber,
      sourceDate: line.selectedDate,
      sourceAmountCents: line.selectedAmountCents,
      sourceDirection: line.selectedDirection,
      sourceDescription: line.descriptionCandidate,
      state,
      candidateCount: preview?.totalCandidates || 0,
      activeTransactionId:
        confirmation?.status === 'active' ? confirmation.transactionId : null,
      activeReconciliationId:
        confirmation?.status === 'active' ? confirmation.reconciliationId : null,
      sourceBacked: true,
    };
  });

  const confirmedItems = lines.filter((line) => line.state === 'confirmed').length;
  const recognizedItems = lines.length;

  return {
    version: RECONCILIATION_PROGRESS_VERSION,
    state: 'progress',
    financeEntityId: input.financeEntityId,
    evidenceId: input.evidenceId,
    accountId: input.accountId,
    scope: 'recognized_native_text_items_only',
    canDeclareStatementFullyReconciled: false,
    financialMutation: false,
    reconciliationMutation: false,
    aiUsed: false,
    ocrUsed: false,
    summary: {
      recognizedItems,
      confirmedItems,
      remainingItems: Math.max(0, recognizedItems - confirmedItems),
      needsRecheckItems: lines.filter((line) => line.state === 'needs_recheck').length,
      needsReviewItems: lines.filter((line) => line.state === 'needs_review').length,
      onePossibilityItems: lines.filter((line) => line.state === 'one_possibility').length,
      multiplePossibilityItems: lines.filter((line) => line.state === 'multiple_possibilities').length,
      noMatchItems: lines.filter((line) => line.state === 'no_match').length,
    },
    lines,
  };
}
