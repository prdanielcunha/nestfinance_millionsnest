import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { isExplicitCountOnlySession } from './countTeamOperationPolicy.js';
import {
  assertCountV3Enabled, assertV3CanRead, assertV3Session,
  sendCountV3Error, serializeV3Session, v3IsValidSessionId,
} from './countVerificationV3Common.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, countSessionId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId || !v3IsValidSessionId(countSessionId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const { db, uid, organizationId, sessionList } = await resolveFinanceRequestContext(req, 'finance.count.view');
    const doc = await db.collection('organizations').doc(organizationId)
      .collection('financeEntities').doc(financeEntityId)
      .collection('countVerificationSessions').doc(countSessionId).get();
    if (!doc.exists) return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    const session = doc.data() || {};
    assertV3Session(session, organizationId, financeEntityId);
    const countOnly = isExplicitCountOnlySession(sessionList);
    assertV3CanRead(session, uid, countOnly);
    return res.status(200).json({
      session: serializeV3Session(session, uid, !countOnly),
      requestId: req.body?.requestId || 'unknown',
    });
  } catch (error: any) {
    sendCountV3Error(res, error);
  }
}
