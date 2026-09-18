import type { CountSessionStatus } from '../../../shared/finance/count.js';
import type { TransactionsActionSummary } from '../../services/transactionsService.js';

export type TodayPriorityKind =
  | 'count_divergence'
  | 'correction'
  | 'count_check'
  | 'inbox_review'
  | 'inbox_identification'
  | 'review'
  | 'approved'
  | 'draft'
  | 'clear';

export type TodayCountAttentionItem = {
  id: string;
  status: CountSessionStatus;
};

export type TodayInboxAttention = {
  needsClassification: number;
  pendingReview: number;
  canClassify: boolean;
  canReview: boolean;
};

export type TodayPriority = {
  kind: TodayPriorityKind;
  count: number;
  countSessionId?: string;
};

/**
 * Deterministic action ordering for the Today screen.
 *
 * The UI should tell a non-technical user what to do next without hiding the
 * accountant-grade source data behind each action. This function intentionally
 * consumes current authoritative state rather than making an AI judgment.
 */
export function chooseTodayPriority(
  summary: TransactionsActionSummary,
  counts: TodayCountAttentionItem[],
  inbox: TodayInboxAttention = {
    needsClassification: 0,
    pendingReview: 0,
    canClassify: false,
    canReview: false,
  },
): TodayPriority {
  const divergent = counts.filter((item) => item.status === 'divergent');
  if (divergent.length > 0) {
    return {
      kind: 'count_divergence',
      count: divergent.length,
      countSessionId: divergent[0].id,
    };
  }

  if (summary.returnedCorrections > 0) {
    return { kind: 'correction', count: summary.returnedCorrections };
  }

  const activeIndependentChecks = counts.filter(
    (item) => item.status === 'counting_b' || item.status === 'recounting',
  );
  if (activeIndependentChecks.length > 0) {
    return {
      kind: 'count_check',
      count: activeIndependentChecks.length,
      countSessionId: activeIndependentChecks[0].id,
    };
  }

  if (inbox.canReview && inbox.pendingReview > 0) {
    return { kind: 'inbox_review', count: inbox.pendingReview };
  }

  if (inbox.canClassify && inbox.needsClassification > 0) {
    return { kind: 'inbox_identification', count: inbox.needsClassification };
  }

  if (summary.readyForReview > 0) {
    return { kind: 'review', count: summary.readyForReview };
  }

  if (summary.approvedForPosting > 0) {
    return { kind: 'approved', count: summary.approvedForPosting };
  }

  if (summary.simpleDrafts > 0) {
    return { kind: 'draft', count: summary.simpleDrafts };
  }

  return { kind: 'clear', count: 0 };
}
