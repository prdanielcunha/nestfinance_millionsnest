import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageFinanceFact } from './factStream.js';
import { generateEvidenceAuditId } from './universalEvidenceHelpers.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  isUniversalEvidenceDocumentType,
  normalizeUniversalEvidenceReviewNote,
} from '../../../shared/finance/universalEvidenceReview.js';

const validEvidenceId = (value: unknown): value is string =>
  typeof value === 'string' && /^evd_[a-f0-9]{32}$/.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const {
      financeEntityId,
      evidenceId,
      expectedVersion,
      note,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !validEvidenceId(evidenceId) ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 3 ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const reviewNote = normalizeUniversalEvidenceReviewNote(note);
    const { db, uid, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.review');

    const evidenceRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('universalEvidence')
      .doc(evidenceId);

    const payloadHash = hashPayload({
      evidenceId,
      expectedVersion,
      reviewNote,
      action: 'review',
    });
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'universal_evidence_review',
      idempotencyKey,
    );

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const snapshot = await transaction.get(evidenceRef);
        const data = snapshot.data() || {};

        if (
          !snapshot.exists ||
          data.organizationId !== organizationId ||
          data.financeEntityId !== financeEntityId
        ) {
          throw new Error('EVIDENCE_NOT_FOUND');
        }
        if (data.processingState !== 'accepted' || data.duplicate === true) {
          throw new Error('EVIDENCE_NOT_READY');
        }
        if (Number(data.version) !== expectedVersion) {
          throw new Error('EVIDENCE_VERSION_CONFLICT');
        }

        const documentType = data.classification?.documentType;
        if (!isUniversalEvidenceDocumentType(documentType)) {
          throw new Error('EVIDENCE_REVIEW_REQUIRES_CLASSIFICATION');
        }
        if (data.review?.status === 'reviewed') {
          throw new Error('EVIDENCE_ALREADY_REVIEWED');
        }

        const nextVersion = expectedVersion + 1;
        transaction.update(evidenceRef, {
          review: {
            status: 'reviewed',
            reviewedByUid: uid,
            reviewedAt: FieldValue.serverTimestamp(),
            note: reviewNote,
          },
          version: nextVersion,
          updatedByUid: uid,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const auditId = generateEvidenceAuditId();
        const auditRef = context.repository.getAuditRef().doc(auditId);
        transaction.create(auditRef, {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'universal_evidence',
          resourceId: evidenceId,
          action: 'evidence.reviewed',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            documentType,
            resolution: 'reviewed',
            notePresent: Boolean(reviewNote),
            financialRecognition: false,
            versionBefore: expectedVersion,
            versionAfter: nextVersion,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        stageFinanceFact(transaction, db, {
          organizationId,
          eventType: 'INBOX_ITEM_RESOLVED',
          entityType: 'universal_evidence',
          entityId: evidenceId,
          actorUserId: uid,
          correlationId: requestId,
          payload: {
            financeEntityId,
            documentType,
            resolution: 'reviewed',
            notePresent: Boolean(reviewNote),
            version: nextVersion,
            financialRecognition: false,
          },
          sourceRefs: [
            { kind: 'evidence', ref: evidenceRef.path, version: nextVersion },
            { kind: 'audit', ref: auditRef.path },
          ],
        });

        return {
          evidenceId,
          version: nextVersion,
          documentType,
          reviewStatus: 'reviewed' as const,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'EVIDENCE_INVALID_REVIEW_NOTE') {
      return res.status(400).json({ error: message });
    }
    if (message === 'EVIDENCE_NOT_FOUND' || message === 'FINANCE_ENTITY_NOT_FOUND') {
      return res.status(404).json({ error: message });
    }
    if (
      [
        'EVIDENCE_NOT_READY',
        'EVIDENCE_VERSION_CONFLICT',
        'EVIDENCE_REVIEW_REQUIRES_CLASSIFICATION',
        'EVIDENCE_ALREADY_REVIEWED',
      ].includes(message) ||
      message.includes('FINANCE_IDEMPOTENCY_CONFLICT')
    ) {
      return res.status(409).json({
        error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : message,
      });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });

    console.error('Universal Evidence Review Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
