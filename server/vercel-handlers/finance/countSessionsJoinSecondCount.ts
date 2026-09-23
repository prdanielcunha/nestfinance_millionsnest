import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageFinanceFact } from './factStream.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';

function normalizeJoinCode(value: unknown) {
  const code = typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/.test(code)) {
    throw new Error('COUNT_INVALID_JOIN_CODE');
  }
  return code;
}

function hashJoinCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, joinCode, idempotencyKey, requestId } = req.body || {};
    if (
      !financeEntityId ||
      typeof financeEntityId !== 'string' ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const normalizedCode = normalizeJoinCode(joinCode);
    const codeHash = hashJoinCode(normalizedCode);
    const { db, uid, actorLabel, organizationId, context } = await resolveFinanceRequestContext(
      req,
      'finance.create_drafts',
    );
    const inviteRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSecondInvites')
      .doc(codeHash);

    const payloadHash = hashPayload({ financeEntityId, codeHash, action: 'join_second_count' });
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'count_second_count_join',
      idempotencyKey,
    );

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const inviteSnapshot = await transaction.get(inviteRef);
        if (!inviteSnapshot.exists) throw new Error('COUNT_JOIN_CODE_NOT_FOUND');
        const invite = inviteSnapshot.data() || {};
        if (invite.organizationId !== organizationId || invite.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_JOIN_CODE_NOT_FOUND');
        }

        const expiresAtMs = invite.expiresAt?.toMillis?.() || 0;
        if (!expiresAtMs || expiresAtMs <= Date.now()) throw new Error('COUNT_JOIN_CODE_EXPIRED');

        const countSessionId = String(invite.countSessionId || '');
        const sessionRef = db
          .collection('organizations')
          .doc(organizationId)
          .collection('financeEntities')
          .doc(financeEntityId)
          .collection('countSessions')
          .doc(countSessionId);
        const sessionSnapshot = await transaction.get(sessionRef);
        if (!sessionSnapshot.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const session = sessionSnapshot.data() || {};
        if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_SESSION_NOT_FOUND');
        }
        if (session.status !== 'counting_b') throw new Error('COUNT_INVALID_STATE');
        if (session.secondCountInviteCodeHash !== codeHash) throw new Error('COUNT_JOIN_CODE_NOT_FOUND');
        if (
          session.policySnapshot?.requireIndependentCounter !== false &&
          (session.countA?.countedByUid || session.countA?.enteredByUid) &&
          (session.countA?.countedByUid || session.countA?.enteredByUid) === uid
        ) {
          throw new Error('COUNT_INDEPENDENT_COUNTER_REQUIRED');
        }
        if (invite.claimedByUid && invite.claimedByUid !== uid) {
          throw new Error('COUNT_JOIN_CODE_ALREADY_USED');
        }
        if (session.secondCountAssignedToUid && session.secondCountAssignedToUid !== uid) {
          throw new Error('COUNT_SECOND_COUNTER_ALREADY_ASSIGNED');
        }

        if (invite.claimedByUid === uid && session.secondCountAssignedToUid === uid) {
          return {
            countSessionId,
            version: Number(session.version || 1),
            status: 'counting_b',
            assignedToLabel: session.secondCountAssignedToLabel || actorLabel,
          };
        }

        const currentVersion = Number(session.version || 0);
        if (!Number.isInteger(currentVersion) || currentVersion < 1) throw new Error('COUNT_VERSION_CONFLICT');
        const nextVersion = currentVersion + 1;

        transaction.update(inviteRef, {
          claimedByUid: uid,
          claimedByLabel: actorLabel,
          claimedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(sessionRef, {
          secondCountAssignedToUid: uid,
          secondCountAssignedToLabel: actorLabel,
          secondCountAssignedAt: FieldValue.serverTimestamp(),
          updatedByUid: uid,
          version: nextVersion,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const auditId = `audit_${countSessionId.slice(4)}_${nextVersion}`;
        const auditRef = context.repository.getAuditRef().doc(auditId);
        stageCanonicalAuditRecord(transaction, db, auditRef, {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'count_session',
          resourceId: countSessionId,
          action: 'count.second_counter_joined',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            versionBefore: currentVersion,
            versionAfter: nextVersion,
            status: 'counting_b',
            blindMaterial: true,
            independentCounter: true,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        stageFinanceFact(transaction, db, {
          organizationId,
          eventType: 'COUNT_UPDATED',
          entityType: 'count_session',
          entityId: countSessionId,
          actorUserId: uid,
          correlationId: requestId,
          payload: {
            financeEntityId,
            status: 'counting_b',
            version: nextVersion,
            stage: 'second_counter_joined',
            blind: true,
          },
          sourceRefs: [
            { kind: 'record', ref: sessionRef.path, version: nextVersion },
            { kind: 'audit', ref: auditRef.path },
          ],
        });

        return {
          countSessionId,
          version: nextVersion,
          status: 'counting_b',
          assignedToLabel: actorLabel,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count Second Counter Join Error:', error);
    const message = String(error?.message || '');
    if (message.startsWith('COUNT_')) {
      const status = [
        'COUNT_JOIN_CODE_ALREADY_USED',
        'COUNT_SECOND_COUNTER_ALREADY_ASSIGNED',
        'COUNT_VERSION_CONFLICT',
      ].includes(message)
        ? 409
        : message === 'COUNT_SESSION_NOT_FOUND' || message === 'COUNT_JOIN_CODE_NOT_FOUND'
          ? 404
          : message === 'COUNT_INDEPENDENT_COUNTER_REQUIRED'
            ? 403
            : 400;
      return res.status(status).json({ error: message });
    }
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error.code)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
