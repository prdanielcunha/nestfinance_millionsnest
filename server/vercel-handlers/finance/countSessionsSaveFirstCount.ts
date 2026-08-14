import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  calculateCountEntriesTotalCents,
  isValidCountSessionId,
  normalizeCountEntries,
} from '../../../shared/finance/count.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, countSessionId, expectedVersion, entries, idempotencyKey, requestId } = req.body || {};
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

    const normalizedEntries = normalizeCountEntries(entries);
    const totalCents = calculateCountEntriesTotalCents(normalizedEntries);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const sessionsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSessions');

    const material = { countSessionId, expectedVersion, entries: normalizedEntries, totalCents };
    const payloadHash = hashPayload(material);
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'count_first_count_save',
      idempotencyKey,
    );

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const sessionRef = sessionsRef.doc(countSessionId);
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const session = sessionDoc.data() || {};
        if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_SESSION_NOT_FOUND');
        }
        if (session.status !== 'counting_a') throw new Error('COUNT_INVALID_STATE');
        if (Number(session.version) !== expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');

        const nextVersion = expectedVersion + 1;
        transaction.update(sessionRef, {
          countA: {
            entries: normalizedEntries,
            totalCents,
            countedByUid: uid,
            enteredByUid: uid,
            savedAt: FieldValue.serverTimestamp(),
          },
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
          action: 'count.first_count_saved',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            versionBefore: expectedVersion,
            versionAfter: nextVersion,
            entryTypes: normalizedEntries.map((entry) => entry.type),
            totalCents,
            status: 'counting_a',
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          countSessionId,
          version: nextVersion,
          status: 'counting_a',
          totalCents,
          entries: normalizedEntries,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count First Count Save Error:', error);
    const message = String(error?.message || '');
    if (message.startsWith('COUNT_')) {
      const status = message === 'COUNT_VERSION_CONFLICT' ? 409 : message === 'COUNT_SESSION_NOT_FOUND' ? 404 : 400;
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
