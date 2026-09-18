export const RECONCILIATION_REVERSAL_SCHEMA_VERSION = 1 as const;

export const RECONCILIATION_REVERSAL_REASON_CODES = [
  'wrong_transaction',
  'wrong_statement_item',
  'duplicate_confirmation',
  'other',
] as const;

export type ReconciliationReversalReasonCode =
  (typeof RECONCILIATION_REVERSAL_REASON_CODES)[number];

export type ReconciliationReversalRecord = {
  reversalId: string;
  reconciliationId: string;
  lineLockId: string;
  organizationId: string;
  financeEntityId: string;
  accountId: string;
  transactionId: string;
  evidenceId: string;
  statementLineFingerprint: string;
  reasonCode: ReconciliationReversalReasonCode;
  note: string | null;
  reversedByUid: string;
  reversedAt: unknown;
  requestId: string;
  balanceChanged: false;
  journalChanged: false;
  schemaVersion: typeof RECONCILIATION_REVERSAL_SCHEMA_VERSION;
};

export type ReconciliationReverseRequest = {
  financeEntityId: string;
  transactionId: string;
  reconciliationId: string;
  reasonCode: ReconciliationReversalReasonCode;
  note?: string | null;
  idempotencyKey: string;
  requestId: string;
};

export type ReconciliationReverseResponse = {
  reversalId: string;
  reconciliationId: string;
  transactionId: string;
  transactionVersion: number;
  reconciliationStatus: 'unreconciled';
  balanceChanged: false;
  journalChanged: false;
  auditRecorded: true;
  factRecorded: true;
};
