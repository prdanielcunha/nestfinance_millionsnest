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
    const { financeEntityId, cursor, pageSize = 25 } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim()) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', requestId });
    }
    if (cursor !== undefined && cursor !== null && !validEvidenceId(cursor)) {
      return res.status(400).json({ error: 'INVALID_CURSOR', requestId });
    }

    const numericPageSize = Number(pageSize);
    if (!Number.isInteger(numericPageSize) || numericPageSize < 1) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', requestId });
    }
    const limit = Math.min(numericPageSize, 50);

    const { db, organizationId } = await resolveFinanceRequestContext(req, 'finance.view');
    const evidenceRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('universalEvidence');

    let query: any = evidenceRef.orderBy('createdAt', 'desc').limit(limit + 1);

    if (cursor) {
      const cursorDoc = await evidenceRef.doc(cursor).get();
      const cursorData = cursorDoc.data();
      if (
        !cursorDoc.exists ||
        cursorData?.organizationId !== organizationId ||
        cursorData?.financeEntityId !== financeEntityId
      ) {
        return res.status(400).json({ error: 'INVALID_CURSOR', requestId });
      }
      query = query.startAfter(cursorDoc);
    }

    const [snapshot, totalCount, acceptedCount, duplicateCount, awaitingUploadCount] = await Promise.all([
      query.get(),
      evidenceRef.count().get(),
      evidenceRef.where('processingState', '==', 'accepted').count().get(),
      evidenceRef.where('processingState', '==', 'duplicate').count().get(),
      evidenceRef.where('processingState', '==', 'awaiting_upload').count().get(),
    ]);

    const pageDocs = snapshot.docs.slice(0, limit);
    const items = pageDocs.flatMap((doc: any) => {
      const data = doc.data() || {};
      if (data.organizationId !== organizationId || data.financeEntityId !== financeEntityId) {
        console.error(
          `[CRITICAL] Universal Evidence entity mismatch blocked for ${doc.id} (req: ${requestId})`,
        );
        return [];
      }

      return [
        {
          evidenceId: doc.id,
          originalFilename: typeof data.originalFilename === 'string' ? data.originalFilename : '',
          mimeType:
            typeof data.verifiedMimeType === 'string'
              ? data.verifiedMimeType
              : typeof data.declaredMimeType === 'string'
                ? data.declaredMimeType
                : null,
          byteSize: Number.isFinite(Number(data.byteSize)) ? Number(data.byteSize) : 0,
          sourceKind: typeof data.sourceKind === 'string' ? data.sourceKind : null,
          processingState: typeof data.processingState === 'string' ? data.processingState : 'unknown',
          duplicate: data.duplicate === true,
          imageMetadata: safeImageMetadata(data.imageMetadata),
          createdAt: toIso(data.createdAt),
          validatedAt: toIso(data.validatedAt),
          version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
        },
      ];
    });

    const hasMore = snapshot.docs.length > limit;
    const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : undefined;

    return res.status(200).json({
      items,
      nextCursor,
      hasMore,
      summary: {
        total: totalCount.data().count,
        accepted: acceptedCount.data().count,
        duplicate: duplicateCount.data().count,
        awaitingUpload: awaitingUploadCount.data().count,
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
    if (message === 'FINANCE_ENTITY_NOT_FOUND') {
      return res.status(404).json({ error: message, requestId });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(409).json({ error: message, requestId });
    }
    if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED', requestId });
    }

    console.error('Universal Evidence List Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', requestId });
  }
}
