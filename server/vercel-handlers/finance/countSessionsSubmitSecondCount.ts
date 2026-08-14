import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  calculateCountEntriesTotalCents,
  compareCountEntries,
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
    if (normalizedEntries.length === 0) return res.status(400).json({ error: 'COUNT_EMPTY_SECOND_COUNT' });
    const totalCents = calculateCountEntriesTotalCents(normalizedEntries);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const sessionRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSessions')
      .doc(countSessionId);

    const material = { countSessionId, expectedVersion, entries: normalizedEntries, totalCents };
    const payloadHash = hashPayload(material);
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'count_second_count_submit',
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
        if (session.status !== 'counting_b') throw new Error('COUNT_INVALID_STATE');
        if (Number(session.version) !== expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');
        if (!Array.isArray(session.countA?.entries) || session.countA.entries.length === 0) {
          throw new Error('COUNT_FIRST_COUNT_REQUIRED');
        }

        const comparison = compareCountEntries(session.countA.entries, normalizedEntries);
        const nextStatus = comparison.matched ? 'matched' : 'divergent';
        const nextVersion = expectedVersion + 1;

        transaction.update(sessionRef, {
          status: nextStatus,
          countB: {
            entries: normalizedEntries,
            totalCents,
            countedByUid: uid,
            enteredByUid: uid,
            sealedAt: FieldValue.serverTimestamp(),
          },
          comparison: {
            ...comparison,
            resolvedBy: comparison.matched ? 'direct_match' : null,
            sealedAt: FieldValue.serverTimestamp(),
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
          action: 'count.second_count_sealed',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            versionBefore: expectedVersion,
            versionAfter: nextVersion,
            status: nextStatus,
            matched: comparison.matched,
            materialRedacted: true,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        // Material stays only on the Count session. The idempotency result is
        // deliberately redacted so a retry cannot reveal A/B values during a
        // later blind recount.
        return {
          countSessionId,
          version: nextVersion,
          status: nextStatus,
          matched: comparison.matched,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count Second Count Submit Error:', error);
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
