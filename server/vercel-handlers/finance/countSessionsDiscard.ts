import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  buildIdempotencyKeyHash,
  executeWithIdempotency,
  hashPayload,
} from './idempotencyHelper.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const {
      financeEntityId,
      countSessionId,
      expectedVersion,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !isValidCountSessionId(countSessionId) ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const {
      db,
      uid,
      actorLabel,
      organizationId,
      context,
    } = await resolveFinanceRequestContext(req, 'finance.create_drafts');

    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'count_session_discard',
      idempotencyKey,
    );
    const payloadHash = hashPayload({ countSessionId, expectedVersion });

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const entityRef = db
          .collection('organizations')
          .doc(organizationId)
          .collection('financeEntities')
          .doc(financeEntityId);
        const sessionRef = entityRef.collection('countSessions').doc(countSessionId);
        const snapshot = await transaction.get(sessionRef);

        if (!snapshot.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const session = snapshot.data() || {};
        if (
          session.organizationId !== organizationId ||
          session.financeEntityId !== financeEntityId
        ) {
          throw new Error('COUNT_SESSION_NOT_FOUND');
        }
        if (Number(session.version) !== expectedVersion) {
          throw new Error('COUNT_VERSION_CONFLICT');
        }
        if (session.status !== 'counting_a') {
          throw new Error('COUNT_DISCARD_NOT_ALLOWED');
        }

        const nextVersion = expectedVersion + 1;
        transaction.update(sessionRef, {
          status: 'discarded',
          discardedAt: FieldValue.serverTimestamp(),
          discardedByUid: uid,
          updatedByUid: uid,
          updatedAt: FieldValue.serverTimestamp(),
          version: nextVersion,
        });

        const auditId = generateAuditId();
        const auditRef = context.repository.getAuditRef().doc(auditId);
        stageCanonicalAuditRecord(transaction, db, auditRef, {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'count_session',
          resourceId: countSessionId,
          action: 'count.session_discarded',
          requestId,
          idempotencyKey,
          beforeHash: hashPayload({
            countSessionId,
            status: session.status,
            version: session.version,
            serviceDate: session.serviceDate,
          }),
          metadata: {
            status: 'discarded',
            versionBefore: session.version,
            versionAfter: nextVersion,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        const eventId = `evt_count_discard_${idempotencyKey}`;
        transaction.set(entityRef.collection('events').doc(eventId), {
          eventId,
          organizationId,
          financeEntityId,
          countSessionId,
          eventType: 'count_session_discarded',
          actorUid: uid,
          actorDisplayNameSnapshot: actorLabel,
          versionBefore: session.version,
          versionAfter: nextVersion,
          requestId,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          countSessionId,
          version: nextVersion,
          status: 'discarded' as const,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || error?.code || '');

    if (message === 'COUNT_SESSION_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'COUNT_VERSION_CONFLICT') return res.status(409).json({ error: message });
    if (message === 'COUNT_DISCARD_NOT_ALLOWED') return res.status(409).json({ error: message });
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error?.status === 401 || error?.status === 403 || error?.status === 400) {
      return res.status(error.status).json({
        error: error.error || (error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN'),
      });
    }
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error?.code)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    console.error(
      'Count Session Discard Error:',
      message.startsWith('COUNT_') ? message : 'UNEXPECTED_ERROR',
    );
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
