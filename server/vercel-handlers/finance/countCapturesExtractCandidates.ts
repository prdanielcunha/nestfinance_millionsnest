import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isCountCaptureMaterialHidden, isValidCountCaptureId, isValidCountCaptureSha256, type CountCaptureFieldKey, type CountCaptureRegion } from '../../../shared/finance/countCapture.js';
import {
  COUNT_CAPTURE_EXTRACTION_LEASE_MS,
  COUNT_CAPTURE_EXTRACTION_MAX_REGION_BYTES,
  COUNT_CAPTURE_EXTRACTION_MAX_TOTAL_BYTES,
  buildCountCaptureCandidatesFromProvider,
  hasActiveCountCaptureExtractionLease,
  validateCountCaptureExtractionRegionInputs,
} from '../../../shared/finance/countCaptureExtraction.js';
import { generateCountCaptureAuditId, resolveCanonicalCountPaperForm } from './countCaptureHelpers.js';
import { getCountCaptureExtractionProvider } from './countCaptureExtractionProvider.js';

function assertStageCanExtract(stage: 'count_a' | 'count_b', session: any) {
  const status = String(session?.status || '');
  if (isCountCaptureMaterialHidden(stage, status as any)) throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');
  if (stage === 'count_a' && status !== 'counting_a') throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_STAGE_STATE');
  if (stage === 'count_b' && status !== 'counting_b') throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_STAGE_STATE');
}

function verifyRegionBytes(regions: ReturnType<typeof validateCountCaptureExtractionRegionInputs>) {
  let totalBytes = 0;
  for (const region of regions) {
    const bytes = Buffer.from(region.dataBase64, 'base64');
    const jpegMagic = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!jpegMagic || bytes.length > COUNT_CAPTURE_EXTRACTION_MAX_REGION_BYTES || bytes.toString('base64') !== region.dataBase64) {
      throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
    }
    totalBytes += bytes.length;
    if (totalBytes > COUNT_CAPTURE_EXTRACTION_MAX_TOTAL_BYTES) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== region.sha256) throw new Error('COUNT_CAPTURE_EXTRACTION_REGION_HASH_MISMATCH');
  }
}

function candidateRegions(capture: any): Partial<Record<CountCaptureFieldKey, CountCaptureRegion | null>> {
  const output: Partial<Record<CountCaptureFieldKey, CountCaptureRegion | null>> = {};
  for (const candidate of Array.isArray(capture?.candidates) ? capture.candidates : []) {
    if (candidate?.key && candidate?.region) output[candidate.key as CountCaptureFieldKey] = candidate.region as CountCaptureRegion;
  }
  return output;
}

function assertCaptureMatchesCanonical(capture: any, canonical: Awaited<ReturnType<typeof resolveCanonicalCountPaperForm>>) {
  if (
    capture.formId !== canonical.form.id ||
    capture.countSessionId !== canonical.form.countSessionId ||
    capture.stage !== canonical.form.stage ||
    capture.templateVersion !== canonical.form.templateVersion ||
    capture.checksum !== canonical.form.checksum
  ) throw new Error('COUNT_CAPTURE_FORM_INTEGRITY_FAILED');
}

type CleanupReservation = {
  db: Firestore;
  idempotencyRef: DocumentReference;
  sessionRef: DocumentReference;
  keyHash: string;
  payloadHash: string;
};

async function cleanupFailedReservation(input: CleanupReservation) {
  try {
    await input.db.runTransaction(async (transaction) => {
      const [idempotencyDoc, sessionDoc] = await Promise.all([transaction.get(input.idempotencyRef), transaction.get(input.sessionRef)]);
      if (idempotencyDoc.exists) {
        const data = idempotencyDoc.data() || {};
        if (data.status === 'in_progress' && data.payloadHash === input.payloadHash) transaction.delete(input.idempotencyRef);
      }
      if (sessionDoc.exists && sessionDoc.data()?.captureExtractionLease?.keyHash === input.keyHash) {
        transaction.update(input.sessionRef, { captureExtractionLease: FieldValue.delete() });
      }
    });
  } catch {
    // A crashed/failed request cannot hold blind-count transitions indefinitely: the lease is time-bounded.
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  let cleanup: CleanupReservation | null = null;
  try {
    const { financeEntityId, captureId, expectedVersion, normalizedSha256, regions: rawRegions, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isValidCountCaptureId(captureId) || !Number.isInteger(expectedVersion) || expectedVersion < 2 || !isValidCountCaptureSha256(normalizedSha256) || !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const regions = validateCountCaptureExtractionRegionInputs(rawRegions);
    verifyRegionBytes(regions);
    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const captureRef = entityRef.collection('countCaptures').doc(captureId);

    // Re-resolve the immutable H3A paper identity before any extraction reservation.
    // This makes the printed form/checksum the canonical document identity rather than
    // trusting capture metadata supplied by an earlier client request.
    const preflightCaptureDoc = await captureRef.get();
    if (!preflightCaptureDoc.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const preflightCapture = preflightCaptureDoc.data() || {};
    if (preflightCapture.organizationId !== organizationId || preflightCapture.financeEntityId !== financeEntityId) {
      return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    }
    const canonical = await resolveCanonicalCountPaperForm({ db, organizationId, financeEntityId, formId: preflightCapture.formId });
    assertCaptureMatchesCanonical(preflightCapture, canonical);

    const idempotencyRef = context.repository.getIdempotencyRef().doc(buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_capture_extract_candidates', idempotencyKey));
    const keyHash = idempotencyRef.id;
    const payloadHash = hashPayload({ captureId, expectedVersion, normalizedSha256, regions: regions.map((region) => ({ key: region.key, sha256: region.sha256, mimeType: region.mimeType })), schemaVersion: 1 });
    const nowMs = Date.now();
    const leaseExpiresAtEpochMs = nowMs + COUNT_CAPTURE_EXTRACTION_LEASE_MS;

    const reservation = await db.runTransaction(async (transaction) => {
      const [captureDoc, sessionDoc, idemDoc] = await Promise.all([
        transaction.get(captureRef),
        transaction.get(canonical.sessionRef),
        transaction.get(idempotencyRef),
      ]);
      if (!captureDoc.exists || !sessionDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const capture = captureDoc.data() || {};
      const session = sessionDoc.data() || {};
      if (capture.organizationId !== organizationId || capture.financeEntityId !== financeEntityId || session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
        throw new Error('COUNT_CAPTURE_NOT_FOUND');
      }
      assertCaptureMatchesCanonical(capture, canonical);

      if (idemDoc.exists) {
        const idem = idemDoc.data() || {};
        if (idem.payloadHash !== payloadHash) throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
        if (idem.status === 'completed') return { cached: true as const, result: idem.result };
        if (idem.status === 'in_progress' && Number(idem.expiresAtEpochMs || 0) > nowMs) throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
      }

      if (capture.status !== 'captured' || Number(capture.version) !== expectedVersion) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      if (capture.extraction) throw new Error('COUNT_CAPTURE_EXTRACTION_ALREADY_COMPLETED');
      if (capture.normalized?.sha256 !== normalizedSha256) throw new Error('COUNT_CAPTURE_EXTRACTION_NORMALIZED_MISMATCH');
      if (capture.normalization?.geometry?.mode === 'full_frame') throw new Error('COUNT_CAPTURE_EXTRACTION_REGION_UNAVAILABLE');
      assertStageCanExtract(capture.stage, session);
      if (hasActiveCountCaptureExtractionLease(session, nowMs) && session.captureExtractionLease?.keyHash !== keyHash) throw new Error('COUNT_CAPTURE_EXTRACTION_IN_PROGRESS');

      const regionsByKey = candidateRegions(capture);
      for (const region of regions) if (!regionsByKey[region.key]) throw new Error('COUNT_CAPTURE_EXTRACTION_REGION_UNAVAILABLE');

      transaction.set(idempotencyRef, { status: 'in_progress', payloadHash, startedAtEpochMs: nowMs, expiresAtEpochMs: leaseExpiresAtEpochMs, createdAt: FieldValue.serverTimestamp() });
      transaction.update(canonical.sessionRef, { captureExtractionLease: { keyHash, captureId, stage: capture.stage, requestedByUid: uid, expiresAtEpochMs: leaseExpiresAtEpochMs } });
      return { cached: false as const, regionsByKey };
    });

    if (reservation.cached) return res.status(200).json({ ...reservation.result, requestId });
    cleanup = { db, idempotencyRef, sessionRef: canonical.sessionRef, keyHash, payloadHash };
    const providerResponse = await getCountCaptureExtractionProvider().extract({ regions });
    const candidates = buildCountCaptureCandidatesFromProvider({ provider: providerResponse.result, regions: reservation.regionsByKey });
    const extractionHash = hashPayload({ provider: providerResponse.provider, model: providerResponse.model, revision: providerResponse.revision, fields: providerResponse.result.fields, regionHashes: regions.map((region) => ({ key: region.key, sha256: region.sha256 })) });

    const result = await db.runTransaction(async (transaction) => {
      const [captureDoc, sessionDoc, idemDoc] = await Promise.all([transaction.get(captureRef), transaction.get(canonical.sessionRef), transaction.get(idempotencyRef)]);
      if (!captureDoc.exists || !sessionDoc.exists || !idemDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const capture = captureDoc.data() || {};
      const session = sessionDoc.data() || {};
      const idem = idemDoc.data() || {};
      if (idem.status !== 'in_progress' || idem.payloadHash !== payloadHash) throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
      if (capture.organizationId !== organizationId || capture.financeEntityId !== financeEntityId || session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      assertCaptureMatchesCanonical(capture, canonical);
      if (capture.status !== 'captured' || Number(capture.version) !== expectedVersion || capture.extraction) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      if (capture.normalized?.sha256 !== normalizedSha256) throw new Error('COUNT_CAPTURE_EXTRACTION_NORMALIZED_MISMATCH');
      const lease = session.captureExtractionLease;
      if (lease?.keyHash !== keyHash || Number(lease.expiresAtEpochMs || 0) <= Date.now()) throw new Error('COUNT_CAPTURE_EXTRACTION_LEASE_EXPIRED');
      assertStageCanExtract(capture.stage, session);

      const nextVersion = expectedVersion + 1;
      transaction.update(captureRef, {
        candidates,
        extraction: {
          schemaVersion: 1,
          provider: providerResponse.provider,
          model: providerResponse.model,
          revision: providerResponse.revision,
          normalizedSha256,
          fields: providerResponse.result.fields.map((field) => ({ key: field.key, status: field.status, observation: field.observation, regionSha256: regions.find((region) => region.key === field.key)?.sha256 || null, provenance: 'client_derived_verified_region_request' })),
          requestedByUid: uid,
          completedAt: FieldValue.serverTimestamp(),
        },
        version: nextVersion,
        updatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(canonical.sessionRef, { captureExtractionLease: FieldValue.delete() });
      const auditId = generateCountCaptureAuditId();
      transaction.set(context.repository.getAuditRef().doc(auditId), {
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'count_capture',
        resourceId: captureId,
        action: 'count.capture_candidates_extracted',
        requestId,
        idempotencyKey,
        afterHash: extractionHash,
        metadata: {
          stage: capture.stage,
          provider: providerResponse.provider,
          model: providerResponse.model,
          revision: providerResponse.revision,
          recognizedCount: candidates.filter((candidate) => candidate.state === 'recognized').length,
          uncertainCount: candidates.filter((candidate) => candidate.state === 'uncertain').length,
          unresolvedCount: candidates.filter((candidate) => candidate.state === 'unresolved').length,
          financialValuesEmbedded: false,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      const safeResult = { captureId, version: nextVersion, status: 'captured', extracted: true };
      transaction.set(idempotencyRef, { status: 'completed', payloadHash, result: safeResult, createdAt: idem.createdAt || FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp() });
      return safeResult;
    });
    cleanup = null;
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    if (cleanup) await cleanupFailedReservation(cleanup);
    const message = String(error?.message || '');
    console.error('Count Capture Extract Candidates Error:', message.startsWith('COUNT_') || message.startsWith('FINANCE_') ? message : 'UNEXPECTED_ERROR');
    if (message === 'COUNT_CAPTURE_NOT_FOUND' || message === 'COUNT_CAPTURE_FORM_NOT_FOUND' || message === 'COUNT_SESSION_NOT_FOUND') return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (message === 'COUNT_CAPTURE_EXTRACTION_DISABLED' || message === 'COUNT_CAPTURE_EXTRACTION_NOT_CONFIGURED') return res.status(503).json({ error: 'COUNT_CAPTURE_EXTRACTION_UNAVAILABLE' });
    if (message === 'COUNT_CAPTURE_EXTRACTION_PROVIDER_TIMEOUT' || message === 'COUNT_CAPTURE_EXTRACTION_PROVIDER_UNAVAILABLE') return res.status(503).json({ error: 'COUNT_CAPTURE_EXTRACTION_TEMPORARILY_UNAVAILABLE' });
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT') || message.includes('VERSION_CONFLICT') || ['COUNT_CAPTURE_EXTRACTION_IN_PROGRESS', 'COUNT_CAPTURE_EXTRACTION_LEASE_EXPIRED', 'COUNT_CAPTURE_MATERIAL_HIDDEN', 'COUNT_CAPTURE_EXTRACTION_ALREADY_COMPLETED'].includes(message)) {
      return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : message });
    }
    if (message.startsWith('COUNT_CAPTURE_EXTRACTION_') || message === 'COUNT_CAPTURE_FORM_INTEGRITY_FAILED') return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
