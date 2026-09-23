import type { AuditTimelineItem } from '../../../../shared/finance/auditReadModel.js';
import { normalizeReviewEvidenceIds } from './transactionReviewEvidenceModel';

const TRANSACTION_ID_PATTERN = /^tx_[a-f0-9]{16,64}$/;
const MAX_REVIEW_HISTORY_ITEMS = 10;

export type ReviewHistorySelection = {
  items: AuditTimelineItem[];
  truncatedAtSource: boolean;
};

export function normalizeReviewHistoryResourceIds(
  transactionId: unknown,
  evidenceIds: unknown,
): string[] {
  const ids: string[] = [];
  if (
    typeof transactionId === 'string' &&
    TRANSACTION_ID_PATTERN.test(transactionId.trim())
  ) {
    ids.push(transactionId.trim());
  }

  ids.push(...normalizeReviewEvidenceIds(evidenceIds));
  return Array.from(new Set(ids));
}

export function selectRelatedReviewHistory(
  items: unknown,
  resourceIds: readonly string[],
  truncatedAtSource = false,
): ReviewHistorySelection {
  if (!Array.isArray(items) || resourceIds.length === 0) {
    return { items: [], truncatedAtSource: Boolean(truncatedAtSource) };
  }

  const allowed = new Set(resourceIds);
  const related = items
    .filter((item): item is AuditTimelineItem => {
      if (!item || typeof item !== 'object') return false;
      const resourceId = (item as AuditTimelineItem).resourceId;
      return typeof resourceId === 'string' && allowed.has(resourceId);
    })
    .slice(0, MAX_REVIEW_HISTORY_ITEMS);

  return {
    items: related,
    truncatedAtSource: Boolean(truncatedAtSource),
  };
}
