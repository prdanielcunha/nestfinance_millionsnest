import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';
import { hasActiveCountCaptureExtractionLease } from '../../../shared/finance/countCaptureExtraction.js';

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

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
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
        transaction.update(sessionRef, {
          status: 'counting_b',
          countB: {
            entries: [],
            totalCents: 0,
            countedByUid: null,
            enteredByUid: null,
            sealedAt: null,
          },
          secondCountStartedByUid: uid,
          secondCountStartedAt: FieldValue.serverTimestamp(),
          updatedByUid: uid,
          version: nextVersion,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const auditId = `audit_${countSessionId.slice(4)}_${nextVersion}`;
        transaction.set(context.repository.getAuditRef().doc(auditId), {
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
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return { countSessionId, version: nextVersion, status: 'counting_b' };
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
