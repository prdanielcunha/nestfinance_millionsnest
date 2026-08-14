import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { db, organizationId, financeEntityId } = await resolveFinanceRequestContext(req, 'finance.view');
    const snapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSessions')
      .limit(100)
      .get();

    const items = snapshot.docs
      .map((doc: any) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          serviceLabel: data.serviceLabel,
          serviceDate: data.serviceDate,
          status: data.status,
          version: data.version,
          firstCountTotalCents: data.countA?.totalCents || 0,
          firstCountEntryTypes: Array.isArray(data.countA?.entries)
            ? data.countA.entries.map((entry: any) => entry.type)
            : [],
          doubleCountRequired: data.policySnapshot?.doubleCountRequired === true,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
        };
      })
      .sort((a: any, b: any) => {
        const dateCompare = String(b.serviceDate || '').localeCompare(String(a.serviceDate || ''));
        return dateCompare !== 0 ? dateCompare : String(b.id).localeCompare(String(a.id));
      });

    return res.status(200).json({ items, requestId: req.body?.requestId || 'unknown' });
  } catch (error: any) {
    console.error('Count Sessions List Error:', error);
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error.code)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
