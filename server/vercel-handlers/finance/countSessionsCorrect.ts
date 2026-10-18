import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';
import { normalizeCorrectionReason, prepareCountCorrection } from '../../../shared/finance/countCorrection.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { stageFinanceSignalRefresh, stageFinanceSignalResolve } from './signalProjection.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, countSessionId, expectedVersion, target, entries, reason,
      idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId || !isValidCountSessionId(countSessionId) ||
      !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !['countA', 'countB'].includes(target) ||
      !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const normalizedReason = normalizeCorrectionReason(reason);
    const { db, uid, actorLabel, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.manage');
    const ref = db.collection('organizations').doc(organizationId).collection('financeEntities')
      .doc(financeEntityId).collection('countSessions').doc(countSessionId);
    const payloadHash = hashPayload({ countSessionId, expectedVersion, target, entries, reason: normalizedReason });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_correct', idempotencyKey);
    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async t => {
      const doc = await t.get(ref);
      const session = doc.data();
      if (!doc.exists || session?.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
        throw new Error('COUNT_SESSION_NOT_FOUND');
      }
      const prepared = prepareCountCorrection(session, { expectedVersion, target, entries, actorUid: uid });
      const changedAt = Timestamp.now(); // Server-owned; client timestamps/actors are never accepted.
      const auditId = generateAuditId();
      const version = expectedVersion + 1;
      const after = { entries: prepared.entries, totalCents: prepared.totalCents,
        enteredByUid: uid, enteredByLabel: actorLabel, countedByUid: uid, countedByLabel: actorLabel,
        source: 'manual_correction', sealedAt: changedAt, savedAt: changedAt };
      const correction = { id: auditId, target, reason: normalizedReason, actorUid: uid, actorLabel, changedAt,
        versionBefore: expectedVersion, versionAfter: version,
        before: session[target], after, statusBefore: session.status, statusAfter: prepared.status };
      t.update(ref, {
        [target]: after, comparison: { ...prepared.comparison, sealedAt: changedAt },
        resolution: FieldValue.delete(), status: prepared.status,
        workflowState: prepared.status === 'matched' ? 'counted' : FieldValue.delete(),
        corrections: [...(session.corrections || []), correction], version,
        updatedByUid: uid, updatedAt: FieldValue.serverTimestamp(),
      });
      const auditRef = context.repository.getAuditRef().doc(auditId);
      stageCanonicalAuditRecord(t, db, auditRef, {
        eventId: auditId, organizationId, financeEntityId, actor: uid, resource: 'count_session',
        resourceId: countSessionId, action: 'count.sealed_corrected', requestId, idempotencyKey,
        beforeHash: hashPayload(session[target]), afterHash: hashPayload(after),
        metadata: { ...correction, comparisonBefore: session.comparison || null,
          resolutionBefore: session.resolution || null, comparisonAfter: prepared.comparison,
          financialMutation: false }, createdAt: changedAt,
      }, 'create');
      const sourceRefs = [{ kind: 'record' as const, ref: ref.path, version }, { kind: 'audit' as const, ref: auditRef.path }];
      const factId = stageFinanceFact(t, db, { organizationId, eventType: 'COUNT_UPDATED', entityType: 'count_session',
        entityId: countSessionId, actorUserId: uid, correlationId: requestId,
        payload: { financeEntityId, version, status: prepared.status, stage: 'sealed_corrected', financialMutation: false }, sourceRefs });
      const signal = { organizationId, financeEntityId, signalType: 'COUNT_DIVERGENCE_REVIEW_REQUIRED' as const,
        entityType: 'count_session', entityId: countSessionId, sourceFactId: factId, sourceRefs };
      if (prepared.comparison.matched) stageFinanceSignalResolve(t, db, signal);
      else stageFinanceSignalRefresh(t, db, signal);
      return { countSessionId, version, status: prepared.status, correctionId: auditId };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.startsWith('COUNT_')) return res.status(message === 'COUNT_SESSION_NOT_FOUND' ? 404 :
      message === 'COUNT_VERSION_CONFLICT' || message === 'COUNT_CORRECTION_LINKED_ADJUSTMENT_REQUIRED' ? 409 : 400).json({ error: message });
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    if (error?.status === 401 || error?.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message === 'FINANCE_ENTITY_NOT_FOUND' || message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error?.code)) return res.status(401).json({ error: 'UNAUTHORIZED' });
    console.error('Count correction failed', error?.code || 'INTERNAL_SERVER_ERROR');
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
