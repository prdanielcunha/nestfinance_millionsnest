import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isCountCaptureMaterialHidden, isValidCountCaptureId } from '../../../shared/finance/countCapture.js';
import {
  buildUnresolvedCountCaptureDenominationCandidates,
  calculateReviewedDenominationSubtotals,
  parseCountCaptureDenominationCellKey,
  validateCountCaptureDenominationReview,
  type CountCaptureDenominationCandidate,
  type CountCaptureReviewedDenomination,
} from '../../../shared/finance/countCaptureDenominations.js';
import { generateCountCaptureAuditId, resolveCanonicalCountPaperForm } from './countCaptureHelpers.js';

function candidatesForCapture(capture: any): CountCaptureDenominationCandidate[] {
  if (Array.isArray(capture.denominationCandidates) && capture.denominationCandidates.length > 0) return capture.denominationCandidates as CountCaptureDenominationCandidate[];
  const unresolved = buildUnresolvedCountCaptureDenominationCandidates(Number(capture.templateVersion || 1));
  return capture.normalization?.geometry?.mode === 'full_frame' ? unresolved.map((candidate) => ({ ...candidate, region: null })) : unresolved;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, captureId, expectedVersion, denominations, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isValidCountCaptureId(captureId) || !Number.isInteger(expectedVersion) || expectedVersion < 2 || !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    const reviewInput = validateCountCaptureDenominationReview(denominations);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const captureRef = entityRef.collection('countCaptures').doc(captureId);
    const captureDoc = await captureRef.get();
    if (!captureDoc.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const capture = captureDoc.data() || {};
    if (capture.organizationId !== organizationId || capture.financeEntityId !== financeEntityId) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (!['captured', 'reviewed'].includes(String(capture.status)) || Number(capture.version) !== expectedVersion) return res.status(409).json({ error: 'COUNT_CAPTURE_VERSION_CONFLICT' });

    const canonical = await resolveCanonicalCountPaperForm({ db, organizationId, financeEntityId, formId: capture.formId });
    if (canonical.form.countSessionId !== capture.countSessionId || canonical.form.stage !== capture.stage || canonical.form.templateVersion !== capture.templateVersion || canonical.form.checksum !== capture.checksum) throw new Error('COUNT_CAPTURE_FORM_INTEGRITY_FAILED');
    if (isCountCaptureMaterialHidden(canonical.form.stage, canonical.session.status)) return res.status(409).json({ error: 'COUNT_CAPTURE_MATERIAL_HIDDEN' });

    const candidates = candidatesForCapture(capture);
    const reviewed: CountCaptureReviewedDenomination[] = reviewInput.map((input) => {
      const identity = parseCountCaptureDenominationCellKey(input.cellKey);
      const candidate = candidates.find((item) => item.cellKey === input.cellKey) || null;
      if (!identity || !candidate) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REVIEW');
      const candidateQuantity = candidate.quantity ?? null;
      const candidateState = candidate.state || 'unresolved';
      if (input.decision === 'confirmed' && (candidateState !== 'recognized' || candidateQuantity === null || input.quantity !== candidateQuantity)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REVIEW');
      return {
        ...input,
        quantity: input.decision === 'confirmed' ? candidateQuantity : input.quantity,
        candidateQuantity,
        candidateState,
        entryType: identity.entryType,
        denominationCents: identity.denominationCents,
      };
    });
    const subtotalsCents = calculateReviewedDenominationSubtotals(reviewed);
    const payloadHash = hashPayload({ captureId, expectedVersion, denominations: reviewed, subtotalsCents });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_capture_denomination_review_save', idempotencyKey);
    const nextVersion = expectedVersion + 1;

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (transaction) => {
      const [liveDoc, liveSessionDoc] = await Promise.all([transaction.get(captureRef), transaction.get(canonical.sessionRef)]);
      if (!liveDoc.exists || !liveSessionDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const live = liveDoc.data() || {};
      if (!['captured', 'reviewed'].includes(String(live.status)) || Number(live.version) !== expectedVersion) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      if (live.organizationId !== organizationId || live.financeEntityId !== financeEntityId) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      if (isCountCaptureMaterialHidden(canonical.form.stage, liveSessionDoc.data()?.status)) throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');
      const liveCandidates = candidatesForCapture(live);
      if (hashPayload(liveCandidates) !== hashPayload(candidates)) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');

      transaction.update(captureRef, {
        denominationCandidates: liveCandidates,
        denominationReview: { fields: reviewed, subtotalsCents, reviewedByUid: uid, reviewedAt: FieldValue.serverTimestamp() },
        version: nextVersion,
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const auditId = generateCountCaptureAuditId();
      transaction.set(context.repository.getAuditRef().doc(auditId), {
        eventId: auditId, organizationId, financeEntityId, actor: uid, resource: 'count_capture', resourceId: captureId,
        action: 'count.capture_denomination_review_saved', requestId, idempotencyKey, afterHash: payloadHash,
        metadata: {
          decisions: reviewed.map((row) => ({ cellKey: row.cellKey, decision: row.decision })),
          unresolvedSubtotalTypes: Object.entries(subtotalsCents).filter(([, value]) => value === null).map(([type]) => type),
          materialRedacted: true,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      return { captureId, version: nextVersion, status: live.status, denominationReviewSaved: true };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count Capture Denomination Review Save Error:', String(error?.message || '').startsWith('COUNT_') ? error.message : 'UNEXPECTED_ERROR');
    const message = String(error?.message || '');
    if (['COUNT_CAPTURE_NOT_FOUND', 'COUNT_CAPTURE_FORM_NOT_FOUND', 'COUNT_SESSION_NOT_FOUND'].includes(message)) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (message.includes('VERSION_CONFLICT') || message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : 'COUNT_CAPTURE_VERSION_CONFLICT' });
    if (message === 'COUNT_CAPTURE_MATERIAL_HIDDEN') return res.status(409).json({ error: message });
    if (message.startsWith('COUNT_CAPTURE_')) return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
