export const RECONCILIATION_EXCEPTION_SCHEMA_VERSION = 1 as const;
export const RECONCILIATION_EXCEPTION_REASONS = [
  'timing_difference',
  'bank_fee',
  'amount_difference',
  'missing_transaction',
  'duplicate_or_unexpected',
  'other',
] as const;
export type ReconciliationExceptionReason = typeof RECONCILIATION_EXCEPTION_REASONS[number];

export type ReconciliationExceptionJustificationRequest = {
  financeEntityId: string;
  evidenceId: string;
  accountId: string;
  lineNumber: number;
  candidateTransactionId?: string | null;
  reasonCode: ReconciliationExceptionReason;
  comment?: string | null;
  idempotencyKey: string;
  requestId: string;
};

export type ReconciliationExceptionJustificationResponse = {
  exceptionId: string;
  evidenceId: string;
  lineNumber: number;
  reasonCode: ReconciliationExceptionReason;
  auditRecorded: true;
  factRecorded: true;
  financialMutation: false;
  reconciliationMutation: false;
};

export function isReconciliationExceptionReason(value: unknown): value is ReconciliationExceptionReason {
  return typeof value === 'string' &&
    (RECONCILIATION_EXCEPTION_REASONS as readonly string[]).includes(value);
}

export function normalizeReconciliationExceptionComment(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (normalized.length > 280) return null;
  return normalized;
}
