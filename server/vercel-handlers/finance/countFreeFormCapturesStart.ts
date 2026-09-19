import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';
import {
  COUNT_CAPTURE_ORIGINAL_MAX_BYTES,
  COUNT_CAPTURE_NORMALIZED_MAX_BYTES,
  COUNT_CAPTURE_UPLOAD_TTL_MS,
  isSupportedCountCaptureNormalizedType,
  isSupportedCountCaptureOriginalType,
  isValidCaptureByteSize,
  isValidCountCaptureSha256,
} from '../../../shared/finance/countCapture.js';
import { buildCountCaptureObjectPaths, generateCountCaptureAuditId, generateCountCaptureId } from './countCaptureHelpers.js';
import { deriveOpenCountStage } from './countCaptureContext.js';
import { getCountCaptureStorageAdapter } from './countCaptureStorage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const {
      financeEntityId,
      countSessionId,
      locale,
      originalContentType,
      originalSize,
      originalSha256,
      normalizedContentType,
      normalizedSize,
      normalizedSha256,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !isValidCountSessionId(countSessionId) ||
      !['PT', 'EN', 'ES'].includes(locale) ||
      !isSupportedCountCaptureOriginalType(originalContentType) ||
      !isSupportedCountCaptureNormalizedType(normalizedContentType) ||
      !isValidCaptureByteSize(originalSize, COUNT_CAPTURE_ORIGINAL_MAX_BYTES) ||
      !isValidCaptureByteSize(normalizedSize, COUNT_CAPTURE_NORMALIZED_MAX_BYTES) ||
      !isValidCountCaptureSha256(originalSha256) ||
      !isValidCountCaptureSha256(normalizedSha256) ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const sessionRef = entityRef.collection('countSessions').doc(countSessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    const session = sessionDoc.data() || {};
    if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
      return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    }
    const stage = deriveOpenCountStage(String(session.status || ''));

    const payloadHash = hashPayload({
      countSessionId,
      stage,
      locale,
      originalContentType,
      originalSize,
      originalSha256,
      normalizedContentType,
      normalizedSize,
      normalizedSha256,
      provenance: 'free_form_note',
    });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_free_form_capture_start', idempotencyKey);
    const capturesRef = entityRef.collection('countCaptures');

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const liveSessionDoc = await transaction.get(sessionRef);
        if (!liveSessionDoc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const liveSession = liveSessionDoc.data() || {};
        if (liveSession.organizationId !== organizationId || liveSession.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_SESSION_NOT_FOUND');
        }
        const liveStage = deriveOpenCountStage(String(liveSession.status || ''));
        if (liveStage !== stage) throw new Error('COUNT_CAPTURE_INVALID_STAGE_STATE');

        const captureId = generateCountCaptureId();
        const paths = buildCountCaptureObjectPaths({
          organizationId,
          financeEntityId,
          captureId,
          originalContentType,
          normalizedContentType,
        });
        const auditId = generateCountCaptureAuditId();
        transaction.create(capturesRef.doc(captureId), {
          id: captureId,
          organizationId,
          financeEntityId,
          provenance: 'free_form_note',
          formId: null,
          countSessionId,
          stage,
          locale,
          templateVersion: null,
          checksum: null,
          status: 'awaiting_upload',
          original: {
            path: paths.originalPath,
            declaredContentType: originalContentType,
            declaredSize: originalSize,
            declaredSha256: originalSha256,
          },
          normalized: {
            path: paths.normalizedPath,
            declaredContentType: normalizedContentType,
            declaredSize: normalizedSize,
            declaredSha256: normalizedSha256,
          },
          createdByUid: uid,
          version: 1,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(context.repository.getAuditRef().doc(auditId), {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'count_capture',
          resourceId: captureId,
          action: 'count.free_form_capture_started',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            countSessionId,
            stage,
            provenance: 'free_form_note',
            officialPaperIdentity: false,
            financialMaterialEmbedded: false,
          },
          createdAt: FieldValue.serverTimestamp(),
        });
        return {
          captureId,
          version: 1,
          status: 'awaiting_upload' as const,
          originalPath: paths.originalPath,
          normalizedPath: paths.normalizedPath,
        };
      },
    );

    const storage = getCountCaptureStorageAdapter();
    const [originalUpload, normalizedUpload] = await Promise.all([
      storage.createUploadUrl(result.originalPath, originalContentType, COUNT_CAPTURE_UPLOAD_TTL_MS),
      storage.createUploadUrl(result.normalizedPath, normalizedContentType, COUNT_CAPTURE_UPLOAD_TTL_MS),
    ]);
    return res.status(200).json({
      captureId: result.captureId,
      version: result.version,
      status: result.status,
      originalUpload: { ...originalUpload, contentType: originalContentType },
      normalizedUpload: { ...normalizedUpload, contentType: normalizedContentType },
      expiresInMs: COUNT_CAPTURE_UPLOAD_TTL_MS,
      requestId,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    console.error('Count Free Form Capture Start Error:', message.startsWith('COUNT_') ? message : 'UNEXPECTED_ERROR');
    if (message === 'COUNT_SESSION_NOT_FOUND') return res.status(404).json({ error: message });
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    if (message.startsWith('COUNT_CAPTURE_')) return res.status(409).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
