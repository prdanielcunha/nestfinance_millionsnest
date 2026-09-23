import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageFinanceFact } from './factStream.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { generateCountSessionId, validateCountServiceDate, validateCountServiceLabel } from '../../../shared/finance/count.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, serviceLabel, serviceDate, idempotencyKey, requestId } = req.body || {};
    if (!financeEntityId || typeof financeEntityId !== 'string' || !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const normalizedLabel = validateCountServiceLabel(serviceLabel);
    const normalizedDate = validateCountServiceDate(serviceDate);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const sessionsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSessions');

    const payloadForHash = {
      serviceLabel: normalizedLabel,
      serviceDate: normalizedDate,
      policySnapshot: { doubleCountRequired: true, requireIndependentCounter: true, policyVersion: 2, source: 'safe_default_v2' },
    };
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_session_create', idempotencyKey);
    const payloadHash = hashPayload(payloadForHash);

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const sessionId = generateCountSessionId();
        const auditId = `audit_${generateCountSessionId().slice(4)}`;
        const sessionRef = sessionsRef.doc(sessionId);
        const auditRef = context.repository.getAuditRef().doc(auditId);
        transaction.set(sessionRef, {
          id: sessionId,
          organizationId,
          financeEntityId,
          serviceLabel: normalizedLabel,
          serviceDate: normalizedDate,
          status: 'counting_a',
          policySnapshot: {
            doubleCountRequired: true,
            requireIndependentCounter: true,
            policyVersion: 2,
            source: 'safe_default_v2',
            capturedAt: FieldValue.serverTimestamp(),
          },
          countA: { entries: [], totalCents: 0, countedByUid: null, countedByLabel: null, enteredByUid: null, enteredByLabel: null, savedAt: null },
          createdByUid: uid,
          updatedByUid: uid,
          version: 1,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        stageCanonicalAuditRecord(transaction, db, auditRef, {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'count_session',
          resourceId: sessionId,
          action: 'count.session_created',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: { serviceDate: normalizedDate, status: 'counting_a', doubleCountRequired: true, requireIndependentCounter: true },
          createdAt: FieldValue.serverTimestamp(),
        });
        stageFinanceFact(transaction, db, {
          organizationId,
          eventType: 'COUNT_OPENED',
          entityType: 'count_session',
          entityId: sessionId,
          actorUserId: uid,
          correlationId: requestId,
          payload: {
            financeEntityId,
            serviceDate: normalizedDate,
            status: 'counting_a',
            doubleCountRequired: true,
            policyVersion: 2,
          },
          sourceRefs: [
            { kind: 'record', ref: sessionRef.path, version: 1 },
            { kind: 'audit', ref: auditRef.path },
          ],
        });
        return { sessionId, version: 1, status: 'counting_a' };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count Session Create Error:', error);
    const code = String(error?.message || '');
    if (code.startsWith('COUNT_')) return res.status(400).json({ error: code });
    if (code.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error.code)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
