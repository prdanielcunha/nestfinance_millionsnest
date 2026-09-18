import { createHash } from 'node:crypto';
import type { PreparedStatementLine } from '../../../shared/finance/reconciliationStatementLines.js';

const normalize = (value: string) => value.trim();

export function buildStatementLineFingerprint(input: {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  evidenceVersion: number;
  line: PreparedStatementLine;
}): string {
  const line = input.line;
  const key = [
    normalize(input.organizationId),
    normalize(input.financeEntityId),
    normalize(input.evidenceId),
    String(input.evidenceVersion),
    String(line.lineNumber),
    line.selectedDate || '',
    line.selectedAmountCents === null ? '' : String(line.selectedAmountCents),
    line.selectedDirection,
    line.raw,
  ].join(':');

  return `line_${createHash('sha256').update(key).digest('hex')}`;
}

export function buildReconciliationId(input: {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  evidenceVersion: number;
  statementLineFingerprint: string;
}): string {
  const key = [
    normalize(input.organizationId),
    normalize(input.financeEntityId),
    normalize(input.evidenceId),
    String(input.evidenceVersion),
    normalize(input.statementLineFingerprint),
  ].join(':');

  return `rec_${createHash('sha256').update(key).digest('hex')}`;
}
