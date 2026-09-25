import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY,
  TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION,
  normalizeTransactionWorkspaceFilters,
  type TransactionWorkspaceView,
} from '../../../shared/finance/transactionWorkspaceView.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { db, uid, organizationId, financeEntityId } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const viewsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('workspaceViewOwners')
      .doc(uid)
      .collection('views');

    const snapshot = await viewsRef
      .orderBy('updatedAt', 'desc')
      .limit(TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY)
      .get();

    const items: TransactionWorkspaceView[] = snapshot.docs.flatMap((doc) => {
      const data = doc.data() || {};
      const filters = normalizeTransactionWorkspaceFilters(data.filters);
      if (!filters) return [];
      return [{
        viewId: doc.id,
        organizationId,
        financeEntityId,
        ownerUid: uid,
        name: String(data.name || ''),
        filters,
        schemaVersion: TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      }];
    });

    return res.status(200).json({
      scope: 'current_user_current_finance_entity',
      readOnly: true,
      items,
      limit: TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Transaction workspace views list error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
