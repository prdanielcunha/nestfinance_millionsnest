import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { normalizeCountEntries } from '../../../shared/finance/count.js';
import { validateCountV3ReceiptLines } from '../../../shared/finance/countV3PurposeReceipt.js';
import {
  evaluateCountVerifications,
  normalizeCountVerificationPolicy,
  type CountVerificationEvidence,
} from '../../../shared/finance/countVerificationPolicy.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { assertCountV3Enabled, assertV3Session, sendCountV3Error, v3IsParticipant, v3IsValidSessionId } from './countVerificationV3Common.js';

/**
 * Each independent stage is sealed in a Firestore transaction. Multiple
 * authenticated operators may submit concurrently; only their own distinct
 * stage is accepted. No Count v1 rows or ledger balances are mutated here.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, countSessionId, expectedVersion, mode, physicalCounterLabel, entries, lines, controlTotalCents, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId ||
        !v3IsValidSessionId(countSessionId) ||
        !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
        (mode !== 'independent' && mode !== 'assisted') ||
        !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    // This API accepts either a canonical purpose×receipt-method collection
    // or the previous Count v3 draft shape for compatibility, never both.
    if (lines !== undefined && entries !== undefined) {
      return res.status(400).json({ error: 'COUNT_VERIFICATION_MIXED_SCHEMA' });
    }
    const classified = lines !== undefined
      ? validateCountV3ReceiptLines(lines, controlTotalCents ?? null)
      : null;
    const normalizedEntries = classified ? null : normalizeCountEntries(entries);
    if (!classified && !normalizedEntries?.length) {
      return res.status(400).json({ error: 'COUNT_EMPTY_VERIFICATION' });
    }
    if (!classified && controlTotalCents !== undefined) {
      return res.status(400).json({ error: 'COUNT_V3_CONTROL_TOTAL_REQUIRES_CLASSIFIED_LINES' });
    }
    const label = mode === 'assisted'
      ? typeof physicalCounterLabel === 'string' ? physicalCounterLabel.trim() : ''
      : null;
    if (mode === 'assisted' && (!label || label.length > 120)) {
      return res.status(400).json({ error: 'COUNT_INVALID_ASSISTED_LABEL' });
    }

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.count.execute');
    const sessionRef = db.collection('organizations').doc(organizationId)
      .collection('financeEntities').doc(financeEntityId)
      .collection('countVerificationSessions').doc(countSessionId);
    const material = { countSessionId, expectedVersion, mode, physicalCounterLabel: label, lines: classified?.lines ?? null, entries: normalizedEntries, controlTotalCents: classified?.controlTotalCents ?? null };
    const payloadHash = hashPayload(material);
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_v3_submit', idempotencyKey);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async transaction => {
      const doc = await transaction.get(sessionRef);
      if (!doc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
      const session = doc.data() || {};
      assertV3Session(session, organizationId, financeEntityId);
      if (!v3IsParticipant(session, uid)) throw { status: 403, error: 'COUNT_SESSION_NOT_ASSIGNED' };
      if (session.status !== 'pending') throw new Error('COUNT_INVALID_STATE');
      if (Number(session.version) !== expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');

      const policySnapshot = normalizeCountVerificationPolicy(session.policySnapshot);
      const previous: CountVerificationEvidence[] = Array.isArray(session.confirmations) ? session.confirmations : [];
      const verificationId = 'verification_' + randomBytes(12).toString('hex');
      const next: CountVerificationEvidence[] = [...previous, {
        verificationId, mode, operatorUid: uid,
        independentCounterUid: mode === 'independent' ? uid : null,
        physicalCounterLabel: label,
        ...(classified ? { lines: classified.lines, controlTotalCents: classified.controlTotalCents } : { entries: normalizedEntries! }),
      }];
      const evaluation = evaluateCountVerifications(next, policySnapshot);
      const nextVersion = expectedVersion + 1;
      transaction.update(sessionRef, {
        confirmations: next,
        status: evaluation.status,
        evaluation,
        version: nextVersion,
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
        ...(evaluation.status !== 'pending' ? { sealedAt: FieldValue.serverTimestamp() } : {}),
      });
      const auditId = generateAuditId();
      const auditRef = context.repository.getAuditRef().doc(auditId);
      stageCanonicalAuditRecord(transaction, db, auditRef, {
        eventId: auditId, organizationId, financeEntityId, actor: uid,
        resource: 'count_verification_session', resourceId: countSessionId,
        action: 'count.v3_verification_sealed', requestId, idempotencyKey,
        afterHash: payloadHash,
        metadata: {
          versionBefore: expectedVersion, versionAfter: nextVersion,
          status: evaluation.status, mode, independentConfirmed: evaluation.independentConfirmed,
          assistedRecorded: evaluation.assistedRecorded, materialRedacted: true, financialMutation: false,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      stageFinanceFact(transaction, db, {
        organizationId,
        eventType: evaluation.status === 'matched'
          ? 'COUNT_COMPLETED'
          : evaluation.status === 'divergent' ? 'COUNT_DIVERGENCE_FOUND' : 'COUNT_UPDATED',
        entityType: 'count_verification_session',
        entityId: countSessionId, actorUserId: uid, correlationId: requestId,
        payload: {
          financeEntityId, status: evaluation.status, mode, version: nextVersion,
          independentConfirmed: evaluation.independentConfirmed,
          assistedRecorded: evaluation.assistedRecorded, balanceMutation: false,
        },
        sourceRefs: [{ kind: 'record', ref: sessionRef.path, version: nextVersion }, { kind: 'audit', ref: auditRef.path }],
      });
      return {
        countSessionId, version: nextVersion, status: evaluation.status,
        verificationId, independentConfirmed: evaluation.independentConfirmed,
        assistedRecorded: evaluation.assistedRecorded,
      };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    // Preserve the shared atomic period-fence error at this HTTP boundary.
    if (error?.code === 'LEDGER_PERIOD_CLOSED' || String(error?.code || '').startsWith('LEDGER_PERIOD_FENCE_')) return res.status(409).json({ error: error.code });

    sendCountV3Error(res, error);
  }
}
