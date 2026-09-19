import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  COUNT_CAPTURE_NORMALIZED_MAX_BYTES,
  COUNT_CAPTURE_ORIGINAL_MAX_BYTES,
  buildUnresolvedCountCaptureCandidates,
  isSupportedCountCaptureNormalizedType,
  isSupportedCountCaptureOriginalType,
  isValidCountCaptureId,
  validateCountCaptureNormalization,
} from '../../../shared/finance/countCapture.js';
import { generateCountCaptureAuditId } from './countCaptureHelpers.js';
import { resolveCountCaptureContext } from './countCaptureContext.js';
import { getCountCaptureStorageAdapter } from './countCaptureStorage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, captureId, expectedVersion, normalization, idempotencyKey, requestId } = req.body || {};
    if (
      typeof financeEntityId !== 'string' ||
      !isValidCountCaptureId(captureId) ||
      expectedVersion !== 1 ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const normalizedGeometry = validateCountCaptureNormalization(normalization);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const captureRef = entityRef.collection('countCaptures').doc(captureId);
    const captureDoc = await captureRef.get();
    if (!captureDoc.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const capture = captureDoc.data() || {};
    if (
      capture.organizationId !== organizationId ||
      capture.financeEntityId !== financeEntityId ||
      capture.provenance !== 'free_form_note'
    ) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (capture.status !== 'awaiting_upload' || Number(capture.version) !== 1) {
      return res.status(409).json({ error: 'COUNT_CAPTURE_VERSION_CONFLICT' });
    }

    const resolved = await resolveCountCaptureContext({ db, organizationId, financeEntityId, capture });
    const storage = getCountCaptureStorageAdapter();
    const [original, normalized] = await Promise.all([
      storage.inspectAndHash(String(capture.original?.path || '')),
      storage.inspectAndHash(String(capture.normalized?.path || '')),
    ]);
    if (
      !isSupportedCountCaptureOriginalType(original.contentType) ||
      original.size > COUNT_CAPTURE_ORIGINAL_MAX_BYTES ||
      original.contentType !== capture.original?.declaredContentType ||
      original.size !== capture.original?.declaredSize ||
      original.sha256 !== capture.original?.declaredSha256
    ) throw new Error('COUNT_CAPTURE_ORIGINAL_MISMATCH');
    if (
      !isSupportedCountCaptureNormalizedType(normalized.contentType) ||
      normalized.size > COUNT_CAPTURE_NORMALIZED_MAX_BYTES ||
      normalized.contentType !== capture.normalized?.declaredContentType ||
      normalized.size !== capture.normalized?.declaredSize ||
      normalized.sha256 !== capture.normalized?.declaredSha256
    ) throw new Error('COUNT_CAPTURE_NORMALIZED_MISMATCH');

    const payloadHash = hashPayload({
      captureId,
      expectedVersion,
      originalSha256: original.sha256,
      normalizedSha256: normalized.sha256,
      normalization: normalizedGeometry,
      provenance: 'free_form_note',
    });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_free_form_capture_finalize', idempotencyKey);

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const [liveCaptureDoc, liveSessionDoc] = await Promise.all([
          transaction.get(captureRef),
          transaction.get(resolved.sessionRef),
        ]);
        if (!liveCaptureDoc.exists || !liveSessionDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
        const live = liveCaptureDoc.data() || {};
        const session = liveSessionDoc.data() || {};
        if (
          live.provenance !== 'free_form_note' ||
          live.status !== 'awaiting_upload' ||
          Number(live.version) !== 1 ||
          live.original?.declaredSha256 !== original.sha256 ||
          live.normalized?.declaredSha256 !== normalized.sha256
        ) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
        if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_SESSION_NOT_FOUND');
        }

        const hashRef = entityRef.collection('countCaptureHashes').doc(original.sha256);
        const hashDoc = await transaction.get(hashRef);
        const existingCaptureId = hashDoc.exists ? String(hashDoc.data()?.captureId || '') : '';
        const verifiedOriginal = { ...live.original, contentType: original.contentType, size: original.size, sha256: original.sha256 };
        const verifiedNormalized = { ...live.normalized, contentType: normalized.contentType, size: normalized.size, sha256: normalized.sha256 };
        const auditId = generateCountCaptureAuditId();

        if (existingCaptureId && existingCaptureId !== captureId) {
          transaction.update(captureRef, {
            status: 'duplicate',
            duplicateOfCaptureId: existingCaptureId,
            original: verifiedOriginal,
            normalized: verifiedNormalized,
            normalization: normalizedGeometry,
            version: 2,
            updatedByUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.create(context.repository.getAuditRef().doc(auditId), {
            eventId: auditId,
            organizationId,
            financeEntityId,
            actor: uid,
            resource: 'count_capture',
            resourceId: captureId,
            action: 'count.free_form_capture_duplicate_detected',
            requestId,
            idempotencyKey,
            afterHash: payloadHash,
            metadata: { duplicateOfCaptureId: existingCaptureId, provenance: 'free_form_note', materialRedacted: true },
            createdAt: FieldValue.serverTimestamp(),
          });
          return { captureId, canonicalCaptureId: existingCaptureId, version: 2, status: 'duplicate' as const, duplicate: true };
        }

        if (!hashDoc.exists) {
          transaction.create(hashRef, {
            originalSha256: original.sha256,
            captureId,
            organizationId,
            financeEntityId,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        const candidates = buildUnresolvedCountCaptureCandidates().map((field) => ({ ...field, region: null }));
        transaction.update(captureRef, {
          status: 'captured',
          original: verifiedOriginal,
          normalized: verifiedNormalized,
          normalization: normalizedGeometry,
          candidates,
          denominationCandidates: [],
          duplicateOfCaptureId: null,
          version: 2,
          updatedByUid: uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(context.repository.getAuditRef().doc(auditId), {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'count_capture',
          resourceId: captureId,
          action: 'count.free_form_capture_finalized',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            countSessionId: resolved.identity.countSessionId,
            stage: resolved.identity.stage,
            provenance: 'free_form_note',
            geometryMode: normalizedGeometry.geometry.mode,
            candidateState: 'unresolved',
            denominationInterpretation: false,
            materialRedacted: true,
          },
          createdAt: FieldValue.serverTimestamp(),
        });
        return { captureId, canonicalCaptureId: captureId, version: 2, status: 'captured' as const, duplicate: false };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    console.error('Count Free Form Capture Finalize Error:', message.startsWith('COUNT_') ? message : 'UNEXPECTED_ERROR');
    if (['COUNT_CAPTURE_NOT_FOUND', 'COUNT_SESSION_NOT_FOUND'].includes(message)) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (message.includes('VERSION_CONFLICT') || message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : 'COUNT_CAPTURE_VERSION_CONFLICT' });
    }
    if (message.startsWith('COUNT_CAPTURE_')) return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
