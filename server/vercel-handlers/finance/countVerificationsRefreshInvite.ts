import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import {
  assertCountV3Enabled, assertV3Session, countV3InviteHash,
  generateCountV3JoinCode, sendCountV3Error, V3_INVITE_TTL_MS, v3IsValidSessionId,
} from './countVerificationV3Common.js';

/**
 * Reissue a time-limited invite for the session creator, e.g. after a page
 * reload. The old join code is revoked in the same Firestore transaction.
 * No participant amounts or existing membership are modified.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, countSessionId, expectedVersion, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId ||
      !v3IsValidSessionId(countSessionId) ||
      !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
      !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.count.execute');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const sessionRef = entityRef.collection('countVerificationSessions').doc(countSessionId);
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_v3_refresh_invite', idempotencyKey);
    const payloadHash = hashPayload({ countSessionId, expectedVersion, action: 'refresh_v3_invite' });
    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async transaction => {
      const doc = await transaction.get(sessionRef);
      if (!doc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
      const session = doc.data() || {};
      assertV3Session(session, organizationId, financeEntityId);
      if (session.createdByUid !== uid) throw { status: 403, error: 'COUNT_INVITE_OWNER_REQUIRED' };
      if (session.status !== 'pending') throw new Error('COUNT_INVALID_STATE');
      if (Number(session.version) !== expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');
      const participants = Array.isArray(session.participants) ? session.participants : [];
      if (participants.length >= Number(session.policySnapshot?.maximumParticipants || 20)) {
        throw new Error('COUNT_TEAM_CAPACITY_EXCEEDED');
      }
      const joinCode = generateCountV3JoinCode();
      const hashedCode = countV3InviteHash(joinCode);
      const expiresAtMs = Date.now() + V3_INVITE_TTL_MS;
      const priorCodeHash = String(session.joinCodeHash || '');
      if (priorCodeHash && priorCodeHash !== hashedCode) {
        transaction.delete(entityRef.collection('countVerificationInvites').doc(priorCodeHash));
      }
      transaction.create(entityRef.collection('countVerificationInvites').doc(hashedCode), {
        organizationId, financeEntityId, countSessionId, codeHash: hashedCode,
        expiresAt: Timestamp.fromMillis(expiresAtMs),
        createdByUid: uid, createdAt: FieldValue.serverTimestamp(),
      });
      const version = expectedVersion + 1;
      transaction.update(sessionRef, {
        joinCodeHash: hashedCode,
        joinCodeExpiresAt: Timestamp.fromMillis(expiresAtMs),
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: uid,
        version,
      });
      const auditId = generateAuditId();
      const auditRef = context.repository.getAuditRef().doc(auditId);
      stageCanonicalAuditRecord(transaction, db, auditRef, {
        eventId: auditId, organizationId, financeEntityId, actor: uid,
        resource: 'count_verification_session', resourceId: countSessionId,
        action: 'count.v3_invite_refreshed', requestId, idempotencyKey, afterHash: payloadHash,
        metadata: { status: 'pending', versionBefore: expectedVersion, versionAfter: version, financialMutation: false },
        createdAt: FieldValue.serverTimestamp(),
      });
      stageFinanceFact(transaction, db, {
        organizationId, eventType: 'COUNT_UPDATED',
        entityType: 'count_verification_session', entityId: countSessionId,
        actorUserId: uid, correlationId: requestId,
        payload: { financeEntityId, stage: 'invite_refreshed', version, balanceMutation: false },
        sourceRefs: [{ kind: 'record', ref: sessionRef.path, version }, { kind: 'audit', ref: auditRef.path }],
      });
      return { countSessionId, joinCode, version, expiresAt: new Date(expiresAtMs).toISOString() };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    sendCountV3Error(res, error);
  }
}
