import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import {
  assertCountV3Enabled, assertV3Session, countV3InviteHash,
  normalizeCountV3JoinCode, sendCountV3Error,
} from './countVerificationV3Common.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, joinCode, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId ||
        !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const hashedCode = countV3InviteHash(normalizeCountV3JoinCode(joinCode));
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.count.execute');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const inviteRef = entityRef.collection('countVerificationInvites').doc(hashedCode);
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_v3_join', idempotencyKey);
    const payloadHash = hashPayload({ financeEntityId, hashedCode, action: 'join_v3' });

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async transaction => {
      const inviteDoc = await transaction.get(inviteRef);
      if (!inviteDoc.exists) throw new Error('COUNT_JOIN_CODE_NOT_FOUND');
      const invite = inviteDoc.data() || {};
      if (invite.organizationId !== organizationId || invite.financeEntityId !== financeEntityId ||
          invite.codeHash !== hashedCode) throw new Error('COUNT_JOIN_CODE_NOT_FOUND');
      const expiresAt = invite.expiresAt?.toMillis?.() || 0;
      if (!expiresAt || expiresAt <= Date.now()) throw new Error('COUNT_JOIN_CODE_EXPIRED');
      const countSessionId = String(invite.countSessionId || '');
      const sessionRef = entityRef.collection('countVerificationSessions').doc(countSessionId);
      const sessionDoc = await transaction.get(sessionRef);
      if (!sessionDoc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
      const session = sessionDoc.data() || {};
      assertV3Session(session, organizationId, financeEntityId);
      if (session.joinCodeHash !== hashedCode || session.status !== 'pending') throw new Error('COUNT_INVALID_STATE');

      const participants: string[] = Array.isArray(session.participants) ? session.participants : [];
      if (participants.includes(uid)) {
        return { countSessionId, version: Number(session.version || 1), status: 'pending', alreadyJoined: true };
      }
      if (participants.length >= Number(session.policySnapshot?.maximumParticipants || 20)) {
        throw new Error('COUNT_TEAM_CAPACITY_EXCEEDED');
      }
      const version = Number(session.version || 0);
      if (!Number.isSafeInteger(version) || version < 1) throw new Error('COUNT_VERSION_CONFLICT');
      const nextVersion = version + 1;
      transaction.update(sessionRef, {
        participants: [...participants, uid],
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
        version: nextVersion,
      });
      const auditId = generateAuditId();
      const auditRef = context.repository.getAuditRef().doc(auditId);
      stageCanonicalAuditRecord(transaction, db, auditRef, {
        eventId: auditId, organizationId, financeEntityId, actor: uid,
        resource: 'count_verification_session', resourceId: countSessionId,
        action: 'count.v3_counter_joined', requestId, idempotencyKey,
        afterHash: payloadHash,
        metadata: { status: 'pending', versionBefore: version, versionAfter: nextVersion, financialMutation: false },
        createdAt: FieldValue.serverTimestamp(),
      });
      stageFinanceFact(transaction, db, {
        organizationId, eventType: 'COUNT_UPDATED', entityType: 'count_verification_session',
        entityId: countSessionId, actorUserId: uid, correlationId: requestId,
        payload: { financeEntityId, stage: 'participant_joined', version: nextVersion, balanceMutation: false },
        sourceRefs: [{ kind: 'record', ref: sessionRef.path, version: nextVersion }, { kind: 'audit', ref: auditRef.path }],
      });
      return { countSessionId, version: nextVersion, status: 'pending', alreadyJoined: false };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    sendCountV3Error(res, error);
  }
}
