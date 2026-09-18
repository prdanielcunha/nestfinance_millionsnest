import type { StatementLinePreparationResult } from './reconciliationStatementLines.js';

export type ReconciliationPreparationUnavailableReason =
  | 'input_too_large'
  | 'encrypted'
  | 'text_layer_not_detected'
  | 'structural_preflight_incomplete'
  | 'page_limit_exceeded'
  | 'extraction_empty'
  | 'parser_error';

export type ReconciliationPreparationSource = {
  evidenceId: string;
  evidenceVersion: number;
  accountId: string;
  accountName: string;
  institutionName: string | null;
  accountLast4: string | null;
  association: 'request_context_only';
  sourceBacked: true;
};

export type ReconciliationPreparationAuthority = {
  deterministic: true;
  aiUsed: false;
  ocrUsed: false;
  financialMutation: false;
  reconciliationMutation: false;
  financialRecognition: false;
  requiresHumanConfirmation: true;
};

export type ReconciliationStatementPreparationResponse =
  | {
      state: 'unavailable';
      source: ReconciliationPreparationSource;
      extraction: {
        state: 'unavailable';
        parser: 'unpdf-pdfjs-1';
        reason: ReconciliationPreparationUnavailableReason;
        totalPages?: number;
      };
      authority: ReconciliationPreparationAuthority;
      requestId?: string;
    }
  | {
      state: 'prepared';
      source: ReconciliationPreparationSource;
      extraction: {
        parser: 'unpdf-pdfjs-1';
        totalPages: number;
        extractedPages: number;
        characters: number;
        truncated: boolean;
      };
      preparation: StatementLinePreparationResult;
      authority: ReconciliationPreparationAuthority;
      requestId?: string;
    };
