import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY,
  TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION,
  normalizeTransactionWorkspaceFilters,
  normalizeTransactionWorkspaceViewName,
} from '../../../shared/finance/transactionWorkspaceView.js';

const validViewId = (value: unknown): value is string =>
  typeof value === 'string' && /^fview_[a-f0-9]{24}$/u.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { name, filters } = req.body || {};
    const requestedViewId = req.body?.viewId;
    const normalizedName = normalizeTransactionWorkspaceViewName(name);
    const normalizedFilters = normalizeTransactionWorkspaceFilters(filters);
    if (
      !normalizedName ||
      !normalizedFilters ||
      (requestedViewId !== undefined && !validViewId(requestedViewId))
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

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

    if (!requestedViewId) {
      const current = await viewsRef.limit(TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY + 1).get();
      if (current.size >= TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY) {
        return res.status(409).json({ error: 'WORKSPACE_VIEW_LIMIT_REACHED' });
      }
    }

    const viewId = requestedViewId || ('fview_' + randomBytes(12).toString('hex'));
    const viewRef = viewsRef.doc(viewId);

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(viewRef);
      const createdAt = existing.exists
        ? existing.data()?.createdAt || FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp();

      transaction.set(viewRef, {
        viewId,
        organizationId,
        financeEntityId,
        ownerUid: uid,
        name: normalizedName,
        filters: normalizedFilters,
        schemaVersion: TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION,
        createdAt,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return res.status(requestedViewId ? 200 : 201).json({
      viewId,
      name: normalizedName,
      filters: normalizedFilters,
      schemaVersion: TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Transaction workspace view save error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
