import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { buildCountV3TreasuryReviewPacket } from '../../../shared/finance/countV3TreasuryReview.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { assertCountV3Enabled, assertV3Session, sendCountV3Error, v3IsValidSessionId } from './countVerificationV3Common.js';

/**
 * Human review acceptance, not an accounting post or draft creation.
 *
 * Count-only operators cannot approve themselves: the canonical Hub session
 * must grant finance.review. Old unknown-purpose PIX is refused rather than
 * silently classified. For a one-person quorum, justification is mandatory.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, countSessionId, expectedVersion, note, idempotencyKey, requestId } = req.body || {};
    const normalizedNote = typeof note === 'string' ? note.trim() : '';
    if (typeof financeEntityId !== 'string' || !financeEntityId ||
        !v3IsValidSessionId(countSessionId) ||
        !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
        normalizedNote.length > 500 || (note !== undefined && typeof note !== 'string') ||
        !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'COUNT_REVIEW_INVALID_PARAMETERS' });
    }
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.review');
    const sessionRef = db.collection('organizations').doc(organizationId)
      .collection('financeEntities').doc(financeEntityId)
      .collection('countVerificationSessions').doc(countSessionId);
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_v3_accept_treasury', idempotencyKey);
    const payloadHash = hashPayload({ countSessionId, expectedVersion, note: normalizedNote });
    const result = await executeWithIdempotency(
      db, context.repository.getIdempotencyRef(), keyHash, payloadHash,
      async transaction => {
        const doc = await transaction.get(sessionRef);
        if (!doc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const session = doc.data() || {};
        assertV3Session(session, organizationId, financeEntityId);
        if (Number(session.version) !== expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');
        if (session.treasuryReview?.status === 'accepted') throw new Error('COUNT_REVIEW_ALREADY_ACCEPTED');
        const preview = buildCountV3TreasuryReviewPacket(session);
        if (preview.requiresPurposeClassification) {
          throw new Error('COUNT_REVIEW_PURPOSE_CLASSIFICATION_REQUIRED');
        }
        if (preview.requiresExplicitTreasuryReview && normalizedNote.length < 10) {
          throw new Error('COUNT_REVIEW_JUSTIFICATION_REQUIRED');
        }
        const nextVersion = expectedVersion + 1;
        // This is a signed-by-authenticated-human review acknowledgement only;
        // it does NOT create a ledger draft, transaction, account or balance.
        transaction.update(sessionRef, {
          treasuryReview: {
            status: 'accepted',
            sourceVersion: expectedVersion,
            sourceEvaluationStatus: preview.status,
            countTotalCents: preview.countedTotalCents,
            reviewJustification: normalizedNote || null,
            reviewedByUid: uid,
            reviewedAt: FieldValue.serverTimestamp(),
            schemaVersion: 1,
          },
          workflowState: 'reviewed_for_draft',
          version: nextVersion,
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: uid,
        });
        const auditId = generateAuditId();
        const auditRef = context.repository.getAuditRef().doc(auditId);
        stageCanonicalAuditRecord(transaction, db, auditRef, {
          eventId: auditId, organizationId, financeEntityId, actor: uid,
          resource: 'count_verification_session', resourceId: countSessionId,
          action: 'count.v3_treasury_review_accepted',
          requestId, idempotencyKey, afterHash: payloadHash,
          metadata: {
            status: 'accepted', versionBefore: expectedVersion, versionAfter: nextVersion,
            sourceEvaluationStatus: preview.status,
            sourceVersion: expectedVersion,
            independentConfirmed: preview.independentConfirmed,
            purposeClassified: true, noteStoredInPrivateSession: !!normalizedNote,
            financialMutation: false,
          },
          createdAt: FieldValue.serverTimestamp(),
        });
        stageFinanceFact(transaction, db, {
          organizationId, eventType: 'COUNT_UPDATED',
          entityType: 'count_verification_session', entityId: countSessionId,
          actorUserId: uid, correlationId: requestId,
          payload: {
            financeEntityId, stage: 'treasury_review_accepted',
            version: nextVersion, sourceVersion: expectedVersion,
            reviewAccepted: true, balanceMutation: false,
          },
          sourceRefs: [
            {kind:'record',ref:sessionRef.path,version:nextVersion},
            {kind:'audit',ref:auditRef.path},
          ],
        });
        return {
          countSessionId, version: nextVersion,
          reviewStatus: 'accepted' as const,
          sourceVersion: expectedVersion,
          financialMutation: false as const,
        };
      },
    );
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (['COUNT_REVIEW_ALREADY_ACCEPTED', 'COUNT_REVIEW_PURPOSE_CLASSIFICATION_REQUIRED',
      'COUNT_REVIEW_NOT_READY', 'COUNT_REVIEW_STATUS_MISMATCH', 'COUNT_REVIEW_TOTAL_MISMATCH'].includes(message)) {
      return res.status(409).json({ error: message });
    }
    sendCountV3Error(res, error);
  }
}
