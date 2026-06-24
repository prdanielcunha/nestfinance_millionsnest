import { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceTransactionAccess } from './accessHelpers.js';
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
      financeEntityId, transactionId, expectedVersion, expectedApprovalSourceHash, reasonCode, comment, requestId, idempotencyKey 
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (typeof expectedVersion !== 'number' || expectedVersion < 1) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!expectedApprovalSourceHash || typeof expectedApprovalSourceHash !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidIdempotencyKey(idempotencyKey)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!reasonCode || typeof reasonCode !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    
    const validReasons = [
      'amount_needs_change',
      'account_needs_change',
      'classification_needs_change',
      'date_needs_change',
      'attachment_needs_change',
      'beneficiary_needs_change',
      'other'
    ];
    if (!validReasons.includes(reasonCode)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'Invalid reasonCode' });
    }

    if (reasonCode === 'other' && (!comment || comment.trim() === '')) {
      return res.status(400).json({ error: 'FINANCE_MISSING_COMMENT', message: 'Comment required for reason other' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const token = authHeader.split('Bearer ')[1];
    const admin = getFirebaseAdmin();
    const db = admin.firestore;
    const decodedToken = await admin.auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!organizationId) return res.status(400).json({ error: 'MISSING_ORGANIZATION_ID' });

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    
    // Check capability: finance.invalidate_approval (or finance.review as fallback)
    const context = await requireFinanceTransactionAccess({
      db, uid, organizationId, financeEntityId, sessionList,
      capability: 'finance.invalidate_approval'
    });

    const payload = { financeEntityId, transactionId, expectedVersion, expectedApprovalSourceHash, reasonCode, comment }; 
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'invalidate_approval', idempotencyKey);
    const payloadHash = hashPayload(payload);

    const actorDisplayName = await getActorDisplayName(db, uid);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      const txRef = context.repository.getTransactionsRef().doc(transactionId);
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) throw { code: 'NOT_FOUND', message: 'Transaction not found' };

      const txData = txDoc.data() as LedgerTransaction;
      if (txData.financeEntityId !== financeEntityId) throw { code: 'FORBIDDEN', message: 'Cross-entity reference' };

      // 9. Confirmar que não existe Posting
      const hasPostingEvidence = txData.status === 'posted' || (txData as any).postingId || (txData as any).journalEntryId || (txData as any).postedAt;
      if (hasPostingEvidence) {
        throw { 
          code: 'FINANCE_APPROVAL_CANNOT_BE_INVALIDATED_AFTER_POSTING', 
          message: 'Esta movimentação já foi lançada e não pode voltar para rascunho. Será necessário fazer uma reversão.' 
        };
      }

      // 5. Exigir status === approved_for_posting
      if (txData.status !== 'approved_for_posting') {
         throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Only transactions approved for posting can have their approval invalidated' };
      }

      // 6. Validar expectedVersion
      if (txData.version !== expectedVersion) throw { code: 'FINANCE_VERSION_CONFLICT', message: 'Version conflict' };
      
      // 7. Validar aprovação existente
      if (!txData.approvedBy || !txData.approvalSourceHash) {
         throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'No active approval found to invalidate' };
      }

      // 8. Validar sourceHash atual
      if (txData.approvalSourceHash !== expectedApprovalSourceHash) {
         throw { code: 'FINANCE_APPROVAL_HASH_MISMATCH', message: 'Approval source hash mismatch' };
      }

      const transactionKind = txData.transactionKind || txData.direction;
      const newVersion = txData.version + 1;
      const listQueryKeys = buildTransactionListQueryKeys(financeEntityId, transactionId, transactionKind, 'draft', txData.occurredAt);
      
      // Update transaction - preserving approval but setting status to draft and invalidation info
      t.update(txRef, sanitizeFirestoreObject({
        status: 'draft',
        listQueryKeys,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
        version: newVersion,
        approvalStatus: 'invalidated',
        invalidatedBy: uid,
        invalidatedAt: FieldValue.serverTimestamp(),
        invalidatedReason: reasonCode,
        invalidatedComment: comment || null
      }));

      const auditId = generateAuditId();
      t.set(context.repository.getAuditRef().doc(auditId), sanitizeFirestoreObject({
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'transaction',
        action: 'transaction.approval_invalidated',
        requestId,
        idempotencyKey,
        afterHash: payloadHash,
        createdAt: FieldValue.serverTimestamp(),
        details: { reasonCode, comment, previousVersion: txData.version, newVersion, sourceHash: txData.approvalSourceHash }
      }));

      // Internal event
      const eventId = idempotencyKey ? `evt_${idempotencyKey}` : generateAuditId();
      t.set(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('events').doc(eventId), sanitizeFirestoreObject({
        eventId,
        organizationId,
        financeEntityId,
        transactionId,
        eventType: 'approval_invalidated',
        actorUid: uid,
        actorDisplayNameSnapshot: actorDisplayName,
        versionBefore: txData.version,
        versionAfter: newVersion,
        reasonCode,
        comment: comment || null,
        sourceHash: txData.approvalSourceHash,
        requestId,
        createdAt: FieldValue.serverTimestamp()
      }));

      return { transactionId, status: 'draft', approvalStatus: 'invalidated', version: newVersion, requestId };
    });

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('Invalidate Approval Error:', error);
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
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
