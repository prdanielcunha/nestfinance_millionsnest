import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  TRANSACTION_SEARCH_SCHEMA_VERSION,
  inspectTransactionSearchProjection,
} from './transactionSearchIndex.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { db, organizationId, financeEntityId } =
      await resolveFinanceRequestContext(req, 'finance.view');
    const inspection = await inspectTransactionSearchProjection(
      db,
      organizationId,
      financeEntityId,
    );
    return res.status(200).json({
      searchSchemaVersion: TRANSACTION_SEARCH_SCHEMA_VERSION,
      financeEntityId,
      transactionCount: inspection.candidates.length,
      indexedCurrent: inspection.verifiedExisting.length,
      missingOrStale: inspection.missingOrStale.length,
      truncated: inspection.truncated,
      ready: !inspection.truncated && inspection.missingOrStale.length === 0,
      financialMutation: false,
      auditMutation: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Transaction search preview error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
