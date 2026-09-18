import type { ReconciliationMatchPreviewResult } from './reconciliationMatchPreview.js';
import type { ReconciliationPreparationUnavailableReason } from './reconciliationStatementPreparation.js';

export type ReconciliationMatchPreviewSource = {
  evidenceId: string;
  evidenceVersion: number;
  accountId: string;
  accountName?: string;
  institutionName?: string | null;
  accountLast4?: string | null;
  association: 'request_context_only';
  sourceBacked: true;
};

export type ReconciliationMatchPreviewAuthority = {
  deterministic: true;
  aiUsed: false;
  ocrUsed: false;
  financialMutation: false;
  reconciliationMutation: false;
  autoMatched: false;
  requiresHumanConfirmation: true;
};

export type ReconciliationMatchPreviewResponse =
  | {
      state: 'unavailable';
      reason: ReconciliationPreparationUnavailableReason;
      source: ReconciliationMatchPreviewSource;
      authority: ReconciliationMatchPreviewAuthority;
      requestId?: string;
    }
  | {
      state: 'preview';
      source: ReconciliationMatchPreviewSource;
      transactionScope: {
        scanned: number;
        usable: number;
        limit: number;
      };
      preparation: {
        candidateLines: number;
        preparedLines: number;
        needsConfirmationLines: number;
        limited: boolean;
      };
      preview: ReconciliationMatchPreviewResult;
      authority: ReconciliationMatchPreviewAuthority;
      requestId?: string;
    };
