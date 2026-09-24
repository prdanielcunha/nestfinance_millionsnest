import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { isFinanceEditSessionId } from '../../../shared/finance/financeEditPresence.js';

function validTransactionId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 180;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, transactionId, sessionId } = req.body || {};
    if (
      typeof financeEntityId !== 'string' ||
      !validTransactionId(transactionId) ||
      !isFinanceEditSessionId(sessionId)
    ) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, uid, organizationId } =
      await resolveFinanceRequestContext(req, 'finance.create_drafts');

    const lockRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('editLocks')
      .doc(transactionId);

    const released = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(lockRef);
      if (!snapshot.exists) return false;
      const data = snapshot.data() || {};
      if (
        data.organizationId !== organizationId ||
        data.financeEntityId !== financeEntityId ||
        data.ownerUid !== uid ||
        data.sessionId !== sessionId
      ) return false;
      transaction.delete(lockRef);
      return true;
    });

    return res.status(200).json({
      released,
      financialMutation: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    console.error('Transaction edit presence release error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
