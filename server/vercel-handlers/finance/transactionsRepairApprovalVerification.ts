import { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceTransactionAccess } from './accessHelpers.js';
import { buildIdempotencyKeyHash, hashPayload, executeWithIdempotency } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { computeApprovalSourceHash, buildApprovalMaterial } from '../../../shared/finance/ledger/approvalSourceHash.js';
import { buildPostingPlan } from '../../../shared/finance/ledger/postingPlan.js';
import { loadPostingConfiguration } from './loadPostingConfiguration.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { 
      financeEntityId, transactionId, idempotencyKey, requestId 
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidIdempotencyKey(idempotencyKey)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const token = authHeader.split('Bearer ')[1];
    const admin = getFirebaseAdmin();
    const db = admin.firestore;
    const decodedToken = await admin.auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const organizationId = (req.headers['x-organization-id'] as string) || decodedToken.mn_organization_id;

    if (!organizationId) return res.status(400).json({ error: 'MISSING_ORGANIZATION_ID' });

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    
    // We need permission to approve/post to repair an approval
    const context = await requireFinanceTransactionAccess({
      db, uid, organizationId, financeEntityId, sessionList,
      capability: 'finance.approve_for_posting'
    });

    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'repair_approval', idempotencyKey);
    const payloadHash = hashPayload({ transactionId });

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      const txRef = context.repository.getTransactionsRef().doc(transactionId);
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) throw { code: 'NOT_FOUND', message: 'Transaction not found' };

      const txData = txDoc.data() as LedgerTransaction;
      if (txData.financeEntityId !== financeEntityId) throw { code: 'FORBIDDEN', message: 'Cross-entity reference' };

      if (txData.status !== 'approved_for_posting') {
        throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Transaction is not in approved state' };
      }

      // Check if it already has been repaired
      if ((txData as any).approvalVerificationRepair) {
         return { repaired: false, reason: 'Already uses current algorithm version', transactionId, version: txData.version };
      }

      const approvalRef = txRef.collection('approvals').doc('latest');
      const approvalDoc = await t.get(approvalRef);
      if (!approvalDoc.exists) {
        throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'No approval record found' };
      }
      const approvalData = approvalDoc.data()!;
      const oldAlgoVer = approvalData.approvalAlgorithmVersion || 1;
      
      if (oldAlgoVer >= 2 && !approvalData.materialSnapshot) {
         throw { code: 'FINANCE_APPROVAL_REPAIR_UNVERIFIABLE', message: 'Missing material snapshot in original modern approval' };
      }

      const allocationsSnap = await t.get(context.repository.getAllocationsQuery().where('transactionId', '==', transactionId));
      const allocations = allocationsSnap.docs.map(d => ({id: d.id, ...d.data()} as FinanceAllocation));

      // Re-verify the OLD hash. If the old hash doesn't match the one stored, it means the transaction WAS materially changed, so we cannot repair it.
      
      if (oldAlgoVer >= 2) {
         return { repaired: false, repairEligible: false, errorCode: 'FINANCE_APPROVAL_REPAIR_NOT_ELIGIBLE', reason: 'Approval is already using a modern algorithm version and cannot be a legacy false stale' };
      }
      
      const legacyTxData = { ...txData };
      if (oldAlgoVer === 1) {
        // The legacy algorithm used `version` which was incremented AFTER approval.
        // The approval itself was sealed using the pre-increment version (approvedVersion).
        legacyTxData.version = approvalData.approvedVersion;
      }
      
      const expectedOldHash = computeApprovalSourceHash(legacyTxData, allocations, oldAlgoVer);

      if (expectedOldHash !== approvalData.approvalSourceHash) {
         throw { code: 'FINANCE_APPROVAL_MATERIAL_CHANGED', message: 'Real material changes detected, repair is impossible' };
      }
      
      // Also verify that the current material exactly matches the snapshot (only if it was a V2+ approval originally)
      const currentMaterial = buildApprovalMaterial(txData, allocations, 2);
      if (oldAlgoVer >= 2) {
        if (JSON.stringify(currentMaterial) !== JSON.stringify(approvalData.materialSnapshot)) {
           throw { code: 'FINANCE_APPROVAL_MATERIAL_CHANGED', message: 'Current material differs from approved material snapshot' };
        }
      }

      // It hasn't materially changed! Let's generate a new V2 seal.
      const { mappings, policy, referenceFingerprintHash } = await loadPostingConfiguration(db, organizationId, financeEntityId, txData);
      
      // Verify legacy plan hash matches
      const legacyPlan = buildPostingPlan({
        transaction: { ...txData, version: approvalData.approvedVersion } as any,
        allocations,
        approval: approvalData as any,
        mappings,
        policy,
        isPreview: false
      });

      if (legacyPlan.blockers.length > 0) {
        console.log('Legacy Plan Blockers:', legacyPlan.blockers);
        return { repaired: false, repairEligible: false, errorCode: 'FINANCE_APPROVAL_REPAIR_NOT_ELIGIBLE', reason: 'Plan has blockers after recalculation' };
      }

      if (legacyPlan.planHash !== approvalData.approvedPlanHash) {
         return { repaired: false, repairEligible: false, errorCode: 'FINANCE_APPROVAL_REPAIR_NOT_ELIGIBLE', reason: 'Plan hash differs after recalculation' };
      }

      const newSourceHash = computeApprovalSourceHash(txData, allocations, 2);
      
      const patchedTxData = { ...txData, approvalSourceHash: newSourceHash, approvedVersion: approvalData.approvedVersion, version: approvalData.approvedVersion };

      const plan = buildPostingPlan({
        transaction: patchedTxData as any,
        allocations,
        approval: { ...approvalData, approvalAlgorithmVersion: 2, materialSnapshot: currentMaterial, approvalSourceHash: newSourceHash } as any,
        mappings,
        policy,
        isPreview: false
      });

      if (plan.blockers.length > 0) {
        return { repaired: false, repairEligible: false, errorCode: 'FINANCE_APPROVAL_REPAIR_NOT_ELIGIBLE', reason: 'Plan has blockers after recalculation' };
      }

      const newPlanHash = plan.planHash;

      const repairEventId = generateAuditId();

      const approvalVerificationRepair = {
        originalApprovalId: approvalDoc.id,
        originalApprovedVersion: approvalData.approvedVersion,
        originalAlgorithmVersion: oldAlgoVer,
        originalApprovalSourceHash: approvalData.approvalSourceHash,
        verificationAlgorithmVersion: 2,
        verificationHash: newSourceHash,
        verificationPlanHash: newPlanHash,
        repairedAt: FieldValue.serverTimestamp(),
        repairedBy: {
          type: 'authorized_user',
          uid: uid
        },
        reasonCode: 'false_stale_workflow_version',
        requestId
      };

      t.update(txRef, sanitizeFirestoreObject({
        approvalVerificationRepair,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
        version: txData.version + 1
      }));

      t.set(context.repository.getAuditRef().doc(repairEventId), sanitizeFirestoreObject({
        eventId: repairEventId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'transaction',
        action: 'transaction.approval_verification_repaired',
        requestId,
        idempotencyKey,
        createdAt: FieldValue.serverTimestamp()
      }));

      // Internal Event
      t.set(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('events').doc(repairEventId), sanitizeFirestoreObject({
        eventId: repairEventId,
        organizationId,
        financeEntityId,
        transactionId,
        eventType: 'approval_verification_repaired',
        actorUid: uid,
        versionBefore: txData.version,
        versionAfter: txData.version + 1,
        requestId,
        createdAt: FieldValue.serverTimestamp()
      }));

      return { repaired: true, transactionId, version: txData.version + 1 };
    });

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('Repair Approval Error:', error);
    if (error.code && error.code.startsWith('FINANCE_')) {
      return res.status(400).json({ error: error.code, details: error.message });
    }
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
