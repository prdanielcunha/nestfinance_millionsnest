import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  detectUniversalEvidenceMime,
  isUniversalEvidenceSize,
  isSha256,
} from '../../../shared/finance/universalEvidence.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  extractNativePdfText,
  PDF_TEXT_MAX_INPUT_BYTES,
} from './universalEvidencePdfTextExtractor.js';
import { getUniversalEvidenceStorageAdapter } from './universalEvidenceStorage.js';

const validEvidenceId = (value: unknown): value is string =>
  typeof value === 'string' && /^evd_[a-f0-9]{32}$/.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId =
    typeof req.headers['x-vercel-id'] === 'string'
      ? req.headers['x-vercel-id']
      : `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', requestId });
  }

  try {
    const { financeEntityId, evidenceId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim() || !validEvidenceId(evidenceId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', requestId });
    }

    const { db, organizationId } = await resolveFinanceRequestContext(req, 'finance.view');
    const evidenceRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('universalEvidence')
      .doc(evidenceId);

    const snapshot = await evidenceRef.get();
    const data = snapshot.data();
    if (
      !snapshot.exists ||
      data?.organizationId !== organizationId ||
      data?.financeEntityId !== financeEntityId
    ) {
      return res.status(404).json({ error: 'EVIDENCE_NOT_FOUND', requestId });
    }

    if (
      data?.version !== 2 ||
      (data?.processingState !== 'accepted' && data?.processingState !== 'duplicate')
    ) {
      return res.status(409).json({ error: 'EVIDENCE_ANALYSIS_NOT_READY', requestId });
    }

    const verifiedMimeType = data?.verifiedMimeType;
    if (verifiedMimeType !== 'application/pdf') {
      return res.status(415).json({ error: 'EVIDENCE_NOT_PDF', requestId });
    }

    const byteSize = Number(data?.byteSize);
    const original = data?.original && typeof data.original === 'object' ? data.original : null;
    const path = typeof original?.path === 'string' ? original.path : '';
    const verifiedByteSize = Number(original?.verifiedByteSize);
    const verifiedSha256 = original?.verifiedSha256;

    if (
      !isUniversalEvidenceSize(byteSize) ||
      !path ||
      original?.immutable !== true ||
      original?.verifiedMimeType !== verifiedMimeType ||
      verifiedByteSize !== byteSize ||
      !isSha256(verifiedSha256)
    ) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT', requestId });
    }

    if (byteSize > PDF_TEXT_MAX_INPUT_BYTES) {
      return res.status(413).json({ error: 'EVIDENCE_TEXT_EXTRACTION_TOO_LARGE', requestId });
    }

    const stored = await getUniversalEvidenceStorageAdapter().readPreview(path);
    if (stored.size !== byteSize || stored.sha256 !== verifiedSha256) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT', requestId });
    }
    if (stored.contentType !== verifiedMimeType) {
      return res.status(415).json({ error: 'EVIDENCE_UNSUPPORTED', requestId });
    }
    const detectedMime = detectUniversalEvidenceMime(stored.bytes.subarray(0, 65536));
    if (detectedMime !== 'application/pdf') {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT', requestId });
    }

    const extraction = await extractNativePdfText(stored.bytes);
    return res.status(200).json({
      extraction: {
        evidenceId,
        deterministic: true,
        aiUsed: false,
        ocrUsed: false,
        financialRecognition: false,
        ...extraction,
      },
      requestId,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED', requestId });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN', requestId });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND' || message === 'EVIDENCE_NOT_FOUND') {
      return res.status(404).json({ error: message, requestId });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE' || message === 'EVIDENCE_ANALYSIS_NOT_READY') {
      return res.status(409).json({ error: message, requestId });
    }
    if (message === 'EVIDENCE_TOO_LARGE') {
      return res.status(413).json({ error: message, requestId });
    }
    if (message === 'EVIDENCE_UNSUPPORTED' || message === 'EVIDENCE_NOT_PDF') {
      return res.status(415).json({ error: message, requestId });
    }
    if (
      message === 'EVIDENCE_UPLOAD_MISSING' ||
      message === 'EVIDENCE_SIZE_MISMATCH' ||
      message === 'EVIDENCE_CORRUPT' ||
      message === 'EVIDENCE_NOT_PDF_BYTES'
    ) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT', requestId });
    }
    if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED', requestId });
    }

    console.error('Universal Evidence PDF Text Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', requestId });
  }
}
