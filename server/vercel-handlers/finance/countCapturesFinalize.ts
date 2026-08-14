import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  COUNT_CAPTURE_NORMALIZED_MAX_BYTES,
  COUNT_CAPTURE_ORIGINAL_MAX_BYTES,
  buildUnresolvedCountCaptureCandidates,
  isCountCaptureMaterialHidden,
  isSupportedCountCaptureNormalizedType,
  isSupportedCountCaptureOriginalType,
  isValidCountCaptureId,
  validateCountCaptureNormalization,
} from '../../../shared/finance/countCapture.js';
import { generateCountCaptureAuditId, resolveCanonicalCountPaperForm } from './countCaptureHelpers.js';
import { getCountCaptureStorageAdapter } from './countCaptureStorage.js';

function assertCaptureStageStillOpen(stage: 'count_a' | 'count_b', status: string) {
  if (isCountCaptureMaterialHidden(stage, status as any)) throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');
  if (stage === 'count_a' && status !== 'counting_a') throw new Error('COUNT_CAPTURE_INVALID_STAGE_STATE');
  if (stage === 'count_b' && status !== 'counting_b') throw new Error('COUNT_CAPTURE_INVALID_STAGE_STATE');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, captureId, expectedVersion, normalization, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isValidCountCaptureId(captureId) || expectedVersion !== 1 || !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    const normalizedGeometry = validateCountCaptureNormalization(normalization);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const captureRef = entityRef.collection('countCaptures').doc(captureId);
    const captureSnapshot = await captureRef.get();
    if (!captureSnapshot.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const capture = captureSnapshot.data() || {};
    if (capture.organizationId !== organizationId || capture.financeEntityId !== financeEntityId) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (capture.status !== 'awaiting_upload' || capture.version !== expectedVersion) return res.status(409).json({ error: 'COUNT_CAPTURE_VERSION_CONFLICT' });

    const canonical = await resolveCanonicalCountPaperForm({ db, organizationId, financeEntityId, formId: capture.formId });
    if (canonical.form.countSessionId !== capture.countSessionId || canonical.form.stage !== capture.stage || canonical.form.checksum !== capture.checksum) throw new Error('COUNT_CAPTURE_FORM_INTEGRITY_FAILED');
    assertCaptureStageStillOpen(canonical.form.stage, String(canonical.session.status || ''));

    const storage = getCountCaptureStorageAdapter();
    const [original, normalized] = await Promise.all([
      storage.inspectAndHash(String(capture.original?.path || '')),
      storage.inspectAndHash(String(capture.normalized?.path || '')),
    ]);
    if (!isSupportedCountCaptureOriginalType(original.contentType) || original.size > COUNT_CAPTURE_ORIGINAL_MAX_BYTES || original.contentType !== capture.original?.declaredContentType || original.size !== capture.original?.declaredSize || original.sha256 !== capture.original?.declaredSha256) throw new Error('COUNT_CAPTURE_ORIGINAL_MISMATCH');
    if (!isSupportedCountCaptureNormalizedType(normalized.contentType) || normalized.size > COUNT_CAPTURE_NORMALIZED_MAX_BYTES || normalized.contentType !== capture.normalized?.declaredContentType || normalized.size !== capture.normalized?.declaredSize || normalized.sha256 !== capture.normalized?.declaredSha256) throw new Error('COUNT_CAPTURE_NORMALIZED_MISMATCH');

    const payloadHash = hashPayload({ captureId, expectedVersion, originalSha256: original.sha256, normalizedSha256: normalized.sha256, normalization: normalizedGeometry });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_capture_finalize', idempotencyKey);
    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (transaction) => {
      const liveCaptureDoc = await transaction.get(captureRef);
      const liveSessionDoc = await transaction.get(canonical.sessionRef);
      if (!liveCaptureDoc.exists || !liveSessionDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const liveCapture = liveCaptureDoc.data() || {};
      if (liveCapture.status !== 'awaiting_upload' || liveCapture.version !== expectedVersion) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      if (liveCapture.original?.declaredSha256 !== original.sha256 || liveCapture.normalized?.declaredSha256 !== normalized.sha256) throw new Error('COUNT_CAPTURE_UPLOAD_CHANGED');
      assertCaptureStageStillOpen(canonical.form.stage, String(liveSessionDoc.data()?.status || ''));

      const hashRef = entityRef.collection('countCaptureHashes').doc(original.sha256);
      const hashDoc = await transaction.get(hashRef);
      const existingCaptureId = hashDoc.exists ? String(hashDoc.data()?.captureId || '') : '';
      const auditId = generateCountCaptureAuditId();
      const verifiedOriginal = { ...liveCapture.original, contentType: original.contentType, size: original.size, sha256: original.sha256 };
      const verifiedNormalized = { ...liveCapture.normalized, contentType: normalized.contentType, size: normalized.size, sha256: normalized.sha256 };

      if (existingCaptureId && existingCaptureId !== captureId) {
        transaction.update(captureRef, { status: 'duplicate', duplicateOfCaptureId: existingCaptureId, original: verifiedOriginal, normalized: verifiedNormalized, normalization: normalizedGeometry, version: 2, updatedByUid: uid, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(context.repository.getAuditRef().doc(auditId), { eventId: auditId, organizationId, financeEntityId, actor: uid, resource: 'count_capture', resourceId: captureId, action: 'count.capture_duplicate_detected', requestId, idempotencyKey, afterHash: payloadHash, metadata: { duplicateOfCaptureId: existingCaptureId, originalSha256: original.sha256, materialRedacted: true }, createdAt: FieldValue.serverTimestamp() });
        return { captureId, canonicalCaptureId: existingCaptureId, version: 2, status: 'duplicate' as const, duplicate: true };
      }

      if (!hashDoc.exists) transaction.create(hashRef, { originalSha256: original.sha256, captureId, organizationId, financeEntityId, createdAt: FieldValue.serverTimestamp() });
      transaction.update(captureRef, { status: 'captured', original: verifiedOriginal, normalized: verifiedNormalized, normalization: normalizedGeometry, candidates: buildUnresolvedCountCaptureCandidates(), duplicateOfCaptureId: null, version: 2, updatedByUid: uid, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(context.repository.getAuditRef().doc(auditId), { eventId: auditId, organizationId, financeEntityId, actor: uid, resource: 'count_capture', resourceId: captureId, action: 'count.capture_finalized', requestId, idempotencyKey, afterHash: payloadHash, metadata: { originalSha256: original.sha256, normalizedSha256: normalized.sha256, candidateState: 'unresolved', materialRedacted: true }, createdAt: FieldValue.serverTimestamp() });
      return { captureId, canonicalCaptureId: captureId, version: 2, status: 'captured' as const, duplicate: false };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    console.error('Count Capture Finalize Error:', error);
    const message = String(error?.message || '');
    if (message === 'COUNT_CAPTURE_NOT_FOUND' || message === 'COUNT_CAPTURE_FORM_NOT_FOUND') return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (message.includes('VERSION_CONFLICT') || message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : 'COUNT_CAPTURE_VERSION_CONFLICT' });
    if (message === 'COUNT_CAPTURE_MATERIAL_HIDDEN' || message === 'COUNT_CAPTURE_INVALID_STAGE_STATE') return res.status(409).json({ error: message });
    if (message.startsWith('COUNT_CAPTURE_')) return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
