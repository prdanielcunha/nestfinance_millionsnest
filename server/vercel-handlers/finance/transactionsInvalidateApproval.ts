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
      financeEntityId, transactionId, expectedVersion, expectedApprovalSourceHash, reasonCode, comment, requestId, idempotencyKey
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (typeof expectedVersion !== 'number' || expectedVersion < 1) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (expectedApprovalSourceHash !== undefined && expectedApprovalSourceHash !== null && typeof expectedApprovalSourceHash !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
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
      'need_correction',
      'other'
    ];
    if (!validReasons.includes(reasonCode)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'Invalid reasonCode' });
    }

    if (reasonCode === 'other' && (!comment || comment.trim() === '')) {
      return res.status(400).json({ error: 'FINANCE_MISSING_COMMENT', message: 'Comment required for reason other' });
    }

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.invalidate_approval');

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

      const hasPostingEvidence = txData.status === 'posted' || (txData as any).postingId || (txData as any).journalEntryId || (txData as any).postedAt;
      if (hasPostingEvidence) {
        throw {
          code: 'FINANCE_APPROVAL_CANNOT_BE_INVALIDATED_AFTER_POSTING',
          message: 'Esta movimentação já foi lançada e não pode voltar para rascunho. Será necessário fazer uma reversão.'
        };
      }

      if (txData.status !== 'approved_for_posting') {
        throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Only transactions approved for posting can have their approval invalidated' };
      }

      if (txData.version !== expectedVersion) throw { code: 'FINANCE_VERSION_CONFLICT', message: 'Version conflict' };

      if (!txData.approvedBy || !txData.approvalSourceHash) {
        throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'No active approval found to invalidate' };
      }

      const { loadPostingConfiguration } = await import('./loadPostingConfiguration.js');
      const { buildPostingPlan } = await import('../../../shared/finance/ledger/postingPlan.js');

      const existingAllocsQ = await t.get(context.repository.getAllocationsQuery().where('transactionId', '==', transactionId));
      const allocations = existingAllocsQ.docs.map(d => ({ id: d.id, ...d.data() }) as any);

      const approvalDoc = await t.get(txRef.collection('approvals').doc('latest'));
      const approval = approvalDoc.exists ? approvalDoc.data() : undefined;

      const { mappings, policy, referenceFingerprintHash } = await loadPostingConfiguration(db, organizationId, financeEntityId, txData);

      let sealStatus = 'verified';
      if (!txData.approvedBy || !txData.approvalSourceHash || !approval || !approval.approvedPlanHash) {
        sealStatus = 'seal_missing';
      } else if (txData.approvedVersion !== approval.approvedVersion) {
        sealStatus = 'transaction_stale';
      } else if (txData.approvalSourceHash !== approval.approvalSourceHash) {
        sealStatus = 'transaction_stale';
      } else {
        const plan = buildPostingPlan({
          transaction: txData,
          allocations,
          approval: approval as any,
          mappings,
          policy,
          isPreview: true
        });
        if (referenceFingerprintHash !== approval.approvedReferenceFingerprintHash) {
          sealStatus = 'references_changed';
        } else if (plan.planHash !== approval.approvedPlanHash) {
          sealStatus = 'plan_mismatch';
        }
      }

      if (reasonCode === 'need_correction') {
        if (sealStatus === 'verified') {
          throw {
            code: 'FINANCE_APPROVAL_NOT_STALE',
            message: 'A transação está com a aprovação válida e não precisa de correção.'
          };
        }
      } else if (expectedApprovalSourceHash && txData.approvalSourceHash !== expectedApprovalSourceHash) {
        throw { code: 'FINANCE_APPROVAL_HASH_MISMATCH', message: 'Approval source hash mismatch' };
      }

      const transactionKind = txData.transactionKind || txData.direction;
      const newVersion = txData.version + 1;
      const listQueryKeys = buildTransactionListQueryKeys(financeEntityId, transactionId, transactionKind, 'draft', txData.occurredAt);

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
