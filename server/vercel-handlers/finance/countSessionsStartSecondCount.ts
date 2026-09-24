import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageFinanceFact } from './factStream.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';
import { hasActiveCountCaptureExtractionLease } from '../../../shared/finance/countCaptureExtraction.js';

const SECOND_COUNT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const SECOND_COUNT_INVITE_TTL_MS = 4 * 60 * 60 * 1000;

function generateSecondCountCode() {
  const bytes = randomBytes(10);
  let code = '';
  for (let index = 0; index < 10; index += 1) {
    code += SECOND_COUNT_CODE_ALPHABET[bytes[index] % SECOND_COUNT_CODE_ALPHABET.length];
  }
  return code;
}

function hashSecondCountCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, countSessionId, expectedVersion, idempotencyKey, requestId } = req.body || {};
    if (
      !financeEntityId ||
      typeof financeEntityId !== 'string' ||
      !isValidCountSessionId(countSessionId) ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, uid, actorLabel, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const sessionRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSessions')
      .doc(countSessionId);

    const payloadHash = hashPayload({ countSessionId, expectedVersion, action: 'start_second_count' });
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'count_second_count_start',
      idempotencyKey,
    );

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const snapshot = await transaction.get(sessionRef);
        if (!snapshot.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const session = snapshot.data() || {};
        if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_SESSION_NOT_FOUND');
        }
        if (session.status !== 'counting_a') throw new Error('COUNT_INVALID_STATE');
        if (Number(session.version) !== expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');
        if (!Array.isArray(session.countA?.entries) || session.countA.entries.length === 0 || !session.countA?.savedAt) {
          throw new Error('COUNT_FIRST_COUNT_REQUIRED');
        }
        if (hasActiveCountCaptureExtractionLease(session)) throw new Error('COUNT_CAPTURE_EXTRACTION_IN_PROGRESS');

        const nextVersion = expectedVersion + 1;
        const joinCode = generateSecondCountCode();
        const codeHash = hashSecondCountCode(joinCode);
        const expiresAtMs = Date.now() + SECOND_COUNT_INVITE_TTL_MS;
        const inviteRef = db
          .collection('organizations')
          .doc(organizationId)
          .collection('financeEntities')
          .doc(financeEntityId)
          .collection('countSecondInvites')
          .doc(codeHash);

        transaction.set(inviteRef, {
          organizationId,
          financeEntityId,
          countSessionId,
          codeHash,
          createdByUid: uid,
          createdByLabel: actorLabel,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(expiresAtMs),
          claimedByUid: null,
          claimedByLabel: null,
          claimedAt: null,
        });

        transaction.update(sessionRef, {
          status: 'counting_b',
          countB: {
            entries: [],
            totalCents: 0,
            countedByUid: null,
            countedByLabel: null,
            enteredByUid: null,
            enteredByLabel: null,
            sealedAt: null,
          },
          secondCountStartedByUid: uid,
          secondCountStartedByLabel: actorLabel,
          secondCountStartedAt: FieldValue.serverTimestamp(),
          secondCountAssignedToUid: null,
          secondCountAssignedToLabel: null,
          secondCountAssignedAt: null,
          secondCountInviteRequired: true,
          secondCountInviteCodeHash: codeHash,
          secondCountInviteCode: joinCode,
          secondCountInviteExpiresAt: Timestamp.fromMillis(expiresAtMs),
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
          action: 'count.second_count_started',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            versionBefore: expectedVersion,
            versionAfter: nextVersion,
            status: 'counting_b',
            blindMaterial: true,
            independentCounterRequired: session.policySnapshot?.requireIndependentCounter !== false,
            inviteExpiresAt: new Date(expiresAtMs).toISOString(),
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
            stage: 'second_count_started',
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
          joinCode,
          expiresAt: new Date(expiresAtMs).toISOString(),
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count Second Count Start Error:', error);
    const message = String(error?.message || '');
    if (message.startsWith('COUNT_')) {
      const status = ['COUNT_VERSION_CONFLICT', 'COUNT_CAPTURE_EXTRACTION_IN_PROGRESS'].includes(message)
        ? 409
        : message === 'COUNT_SESSION_NOT_FOUND'
          ? 404
          : 400;
      return res.status(status).json({ error: message });
    }
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error.code)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
