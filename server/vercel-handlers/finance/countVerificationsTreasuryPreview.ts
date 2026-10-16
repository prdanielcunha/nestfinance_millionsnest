import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildCountV3TreasuryReviewPacket } from '../../../shared/finance/countV3TreasuryReview.js';
import {
  assertCountV3Enabled, assertV3Session, sendCountV3Error, v3IsValidSessionId,
} from './countVerificationV3Common.js';

/** Source-backed treasury preview only. Never writes or posts any money. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, countSessionId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId ||
        !v3IsValidSessionId(countSessionId)) {
      return res.status(400).json({ error: 'COUNT_REVIEW_INVALID_PARAMETERS' });
    }
    // Count-only and view-only participants cannot obtain treasury figures
    // through this endpoint, including when their ecclesiastical title says
    // "treasurer". The verified Hub session is checked by the API boundary.
    const { db, organizationId } = await resolveFinanceRequestContext(req, 'finance.review');
    const doc = await db.collection('organizations').doc(organizationId)
      .collection('financeEntities').doc(financeEntityId)
      .collection('countVerificationSessions').doc(countSessionId).get();
    if (!doc.exists) return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    const session = doc.data() || {};
    assertV3Session(session, organizationId, financeEntityId);
    const preview = buildCountV3TreasuryReviewPacket(session);
    return res.status(200).json({
      preview,
      requestId: req.body?.requestId || 'unknown',
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'COUNT_REVIEW_NOT_READY' || message === 'COUNT_REVIEW_STATUS_MISMATCH' ||
        message === 'COUNT_REVIEW_TOTAL_MISMATCH') {
      return res.status(409).json({ error: message });
    }
    sendCountV3Error(res, error);
  }
}
