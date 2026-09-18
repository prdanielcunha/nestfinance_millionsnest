import type { ReconciliationMatchEvidence } from './reconciliationMatchPreview.js';

export const RECONCILIATION_CONFIRMATION_SCHEMA_VERSION = 1 as const;

export type ReconciliationConfirmationRecord = {
  reconciliationId: string;
  organizationId: string;
  financeEntityId: string;
  accountId: string;
  transactionId: string;
  transactionVersion: number;
  evidenceId: string;
  evidenceVersion: number;
  statementLineFingerprint: string;
  statementLineNumber: number;
  statementDate: string;
  statementAmountCents: number;
  statementDirection: 'inflow' | 'outflow';
  statementDescription: string | null;
  matchEvidence: ReconciliationMatchEvidence;
  status: 'confirmed';
  confirmedByUid: string;
  confirmedAt: unknown;
  requestId: string;
  balanceChanged: false;
  journalChanged: false;
  schemaVersion: typeof RECONCILIATION_CONFIRMATION_SCHEMA_VERSION;
};

export type ReconciliationConfirmRequest = {
  financeEntityId: string;
  evidenceId: string;
  accountId: string;
  transactionId: string;
  lineNumber: number;
  idempotencyKey: string;
  requestId: string;
};

export type ReconciliationConfirmResponse = {
  reconciliationId: string;
  transactionId: string;
  transactionVersion: number;
  reconciliationStatus: 'reconciled';
  lineNumber: number;
  balanceChanged: false;
  journalChanged: false;
  auditRecorded: true;
  factRecorded: true;
};
