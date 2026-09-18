export const RECONCILIATION_LINE_LOCK_SCHEMA_VERSION = 1 as const;

export type ReconciliationLineLockRecord = {
  lineLockId: string;
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  statementLineFingerprint: string;
  status: 'active' | 'released';
  activeReconciliationId: string | null;
  activeTransactionId: string | null;
  activatedByUid: string | null;
  activatedAt: unknown | null;
  releasedByUid: string | null;
  releasedAt: unknown | null;
  releaseReversalId: string | null;
  schemaVersion: typeof RECONCILIATION_LINE_LOCK_SCHEMA_VERSION;
};