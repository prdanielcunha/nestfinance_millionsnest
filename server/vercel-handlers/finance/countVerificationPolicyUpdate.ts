import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { normalizeCountVerificationPolicy } from '../../../shared/finance/countVerificationPolicy.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { assertCountV3Enabled, sendCountV3Error } from './countVerificationV3Common.js';

/** Finance authority configures future counting teams only.
 * Existing Count v1, Count v3 sessions and posted balances are immutable. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, expectedRevision, policy, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      return res.status(400).json({ error: 'COUNT_INVALID_VERIFICATION_POLICY' });
    }
    // Apply a complete policy, never accept caller-selected field paths.
    const normalized = normalizeCountVerificationPolicy(policy);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.manage');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_v3_policy_update', idempotencyKey);
    const payloadHash = hashPayload({ expectedRevision, policy: normalized });

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async transaction => {
      const doc = await transaction.get(entityRef);
      if (!doc.exists || doc.data()?.active === false) throw new Error('FINANCE_ENTITY_NOT_FOUND');
      const previous = doc.data() || {};
      const currentRevision = Number(previous.countVerificationPolicyRevision ?? 0);
      if (!Number.isSafeInteger(currentRevision) || currentRevision !== expectedRevision) {
        throw new Error('COUNT_POLICY_REVISION_CONFLICT');
      }
      const nextRevision = expectedRevision + 1;
      transaction.update(entityRef, {
        countVerificationPolicy: normalized,
        countVerificationPolicyRevision: nextRevision,
        countVerificationPolicyUpdatedByUid: uid,
        countVerificationPolicyUpdatedAt: FieldValue.serverTimestamp(),
      });
      const auditId = generateAuditId();
      const auditRef = context.repository.getAuditRef().doc(auditId);
      stageCanonicalAuditRecord(transaction, db, auditRef, {
        eventId: auditId, organizationId, financeEntityId, actor: uid,
        resource: 'finance_entity_count_policy', resourceId: financeEntityId,
        action: 'count.v3_entity_policy_changed', requestId, idempotencyKey,
        afterHash: payloadHash,
        metadata: { versionBefore: expectedRevision, versionAfter: nextRevision,
          independentQuorum: normalized.minimumIndependentConfirmations,
          capacity: normalized.maximumParticipants, assistedEnabled: normalized.allowAssisted,
          financialMutation: false },
        createdAt: FieldValue.serverTimestamp(),
      });
      stageFinanceFact(transaction, db, {
        organizationId, eventType: 'COUNT_UPDATED', entityType: 'finance_entity_count_policy',
        entityId: financeEntityId, actorUserId: uid, correlationId: requestId,
        payload: { financeEntityId, stage: 'policy_updated', revision: nextRevision, balanceMutation: false },
        sourceRefs: [{kind:'record',ref:entityRef.path,version:nextRevision},{kind:'audit',ref:auditRef.path}],
      });
      return { financeEntityId, policy: normalized, revision: nextRevision };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    // Preserve the shared atomic period-fence error at this HTTP boundary.
    if (error?.code === 'LEDGER_PERIOD_CLOSED' || String(error?.code || '').startsWith('LEDGER_PERIOD_FENCE_')) return res.status(409).json({ error: error.code });

    const msg = String(error?.message || '');
    if (msg === 'COUNT_POLICY_REVISION_CONFLICT') return res.status(409).json({ error: msg });
    sendCountV3Error(res, error);
  }
}
