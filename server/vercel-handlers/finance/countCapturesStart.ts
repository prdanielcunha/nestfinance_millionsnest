import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  COUNT_CAPTURE_ORIGINAL_MAX_BYTES,
  COUNT_CAPTURE_NORMALIZED_MAX_BYTES,
  COUNT_CAPTURE_UPLOAD_TTL_MS,
  isSupportedCountCaptureNormalizedType,
  isSupportedCountCaptureOriginalType,
  isValidCaptureByteSize,
  isValidCountCaptureSha256,
} from '../../../shared/finance/countCapture.js';
import { buildCountCaptureObjectPaths, generateCountCaptureAuditId, generateCountCaptureId, resolveCanonicalCountPaperForm } from './countCaptureHelpers.js';
import { getCountCaptureStorageAdapter } from './countCaptureStorage.js';

function assertStageCanCapture(stage: 'count_a' | 'count_b', session: any, organizationId: string, financeEntityId: string) {
  if (!session || session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) throw new Error('COUNT_CAPTURE_FORM_NOT_FOUND');
  const status = String(session.status || '');
  if (stage === 'count_a' && status !== 'counting_a') throw new Error('COUNT_CAPTURE_INVALID_STAGE_STATE');
  if (stage === 'count_b' && status !== 'counting_b') throw new Error('COUNT_CAPTURE_INVALID_STAGE_STATE');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, formId, qrPayload, originalContentType, originalSize, originalSha256, normalizedContentType, normalizedSize, normalizedSha256, idempotencyKey, requestId } = req.body || {};
    if (
      typeof financeEntityId !== 'string' ||
      !isSupportedCountCaptureOriginalType(originalContentType) ||
      !isSupportedCountCaptureNormalizedType(normalizedContentType) ||
      !isValidCaptureByteSize(originalSize, COUNT_CAPTURE_ORIGINAL_MAX_BYTES) ||
      !isValidCaptureByteSize(normalizedSize, COUNT_CAPTURE_NORMALIZED_MAX_BYTES) ||
      !isValidCountCaptureSha256(originalSha256) ||
      !isValidCountCaptureSha256(normalizedSha256) ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId) ||
      (typeof qrPayload !== 'string' && typeof formId !== 'string')
    ) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const canonical = await resolveCanonicalCountPaperForm({ db, organizationId, financeEntityId, formId, qrPayload });
    assertStageCanCapture(canonical.form.stage, canonical.session, organizationId, financeEntityId);

    const payloadHash = hashPayload({ formId: canonical.form.id, templateVersion: canonical.form.templateVersion, checksum: canonical.form.checksum, originalContentType, originalSize, originalSha256, normalizedContentType, normalizedSize, normalizedSha256 });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_capture_start', idempotencyKey);
    const capturesRef = canonical.entityRef.collection('countCaptures');

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (transaction) => {
      const liveSessionDoc = await transaction.get(canonical.sessionRef);
      if (!liveSessionDoc.exists) throw new Error('COUNT_CAPTURE_FORM_NOT_FOUND');
      assertStageCanCapture(canonical.form.stage, liveSessionDoc.data(), organizationId, financeEntityId);

      const captureId = generateCountCaptureId();
      const paths = buildCountCaptureObjectPaths({ organizationId, financeEntityId, captureId, originalContentType, normalizedContentType });
      const auditId = generateCountCaptureAuditId();
      transaction.set(capturesRef.doc(captureId), {
        id: captureId, organizationId, financeEntityId, formId: canonical.form.id, countSessionId: canonical.form.countSessionId,
        stage: canonical.form.stage, locale: canonical.form.locale, templateVersion: canonical.form.templateVersion, checksum: canonical.form.checksum,
        status: 'awaiting_upload',
        original: { path: paths.originalPath, declaredContentType: originalContentType, declaredSize: originalSize, declaredSha256: originalSha256 },
        normalized: { path: paths.normalizedPath, declaredContentType: normalizedContentType, declaredSize: normalizedSize, declaredSha256: normalizedSha256 },
        createdByUid: uid, version: 1, schemaVersion: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(context.repository.getAuditRef().doc(auditId), {
        eventId: auditId, organizationId, financeEntityId, actor: uid, resource: 'count_capture', resourceId: captureId,
        action: 'count.capture_started', requestId, idempotencyKey, afterHash: payloadHash,
        metadata: { formId: canonical.form.id, stage: canonical.form.stage, templateVersion: canonical.form.templateVersion, financialMaterialEmbedded: false },
        createdAt: FieldValue.serverTimestamp(),
      });
      return { captureId, version: 1, status: 'awaiting_upload' as const, originalPath: paths.originalPath, normalizedPath: paths.normalizedPath };
    });

    const storage = getCountCaptureStorageAdapter();
    const [originalUpload, normalizedUpload] = await Promise.all([
      storage.createUploadUrl(result.originalPath, originalContentType, COUNT_CAPTURE_UPLOAD_TTL_MS),
      storage.createUploadUrl(result.normalizedPath, normalizedContentType, COUNT_CAPTURE_UPLOAD_TTL_MS),
    ]);
    return res.status(200).json({ captureId: result.captureId, version: result.version, status: result.status, originalUpload: { ...originalUpload, contentType: originalContentType }, normalizedUpload: { ...normalizedUpload, contentType: normalizedContentType }, expiresInMs: COUNT_CAPTURE_UPLOAD_TTL_MS, requestId });
  } catch (error: any) {
    console.error('Count Capture Start Error:', error);
    const message = String(error?.message || '');
    if (message === 'COUNT_CAPTURE_FORM_NOT_FOUND' || message === 'COUNT_SESSION_NOT_FOUND') return res.status(404).json({ error: 'COUNT_CAPTURE_FORM_NOT_FOUND' });
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    if (message.startsWith('COUNT_CAPTURE_') || message.startsWith('COUNT_PAPER_')) return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error.code)) return res.status(401).json({ error: 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
