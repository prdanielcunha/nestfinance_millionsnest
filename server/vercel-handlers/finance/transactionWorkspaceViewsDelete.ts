import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';

const validViewId = (value: unknown): value is string =>
  typeof value === 'string' && /^fview_[a-f0-9]{24}$/u.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { viewId } = req.body || {};
    if (!validViewId(viewId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, uid, organizationId, financeEntityId } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const viewRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('workspaceViewOwners')
      .doc(uid)
      .collection('views')
      .doc(viewId);

    const snapshot = await viewRef.get();
    if (!snapshot.exists) return res.status(200).json({ deleted: false });

    const data = snapshot.data() || {};
    if (
      data.organizationId !== organizationId ||
      data.financeEntityId !== financeEntityId ||
      data.ownerUid !== uid
    ) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    await viewRef.delete();
    return res.status(200).json({ deleted: true, viewId });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Transaction workspace view delete error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
