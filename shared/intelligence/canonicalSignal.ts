import type { CanonicalFactSourceRef } from './canonicalFact.js';

export const CANONICAL_SIGNAL_SCHEMA_VERSION = 1 as const;

export const NESTFINANCE_SIGNAL_TYPES = [
  'TRANSACTION_CORRECTION_REQUIRED',
  'TRANSACTION_REVIEW_REQUIRED',
  'INBOX_IDENTIFICATION_REQUIRED',
  'INBOX_REVIEW_REQUIRED',
  'COUNT_DIVERGENCE_REVIEW_REQUIRED',
] as const;

export type NestFinanceSignalType = (typeof NESTFINANCE_SIGNAL_TYPES)[number];

export const NESTFINANCE_SIGNAL_STATUSES = ['open', 'resolved'] as const;
export type NestFinanceSignalStatus = (typeof NESTFINANCE_SIGNAL_STATUSES)[number];

export const NESTFINANCE_SIGNAL_ATTENTION_LEVELS = [
  'action_required',
  'warning',
] as const;
export type NestFinanceSignalAttentionLevel =
  (typeof NESTFINANCE_SIGNAL_ATTENTION_LEVELS)[number];

export const NESTFINANCE_SIGNAL_ACTION_CODES = [
  'OPEN_TRANSACTION_CORRECTION',
  'OPEN_TRANSACTION_REVIEW',
  'IDENTIFY_INBOX_DOCUMENT',
  'REVIEW_INBOX_DOCUMENT',
  'REVIEW_COUNT_DIVERGENCE',
] as const;
export type NestFinanceSignalActionCode =
  (typeof NESTFINANCE_SIGNAL_ACTION_CODES)[number];

export type CanonicalFinanceSignal<TTimestamp = string> = {
  signalId: string;
  organizationId: string;
  financeEntityId: string;
  sourceApp: 'NESTFINANCE';
  signalType: NestFinanceSignalType;
  entityType: string;
  entityId: string;
  status: NestFinanceSignalStatus;
  attentionLevel: NestFinanceSignalAttentionLevel;
  requiredCapability: string;
  actionCode: NestFinanceSignalActionCode;

  /**
   * Opening fields are optional because this is a rebuildable projection.
   * A legacy entity can be resolved after P5 without fabricating a historical
   * open timestamp or source fact that never existed in the projection.
   */
  openedAt?: TTimestamp | null;
  openedByFactId?: string | null;

  updatedAt: TTimestamp;
  lastFactId: string;

  resolvedAt?: TTimestamp | null;
  resolvedByFactId?: string | null;

  /**
   * Compact evidence pointers only. Sensitive/free-form domain material stays
   * in the authoritative source records.
   */
  sourceRefs: CanonicalFactSourceRef[];
  version: typeof CANONICAL_SIGNAL_SCHEMA_VERSION;
};
