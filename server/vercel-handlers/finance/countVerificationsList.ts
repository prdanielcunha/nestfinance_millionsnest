import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { isExplicitCountOnlySession } from './countTeamOperationPolicy.js';
import {
  assertCountV3Enabled, sendCountV3Error, serializeV3Session, v3IsParticipant,
} from './countVerificationV3Common.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const { db, uid, organizationId, sessionList } = await resolveFinanceRequestContext(req, 'finance.count.view');
    const docs = await db.collection('organizations').doc(organizationId)
      .collection('financeEntities').doc(financeEntityId)
      .collection('countVerificationSessions').limit(100).get();
    const countOnly = isExplicitCountOnlySession(sessionList);
    const items = docs.docs
      .map(doc => doc.data() || {})
      .filter(session => session.organizationId === organizationId && session.financeEntityId === financeEntityId &&
        (!countOnly || v3IsParticipant(session, uid)))
      .map(session => {
        const serialized = serializeV3Session(session, uid, !countOnly);
        // No financial details or others' entries in the overview.
        const { ownConfirmations, confirmedTotalCents, ...summary } = serialized;
        return summary;
      })
      .sort((a, b) => String(b.serviceDate || '').localeCompare(String(a.serviceDate || '')));
    return res.status(200).json({ items, requestId: req.body?.requestId || 'unknown' });
  } catch (error: any) {
    sendCountV3Error(res, error);
  }
}
