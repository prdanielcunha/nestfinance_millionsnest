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
import { evaluateReviewReadiness } from '../../../shared/finance/ledger/evaluateReviewReadiness.js';
import { computeApprovalSourceHash } from '../../../shared/finance/ledger/approvalSourceHash.js';

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
      financeEntityId, transactionId, expectedVersion, approvalIdempotencyKey, requestId, comment 
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (typeof expectedVersion !== 'number' || expectedVersion < 1) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidIdempotencyKey(approvalIdempotencyKey)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

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
    
    // Check capability: finance.approve_for_posting
    const context = await requireFinanceTransactionAccess({
      db, uid, organizationId, financeEntityId, sessionList,
      capability: 'finance.approve_for_posting'
    });

    const payload = { financeEntityId, transactionId, expectedVersion, comment }; 
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'approve_for_posting', approvalIdempotencyKey);
    const payloadHash = hashPayload(payload);

    const actorDisplayName = await getActorDisplayName(db, uid);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      const txRef = context.repository.getTransactionsRef().doc(transactionId);
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) throw { code: 'NOT_FOUND', message: 'Transaction not found' };

      const txData = txDoc.data() as LedgerTransaction;
      if (txData.financeEntityId !== financeEntityId) throw { code: 'FORBIDDEN', message: 'Cross-entity reference' };
      if (txData.version !== expectedVersion) throw { code: 'FINANCE_VERSION_CONFLICT', message: 'Version conflict' };
      
      if (txData.status !== 'ready_for_review') {
         throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Cannot approve transaction not in ready_for_review' };
      }

      // Load allocations
      const existingAllocsQ = await t.get(context.repository.getAllocationsQuery().where('transactionId', '==', transactionId));
      const allocations = existingAllocsQ.docs.map(d => ({id: d.id, ...d.data()}) as any);

      // Load all accounts for readiness check
      const accountsQ = await t.get(context.repository.getAccountsRef());
      const accounts = accountsQ.docs.map(d => ({id: d.id, ...d.data()}));

      const { evaluateReviewReadiness } = await import('../../../shared/finance/ledger/evaluateReviewReadiness.js');
      const { computeApprovalSourceHash } = await import('../../../shared/finance/ledger/approvalSourceHash.js');
      const { buildPostingPlan } = await import('../../../shared/finance/ledger/postingPlan.js');
      const { loadPostingConfiguration } = await import('./loadPostingConfiguration.js');

      // Evaluate review readiness
      const readiness = evaluateReviewReadiness(txData, accounts);
      if (!readiness.ready) {
        throw { code: 'FINANCE_NOT_READY_FOR_APPROVAL', message: readiness.blockers.map(b => b.details).join('. ') };
      }

      // Check segregation of duties
      const entityData = context.financeEntity;
      if (entityData?.reviewPolicy?.requireDistinctApprover && txData.createdBy === uid) {
        throw { code: 'FINANCE_SEGREGATION_OF_DUTIES_VIOLATION', message: 'Creator cannot approve their own transaction based on entity policy' };
      }

      const { mappings, policy, referenceFingerprintHash } = await loadPostingConfiguration(db, organizationId, financeEntityId, txData);
      const plan = buildPostingPlan({
        transaction: txData,
        allocations,
        mappings,
        policy,
        approval: { approvedVersion: txData.version, approvalSourceHash: 'tmp', status: 'approved' },
        isPreview: true
      });

      if (plan.blockers.length > 0) {
         throw { code: 'FINANCE_NOT_READY_FOR_APPROVAL', message: 'Plano contábil bloqueado: ' + plan.blockers.map(b => `${b.code}: ${b.details || ''}`).join('. ') };
      }
      if (plan.journalEntry.totalDebitCents !== plan.journalEntry.totalCreditCents) {
         throw { code: 'FINANCE_NOT_READY_FOR_APPROVAL', message: 'Plano contábil desbalanceado.' };
      }

      const approvedPlanHash = plan.planHash;
      const approvedReferenceFingerprintHash = referenceFingerprintHash;
      const sourceHash = computeApprovalSourceHash(txData, allocations);

      const transactionKind = txData.transactionKind || txData.direction;
      const newVersion = txData.version + 1;
      const listQueryKeys = buildTransactionListQueryKeys(financeEntityId, transactionId, transactionKind, 'approved_for_posting', txData.occurredAt);
      
      const eventId = approvalIdempotencyKey ? `evt_${approvalIdempotencyKey}` : generateAuditId();

      const approvalPayload = sanitizeFirestoreObject({
        status: 'approved',
        approvedBy: uid,
        approvedAt: FieldValue.serverTimestamp(),
        approvedVersion: txData.version,
        approvalSourceHash: sourceHash,
        approvedPlanHash,
        approvedReferenceFingerprintHash,
        postingPlanVersion: 1,
        comment: comment || null
      });

      t.set(txRef.collection('approvals').doc('latest'), approvalPayload);
      t.set(txRef.collection('approvals').doc(eventId), approvalPayload);

      t.update(txRef, sanitizeFirestoreObject({
        status: 'approved_for_posting',
        listQueryKeys,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
        version: newVersion,
        approvedBy: uid,
        approvedAt: FieldValue.serverTimestamp(),
        approvedVersion: txData.version,
        approvalSourceHash: sourceHash,
        approvedPlanHash,
        approvedReferenceFingerprintHash,
        approvalComment: comment || null
      }));

      const auditId = generateAuditId();
      t.set(context.repository.getAuditRef().doc(auditId), sanitizeFirestoreObject({
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'transaction',
        action: 'transaction.approved_for_posting',
        requestId,
        idempotencyKey: approvalIdempotencyKey,
        afterHash: payloadHash,
        createdAt: FieldValue.serverTimestamp(),
        details: { comment, approvedVersion: txData.version, sourceHash }
      }));

      t.set(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('events').doc(eventId), sanitizeFirestoreObject({
        eventId,
        organizationId,
        financeEntityId,
        transactionId,
        eventType: 'approved_for_posting',
        actorUid: uid,
        actorDisplayNameSnapshot: actorDisplayName,
        versionBefore: txData.version,
        versionAfter: newVersion,
        comment: comment || null,
        sourceHash,
        requestId,
        createdAt: FieldValue.serverTimestamp()
      }));

      return { transactionId, approvalStatus: 'approved_for_posting', approvedVersion: txData.version, sourceHash, version: newVersion };
    });

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('Approve Transaction Error:', error);
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
