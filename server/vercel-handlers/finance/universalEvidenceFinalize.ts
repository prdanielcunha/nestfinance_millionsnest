import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { detectUniversalEvidenceMime, inspectImageMetadata, isUniversalEvidenceSize } from '../../../shared/finance/universalEvidence.js';
import { generateEvidenceAuditId } from './universalEvidenceHelpers.js';
import { getUniversalEvidenceStorageAdapter } from './universalEvidenceStorage.js';

const validId = (value: unknown): value is string => typeof value === 'string' && /^evd_[a-f0-9]{32}$/.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId, evidenceId, expectedVersion, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !validId(evidenceId) || expectedVersion !== 1 || !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const evidenceRef = entityRef.collection('universalEvidence').doc(evidenceId);
    const snapshot = await evidenceRef.get();
    if (!snapshot.exists) return res.status(404).json({ error: 'EVIDENCE_NOT_FOUND' });
    const evidence = snapshot.data() || {};
    if (evidence.organizationId !== organizationId || evidence.financeEntityId !== financeEntityId) return res.status(404).json({ error: 'EVIDENCE_NOT_FOUND' });
    if (evidence.version === 2 && (evidence.processingState === 'accepted' || evidence.processingState === 'duplicate')) {
      return res.status(200).json({ evidenceId, captureId: evidenceId, processingState: evidence.processingState, duplicate: evidence.processingState === 'duplicate', version: 2, requestId });
    }
    if (evidence.version !== 1 || evidence.processingState !== 'awaiting_upload') return res.status(409).json({ error: 'EVIDENCE_VERSION_CONFLICT' });
    const stored = await getUniversalEvidenceStorageAdapter().inspectAndHash(String(evidence.original?.path || ''));
    if (!isUniversalEvidenceSize(stored.size) || stored.size !== evidence.byteSize) throw new Error('EVIDENCE_TOO_LARGE_OR_SIZE_MISMATCH');
    if (stored.sha256 !== evidence.originalSha256) throw new Error('EVIDENCE_CORRUPT');
    const verifiedMimeType = detectUniversalEvidenceMime(stored.headerBytes);
    if (!verifiedMimeType || verifiedMimeType !== evidence.declaredMimeType || stored.contentType !== evidence.declaredMimeType) throw new Error('EVIDENCE_UNSUPPORTED');
    const imageMetadata = inspectImageMetadata(stored.headerBytes, verifiedMimeType);
    if (verifiedMimeType.startsWith('image/') && (!imageMetadata || imageMetadata.width <= 0 || imageMetadata.height <= 0)) throw new Error('EVIDENCE_CORRUPT');
    const payloadHash = hashPayload({ evidenceId, expectedVersion, sha256: stored.sha256, verifiedMimeType, imageMetadata });
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'universal_evidence_finalize', idempotencyKey);
    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (transaction) => {
      const live = await transaction.get(evidenceRef);
      if (!live.exists || live.data()?.organizationId !== organizationId || live.data()?.financeEntityId !== financeEntityId) throw new Error('EVIDENCE_NOT_FOUND');
      if (live.data()?.version !== 1 || live.data()?.processingState !== 'awaiting_upload') throw new Error('EVIDENCE_VERSION_CONFLICT');
      const hashRef = entityRef.collection('universalEvidenceHashes').doc(stored.sha256);
      const hashDoc = await transaction.get(hashRef);
      const canonicalId = hashDoc.exists ? String(hashDoc.data()?.evidenceId || '') : evidenceId;
      const duplicate = Boolean(hashDoc.exists && canonicalId !== evidenceId);
      transaction.update(evidenceRef, {
        verifiedMimeType, byteSize: stored.size, originalSha256: stored.sha256, imageMetadata,
        original: { ...live.data()?.original, verifiedMimeType, verifiedByteSize: stored.size, verifiedSha256: stored.sha256, imageMetadata },
        processingState: duplicate ? 'duplicate' : 'accepted', duplicate, duplicateOfEvidenceId: duplicate ? canonicalId : null,
        validatedByUid: uid, validatedAt: FieldValue.serverTimestamp(), version: 2,
      });
      if (!hashDoc.exists) transaction.create(hashRef, { evidenceId, originalSha256: stored.sha256, organizationId, financeEntityId, createdAt: FieldValue.serverTimestamp() });
      const auditId = generateEvidenceAuditId();
      transaction.create(context.repository.getAuditRef().doc(auditId), { eventId: auditId, organizationId, financeEntityId, actor: uid, resource: 'universal_evidence', resourceId: evidenceId, action: duplicate ? 'evidence.duplicate_detected' : 'evidence.accepted', requestId, idempotencyKey, afterHash: payloadHash, metadata: { verifiedMimeType, byteSize: stored.size, originalSha256: stored.sha256, duplicate, financialRecognition: false }, createdAt: FieldValue.serverTimestamp() });
      return { evidenceId, captureId: evidenceId, processingState: duplicate ? 'duplicate' as const : 'accepted' as const, duplicate, version: 2 };
    });
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'EVIDENCE_NOT_FOUND') return res.status(404).json({ error: message });
    if (message.includes('VERSION_CONFLICT') || message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : 'EVIDENCE_VERSION_CONFLICT' });
    if (message === 'EVIDENCE_UNSUPPORTED') return res.status(415).json({ error: message });
    if (message === 'EVIDENCE_TOO_LARGE_OR_SIZE_MISMATCH') return res.status(413).json({ error: 'EVIDENCE_TOO_LARGE' });
    if (message === 'EVIDENCE_CORRUPT' || message === 'EVIDENCE_UPLOAD_MISSING') return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    console.error('Universal Evidence Finalize Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
