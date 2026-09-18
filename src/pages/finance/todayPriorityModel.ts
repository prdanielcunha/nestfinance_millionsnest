import type { CountSessionStatus } from '../../../shared/finance/count.js';
import type { NeedsAttentionSignalSummaryItem } from '../../../shared/intelligence/needsAttention.js';
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

export type TodaySignalAttention = {
  items: NeedsAttentionSignalSummaryItem[];
};

export type TodayPriority = {
  kind: TodayPriorityKind;
  count: number;
  countSessionId?: string;
  signalId?: string;
  signalEntityId?: string;
  sourceBacked?: boolean;
};

function firstSignal(
  signals: TodaySignalAttention | undefined,
  signalType: NeedsAttentionSignalSummaryItem['signalType'],
  entityIds?: Set<string>,
) {
  return signals?.items.find(
    (item) =>
      item.currentStateVerified === true &&
      item.signalType === signalType &&
      (!entityIds || entityIds.has(item.entityId)),
  );
}

function withSignal(
  priority: TodayPriority,
  signal: NeedsAttentionSignalSummaryItem | undefined,
): TodayPriority {
  if (!signal) return priority;
  return {
    ...priority,
    signalId: signal.signalId,
    signalEntityId: signal.entityId,
    sourceBacked: true,
  };
}

/**
 * Deterministic action ordering for the Today screen.
 *
 * Current domain state remains authoritative while the Signal Foundation has
 * partial historical coverage. Signals may enrich an already-proven priority
 * with explainability and a direct entity target, but they must never create,
 * increase, or reorder work by themselves until backfill coverage is certified.
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
  signals?: TodaySignalAttention,
): TodayPriority {
  const divergent = counts.filter((item) => item.status === 'divergent');
  if (divergent.length > 0) {
    const divergentIds = new Set(divergent.map((item) => item.id));
    return withSignal(
      {
        kind: 'count_divergence',
        count: divergent.length,
        countSessionId: divergent[0].id,
      },
      firstSignal(signals, 'COUNT_DIVERGENCE_REVIEW_REQUIRED', divergentIds),
    );
  }

  if (summary.returnedCorrections > 0) {
    return withSignal(
      { kind: 'correction', count: summary.returnedCorrections },
      firstSignal(signals, 'TRANSACTION_CORRECTION_REQUIRED'),
    );
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
    return withSignal(
      { kind: 'inbox_review', count: inbox.pendingReview },
      firstSignal(signals, 'INBOX_REVIEW_REQUIRED'),
    );
  }

  if (inbox.canClassify && inbox.needsClassification > 0) {
    return withSignal(
      { kind: 'inbox_identification', count: inbox.needsClassification },
      firstSignal(signals, 'INBOX_IDENTIFICATION_REQUIRED'),
    );
  }

  if (summary.readyForReview > 0) {
    return withSignal(
      { kind: 'review', count: summary.readyForReview },
      firstSignal(signals, 'TRANSACTION_REVIEW_REQUIRED'),
    );
  }

  if (summary.approvedForPosting > 0) {
    return { kind: 'approved', count: summary.approvedForPosting };
  }

  if (summary.simpleDrafts > 0) {
    return { kind: 'draft', count: summary.simpleDrafts };
  }

  return { kind: 'clear', count: 0 };
}
