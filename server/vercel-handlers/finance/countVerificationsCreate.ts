import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateCountSessionId, validateCountServiceDate, validateCountServiceLabel } from '../../../shared/finance/count.js';
import { isValidIdempotencyKey, isValidRequestId, generateAuditId } from '../../../shared/finance/ledger/ids.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import {
  assertCountV3Enabled,
  countV3InviteHash,
  countV3PolicyFromEntity,
  generateCountV3JoinCode,
  sendCountV3Error,
  V3_INVITE_TTL_MS,
} from './countVerificationV3Common.js';

/** Independent Count v3 has a separate collection and is disabled by default.
 * No posting, balance adjustment, transaction or legacy Count v1 writes. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, serviceLabel, serviceDate, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId ||
      !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const normalizedLabel = validateCountServiceLabel(serviceLabel);
    const normalizedDate = validateCountServiceDate(serviceDate);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.count.execute');
    const policySnapshot = countV3PolicyFromEntity(context.financeEntity);
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_v3_create', idempotencyKey);
    const payloadHash = hashPayload({ serviceLabel: normalizedLabel, serviceDate: normalizedDate, policySnapshot });

    const created = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async transaction => {
      const countSessionId = generateCountSessionId();
      const joinCode = generateCountV3JoinCode();
      const codeHash = countV3InviteHash(joinCode);
      const sessionRef = entityRef.collection('countVerificationSessions').doc(countSessionId);
      const inviteRef = entityRef.collection('countVerificationInvites').doc(codeHash);
      const auditId = generateAuditId();
      const auditRef = context.repository.getAuditRef().doc(auditId);
      const expiresAtMs = Date.now() + V3_INVITE_TTL_MS;

      transaction.create(sessionRef, {
        id: countSessionId,
        organizationId,
        financeEntityId,
        serviceLabel: normalizedLabel,
        serviceDate: normalizedDate,
        status: 'pending',
        policySnapshot,
        participants: [uid],
        confirmations: [],
        evaluation: null,
        createdByUid: uid,
        joinCodeHash: codeHash,
        joinCodeExpiresAt: Timestamp.fromMillis(expiresAtMs),
        version: 1,
        schemaVersion: 3,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(inviteRef, {
        organizationId, financeEntityId, countSessionId, codeHash,
        expiresAt: Timestamp.fromMillis(expiresAtMs),
        createdByUid: uid, createdAt: FieldValue.serverTimestamp(),
      });
      stageCanonicalAuditRecord(transaction, db, auditRef, {
        eventId: auditId, organizationId, financeEntityId, actor: uid,
        resource: 'count_verification_session', resourceId: countSessionId,
        action: 'count.v3_session_opened', requestId, idempotencyKey,
        afterHash: payloadHash,
        metadata: { serviceDate: normalizedDate, policyVersion: 3, financialMutation: false, status: 'pending' },
        createdAt: FieldValue.serverTimestamp(),
      });
      stageFinanceFact(transaction, db, {
        organizationId, eventType: 'COUNT_OPENED', entityType: 'count_verification_session',
        entityId: countSessionId, actorUserId: uid, correlationId: requestId,
        payload: { financeEntityId, status: 'pending', policyVersion: 3, balanceMutation: false },
        sourceRefs: [{ kind: 'record', ref: sessionRef.path, version: 1 }, { kind: 'audit', ref: auditRef.path }],
      });
      // This is a creator-only idempotency result. It carries the invite code
      // for safe network retries, never Count A/B amounts or accounting details.
      return { countSessionId, version: 1, status: 'pending', joinCode, expiresAt: new Date(expiresAtMs).toISOString() };
    });
    return res.status(200).json({ ...created, requestId });
  } catch (error: any) {
    sendCountV3Error(res, error);
  }
}
