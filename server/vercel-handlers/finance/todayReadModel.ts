import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasFinanceCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import { readTransactionsActionSummary } from './transactionsSummary.js';
import { readVerifiedSignalSummary } from './intelligenceSignalsSummary.js';
import type {
  TodayReadModelCountItem,
  TodayReadModelResponse,
} from '../../../shared/intelligence/todayReadModel.js';

const ATTENTION_COUNT_STATUSES = new Set(['divergent', 'counting_b', 'recounting']);

function aggregateCount(snapshot: any): number {
  const value = snapshot?.data?.()?.count;
  return typeof value === 'number' ? value : 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  const requestId =
    typeof req.body?.requestId === 'string' && req.body.requestId
      ? req.body.requestId
      : typeof req.headers['x-vercel-id'] === 'string'
        ? req.headers['x-vercel-id']
        : 'unknown';

  try {
    const { financeEntityId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim()) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', requestId });
    }

    const {
      db,
      organizationId,
      sessionList,
      context,
    } = await resolveFinanceRequestContext(req, 'finance.view');

    const countSessionsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSessions');

    const evidenceRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('universalEvidence');

    const [
      transactions,
      countSnapshot,
      acceptedCountSnapshot,
      classifiedCountSnapshot,
      pendingReviewCountSnapshot,
      signals,
    ] = await Promise.all([
      readTransactionsActionSummary(context.repository, financeEntityId),
      countSessionsRef.select('status').limit(100).get(),
      evidenceRef.where('processingState', '==', 'accepted').count().get(),
      evidenceRef.where('classification.source', '==', 'human').count().get(),
      evidenceRef.where('review.status', '==', 'pending').count().get(),
      readVerifiedSignalSummary({
        db,
        organizationId,
        financeEntityId,
        sessionList,
      }),
    ]);

    const counts: TodayReadModelCountItem[] = countSnapshot.docs.flatMap((doc: any) => {
      const status = String(doc.data()?.status || '');
      if (!ATTENTION_COUNT_STATUSES.has(status)) return [];
      return [{ id: doc.id, status: status as TodayReadModelCountItem['status'] }];
    });

    const acceptedCount = aggregateCount(acceptedCountSnapshot);
    const classifiedCount = aggregateCount(classifiedCountSnapshot);
    const pendingReview = aggregateCount(pendingReviewCountSnapshot);

    const result: TodayReadModelResponse = {
      modelVersion: 1,
      sourceMode: 'authoritative_plus_verified_signals',
      transactions,
      counts,
      inbox: {
        needsClassification: Math.max(0, acceptedCount - classifiedCount),
        pendingReview,
        canClassify: hasFinanceCapability(sessionList, 'finance.create_drafts'),
        canReview: hasFinanceCapability(sessionList, 'finance.review'),
      },
      signals,
      requestId,
    };

    return res.status(200).json(result);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'FINANCE_ENTITY_NOT_FOUND') {
      return res.status(404).json({ error: message, requestId });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(409).json({ error: message, requestId });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN', requestId });
    }
    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED', requestId });
    }
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error?.code)) {
      return res.status(401).json({ error: 'UNAUTHORIZED', requestId });
    }

    console.error('Today Read Model Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', requestId });
  }
}
