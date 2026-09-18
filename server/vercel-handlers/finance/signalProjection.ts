import { createHash } from 'crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  CANONICAL_SIGNAL_SCHEMA_VERSION,
  type NestFinanceSignalActionCode,
  type NestFinanceSignalAttentionLevel,
  type NestFinanceSignalType,
} from '../../../shared/intelligence/canonicalSignal.js';
import type { CanonicalFactSourceRef } from '../../../shared/intelligence/canonicalFact.js';

type FinanceSignalDefinition = {
  attentionLevel: NestFinanceSignalAttentionLevel;
  requiredCapability: string;
  actionCode: NestFinanceSignalActionCode;
};

export const FINANCE_SIGNAL_DEFINITIONS: Record<NestFinanceSignalType, FinanceSignalDefinition> = {
  TRANSACTION_CORRECTION_REQUIRED: {
    attentionLevel: 'action_required',
    requiredCapability: 'finance.create_drafts',
    actionCode: 'OPEN_TRANSACTION_CORRECTION',
  },
  TRANSACTION_REVIEW_REQUIRED: {
    attentionLevel: 'action_required',
    requiredCapability: 'finance.review',
    actionCode: 'OPEN_TRANSACTION_REVIEW',
  },
  INBOX_IDENTIFICATION_REQUIRED: {
    attentionLevel: 'action_required',
    requiredCapability: 'finance.create_drafts',
    actionCode: 'IDENTIFY_INBOX_DOCUMENT',
  },
  INBOX_REVIEW_REQUIRED: {
    attentionLevel: 'action_required',
    requiredCapability: 'finance.review',
    actionCode: 'REVIEW_INBOX_DOCUMENT',
  },
  COUNT_DIVERGENCE_REVIEW_REQUIRED: {
    attentionLevel: 'warning',
    requiredCapability: 'finance.create_drafts',
    actionCode: 'REVIEW_COUNT_DIVERGENCE',
  },
};

type FinanceSignalInput = {
  organizationId: string;
  financeEntityId: string;
  signalType: NestFinanceSignalType;
  entityType: string;
  entityId: string;
  sourceFactId: string;
  sourceRefs: CanonicalFactSourceRef[];
};

const normalized = (value: string) => value.trim();

export function buildFinanceSignalId(
  input: Pick<
    FinanceSignalInput,
    'organizationId' | 'signalType' | 'entityType' | 'entityId'
  >,
): string {
  const stableKey = [
    normalized(input.organizationId),
    input.signalType,
    normalized(input.entityType),
    normalized(input.entityId),
  ].join(':');
  return `signal_${createHash('sha256').update(stableKey).digest('hex')}`;
}

function baseProjection(input: FinanceSignalInput) {
  const definition = FINANCE_SIGNAL_DEFINITIONS[input.signalType];
  return {
    signalId: buildFinanceSignalId(input),
    organizationId: input.organizationId,
    financeEntityId: input.financeEntityId,
    sourceApp: 'NESTFINANCE' as const,
    signalType: input.signalType,
    entityType: input.entityType,
    entityId: input.entityId,
    attentionLevel: definition.attentionLevel,
    requiredCapability: definition.requiredCapability,
    actionCode: definition.actionCode,
    sourceRefs: input.sourceRefs,
    lastFactId: input.sourceFactId,
    version: CANONICAL_SIGNAL_SCHEMA_VERSION,
  };
}

/**
 * Opens or re-opens a deterministic signal projection.
 *
 * Signals are rebuildable read models, not financial authority. Re-opening
 * starts a new attention cycle while facts remain immutable evidence.
 */
export function stageFinanceSignalOpen(
  transaction: Transaction,
  db: Firestore,
  input: FinanceSignalInput,
): string {
  const projection = baseProjection(input);
  const signalRef = db.collection('intelligenceSignals').doc(projection.signalId);
  const now = FieldValue.serverTimestamp();

  transaction.set(
    signalRef,
    {
      ...projection,
      status: 'open',
      openedAt: now,
      openedByFactId: input.sourceFactId,
      updatedAt: now,
      resolvedAt: null,
      resolvedByFactId: null,
    },
    { merge: true },
  );
  return projection.signalId;
}

/**
 * Refreshes evidence behind an already-open signal without resetting how long
 * the current attention cycle has been open.
 */
export function stageFinanceSignalRefresh(
  transaction: Transaction,
  db: Firestore,
  input: FinanceSignalInput,
): string {
  const projection = baseProjection(input);
  const signalRef = db.collection('intelligenceSignals').doc(projection.signalId);

  transaction.set(
    signalRef,
    {
      ...projection,
      status: 'open',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return projection.signalId;
}

/**
 * Resolves the latest projection. For legacy pre-P5 data this can create a
 * resolved tombstone without inventing an opening timestamp.
 */
export function stageFinanceSignalResolve(
  transaction: Transaction,
  db: Firestore,
  input: FinanceSignalInput,
): string {
  const projection = baseProjection(input);
  const signalRef = db.collection('intelligenceSignals').doc(projection.signalId);
  const now = FieldValue.serverTimestamp();

  transaction.set(
    signalRef,
    {
      ...projection,
      status: 'resolved',
      updatedAt: now,
      resolvedAt: now,
      resolvedByFactId: input.sourceFactId,
    },
    { merge: true },
  );
  return projection.signalId;
}
