import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';

const validEvidenceId = (value: unknown): value is string =>
  typeof value === 'string' && /^evd_[a-f0-9]{32}$/.test(value);

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function safeImageMetadata(value: any) {
  if (!value || typeof value !== 'object') return null;
  const width = Number(value.width);
  const height = Number(value.height);
  const orientation = Number(value.orientation || 1);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return {
    width,
    height,
    orientation: Number.isInteger(orientation) && orientation >= 1 && orientation <= 8 ? orientation : 1,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId =
    typeof req.headers['x-vercel-id'] === 'string'
      ? req.headers['x-vercel-id']
      : `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

    const verifiedMimeType = typeof data.verifiedMimeType === 'string' ? data.verifiedMimeType : null;
    const declaredMimeType = typeof data.declaredMimeType === 'string' ? data.declaredMimeType : null;
    const byteSize = Number.isFinite(Number(data.byteSize)) ? Number(data.byteSize) : 0;
    const original = data.original && typeof data.original === 'object' ? data.original : {};
    const verifiedByteSize = Number(original.verifiedByteSize);

    return res.status(200).json({
      evidence: {
        evidenceId: snapshot.id,
        originalFilename: typeof data.originalFilename === 'string' ? data.originalFilename : '',
        mimeType: verifiedMimeType || declaredMimeType,
        declaredMimeType,
        verifiedMimeType,
        byteSize,
        sourceKind: typeof data.sourceKind === 'string' ? data.sourceKind : null,
        processingState: typeof data.processingState === 'string' ? data.processingState : 'unknown',
        duplicate: data.duplicate === true,
        imageMetadata: safeImageMetadata(data.imageMetadata),
        createdAt: toIso(data.createdAt),
        validatedAt: toIso(data.validatedAt),
        version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
        verification: {
          immutableOriginal: original.immutable === true,
          mimeVerified: Boolean(verifiedMimeType),
          sizeVerified: Number.isFinite(verifiedByteSize) && verifiedByteSize === byteSize,
          contentHashVerified:
            typeof original.verifiedSha256 === 'string' && /^[a-f0-9]{64}$/.test(original.verifiedSha256),
        },
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
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(409).json({ error: message, requestId });
    }
    if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED', requestId });
    }

    console.error('Universal Evidence Detail Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', requestId });
  }
}
