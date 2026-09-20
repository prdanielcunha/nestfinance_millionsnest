export const RECONCILIATION_SESSION_SCHEMA_VERSION = 1 as const;

export type ReconciliationSessionStatus = 'in_progress';

export type ReconciliationSessionRecord<TTimestamp = unknown> = {
  reconciliationSessionId: string;
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  accountId: string;
  status: ReconciliationSessionStatus;
  startedByUid: string | null;
  startedAt: TTimestamp;
  lastActivityAt: TTimestamp;
  activeConfirmationCount: number;
  totalConfirmationCount: number;
  exceptionCount: number;
  lastExceptionAt: TTimestamp | null;
  lastExceptionReasonCode: string | null;
  sourceScope: 'recognized_native_text_items_only';
  canDeclareStatementFullyReconciled: false;
  schemaVersion: typeof RECONCILIATION_SESSION_SCHEMA_VERSION;
};
