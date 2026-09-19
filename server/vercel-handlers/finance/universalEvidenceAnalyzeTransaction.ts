import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateEvidenceAuditId } from './universalEvidenceHelpers.js';
import { getUniversalEvidenceStorageAdapter } from './universalEvidenceStorage.js';
import { getDocumentTransactionIntelligenceProvider, DOCUMENT_TRANSACTION_PROVIDER_REVISION } from './documentTransactionIntelligenceProvider.js';
import { detectUniversalEvidenceMime, isSha256, isUniversalEvidenceMime, isUniversalEvidenceSize } from '../../../shared/finance/universalEvidence.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  buildDocumentTransactionAnalysis,
  type DocumentTransactionCategoryOption,
  type DocumentTransactionAnalysis,
} from '../../../shared/finance/documentTransactionIntelligence.js';
import { normalizeCnpj } from '../../../shared/finance/taxId.js';

const validEvidenceId = (value: unknown): value is string =>
  typeof value === 'string' && /^evd_[a-f0-9]{32}$/.test(value);

function safeStoredAnalysis(value: any): DocumentTransactionAnalysis | null {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 2 || value.source !== 'ai_assisted') return null;
  if (!value.authority || value.authority.humanConfirmationRequired !== true || value.authority.createsTransaction !== false) return null;
  return value as DocumentTransactionAnalysis;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const {
      financeEntityId,
      evidenceId,
      expectedVersion,
      locale,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !validEvidenceId(evidenceId) ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 2 ||
      !['PT', 'EN', 'ES'].includes(locale) ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, uid, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId);
    const evidenceRef = entityRef.collection('universalEvidence').doc(evidenceId);

    const [evidenceSnapshot, entitySnapshot, categorySnapshot] = await Promise.all([
      evidenceRef.get(),
      entityRef.get(),
      context.repository.getCategoriesQuery().limit(1001).get(),
    ]);

    if (!evidenceSnapshot.exists) return res.status(404).json({ error: 'EVIDENCE_NOT_FOUND' });
    if (!entitySnapshot.exists) return res.status(404).json({ error: 'FINANCE_ENTITY_NOT_FOUND' });
    if (categorySnapshot.size > 1000) return res.status(409).json({ error: 'CATALOG_LIMIT_EXCEEDED' });

    const evidence = evidenceSnapshot.data() || {};
    if (evidence.organizationId !== organizationId || evidence.financeEntityId !== financeEntityId) {
      return res.status(404).json({ error: 'EVIDENCE_NOT_FOUND' });
    }
    if (evidence.processingState !== 'accepted' || evidence.duplicate === true) {
      return res.status(409).json({ error: 'EVIDENCE_ANALYSIS_NOT_READY' });
    }
    if (Number(evidence.version) !== expectedVersion) {
      const stored = safeStoredAnalysis(evidence.transactionAnalysis?.analysis);
      if (stored && evidence.transactionAnalysis?.fingerprint) {
        return res.status(200).json({
          evidenceId,
          version: Number(evidence.version),
          analysis: stored,
          provider: evidence.transactionAnalysis.provider || null,
          model: evidence.transactionAnalysis.model || null,
          revision: evidence.transactionAnalysis.revision || null,
          replayed: true,
          requestId,
        });
      }
      return res.status(409).json({ error: 'EVIDENCE_VERSION_CONFLICT' });
    }

    const categories: DocumentTransactionCategoryOption[] = categorySnapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) } as any))
      .filter((category) =>
        category.active !== false &&
        typeof category.name === 'string' &&
        (category.kind === 'income' || category.kind === 'expense'),
      )
      .map((category) => ({
        id: category.id,
        name: category.name.trim().slice(0, 120),
        kind: category.kind,
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    const entityData = entitySnapshot.data() || {};
    const entityTaxId = typeof entityData.taxId === 'string' ? normalizeCnpj(entityData.taxId) : '';

    const verifiedMimeType = evidence.verifiedMimeType;
    const byteSize = Number(evidence.byteSize);
    const original = evidence.original && typeof evidence.original === 'object' ? evidence.original : null;
    const path = typeof original?.path === 'string' ? original.path : '';
    const verifiedByteSize = Number(original?.verifiedByteSize);
    const verifiedSha256 = original?.verifiedSha256;

    if (
      !isUniversalEvidenceMime(verifiedMimeType) ||
      !isUniversalEvidenceSize(byteSize) ||
      !path ||
      original?.immutable !== true ||
      original?.verifiedMimeType !== verifiedMimeType ||
      verifiedByteSize !== byteSize ||
      !isSha256(verifiedSha256)
    ) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    }

    const fingerprint = createHash('sha256')
      .update(JSON.stringify({
        evidenceSha256: verifiedSha256,
        entityTaxId,
        categories,
        locale,
        providerRevision: DOCUMENT_TRANSACTION_PROVIDER_REVISION,
      }))
      .digest('hex');

    const existingAnalysis = safeStoredAnalysis(evidence.transactionAnalysis?.analysis);
    if (
      existingAnalysis &&
      evidence.transactionAnalysis?.fingerprint === fingerprint &&
      evidence.transactionAnalysis?.revision === DOCUMENT_TRANSACTION_PROVIDER_REVISION
    ) {
      return res.status(200).json({
        evidenceId,
        version: Number(evidence.version),
        analysis: existingAnalysis,
        provider: evidence.transactionAnalysis.provider || null,
        model: evidence.transactionAnalysis.model || null,
        revision: evidence.transactionAnalysis.revision || null,
        replayed: true,
        requestId,
      });
    }

    const stored = await getUniversalEvidenceStorageAdapter().readPreview(path);
    if (stored.size !== byteSize || stored.sha256 !== verifiedSha256) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    }
    if (stored.contentType !== verifiedMimeType) {
      return res.status(415).json({ error: 'EVIDENCE_UNSUPPORTED' });
    }
    const detectedMime = detectUniversalEvidenceMime(stored.bytes.subarray(0, 65536));
    if (!detectedMime || detectedMime !== verifiedMimeType) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    }

    const providerResponse = await getDocumentTransactionIntelligenceProvider().analyze({
      bytes: stored.bytes,
      mimeType: verifiedMimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
      categories,
      locale: locale as 'PT' | 'EN' | 'ES',
    });
    const analysis = buildDocumentTransactionAnalysis({
      provider: providerResponse.result,
      entityTaxId,
      categories,
    });

    const payloadHash = hashPayload({
      evidenceId,
      expectedVersion,
      locale,
      fingerprint,
      analysis,
      provider: providerResponse.provider,
      model: providerResponse.model,
      revision: providerResponse.revision,
    });
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'universal_evidence_transaction_analysis',
      idempotencyKey,
    );

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const currentSnapshot = await transaction.get(evidenceRef);
        const current = currentSnapshot.data() || {};
        if (
          !currentSnapshot.exists ||
          current.organizationId !== organizationId ||
          current.financeEntityId !== financeEntityId
        ) {
          throw new Error('EVIDENCE_NOT_FOUND');
        }

        const currentStored = safeStoredAnalysis(current.transactionAnalysis?.analysis);
        if (
          currentStored &&
          current.transactionAnalysis?.fingerprint === fingerprint &&
          current.transactionAnalysis?.revision === DOCUMENT_TRANSACTION_PROVIDER_REVISION
        ) {
          return {
            evidenceId,
            version: Number(current.version),
            analysis: currentStored,
            provider: current.transactionAnalysis.provider || null,
            model: current.transactionAnalysis.model || null,
            revision: current.transactionAnalysis.revision || null,
            replayed: true,
          };
        }

        if (Number(current.version) !== expectedVersion) throw new Error('EVIDENCE_VERSION_CONFLICT');
        if (current.processingState !== 'accepted' || current.duplicate === true) {
          throw new Error('EVIDENCE_ANALYSIS_NOT_READY');
        }

        const nextVersion = expectedVersion + 1;
        transaction.update(evidenceRef, {
          transactionAnalysis: {
            analysis,
            fingerprint,
            provider: providerResponse.provider,
            model: providerResponse.model,
            revision: providerResponse.revision,
            generatedByUid: uid,
            generatedAt: FieldValue.serverTimestamp(),
          },
          version: nextVersion,
          updatedByUid: uid,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const auditId = generateEvidenceAuditId();
        transaction.create(context.repository.getAuditRef().doc(auditId), {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'universal_evidence',
          resourceId: evidenceId,
          action: 'evidence.transaction_analysis_generated',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            analysisStatus: analysis.analysisStatus,
            entityTaxIdCheck: analysis.entityTaxIdCheck,
            categorySuggested: Boolean(analysis.categoryId.value),
            documentMultiplicity: analysis.documentMultiplicity.value,
            provider: providerResponse.provider,
            revision: providerResponse.revision,
            humanConfirmationRequired: true,
            financialRecognition: false,
            transactionCreated: false,
            balanceMutation: false,
            versionBefore: expectedVersion,
            versionAfter: nextVersion,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          evidenceId,
          version: nextVersion,
          analysis,
          provider: providerResponse.provider,
          model: providerResponse.model,
          revision: providerResponse.revision,
          replayed: false,
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
      message === 'EVIDENCE_ANALYSIS_NOT_READY' ||
      message === 'EVIDENCE_VERSION_CONFLICT' ||
      message === 'CATALOG_LIMIT_EXCEEDED' ||
      message.includes('FINANCE_IDEMPOTENCY_CONFLICT')
    ) {
      return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : message });
    }
    if (message === 'EVIDENCE_TOO_LARGE') return res.status(413).json({ error: message });
    if (message === 'EVIDENCE_UNSUPPORTED') return res.status(415).json({ error: message });
    if (
      message === 'EVIDENCE_UPLOAD_MISSING' ||
      message === 'EVIDENCE_SIZE_MISMATCH' ||
      message === 'EVIDENCE_CORRUPT'
    ) return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    if (
      message === 'DOCUMENT_ANALYSIS_NOT_CONFIGURED' ||
      message === 'DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE' ||
      message === 'DOCUMENT_ANALYSIS_PROVIDER_TIMEOUT'
    ) return res.status(503).json({ error: message });
    if (message === 'DOCUMENT_ANALYSIS_PROVIDER_INVALID_RESPONSE') {
      return res.status(422).json({ error: message });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });

    console.error('Universal Evidence Transaction Analysis Error:', message || error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
