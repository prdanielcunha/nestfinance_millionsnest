export const CANONICAL_FACT_SCHEMA_VERSION = 1 as const;

export const NESTFINANCE_FACT_EVENT_TYPES = [
  'TRANSACTION_CREATED',
  'TRANSACTION_SUBMITTED',
  'TRANSACTION_POSTED',
  'TRANSACTION_APPROVED',
  'TRANSACTION_RETURNED',
  'COUNT_OPENED',
  'COUNT_UPDATED',
  'COUNT_COMPLETED',
  'COUNT_DIVERGENCE_FOUND',
  'INBOX_ITEM_CREATED',
  'DOCUMENT_ATTACHED',
  'DOCUMENT_CLASSIFIED',
  'INBOX_ITEM_RESOLVED',
  'RECONCILIATION_STARTED',
  'RECONCILIATION_MATCHED',
  'RECONCILIATION_REVERSED',
  'RECONCILIATION_DIVERGENCE',
  'AUDIT_EVENT_RECORDED',
  'ATTENTION_STATE_OBSERVED',
] as const;

export type NestFinanceFactEventType = (typeof NESTFINANCE_FACT_EVENT_TYPES)[number];

export type CanonicalFactSourceRef = {
  kind: 'record' | 'audit' | 'evidence';
  ref: string;
  version?: number;
};

export type CanonicalFactConfidence = 'verified' | 'derived';

/**
 * Cross-app fact contract for MillionsNest Intelligence.
 *
 * Facts are observations, not interpretations. Payloads must stay minimal and
 * avoid copying sensitive source documents. Consumers should follow sourceRefs
 * when they are authorized to inspect the underlying record.
 */
export type CanonicalFact<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TTimestamp = string,
> = {
  eventId: string;
  organizationId: string;
  sourceApp: 'NESTFINANCE';
  eventType: NestFinanceFactEventType;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  occurredAt: TTimestamp;
  recordedAt: TTimestamp;
  correlationId: string | null;
  causationId: string | null;
  payload: TPayload;
  sourceRefs: CanonicalFactSourceRef[];
  confidence: CanonicalFactConfidence;
  version: typeof CANONICAL_FACT_SCHEMA_VERSION;
};
