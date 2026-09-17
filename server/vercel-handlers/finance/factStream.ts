import { createHash } from 'crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  CANONICAL_FACT_SCHEMA_VERSION,
  type CanonicalFact,
  type CanonicalFactConfidence,
  type CanonicalFactSourceRef,
  type NestFinanceFactEventType,
} from '../../../shared/intelligence/canonicalFact.js';

type FinanceFactInput = {
  organizationId: string;
  eventType: NestFinanceFactEventType;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  payload?: Record<string, unknown>;
  sourceRefs: CanonicalFactSourceRef[];
  confidence?: CanonicalFactConfidence;
};

const normalizeIdPart = (value: string) => value.trim();

export function buildFinanceFactEventId(input: Pick<FinanceFactInput, 'organizationId' | 'eventType' | 'entityType' | 'entityId'> & { correlationId?: string | null }): string {
  const stableKey = [
    normalizeIdPart(input.organizationId),
    input.eventType,
    normalizeIdPart(input.entityType),
    normalizeIdPart(input.entityId),
    normalizeIdPart(input.correlationId || ''),
  ].join(':');
  return `fact_${createHash('sha256').update(stableKey).digest('hex')}`;
}

/**
 * Stages a canonical fact in the same Firestore transaction as its source
 * mutation. This prevents a successful financial mutation from being separated
 * from the fact that describes it, and makes transaction retries safe.
 */
export function stageFinanceFact(transaction: Transaction, db: Firestore, input: FinanceFactInput): string {
  const eventId = buildFinanceFactEventId(input);
  const factRef = db
    .collection('organizations')
    .doc(input.organizationId)
    .collection('intelligenceFacts')
    .doc(eventId);
  const serverTimestamp = FieldValue.serverTimestamp();

  const fact: CanonicalFact<Record<string, unknown>, FieldValue> = {
    eventId,
    organizationId: input.organizationId,
    sourceApp: 'NESTFINANCE',
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    occurredAt: serverTimestamp,
    recordedAt: serverTimestamp,
    correlationId: input.correlationId || null,
    causationId: input.causationId || null,
    payload: input.payload || {},
    sourceRefs: input.sourceRefs,
    confidence: input.confidence || 'verified',
    version: CANONICAL_FACT_SCHEMA_VERSION,
  };

  transaction.create(factRef, fact);
  return eventId;
}
