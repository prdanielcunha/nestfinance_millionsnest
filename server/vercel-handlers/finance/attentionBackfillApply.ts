import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasEffectiveCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import {
  ATTENTION_BACKFILL_BATCH_MAX,
  ATTENTION_BACKFILL_VERSION,
  inspectAttentionBackfill,
  matchesAttentionBackfillCandidate,
  type AttentionBackfillCandidate,
} from './attentionBackfill.js';
import { ensureFinanceFact } from './factStream.js';
import { stageFinanceSignalOpen } from './signalProjection.js';

function liveSourceRefs(path: string, version: unknown) {
  const numeric = Number(version);
  return [
    Number.isInteger(numeric) && numeric >= 0
      ? { kind: 'record' as const, ref: path, version: numeric }
      : { kind: 'record' as const, ref: path },
  ];
}

function observedState(candidate: AttentionBackfillCandidate, data: Record<string, any>) {
  if (candidate.signalType === 'COUNT_DIVERGENCE_REVIEW_REQUIRED') return String(data.status);
  if (candidate.signalType === 'TRANSACTION_REVIEW_REQUIRED') return 'ready_for_review';
  if (candidate.signalType === 'TRANSACTION_CORRECTION_REQUIRED') return 'returned_draft';
  if (candidate.signalType === 'INBOX_IDENTIFICATION_REQUIRED') return 'accepted_unclassified';
  return 'classified_pending_review';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { db, uid, organizationId, financeEntityId, sessionList } =
      await resolveFinanceRequestContext(req, 'finance.view');

    if (!hasEffectiveCapability(sessionList, 'finance.manage')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const requestedBatchSize = req.body?.batchSize ?? 25;
    const batchSize = Number(requestedBatchSize);
    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > ATTENTION_BACKFILL_BATCH_MAX
    ) {
      return res.status(400).json({ error: 'INVALID_BATCH_SIZE' });
    }

    const before = await inspectAttentionBackfill(db, organizationId, financeEntityId);
    const batch = before.missing.slice(0, batchSize);

    let applied = 0;
    let reusedFacts = 0;
    let skippedStateChanged = 0;

    for (const candidate of batch) {
      const outcome = await db.runTransaction(async (transaction) => {
        const sourceRef = db.doc(candidate.sourceRefs[0].ref);
        const sourceSnapshot = await transaction.get(sourceRef);
        const data = sourceSnapshot.data() || {};

        if (
          !sourceSnapshot.exists ||
          !matchesAttentionBackfillCandidate(
            candidate,
            data,
            organizationId,
            financeEntityId,
          )
        ) {
          return { applied: false, reusedFact: false };
        }

        const sourceRefs = liveSourceRefs(sourceRef.path, data.version);
        const correlationId =
          `attention-backfill-v${ATTENTION_BACKFILL_VERSION}:${candidate.signalType}`;

        const factInput = {
          organizationId,
          eventType: 'ATTENTION_STATE_OBSERVED' as const,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          actorUserId: uid,
          correlationId,
          payload: {
            financeEntityId,
            signalType: candidate.signalType,
            observedState: observedState(candidate, data),
            observationKind: 'current_state_backfill',
            historicalEventInferred: false,
            backfillVersion: ATTENTION_BACKFILL_VERSION,
          },
          sourceRefs,
          confidence: 'verified' as const,
        };

        const factId = await ensureFinanceFact(transaction, db, factInput);
        const factRef = db.collection('intelligenceFacts').doc(factId);
        const factAlreadyExisted = (await transaction.get(factRef)).exists;

        stageFinanceSignalOpen(transaction, db, {
          organizationId,
          financeEntityId,
          signalType: candidate.signalType,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          sourceFactId: factId,
          sourceRefs,
        });

        return { applied: true, reusedFact: factAlreadyExisted };
      });

      if (outcome.applied) {
        applied += 1;
        if (outcome.reusedFact) reusedFacts += 1;
      } else {
        skippedStateChanged += 1;
      }
    }

    const after = await inspectAttentionBackfill(db, organizationId, financeEntityId);

    return res.status(200).json({
      backfillVersion: ATTENTION_BACKFILL_VERSION,
      financeEntityId,
      attempted: batch.length,
      applied,
      reusedFacts,
      skippedStateChanged,
      remaining: after.missing.length,
      complete: after.missing.length === 0,
      financialMutation: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Attention backfill apply error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
