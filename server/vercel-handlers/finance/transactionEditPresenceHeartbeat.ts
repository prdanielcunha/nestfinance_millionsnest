import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  FINANCE_EDIT_LEASE_MS,
  isFinanceEditSessionId,
} from '../../../shared/finance/financeEditPresence.js';

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

    const { db, uid, actorLabel, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.create_drafts');

    const transactionRef = context.repository.getTransactionsRef().doc(transactionId);
    const lockRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('editLocks')
      .doc(transactionId);

    const nowMs = Date.now();
    const expiresMs = nowMs + FINANCE_EDIT_LEASE_MS;

    const result = await db.runTransaction(async (transaction) => {
      const [txSnapshot, lockSnapshot] = await Promise.all([
        transaction.get(transactionRef),
        transaction.get(lockRef),
      ]);
      const txData = txSnapshot.data() || {};
      if (
        !txSnapshot.exists ||
        txData.organizationId !== organizationId ||
        txData.financeEntityId !== financeEntityId
      ) throw new Error('TRANSACTION_NOT_FOUND');
      if (txData.status !== 'draft') throw new Error('FINANCE_INVALID_STATE_TRANSITION');

      const lock = lockSnapshot.data() || {};
      const liveExpiresMs =
        typeof lock.expiresAt?.toMillis === 'function'
          ? lock.expiresAt.toMillis()
          : 0;
      const liveOtherSession =
        lockSnapshot.exists &&
        liveExpiresMs > nowMs &&
        (lock.ownerUid !== uid || lock.sessionId !== sessionId);

      if (liveOtherSession) {
        return {
          editable: false,
          ownerLabel:
            typeof lock.ownerLabel === 'string' && lock.ownerLabel.trim()
              ? lock.ownerLabel.trim().slice(0, 120)
              : null,
          expiresAt: new Date(liveExpiresMs).toISOString(),
          leaseMs: FINANCE_EDIT_LEASE_MS,
          financialMutation: false as const,
        };
      }

      transaction.set(lockRef, {
        organizationId,
        financeEntityId,
        transactionId,
        ownerUid: uid,
        ownerLabel: actorLabel,
        sessionId,
        heartbeatAt: Timestamp.fromMillis(nowMs),
        expiresAt: Timestamp.fromMillis(expiresMs),
        schemaVersion: 1,
      });

      return {
        editable: true,
        ownerLabel: actorLabel,
        expiresAt: new Date(expiresMs).toISOString(),
        leaseMs: FINANCE_EDIT_LEASE_MS,
        financialMutation: false as const,
      };
    });

    return res.status(200).json(result);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'TRANSACTION_NOT_FOUND' || message === 'FINANCE_ENTITY_NOT_FOUND') {
      return res.status(404).json({ error: message });
    }
    if (message === 'FINANCE_INVALID_STATE_TRANSITION' || message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(409).json({ error: message });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    console.error('Transaction edit presence heartbeat error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
