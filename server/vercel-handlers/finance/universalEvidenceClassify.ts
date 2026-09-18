import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageFinanceFact } from './factStream.js';
import { stageFinanceSignalOpen, stageFinanceSignalResolve } from './signalProjection.js';
import { generateEvidenceAuditId } from './universalEvidenceHelpers.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isUniversalEvidenceDocumentType } from '../../../shared/finance/universalEvidenceReview.js';

const validEvidenceId = (value: unknown): value is string =>
  typeof value === 'string' && /^evd_[a-f0-9]{32}$/.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const {
      financeEntityId,
      evidenceId,
      expectedVersion,
      documentType,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !validEvidenceId(evidenceId) ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 2 ||
      !isUniversalEvidenceDocumentType(documentType) ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, uid, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.create_drafts');

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
      documentType,
      action: 'classify',
    });
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'universal_evidence_classify',
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

        const nextVersion = expectedVersion + 1;
        transaction.update(evidenceRef, {
          classification: {
            documentType,
            source: 'human',
            confirmedByUid: uid,
            confirmedAt: FieldValue.serverTimestamp(),
          },
          review: {
            status: 'pending',
            reviewedByUid: null,
            reviewedAt: null,
            note: null,
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
          action: 'evidence.classified',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            documentType,
            classificationSource: 'human',
            reviewStatus: 'pending',
            financialRecognition: false,
            versionBefore: expectedVersion,
            versionAfter: nextVersion,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        const sourceRefs = [
          { kind: 'evidence' as const, ref: evidenceRef.path, version: nextVersion },
          { kind: 'audit' as const, ref: auditRef.path },
        ];
        const factId = stageFinanceFact(transaction, db, {
          organizationId,
          eventType: 'DOCUMENT_CLASSIFIED',
          entityType: 'universal_evidence',
          entityId: evidenceId,
          actorUserId: uid,
          correlationId: requestId,
          payload: {
            financeEntityId,
            documentType,
            classificationSource: 'human',
            reviewStatus: 'pending',
            version: nextVersion,
            financialRecognition: false,
          },
          sourceRefs,
        });

        stageFinanceSignalResolve(transaction, db, {
          organizationId,
          financeEntityId,
          signalType: 'INBOX_IDENTIFICATION_REQUIRED',
          entityType: 'universal_evidence',
          entityId: evidenceId,
          sourceFactId: factId,
          sourceRefs,
        });
        stageFinanceSignalOpen(transaction, db, {
          organizationId,
          financeEntityId,
          signalType: 'INBOX_REVIEW_REQUIRED',
          entityType: 'universal_evidence',
          entityId: evidenceId,
          sourceFactId: factId,
          sourceRefs,
        });

        return {
          evidenceId,
          version: nextVersion,
          documentType,
          reviewStatus: 'pending' as const,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'EVIDENCE_NOT_FOUND' || message === 'FINANCE_ENTITY_NOT_FOUND') {
      return res.status(404).json({ error: message });
    }
    if (
      message === 'EVIDENCE_NOT_READY' ||
      message === 'EVIDENCE_VERSION_CONFLICT' ||
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

    console.error('Universal Evidence Classify Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
