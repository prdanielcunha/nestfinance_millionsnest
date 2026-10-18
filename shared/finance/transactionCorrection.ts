/** Human-readable, bounded history. Complete source records remain in private audit. */
export function transactionNeedsCorrectionReason(record: any): boolean {
  return Boolean(record.returnedToDraftAt || record.returnedToDraftBy || record.invalidatedAt ||
    record.invalidatedBy || record.approvalStatus === 'invalidated');
}

export function normalizeTransactionCorrectionReason(value: unknown, required: boolean): string | null {
  if ((value === undefined || value === null || value === '') && !required) return null;
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 10 || reason.length > 500) {
    throw { code: 'FINANCE_CORRECTION_REASON_REQUIRED' };
  }
  return reason;
}

export function assertTransactionEditable(record: any) {
  if (record.status !== 'draft' || record.journalEntryId || record.postingId || record.postedAt ||
    record.postedBy || record.reversalOf || record.reversedAt || record.reversedBy) {
    throw { code: 'FINANCE_INVALID_STATE_TRANSITION' };
  }
  if (record.reconciliationStatus === 'reconciled' || record.reconciliationId || record.reconciledAt) {
    throw { code: 'FINANCE_RECONCILIATION_REQUIRES_REVERSAL' };
  }
}

export function transactionCorrectionSnapshot(record: any, allocations: readonly any[]) {
  const text = (value: unknown, max = 2000): string | null => typeof value === 'string' ? value.slice(0, max) : null;
  return {
    amountCents: record.amountCents,
    currency: text(record.currency, 8),
    transactionKind: text(record.transactionKind || record.direction, 40),
    occurredAt: text(record.occurredAt, 40),
    competenceDate: text(record.competenceDate, 40),
    account: text(record.accountSnapshot?.name),
    destinationAccount: text(record.destinationAccountSnapshot?.name),
    liabilityAccount: text(record.liabilityAccountSnapshot?.name),
    paymentMethod: text(record.paymentMethod, 80),
    description: text(record.description),
    counterparty: text(record.counterparty),
    evidenceJustification: text(record.evidenceJustification),
    evidenceCount: Array.isArray(record.evidenceIds) ? record.evidenceIds.length : 0,
    allocations: allocations.map(allocation => ({
      category: text(allocation.categorySnapshot?.name),
      fund: text(allocation.fundSnapshot?.name),
      costCenter: text(allocation.costCenterSnapshot?.name),
      amountCents: allocation.amountCents,
    })),
  };
}
