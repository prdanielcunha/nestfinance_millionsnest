import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import {
  COUNT_CAPTURE_NORMALIZED_MAX_BYTES,
  isCountCaptureMaterialHidden,
  isValidCountCaptureId,
  isValidCountCaptureSha256,
} from '../../../shared/finance/countCapture.js';
import {
  COUNT_CAPTURE_EXTRACTION_LEASE_MS,
  buildCountCaptureCandidatesFromProvider,
  hasActiveCountCaptureExtractionLease,
} from '../../../shared/finance/countCaptureExtraction.js';
import { assertCountCaptureStageOpen, resolveCountCaptureContext } from './countCaptureContext.js';
import { generateCountCaptureAuditId } from './countCaptureHelpers.js';
import { getCountCaptureStorageAdapter } from './countCaptureStorage.js';
import { getCountFreeFormExtractionProvider } from './countFreeFormExtractionProvider.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  let cleanup: { sessionRef: any; idemRef: any; keyHash: string; payloadHash: string; db: any } | null = null;
  try {
    const { financeEntityId, captureId, expectedVersion, normalizedSha256, idempotencyKey, requestId } = req.body || {};
    if (
      typeof financeEntityId !== 'string' ||
      !isValidCountCaptureId(captureId) ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 2 ||
      !isValidCountCaptureSha256(normalizedSha256) ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const captureRef = entityRef.collection('countCaptures').doc(captureId);
    const preflightDoc = await captureRef.get();
    if (!preflightDoc.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const preflight = preflightDoc.data() || {};
    if (
      preflight.organizationId !== organizationId ||
      preflight.financeEntityId !== financeEntityId ||
      preflight.provenance !== 'free_form_note'
    ) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });

    const resolved = await resolveCountCaptureContext({ db, organizationId, financeEntityId, capture: preflight });
    assertCountCaptureStageOpen(resolved.identity.stage, resolved.session.status);
    if (isCountCaptureMaterialHidden(resolved.identity.stage, resolved.session.status)) {
      return res.status(409).json({ error: 'COUNT_CAPTURE_MATERIAL_HIDDEN' });
    }

    const idemRef = context.repository.getIdempotencyRef().doc(
      buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_free_form_extract', idempotencyKey),
    );
    const payloadHash = hashPayload({
      captureId,
      expectedVersion,
      normalizedSha256,
      provenance: 'free_form_note',
      extractionSchema: 1,
    });
    const keyHash = idemRef.id;
    const nowMs = Date.now();
    const leaseExpiresAtEpochMs = nowMs + COUNT_CAPTURE_EXTRACTION_LEASE_MS;

    const reservation = await db.runTransaction(async (transaction) => {
      const [captureDoc, sessionDoc, idemDoc] = await Promise.all([
        transaction.get(captureRef),
        transaction.get(resolved.sessionRef),
        transaction.get(idemRef),
      ]);
      if (!captureDoc.exists || !sessionDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const capture = captureDoc.data() || {};
      const session = sessionDoc.data() || {};
      if (capture.provenance !== 'free_form_note') throw new Error('COUNT_CAPTURE_NOT_FOUND');
      if (idemDoc.exists) {
        const idem = idemDoc.data() || {};
        if (idem.payloadHash !== payloadHash) throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
        if (idem.status === 'completed') return { cached: true as const, result: idem.result };
        if (idem.status === 'in_progress' && Number(idem.expiresAtEpochMs || 0) > nowMs) {
          throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
        }
      }
      if (capture.status !== 'captured' || Number(capture.version) !== expectedVersion || capture.extraction) {
        throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      }
      if (capture.normalized?.sha256 !== normalizedSha256) throw new Error('COUNT_CAPTURE_EXTRACTION_NORMALIZED_MISMATCH');
      if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) throw new Error('COUNT_SESSION_NOT_FOUND');
      if (isCountCaptureMaterialHidden(capture.stage, session.status)) throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');
      if (hasActiveCountCaptureExtractionLease(session, nowMs) && session.captureExtractionLease?.keyHash !== keyHash) {
        throw new Error('COUNT_CAPTURE_EXTRACTION_IN_PROGRESS');
      }

      transaction.set(idemRef, {
        status: 'in_progress',
        payloadHash,
        startedAtEpochMs: nowMs,
        expiresAtEpochMs: leaseExpiresAtEpochMs,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(resolved.sessionRef, {
        captureExtractionLease: {
          keyHash,
          captureId,
          stage: capture.stage,
          provenance: 'free_form_note',
          requestedByUid: uid,
          expiresAtEpochMs: leaseExpiresAtEpochMs,
        },
      });
      return {
        cached: false as const,
        normalizedPath: String(capture.normalized?.path || ''),
        locale: ['PT', 'EN', 'ES'].includes(capture.locale) ? capture.locale : 'PT',
      };
    });

    if (reservation.cached) return res.status(200).json({ ...reservation.result, requestId });
    cleanup = { sessionRef: resolved.sessionRef, idemRef, keyHash, payloadHash, db };

    const stored = await getCountCaptureStorageAdapter().readVerifiedBytes(
      reservation.normalizedPath,
      COUNT_CAPTURE_NORMALIZED_MAX_BYTES,
    );
    if (stored.sha256 !== normalizedSha256 || !['image/jpeg', 'image/webp'].includes(stored.contentType)) {
      throw new Error('COUNT_CAPTURE_EXTRACTION_NORMALIZED_MISMATCH');
    }

    const providerResponse = await getCountFreeFormExtractionProvider().extract({
      bytes: stored.bytes,
      mimeType: stored.contentType as 'image/jpeg' | 'image/webp',
      locale: reservation.locale as 'PT' | 'EN' | 'ES',
    });
    const candidates = buildCountCaptureCandidatesFromProvider({
      provider: providerResponse.result,
      regions: { tithe: null, offering: null, other_income: null, pix: null },
    });
    const extractionHash = hashPayload({
      provider: providerResponse.provider,
      model: providerResponse.model,
      revision: providerResponse.revision,
      fields: providerResponse.result.fields,
      normalizedSha256,
      provenance: 'free_form_note',
    });

    const result = await db.runTransaction(async (transaction) => {
      const [captureDoc, sessionDoc, idemDoc] = await Promise.all([
        transaction.get(captureRef),
        transaction.get(resolved.sessionRef),
        transaction.get(idemRef),
      ]);
      if (!captureDoc.exists || !sessionDoc.exists || !idemDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const capture = captureDoc.data() || {};
      const session = sessionDoc.data() || {};
      const idem = idemDoc.data() || {};
      if (idem.status !== 'in_progress' || idem.payloadHash !== payloadHash) throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
      if (
        capture.provenance !== 'free_form_note' ||
        capture.status !== 'captured' ||
        Number(capture.version) !== expectedVersion ||
        capture.extraction
      ) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      if (capture.normalized?.sha256 !== normalizedSha256) throw new Error('COUNT_CAPTURE_EXTRACTION_NORMALIZED_MISMATCH');
      if (session.captureExtractionLease?.keyHash !== keyHash || Number(session.captureExtractionLease?.expiresAtEpochMs || 0) <= Date.now()) {
        throw new Error('COUNT_CAPTURE_EXTRACTION_LEASE_EXPIRED');
      }
      if (isCountCaptureMaterialHidden(capture.stage, session.status)) throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');

      const nextVersion = expectedVersion + 1;
      transaction.update(captureRef, {
        candidates,
        extraction: {
          schemaVersion: 1,
          provider: providerResponse.provider,
          model: providerResponse.model,
          revision: providerResponse.revision,
          normalizedSha256,
          provenance: 'free_form_full_frame',
          fields: providerResponse.result.fields.map((field) => ({
            key: field.key,
            status: field.status,
            observation: field.observation,
            provenance: 'server_verified_full_frame',
          })),
          requestedByUid: uid,
          completedAt: FieldValue.serverTimestamp(),
        },
        version: nextVersion,
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(resolved.sessionRef, { captureExtractionLease: FieldValue.delete() });

      const auditId = generateCountCaptureAuditId();
      transaction.create(context.repository.getAuditRef().doc(auditId), {
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'count_capture',
        resourceId: captureId,
        action: 'count.free_form_candidates_extracted',
        requestId,
        idempotencyKey,
        afterHash: extractionHash,
        metadata: {
          stage: capture.stage,
          provenance: 'free_form_note',
          provider: providerResponse.provider,
          model: providerResponse.model,
          revision: providerResponse.revision,
          recognizedCount: candidates.filter((candidate) => candidate.state === 'recognized').length,
          uncertainCount: candidates.filter((candidate) => candidate.state === 'uncertain').length,
          unresolvedCount: candidates.filter((candidate) => candidate.state === 'unresolved').length,
          humanReviewRequired: true,
          financialValuesEmbedded: false,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      const safeResult = { captureId, version: nextVersion, status: 'captured', extracted: true };
      transaction.set(idemRef, {
        status: 'completed',
        payloadHash,
        result: safeResult,
        completedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return safeResult;
    });
    cleanup = null;
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    if (cleanup) {
      try {
        await cleanup.db.runTransaction(async (transaction: any) => {
          const [idemDoc, sessionDoc] = await Promise.all([
            transaction.get(cleanup!.idemRef),
            transaction.get(cleanup!.sessionRef),
          ]);
          if (idemDoc.exists && idemDoc.data()?.status === 'in_progress' && idemDoc.data()?.payloadHash === cleanup!.payloadHash) {
            transaction.delete(cleanup!.idemRef);
          }
          if (sessionDoc.exists && sessionDoc.data()?.captureExtractionLease?.keyHash === cleanup!.keyHash) {
            transaction.update(cleanup!.sessionRef, { captureExtractionLease: FieldValue.delete() });
          }
        });
      } catch {
        // Lease remains time-bounded even if cleanup cannot complete.
      }
    }
    const message = String(error?.message || '');
    console.error('Count Free Form Extract Error:', message.startsWith('COUNT_') || message.startsWith('FINANCE_') ? message : 'UNEXPECTED_ERROR');
    if (['COUNT_CAPTURE_NOT_FOUND', 'COUNT_SESSION_NOT_FOUND'].includes(message)) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (
      message.includes('VERSION_CONFLICT') ||
      message.includes('FINANCE_IDEMPOTENCY_CONFLICT') ||
      ['COUNT_CAPTURE_MATERIAL_HIDDEN', 'COUNT_CAPTURE_EXTRACTION_IN_PROGRESS', 'COUNT_CAPTURE_EXTRACTION_LEASE_EXPIRED'].includes(message)
    ) return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : message });
    if (message === 'COUNT_FREE_FORM_EXTRACTION_DISABLED' || message === 'COUNT_FREE_FORM_EXTRACTION_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'COUNT_CAPTURE_EXTRACTION_UNAVAILABLE' });
    }
    if (message.includes('PROVIDER_TIMEOUT') || message.includes('PROVIDER_UNAVAILABLE')) {
      return res.status(503).json({ error: 'COUNT_CAPTURE_EXTRACTION_TEMPORARILY_UNAVAILABLE' });
    }
    if (message.startsWith('COUNT_')) return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
