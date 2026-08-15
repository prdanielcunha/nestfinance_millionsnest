import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  COUNT_CAPTURE_FIELD_KEYS,
  COUNT_CAPTURE_READ_TTL_MS,
  isCountCaptureMaterialHidden,
  isValidCountCaptureId,
} from '../../../shared/finance/countCapture.js';
import {
  COUNT_CAPTURE_DENOMINATION_CELL_KEYS,
  buildUnresolvedCountCaptureDenominationCandidates,
} from '../../../shared/finance/countCaptureDenominations.js';
import { resolveCanonicalCountPaperForm } from './countCaptureHelpers.js';
import { getCountCaptureStorageAdapter } from './countCaptureStorage.js';
import { toOptionalIso } from './countPaperHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, captureId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isValidCountCaptureId(captureId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, organizationId } = await resolveFinanceRequestContext(req, 'finance.view');
    const entityRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId);
    const captureDoc = await entityRef.collection('countCaptures').doc(captureId).get();
    if (!captureDoc.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const capture = captureDoc.data() || {};
    if (capture.organizationId !== organizationId || capture.financeEntityId !== financeEntityId) {
      return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    }

    const canonical = await resolveCanonicalCountPaperForm({
      db,
      organizationId,
      financeEntityId,
      formId: capture.formId,
    });
    if (
      canonical.form.countSessionId !== capture.countSessionId ||
      canonical.form.stage !== capture.stage ||
      canonical.form.templateVersion !== capture.templateVersion ||
      canonical.form.checksum !== capture.checksum
    ) {
      throw new Error('COUNT_CAPTURE_FORM_INTEGRITY_FAILED');
    }

    const materialHidden = isCountCaptureMaterialHidden(
      canonical.form.stage,
      canonical.session.status,
    );

    if (capture.status === 'duplicate') {
      return res.status(200).json({
        capture: {
          id: captureId,
          status: 'duplicate',
          version: Number(capture.version || 0),
          formId: canonical.form.id,
          countSessionId: canonical.form.countSessionId,
          stage: canonical.form.stage,
          templateVersion: canonical.form.templateVersion,
          materialHidden: true,
          duplicateOfCaptureId: String(capture.duplicateOfCaptureId || ''),
          normalization: null,
          normalizedSha256: null,
          candidates: null,
          extraction: null,
          review: null,
          denominationCandidates: null,
          denominationExtraction: null,
          denominationReview: null,
          evidenceReviewComplete: false,
          originalUrl: null,
          normalizedUrl: null,
          createdAt: toOptionalIso(capture.createdAt),
          updatedAt: toOptionalIso(capture.updatedAt),
        },
      });
    }

    let originalUrl: string | null = null;
    let normalizedUrl: string | null = null;
    if (!materialHidden && ['captured', 'reviewed'].includes(capture.status)) {
      const storage = getCountCaptureStorageAdapter();
      [originalUrl, normalizedUrl] = await Promise.all([
        storage.createReadUrl(String(capture.original?.path || ''), COUNT_CAPTURE_READ_TTL_MS),
        storage.createReadUrl(String(capture.normalized?.path || ''), COUNT_CAPTURE_READ_TTL_MS),
      ]);
    }

    const denominationCandidates = Array.isArray(capture.denominationCandidates) && capture.denominationCandidates.length > 0
      ? capture.denominationCandidates
      : buildUnresolvedCountCaptureDenominationCandidates(canonical.form.templateVersion).map((field) =>
          capture.normalization?.geometry?.mode === 'full_frame' ? { ...field, region: null } : field,
        );
    const topLevelReviewComplete = Array.isArray(capture.review?.fields) && capture.review.fields.length === COUNT_CAPTURE_FIELD_KEYS.length;
    const denominationReviewComplete = Array.isArray(capture.denominationReview?.fields) && capture.denominationReview.fields.length === COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length;

    return res.status(200).json({
      capture: {
        id: captureId,
        status: capture.status,
        version: Number(capture.version || 0),
        formId: canonical.form.id,
        countSessionId: canonical.form.countSessionId,
        stage: canonical.form.stage,
        locale: canonical.form.locale,
        serviceLabel: canonical.form.serviceLabel,
        serviceDate: canonical.form.serviceDate,
        templateVersion: canonical.form.templateVersion,
        checksum: canonical.form.checksum,
        materialHidden,
        duplicateOfCaptureId: capture.duplicateOfCaptureId || null,
        normalization: materialHidden ? null : capture.normalization || null,
        normalizedSha256: materialHidden ? null : capture.normalized?.sha256 || null,
        candidates: materialHidden ? null : capture.candidates || null,
        extraction: materialHidden || !capture.extraction ? null : {
          provider: capture.extraction.provider,
          model: capture.extraction.model,
          revision: capture.extraction.revision,
          completedAt: toOptionalIso(capture.extraction.completedAt),
        },
        review: materialHidden ? null : capture.review || null,
        denominationCandidates: materialHidden ? null : denominationCandidates,
        denominationExtraction: materialHidden || !capture.denominationExtraction ? null : {
          provider: capture.denominationExtraction.provider,
          model: capture.denominationExtraction.model,
          revision: capture.denominationExtraction.revision,
          completedAt: toOptionalIso(capture.denominationExtraction.completedAt),
        },
        denominationReview: materialHidden ? null : capture.denominationReview || null,
        evidenceReviewComplete: !materialHidden && topLevelReviewComplete && denominationReviewComplete,
        originalUrl,
        normalizedUrl,
        readUrlExpiresInMs: originalUrl || normalizedUrl ? COUNT_CAPTURE_READ_TTL_MS : null,
        createdAt: toOptionalIso(capture.createdAt),
        updatedAt: toOptionalIso(capture.updatedAt),
      },
    });
  } catch (error: any) {
    console.error('Count Capture Detail Error:', error);
    const message = String(error?.message || '');
    if (message === 'COUNT_CAPTURE_FORM_NOT_FOUND' || message === 'COUNT_SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    }
    if (message.startsWith('COUNT_CAPTURE_')) return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
