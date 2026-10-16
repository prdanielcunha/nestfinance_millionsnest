import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { assertCountV3Enabled, assertV3Session, sendCountV3Error, v3IsValidSessionId } from './countVerificationV3Common.js';

const MAX_RECOUNT_CYCLES = 10;

/**
 * Manual treasury disposition for a divergent N-person Count.
 * Preserves all sealed evidence in a private child collection and resets only
 * the current comparison cycle. No accounting transaction or balance is posted.
 *
 * A counter cannot request/approve their own replay merely by having a
 * Count-only grant. Only the canonical finance.manage role may reopen.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const {
      financeEntityId, countSessionId, expectedVersion,
      reason, idempotencyKey, requestId,
    } = req.body || {};
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (typeof financeEntityId !== 'string' || !financeEntityId ||
        !v3IsValidSessionId(countSessionId) ||
        !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
        normalizedReason.length < 10 || normalizedReason.length > 500 ||
        !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'COUNT_RECOUNT_INVALID_PARAMETERS' });
    }

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.manage');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const sessionRef = entityRef.collection('countVerificationSessions').doc(countSessionId);
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_v3_reopen', idempotencyKey);
    const payloadHash = hashPayload({ countSessionId, expectedVersion, reason: normalizedReason });
    const result = await executeWithIdempotency(
      db, context.repository.getIdempotencyRef(), keyHash, payloadHash,
      async transaction => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const session = sessionDoc.data() || {};
        assertV3Session(session, organizationId, financeEntityId);
        if (session.status !== 'divergent') throw new Error('COUNT_RECOUNT_REQUIRES_DIVERGENCE');
        if (Number(session.version) !== expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');
        const oldCycle = Number(session.recountCycle ?? 0);
        if (!Number.isSafeInteger(oldCycle) || oldCycle < 0 || oldCycle >= MAX_RECOUNT_CYCLES) {
          throw new Error('COUNT_RECOUNT_LIMIT_REACHED');
        }
        const previousConfirmations = Array.isArray(session.confirmations) ? session.confirmations : [];
        if (previousConfirmations.length < 2) throw new Error('COUNT_RECOUNT_INCOMPLETE_EVIDENCE');

        const archiveRef = sessionRef.collection('cycles').doc('cycle_' + String(oldCycle).padStart(2, '0'));
        const newVersion = expectedVersion + 1;
        transaction.create(archiveRef, {
          organizationId, financeEntityId, countSessionId,
          cycle: oldCycle, version: expectedVersion, status: session.status,
          confirmations: previousConfirmations, evaluation: session.evaluation || null,
          policySnapshot: session.policySnapshot,
          reviewedByUid: uid, reviewReason: normalizedReason,
          archivedAt: FieldValue.serverTimestamp(),
          schemaVersion: 3,
        });

        const oldInviteHash = typeof session.joinCodeHash === 'string' ? session.joinCodeHash : '';
        if (oldInviteHash) {
          transaction.delete(entityRef.collection('countVerificationInvites').doc(oldInviteHash));
        }
        transaction.update(sessionRef, {
          status: 'pending',
          confirmations: [],
          evaluation: null,
          sealedAt: FieldValue.delete(),
          joinCodeHash: '',
          joinCodeExpiresAt: null,
          recountCycle: oldCycle + 1,
          version: newVersion,
          updatedByUid: uid,
          updatedAt: FieldValue.serverTimestamp(),
          lastReopenedAt: FieldValue.serverTimestamp(),
          lastReopenedByUid: uid,
        });

        const auditId = generateAuditId();
        const auditRef = context.repository.getAuditRef().doc(auditId);
        stageCanonicalAuditRecord(transaction, db, auditRef, {
          eventId: auditId, organizationId, financeEntityId, actor: uid,
          resource: 'count_verification_session', resourceId: countSessionId,
          action: 'count.v3_divergence_reopened', requestId, idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            statusBefore: 'divergent', statusAfter: 'pending',
            versionBefore: expectedVersion, versionAfter: newVersion,
            archivedCycle: oldCycle, newCycle: oldCycle + 1,
            archiveRef: archiveRef.path,
            reasonCapturedInPrivateArchive: true,
            financialMutation: false,
          },
          createdAt: FieldValue.serverTimestamp(),
        });
        stageFinanceFact(transaction, db, {
          organizationId, eventType: 'COUNT_UPDATED', entityType: 'count_verification_session',
          entityId: countSessionId, actorUserId: uid, correlationId: requestId,
          payload: {
            financeEntityId, stage: 'divergence_reopened',
            status: 'pending', recountCycle: oldCycle + 1,
            version: newVersion, balanceMutation: false,
          },
          sourceRefs: [
            { kind: 'record', ref: sessionRef.path, version: newVersion },
            { kind: 'audit', ref: auditRef.path },
          ],
        });
        return {
          countSessionId, version: newVersion, status: 'pending',
          recountCycle: oldCycle + 1,
          archivedCycleId: archiveRef.id,
        };
      },
    );
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (['COUNT_RECOUNT_LIMIT_REACHED', 'COUNT_RECOUNT_REQUIRES_DIVERGENCE',
      'COUNT_RECOUNT_INCOMPLETE_EVIDENCE'].includes(message)) {
      return res.status(409).json({ error: message });
    }
    sendCountV3Error(res, error);
  }
}
