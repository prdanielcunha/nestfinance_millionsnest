import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  NestFinanceSignalType,
} from '../../../shared/intelligence/canonicalSignal.js';
import type { CanonicalFactSourceRef } from '../../../shared/intelligence/canonicalFact.js';
import { buildFinanceSignalId } from './signalProjection.js';
import { isFinanceSignalCurrent } from './signalCurrentState.js';

export const ATTENTION_BACKFILL_VERSION = 1 as const;
export const ATTENTION_BACKFILL_BATCH_MAX = 100 as const;

export type AttentionBackfillCandidate = {
  signalId: string;
  signalType: NestFinanceSignalType;
  entityType: 'finance_transaction' | 'universal_evidence' | 'count_session';
  entityId: string;
  sourceRefs: CanonicalFactSourceRef[];
  observedState: string;
};

export type AttentionBackfillInspection = {
  candidates: AttentionBackfillCandidate[];
  missing: AttentionBackfillCandidate[];
  verifiedExisting: AttentionBackfillCandidate[];
};

export function buildAttentionCoverageId(
  organizationId: string,
  financeEntityId: string,
): string {
  const key = [
    organizationId.trim(),
    financeEntityId.trim(),
    `facts-v1`,
    `signals-v1`,
    `backfill-v${ATTENTION_BACKFILL_VERSION}`,
  ].join(':');
  return `coverage_${createHash('sha256').update(key).digest('hex')}`;
}

function recordRef(path: string, version: unknown): CanonicalFactSourceRef[] {
  const numeric = Number(version);
  return [
    Number.isInteger(numeric) && numeric >= 0
      ? { kind: 'record', ref: path, version: numeric }
      : { kind: 'record', ref: path },
  ];
}

function candidate(
  organizationId: string,
  signalType: NestFinanceSignalType,
  entityType: AttentionBackfillCandidate['entityType'],
  entityId: string,
  sourceRefs: CanonicalFactSourceRef[],
  observedState: string,
): AttentionBackfillCandidate {
  return {
    signalId: buildFinanceSignalId({
      organizationId,
      signalType,
      entityType,
      entityId,
    }),
    signalType,
    entityType,
    entityId,
    sourceRefs,
    observedState,
  };
}

export function matchesAttentionBackfillCandidate(
  candidate: AttentionBackfillCandidate,
  data: Record<string, any>,
  organizationId: string,
  financeEntityId: string,
): boolean {
  if (candidate.signalType === 'TRANSACTION_REVIEW_REQUIRED') {
    return data.financeEntityId === financeEntityId && data.status === 'ready_for_review';
  }

  if (candidate.signalType === 'TRANSACTION_CORRECTION_REQUIRED') {
    return (
      data.financeEntityId === financeEntityId &&
      data.status === 'draft' &&
      Boolean(
        data.returnedToDraftAt ||
          data.returnedToDraftReason ||
          data.returnedToDraftComment ||
          data.approvalStatus === 'invalidated' ||
          data.invalidatedAt,
      )
    );
  }

  if (candidate.signalType === 'INBOX_IDENTIFICATION_REQUIRED') {
    return (
      data.organizationId === organizationId &&
      data.financeEntityId === financeEntityId &&
      data.processingState === 'accepted' &&
      data.duplicate !== true &&
      !data.classification?.documentType
    );
  }

  if (candidate.signalType === 'INBOX_REVIEW_REQUIRED') {
    return (
      data.organizationId === organizationId &&
      data.financeEntityId === financeEntityId &&
      data.processingState === 'accepted' &&
      data.duplicate !== true &&
      Boolean(data.classification?.documentType) &&
      data.review?.status !== 'reviewed'
    );
  }

  if (candidate.signalType === 'COUNT_DIVERGENCE_REVIEW_REQUIRED') {
    return (
      data.organizationId === organizationId &&
      data.financeEntityId === financeEntityId &&
      (data.status === 'divergent' || data.status === 'recounting')
    );
  }

  return false;
}

export async function scanAttentionBackfillCandidates(
  db: Firestore,
  organizationId: string,
  financeEntityId: string,
): Promise<AttentionBackfillCandidate[]> {
  const orgRef = db.collection('organizations').doc(organizationId);
  const transactionsRef = orgRef.collection('financeTransactions');
  const evidenceRef = orgRef
    .collection('financeEntities')
    .doc(financeEntityId)
    .collection('universalEvidence');
  const countsRef = orgRef
    .collection('financeEntities')
    .doc(financeEntityId)
    .collection('countSessions');

  const [transactions, evidence, counts] = await Promise.all([
    transactionsRef
      .where('financeEntityId', '==', financeEntityId)
      .select(
        'financeEntityId',
        'status',
        'version',
        'returnedToDraftAt',
        'returnedToDraftReason',
        'returnedToDraftComment',
        'approvalStatus',
        'invalidatedAt',
      )
      .get(),
    evidenceRef
      .where('processingState', '==', 'accepted')
      .select(
        'organizationId',
        'financeEntityId',
        'processingState',
        'duplicate',
        'classification',
        'review',
        'version',
      )
      .get(),
    countsRef
      .where('status', 'in', ['divergent', 'recounting'])
      .select('organizationId', 'financeEntityId', 'status', 'version')
      .get(),
  ]);

  const candidates: AttentionBackfillCandidate[] = [];

  for (const doc of transactions.docs) {
    const data = doc.data() || {};
    if (data.financeEntityId !== financeEntityId) continue;

    if (data.status === 'ready_for_review') {
      candidates.push(
        candidate(
          organizationId,
          'TRANSACTION_REVIEW_REQUIRED',
          'finance_transaction',
          doc.id,
          recordRef(doc.ref.path, data.version),
          'ready_for_review',
        ),
      );
      continue;
    }

    const correctionRequired =
      data.status === 'draft' &&
      Boolean(
        data.returnedToDraftAt ||
          data.returnedToDraftReason ||
          data.returnedToDraftComment ||
          data.approvalStatus === 'invalidated' ||
          data.invalidatedAt,
      );
    if (correctionRequired) {
      candidates.push(
        candidate(
          organizationId,
          'TRANSACTION_CORRECTION_REQUIRED',
          'finance_transaction',
          doc.id,
          recordRef(doc.ref.path, data.version),
          'returned_draft',
        ),
      );
    }
  }

  for (const doc of evidence.docs) {
    const data = doc.data() || {};
    if (
      data.organizationId !== organizationId ||
      data.financeEntityId !== financeEntityId ||
      data.processingState !== 'accepted' ||
      data.duplicate === true
    ) {
      continue;
    }

    const classified = Boolean(data.classification?.documentType);
    if (!classified) {
      candidates.push(
        candidate(
          organizationId,
          'INBOX_IDENTIFICATION_REQUIRED',
          'universal_evidence',
          doc.id,
          recordRef(doc.ref.path, data.version),
          'accepted_unclassified',
        ),
      );
      continue;
    }

    if (data.review?.status !== 'reviewed') {
      candidates.push(
        candidate(
          organizationId,
          'INBOX_REVIEW_REQUIRED',
          'universal_evidence',
          doc.id,
          recordRef(doc.ref.path, data.version),
          'classified_pending_review',
        ),
      );
    }
  }

  for (const doc of counts.docs) {
    const data = doc.data() || {};
    if (
      data.organizationId !== organizationId ||
      data.financeEntityId !== financeEntityId ||
      (data.status !== 'divergent' && data.status !== 'recounting')
    ) {
      continue;
    }

    candidates.push(
      candidate(
        organizationId,
        'COUNT_DIVERGENCE_REVIEW_REQUIRED',
        'count_session',
        doc.id,
        recordRef(doc.ref.path, data.version),
        String(data.status),
      ),
    );
  }

  candidates.sort((a, b) => a.signalId.localeCompare(b.signalId));
  return candidates;
}

export async function inspectAttentionBackfill(
  db: Firestore,
  organizationId: string,
  financeEntityId: string,
): Promise<AttentionBackfillInspection> {
  const candidates = await scanAttentionBackfillCandidates(
    db,
    organizationId,
    financeEntityId,
  );

  const refs = candidates.map((item) =>
    db.collection('intelligenceSignals').doc(item.signalId),
  );
  const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];

  const missing: AttentionBackfillCandidate[] = [];
  const verifiedExisting: AttentionBackfillCandidate[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    const snapshot = snapshots[index];
    const signal = snapshot?.data?.() || {};

    const structurallyMatches =
      Boolean(snapshot?.exists) &&
      signal.organizationId === organizationId &&
      signal.financeEntityId === financeEntityId &&
      signal.sourceApp === 'NESTFINANCE' &&
      signal.version === 1 &&
      signal.signalType === item.signalType &&
      signal.entityType === item.entityType &&
      signal.entityId === item.entityId &&
      signal.status === 'open';

    if (!structurallyMatches) {
      missing.push(item);
      continue;
    }

    const current = await isFinanceSignalCurrent({
      db,
      organizationId,
      financeEntityId,
      signalType: item.signalType,
      entityType: item.entityType,
      entityId: item.entityId,
    });

    const factId = typeof signal.lastFactId === 'string' ? signal.lastFactId : '';
    const factSnapshot = /^fact_[a-f0-9]{64}$/.test(factId)
      ? await db.collection('intelligenceFacts').doc(factId).get()
      : null;
    const fact = factSnapshot?.data?.() || {};
    const sourceBacked =
      Boolean(factSnapshot?.exists) &&
      fact.organizationId === organizationId &&
      fact.sourceApp === 'NESTFINANCE' &&
      fact.entityType === item.entityType &&
      fact.entityId === item.entityId &&
      fact.payload?.financeEntityId === financeEntityId &&
      Array.isArray(fact.sourceRefs) &&
      fact.sourceRefs.length > 0;

    if (current && sourceBacked) verifiedExisting.push(item);
    else missing.push(item);
  }

  return { candidates, missing, verifiedExisting };
}
