import { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, hashPayload, executeWithIdempotency } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { buildTransactionListQueryKeys } from '../../../shared/finance/ledger/listQueryKeys.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';

async function getActorDisplayName(db: any, uid: string): Promise<string> {
  try {
    const uDoc = await db.collection('user_profiles').doc(uid).get();
    if (uDoc.exists) {
      return uDoc.data()?.name || uDoc.data()?.displayName || 'Usuário da equipe';
    }
  } catch (e) {
    // ignore
  }
  return 'Usuário da equipe';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const {
      financeEntityId, transactionId, expectedVersion, idempotencyKey, requestId, reasonCode, comment
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (typeof expectedVersion !== 'number' || expectedVersion < 1) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidIdempotencyKey(idempotencyKey)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!reasonCode || typeof reasonCode !== 'string' || reasonCode.trim() === '') return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'reasonCode is required and cannot be empty' });
    if (reasonCode === 'other' && (!comment || comment.trim() === '')) {
      return res.status(400).json({ error: 'FINANCE_MISSING_COMMENT', message: 'Comment required for reason other' });
    }

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.return_to_draft');

    const payload = { financeEntityId, transactionId, expectedVersion, reasonCode, comment };
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'return_to_draft', idempotencyKey);
    const payloadHash = hashPayload(payload);

    const actorDisplayName = await getActorDisplayName(db, uid);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      const txRef = context.repository.getTransactionsRef().doc(transactionId);
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) throw { code: 'NOT_FOUND', message: 'Transaction not found' };

      const txData = txDoc.data() as LedgerTransaction;
      if (txData.financeEntityId !== financeEntityId) throw { code: 'FORBIDDEN', message: 'Cross-entity reference' };
      if (txData.version !== expectedVersion) throw { code: 'FINANCE_VERSION_CONFLICT', message: 'Version conflict' };

      if (txData.status !== 'ready_for_review' && txData.status !== 'approved_for_posting') {
        throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Cannot return transaction not in ready_for_review or approved_for_posting' };
      }

      const transactionKind = txData.transactionKind || txData.direction;
      const newVersion = txData.version + 1;
      const listQueryKeys = buildTransactionListQueryKeys(financeEntityId, transactionId, transactionKind, 'draft', txData.occurredAt);

      if (txData.status === 'approved_for_posting') {
        const approvalUpdate = sanitizeFirestoreObject({
          status: 'invalidated',
          invalidatedAt: FieldValue.serverTimestamp(),
          invalidatedBy: uid,
          reasonCode: reasonCode === 'other' ? 'approval_invalidated_for_correction' : reasonCode,
          comment: comment || null
        });
        t.update(txRef.collection('approvals').doc('latest'), approvalUpdate);
      }

      t.update(txRef, sanitizeFirestoreObject({
        status: 'draft',
        listQueryKeys,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
        version: newVersion,
        returnedToDraftReason: reasonCode,
        returnedToDraftComment: comment || null,
        returnedToDraftAt: FieldValue.serverTimestamp(),
        returnedToDraftBy: uid,
        approvalSourceHash: FieldValue.delete(),
        approvedVersion: FieldValue.delete(),
        approvedAt: FieldValue.delete(),
        approvedBy: FieldValue.delete(),
        approvalComment: FieldValue.delete()
      }));

      const auditId = generateAuditId();
      t.set(context.repository.getAuditRef().doc(auditId), sanitizeFirestoreObject({
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'transaction',
        action: 'transaction.returned_to_draft',
        requestId,
        idempotencyKey,
        afterHash: payloadHash,
        createdAt: FieldValue.serverTimestamp(),
        details: { reasonCode, comment, previousVersion: txData.version, newVersion }
      }));

      const eventId = idempotencyKey ? `evt_${idempotencyKey}` : generateAuditId();
      t.set(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('events').doc(eventId), sanitizeFirestoreObject({
        eventId,
        organizationId,
        financeEntityId,
        transactionId,
        eventType: 'returned_to_draft',
        actorUid: uid,
        actorDisplayNameSnapshot: actorDisplayName,
        versionBefore: txData.version,
        versionAfter: newVersion,
        reasonCode,
        comment: comment || null,
        requestId,
        createdAt: FieldValue.serverTimestamp()
      }));

      return { transactionId, version: newVersion };
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Return Transaction to Draft Error:', error);
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (error.code && error.code.startsWith('FINANCE_')) {
      return res.status(400).json({ error: error.code, details: error.message });
    }
    if (error.message?.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error.code === 'auth/id-token-revoked' || error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
