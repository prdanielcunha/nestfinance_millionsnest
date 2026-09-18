import { createHash } from 'node:crypto';
import type { PreparedStatementLine } from '../../../shared/finance/reconciliationStatementLines.js';

const normalize = (value: string) => value.trim();

export function buildStatementLineFingerprint(input: {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  line: PreparedStatementLine;
}): string {
  const line = input.line;
  const key = [
    normalize(input.organizationId),
    normalize(input.financeEntityId),
    normalize(input.evidenceId),
    String(line.lineNumber),
    line.selectedDate || '',
    line.selectedAmountCents === null ? '' : String(line.selectedAmountCents),
    line.selectedDirection,
    line.raw,
  ].join(':');

  return `line_${createHash('sha256').update(key).digest('hex')}`;
}

export function buildLegacyReconciliationId(input: {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  statementLineFingerprint: string;
}): string {
  const key = [
    normalize(input.organizationId),
    normalize(input.financeEntityId),
    normalize(input.evidenceId),
    normalize(input.statementLineFingerprint),
  ].join(':');

  return `rec_${createHash('sha256').update(key).digest('hex')}`;
}

export const buildReconciliationId = buildLegacyReconciliationId;

export function buildReconciliationLineLockId(input: {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  statementLineFingerprint: string;
}): string {
  const key = [
    normalize(input.organizationId),
    normalize(input.financeEntityId),
    normalize(input.evidenceId),
    normalize(input.statementLineFingerprint),
    'active-lock-v1',
  ].join(':');

  return `rlock_${createHash('sha256').update(key).digest('hex')}`;
}

export function buildReconciliationAttemptId(input: {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  statementLineFingerprint: string;
  transactionId: string;
  idempotencyKeyHash: string;
}): string {
  const key = [
    normalize(input.organizationId),
    normalize(input.financeEntityId),
    normalize(input.evidenceId),
    normalize(input.statementLineFingerprint),
    normalize(input.transactionId),
    normalize(input.idempotencyKeyHash),
    'confirmation-attempt-v2',
  ].join(':');

  return `rec_${createHash('sha256').update(key).digest('hex')}`;
}

export function buildReconciliationReversalId(input: {
  organizationId: string;
  financeEntityId: string;
  reconciliationId: string;
}): string {
  const key = [
    normalize(input.organizationId),
    normalize(input.financeEntityId),
    normalize(input.reconciliationId),
    'reversal-v1',
  ].join(':');

  return `rrev_${createHash('sha256').update(key).digest('hex')}`;
}
