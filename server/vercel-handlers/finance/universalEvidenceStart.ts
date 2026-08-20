import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isSha256, isUniversalEvidenceMime, isUniversalEvidenceSize, isUniversalEvidenceSourceKind } from '../../../shared/finance/universalEvidence.js';
import { cleanFilename, EVIDENCE_UPLOAD_TTL_MS, evidenceObjectPath, generateEvidenceAuditId, generateEvidenceId } from './universalEvidenceHelpers.js';
import { getUniversalEvidenceStorageAdapter } from './universalEvidenceStorage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, originalFilename, declaredMimeType, byteSize, originalSha256, sourceKind, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isUniversalEvidenceMime(declaredMimeType) || !isUniversalEvidenceSize(byteSize) || !isSha256(originalSha256) || !isUniversalEvidenceSourceKind(sourceKind) || !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const filename = cleanFilename(originalFilename);
    const payloadHash = hashPayload({ filename, declaredMimeType, byteSize, originalSha256, sourceKind });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'universal_evidence_start', idempotencyKey);
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (transaction) => {
      const evidenceId = generateEvidenceId();
      const originalPath = evidenceObjectPath({ organizationId, financeEntityId, evidenceId, mime: declaredMimeType });
      transaction.create(entityRef.collection('universalEvidence').doc(evidenceId), {
        evidenceId, captureId: evidenceId, organizationId, financeEntityId, originalFilename: filename,
        declaredMimeType, verifiedMimeType: null, byteSize, originalSha256, sourceKind,
        original: { path: originalPath, declaredMimeType, declaredByteSize: byteSize, declaredSha256: originalSha256, immutable: true },
        processingState: 'awaiting_upload', duplicate: false, duplicateOfEvidenceId: null,
        createdByUid: uid, createdAt: FieldValue.serverTimestamp(), schemaVersion: 1, version: 1,
      });
      const auditId = generateEvidenceAuditId();
      transaction.create(context.repository.getAuditRef().doc(auditId), { eventId: auditId, organizationId, financeEntityId, actor: uid, resource: 'universal_evidence', resourceId: evidenceId, action: 'evidence.intake_started', requestId, idempotencyKey, afterHash: payloadHash, metadata: { sourceKind, declaredMimeType, byteSize, financialRecognition: false }, createdAt: FieldValue.serverTimestamp() });
      return { evidenceId, originalPath, version: 1, processingState: 'awaiting_upload' as const };
    });
    const upload = await getUniversalEvidenceStorageAdapter().createUploadUrl(result.originalPath, declaredMimeType, EVIDENCE_UPLOAD_TTL_MS);
    return res.status(200).json({ evidenceId: result.evidenceId, captureId: result.evidenceId, version: result.version, processingState: result.processingState, upload: { ...upload, contentType: declaredMimeType }, expiresInMs: EVIDENCE_UPLOAD_TTL_MS, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (error.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    console.error('Universal Evidence Start Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
