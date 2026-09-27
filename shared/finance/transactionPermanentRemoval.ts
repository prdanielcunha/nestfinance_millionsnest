/** Removal is limited to unposted manual records with no external evidence or balance effect. */
export function transactionRemovalBlocker(data: Record<string, any>): string | null {
  if (!['draft', 'ready_for_review', 'approved_for_posting'].includes(data.status)) return 'POSTED_OR_UNSUPPORTED';
  if (data.sourceContext !== 'manual' || data.countSource || data.countSessionId || data.proposalId) return 'LINKED_SOURCE';
  if (Array.isArray(data.evidenceIds) && data.evidenceIds.length > 0) return 'HAS_EVIDENCE';
  if (data.evidenceJustification || data.evidenceId) return 'HAS_EVIDENCE';
  if (data.reconciliationStatus !== 'unreconciled') return 'RECONCILED_OR_UNKNOWN';
  if (data.postingId || data.postedAt || data.postedBy || data.journalEntryId || data.ledgerEntryId || data.reversalId) return 'HAS_LEDGER_EFFECT';
  if (!Number.isSafeInteger(data.version) || data.version < 1) return 'UNKNOWN_VERSION';
  return null;
}
