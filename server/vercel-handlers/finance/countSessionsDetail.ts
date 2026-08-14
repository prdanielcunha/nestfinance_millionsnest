import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';

function toIso(value: any) {
  return value?.toDate?.()?.toISOString?.() || null;
}

function serializeCount(value: any) {
  if (!value || typeof value !== 'object') return null;
  return {
    entries: Array.isArray(value.entries) ? value.entries : [],
    totalCents: Number(value.totalCents || 0),
    countedByUid: value.countedByUid || null,
    enteredByUid: value.enteredByUid || null,
    savedAt: toIso(value.savedAt),
    sealedAt: toIso(value.sealedAt),
  };
}

function serializeComparison(value: any) {
  if (!value || typeof value !== 'object') return null;
  return {
    matched: value.matched === true,
    countATotalCents: Number(value.countATotalCents || 0),
    countBTotalCents: Number(value.countBTotalCents || 0),
    totalDeltaCents: Number(value.totalDeltaCents || 0),
    differences: Array.isArray(value.differences) ? value.differences : [],
    resolvedBy: value.resolvedBy || null,
    sealedAt: toIso(value.sealedAt),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { countSessionId } = req.body || {};
    if (!isValidCountSessionId(countSessionId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, organizationId, financeEntityId } = await resolveFinanceRequestContext(req, 'finance.view');
    const snapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSessions')
      .doc(countSessionId)
      .get();

    if (!snapshot.exists) return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    const data = snapshot.data() || {};
    if (data.financeEntityId !== financeEntityId || data.organizationId !== organizationId) {
      return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    }

    const materialHidden = data.status === 'counting_b' || data.status === 'recounting';
    const session: any = {
      id: snapshot.id,
      serviceLabel: data.serviceLabel,
      serviceDate: data.serviceDate,
      status: data.status,
      version: data.version,
      policySnapshot: data.policySnapshot || {},
      materialHidden,
      recountAttemptCount: Array.isArray(data.recountAttempts) ? data.recountAttempts.length : 0,
      activeRecountAttemptNumber: data.status === 'recounting' ? Number(data.activeRecount?.attemptNumber || 0) : null,
    };

    if (materialHidden) {
      // Blind-count invariant: no Count A/B amounts, denominations, entry types,
      // comparison deltas or prior recount values leave the server while an
      // independent count is in progress.
      session.countA = null;
      session.countB = null;
      session.comparison = null;
      session.recountAttempts = [];
    } else {
      session.countA = serializeCount(data.countA);
      session.countB = serializeCount(data.countB);
      session.comparison = serializeComparison(data.comparison);
      session.resolution = data.resolution || null;
      session.recountAttempts = Array.isArray(data.recountAttempts)
        ? data.recountAttempts.map((attempt: any) => ({
            attemptNumber: Number(attempt.attemptNumber || 0),
            entries: Array.isArray(attempt.entries) ? attempt.entries : [],
            totalCents: Number(attempt.totalCents || 0),
            countedByUid: attempt.countedByUid || null,
            enteredByUid: attempt.enteredByUid || null,
            sealedAt: toIso(attempt.sealedAt),
            matchesA: attempt.matchesA === true,
            matchesB: attempt.matchesB === true,
          }))
        : [];
    }

    return res.status(200).json({
      session,
      requestId: req.body?.requestId || 'unknown',
    });
  } catch (error: any) {
    console.error('Count Session Detail Error:', error);
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error.code)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
