import type { NeedsAttentionSignalSummary } from './needsAttention.js';

export type TodayReadModelTransactionSummary = {
  returnedCorrections: number;
  simpleDrafts: number;
  readyForReview: number;
  approvedForPosting: number;
  totalOpen: number;
};

export type TodayReadModelCountStatus = 'divergent' | 'counting_b' | 'recounting';

export type TodayReadModelCountItem = {
  id: string;
  status: TodayReadModelCountStatus;
};

export type TodayReadModelInboxAttention = {
  needsClassification: number;
  pendingReview: number;
  canClassify: boolean;
  canReview: boolean;
};

export type TodayReadModelResponse = {
  modelVersion: 1;
  sourceMode: 'authoritative_plus_verified_signals';
  transactions: TodayReadModelTransactionSummary;
  counts: TodayReadModelCountItem[];
  inbox: TodayReadModelInboxAttention;
  signals: NeedsAttentionSignalSummary;
  requestId: string;
};
