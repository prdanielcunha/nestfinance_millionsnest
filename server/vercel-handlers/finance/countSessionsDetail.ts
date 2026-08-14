import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';

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

    return res.status(200).json({
      session: {
        id: snapshot.id,
        serviceLabel: data.serviceLabel,
        serviceDate: data.serviceDate,
        status: data.status,
        version: data.version,
        policySnapshot: data.policySnapshot || {},
        countA: {
          entries: Array.isArray(data.countA?.entries) ? data.countA.entries : [],
          totalCents: Number(data.countA?.totalCents || 0),
          countedByUid: data.countA?.countedByUid || null,
          enteredByUid: data.countA?.enteredByUid || null,
          savedAt: data.countA?.savedAt?.toDate?.()?.toISOString?.() || null,
        },
      },
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
