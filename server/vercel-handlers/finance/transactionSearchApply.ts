import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasEffectiveCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import { TRANSACTION_SEARCH_SCHEMA_VERSION } from '../../../shared/finance/transactionSearch.js';
import {
  TRANSACTION_SEARCH_BATCH_MAX,
  inspectTransactionSearchProjection,
  stageTransactionSearchIndex,
} from './transactionSearchIndex.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { db, organizationId, financeEntityId, sessionList } =
      await resolveFinanceRequestContext(req, 'finance.view');
    if (!hasEffectiveCapability(sessionList, 'finance.manage')) {
      return res.status(403).json({ error: 'FORBIDDEN_SEARCH_INDEX_MANAGEMENT' });
    }
    const batchSize = Number(req.body?.batchSize ?? 50);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > TRANSACTION_SEARCH_BATCH_MAX) {
      return res.status(400).json({ error: 'INVALID_BATCH_SIZE' });
    }

    const before = await inspectTransactionSearchProjection(
      db,
      organizationId,
      financeEntityId,
    );
    const batch = before.missingOrStale.slice(0, batchSize);
    let applied = 0;
    let skippedSourceChanged = 0;

    for (const candidate of batch) {
      const result = await db.runTransaction(async (transaction: any) => {
        const transactionRef = db.doc(candidate.transactionRef);
        const source = await transaction.get(transactionRef);
        const data = source.data() || {};
        if (
          !source.exists ||
          data.organizationId !== organizationId ||
          data.financeEntityId !== financeEntityId
        ) {
          return false;
        }
        stageTransactionSearchIndex(transaction, db, {
          organizationId,
          financeEntityId,
          transactionId: source.id,
          transactionData: data,
        });
        return true;
      });
      if (result) applied += 1;
      else skippedSourceChanged += 1;
    }

    const after = await inspectTransactionSearchProjection(
      db,
      organizationId,
      financeEntityId,
    );

    return res.status(200).json({
      searchSchemaVersion: TRANSACTION_SEARCH_SCHEMA_VERSION,
      financeEntityId,
      attempted: batch.length,
      applied,
      skippedSourceChanged,
      remaining: after.missingOrStale.length,
      truncated: after.truncated,
      complete: !after.truncated && after.missingOrStale.length === 0,
      financialMutation: false,
      auditMutation: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Transaction search apply error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
