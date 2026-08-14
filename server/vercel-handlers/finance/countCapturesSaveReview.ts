import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  isCountCaptureMaterialHidden,
  isValidCountCaptureId,
  validateCountCaptureReviewFields,
  type CountCaptureCandidateField,
  type CountCaptureReviewedField,
} from '../../../shared/finance/countCapture.js';
import { generateCountCaptureAuditId, resolveCanonicalCountPaperForm } from './countCaptureHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, captureId, expectedVersion, fields, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isValidCountCaptureId(captureId) || typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 2 || !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const reviewInput = validateCountCaptureReviewFields(fields);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const captureRef = entityRef.collection('countCaptures').doc(captureId);
    const captureDoc = await captureRef.get();
    if (!captureDoc.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const capture = captureDoc.data() || {};
    if (capture.organizationId !== organizationId || capture.financeEntityId !== financeEntityId) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (!['captured', 'reviewed'].includes(capture.status) || capture.version !== expectedVersion) return res.status(409).json({ error: 'COUNT_CAPTURE_VERSION_CONFLICT' });

    const canonical = await resolveCanonicalCountPaperForm({ db, organizationId, financeEntityId, formId: capture.formId });
    if (canonical.form.countSessionId !== capture.countSessionId || canonical.form.stage !== capture.stage || canonical.form.checksum !== capture.checksum) throw new Error('COUNT_CAPTURE_FORM_INTEGRITY_FAILED');
    if (isCountCaptureMaterialHidden(canonical.form.stage, canonical.session.status)) return res.status(409).json({ error: 'COUNT_CAPTURE_MATERIAL_HIDDEN' });

    const candidates = Array.isArray(capture.candidates) ? (capture.candidates as CountCaptureCandidateField[]) : [];
    const reviewedFields: CountCaptureReviewedField[] = reviewInput.map((input) => {
      const candidate = candidates.find((item) => item.key === input.key) || null;
      const candidateValueCents = candidate?.valueCents ?? null;
      const candidateState = candidate?.state || 'unresolved';
      if (input.decision === 'confirmed' && (candidateState === 'unresolved' || candidateValueCents === null || input.valueCents !== candidateValueCents)) {
        throw new Error('COUNT_CAPTURE_INVALID_REVIEW');
      }
      return {
        key: input.key,
        decision: input.decision,
        valueCents: input.decision === 'confirmed' ? candidateValueCents : input.valueCents,
        candidateValueCents,
        candidateState,
      };
    });

    const payloadHash = hashPayload({ captureId, expectedVersion, fields: reviewedFields });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_capture_review_save', idempotencyKey);
    const nextVersion = expectedVersion + 1;

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (transaction) => {
      const liveDoc = await transaction.get(captureRef);
      const liveSessionDoc = await transaction.get(canonical.sessionRef);
      if (!liveDoc.exists || !liveSessionDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const live = liveDoc.data() || {};
      if (!['captured', 'reviewed'].includes(live.status) || live.version !== expectedVersion) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      if (isCountCaptureMaterialHidden(canonical.form.stage, liveSessionDoc.data()?.status)) throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');

      const liveCandidates = Array.isArray(live.candidates) ? (live.candidates as CountCaptureCandidateField[]) : [];
      // Candidate fields are immutable evidence for this review version. Fail closed
      // if they changed between the preflight read and transactional save.
      if (hashPayload(liveCandidates) !== hashPayload(candidates)) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');

      const auditId = generateCountCaptureAuditId();
      transaction.update(captureRef, {
        status: 'reviewed',
        review: { fields: reviewedFields, reviewedByUid: uid, reviewedAt: FieldValue.serverTimestamp() },
        version: nextVersion,
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(context.repository.getAuditRef().doc(auditId), {
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'count_capture',
        resourceId: captureId,
        action: 'count.capture_review_saved',
        requestId,
        idempotencyKey,
        afterHash: payloadHash,
        metadata: { decisions: reviewedFields.map((field) => ({ key: field.key, decision: field.decision })), materialRedacted: true },
        createdAt: FieldValue.serverTimestamp(),
      });
      return { captureId, version: nextVersion, status: 'reviewed' as const };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count Capture Review Save Error:', error);
    const message = String(error?.message || '');
    if (message === 'COUNT_CAPTURE_NOT_FOUND') return res.status(404).json({ error: message });
    if (message.includes('VERSION_CONFLICT') || message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : 'COUNT_CAPTURE_VERSION_CONFLICT' });
    if (message === 'COUNT_CAPTURE_MATERIAL_HIDDEN') return res.status(409).json({ error: message });
    if (message.startsWith('COUNT_CAPTURE_')) return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
