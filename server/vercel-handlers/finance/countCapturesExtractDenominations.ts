import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { isCountCaptureMaterialHidden, isValidCountCaptureId, isValidCountCaptureSha256, type CountCaptureRegion } from '../../../shared/finance/countCapture.js';
import { COUNT_CAPTURE_EXTRACTION_LEASE_MS, hasActiveCountCaptureExtractionLease } from '../../../shared/finance/countCaptureExtraction.js';
import {
  COUNT_CAPTURE_DENOMINATION_MAX_REGION_BYTES,
  COUNT_CAPTURE_DENOMINATION_MAX_TOTAL_BYTES,
  buildCountCaptureDenominationCandidatesFromProvider,
  buildUnresolvedCountCaptureDenominationCandidates,
  validateCountCaptureDenominationRegionInputs,
  type CountCaptureDenominationCellKey,
} from '../../../shared/finance/countCaptureDenominations.js';
import { generateCountCaptureAuditId, resolveCanonicalCountPaperForm } from './countCaptureHelpers.js';
import { getCountCaptureDenominationExtractionProvider } from './countCaptureDenominationExtractionProvider.js';

function assertStageCanExtract(stage: 'count_a' | 'count_b', session: any) {
  const status = String(session?.status || '');
  if (isCountCaptureMaterialHidden(stage, status as any)) throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');
  if (stage === 'count_a' && status !== 'counting_a') throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_STAGE_STATE');
  if (stage === 'count_b' && status !== 'counting_b') throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_STAGE_STATE');
}

function assertCaptureMatchesCanonical(capture: any, canonical: Awaited<ReturnType<typeof resolveCanonicalCountPaperForm>>) {
  if (capture.formId !== canonical.form.id || capture.countSessionId !== canonical.form.countSessionId || capture.stage !== canonical.form.stage || capture.templateVersion !== canonical.form.templateVersion || capture.checksum !== canonical.form.checksum) {
    throw new Error('COUNT_CAPTURE_FORM_INTEGRITY_FAILED');
  }
}

function verifyRegionBytes(regions: ReturnType<typeof validateCountCaptureDenominationRegionInputs>) {
  let totalBytes = 0;
  for (const region of regions) {
    const bytes = Buffer.from(region.dataBase64, 'base64');
    const jpegMagic = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!jpegMagic || bytes.length > COUNT_CAPTURE_DENOMINATION_MAX_REGION_BYTES || bytes.toString('base64') !== region.dataBase64) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
    totalBytes += bytes.length;
    if (totalBytes > COUNT_CAPTURE_DENOMINATION_MAX_TOTAL_BYTES) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
    if (createHash('sha256').update(bytes).digest('hex') !== region.sha256) throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_HASH_MISMATCH');
  }
}

function expectedRegions(capture: any): Partial<Record<CountCaptureDenominationCellKey, CountCaptureRegion | null>> {
  const source = Array.isArray(capture?.denominationCandidates) && capture.denominationCandidates.length > 0
    ? capture.denominationCandidates
    : buildUnresolvedCountCaptureDenominationCandidates(Number(capture?.templateVersion || 1));
  const output: Partial<Record<CountCaptureDenominationCellKey, CountCaptureRegion | null>> = {};
  for (const candidate of source) if (candidate?.cellKey) output[candidate.cellKey as CountCaptureDenominationCellKey] = candidate.region || null;
  return output;
}

type CleanupReservation = { db: Firestore; idempotencyRef: DocumentReference; sessionRef: DocumentReference; keyHash: string; payloadHash: string };
async function cleanupFailedReservation(input: CleanupReservation) {
  try {
    await input.db.runTransaction(async (transaction) => {
      const [idempotencyDoc, sessionDoc] = await Promise.all([transaction.get(input.idempotencyRef), transaction.get(input.sessionRef)]);
      if (idempotencyDoc.exists) {
        const data = idempotencyDoc.data() || {};
        if (data.status === 'in_progress' && data.payloadHash === input.payloadHash) transaction.delete(input.idempotencyRef);
      }
      if (sessionDoc.exists && sessionDoc.data()?.captureExtractionLease?.keyHash === input.keyHash) transaction.update(input.sessionRef, { captureExtractionLease: FieldValue.delete() });
    });
  } catch {
    // Lease is time bounded; failure cleanup is best effort.
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  let cleanup: CleanupReservation | null = null;
  try {
    const { financeEntityId, captureId, expectedVersion, normalizedSha256, regions: rawRegions, idempotencyKey, requestId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isValidCountCaptureId(captureId) || !Number.isInteger(expectedVersion) || expectedVersion < 2 || !isValidCountCaptureSha256(normalizedSha256) || !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    const regions = validateCountCaptureDenominationRegionInputs(rawRegions);
    verifyRegionBytes(regions);

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const captureRef = entityRef.collection('countCaptures').doc(captureId);
    const preflight = await captureRef.get();
    if (!preflight.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const preflightCapture = preflight.data() || {};
    if (preflightCapture.organizationId !== organizationId || preflightCapture.financeEntityId !== financeEntityId) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const canonical = await resolveCanonicalCountPaperForm({ db, organizationId, financeEntityId, formId: preflightCapture.formId });
    assertCaptureMatchesCanonical(preflightCapture, canonical);

    const idempotencyRef = context.repository.getIdempotencyRef().doc(buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'count_capture_extract_denominations', idempotencyKey));
    const keyHash = idempotencyRef.id;
    const payloadHash = hashPayload({ captureId, expectedVersion, normalizedSha256, regions: regions.map((region) => ({ cellKey: region.cellKey, sha256: region.sha256, mimeType: region.mimeType })), schemaVersion: 1 });
    const nowMs = Date.now();
    const leaseExpiresAtEpochMs = nowMs + COUNT_CAPTURE_EXTRACTION_LEASE_MS;

    const reservation = await db.runTransaction(async (transaction) => {
      const [captureDoc, sessionDoc, idemDoc] = await Promise.all([transaction.get(captureRef), transaction.get(canonical.sessionRef), transaction.get(idempotencyRef)]);
      if (!captureDoc.exists || !sessionDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const capture = captureDoc.data() || {};
      const session = sessionDoc.data() || {};
      if (capture.organizationId !== organizationId || capture.financeEntityId !== financeEntityId || session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      assertCaptureMatchesCanonical(capture, canonical);
      if (idemDoc.exists) {
        const idem = idemDoc.data() || {};
        if (idem.payloadHash !== payloadHash) throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
        if (idem.status === 'completed') return { cached: true as const, result: idem.result };
        if (idem.status === 'in_progress' && Number(idem.expiresAtEpochMs || 0) > nowMs) throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
      }
      if (!['captured', 'reviewed'].includes(String(capture.status)) || Number(capture.version) !== expectedVersion) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      if (capture.denominationExtraction) throw new Error('COUNT_CAPTURE_DENOMINATION_ALREADY_COMPLETED');
      if (capture.normalized?.sha256 !== normalizedSha256) throw new Error('COUNT_CAPTURE_DENOMINATION_NORMALIZED_MISMATCH');
      if (capture.normalization?.geometry?.mode === 'full_frame') throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_UNAVAILABLE');
      assertStageCanExtract(capture.stage, session);
      if (hasActiveCountCaptureExtractionLease(session, nowMs) && session.captureExtractionLease?.keyHash !== keyHash) throw new Error('COUNT_CAPTURE_EXTRACTION_IN_PROGRESS');
      const regionsByKey = expectedRegions(capture);
      for (const region of regions) if (!regionsByKey[region.cellKey]) throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_UNAVAILABLE');

      transaction.set(idempotencyRef, { status: 'in_progress', payloadHash, startedAtEpochMs: nowMs, expiresAtEpochMs: leaseExpiresAtEpochMs, createdAt: FieldValue.serverTimestamp() });
      transaction.update(canonical.sessionRef, { captureExtractionLease: { keyHash, captureId, stage: capture.stage, kind: 'denominations', requestedByUid: uid, expiresAtEpochMs: leaseExpiresAtEpochMs } });
      return { cached: false as const, regionsByKey };
    });

    if (reservation.cached) return res.status(200).json({ ...reservation.result, requestId });
    cleanup = { db, idempotencyRef, sessionRef: canonical.sessionRef, keyHash, payloadHash };
    const providerResponse = await getCountCaptureDenominationExtractionProvider().extract({ regions });
    const candidates = buildCountCaptureDenominationCandidatesFromProvider({ provider: providerResponse.result, regions: reservation.regionsByKey });
    const extractionHash = hashPayload({ provider: providerResponse.provider, model: providerResponse.model, revision: providerResponse.revision, statuses: providerResponse.result.fields.map((field) => ({ cellKey: field.cellKey, status: field.status })), regionHashes: regions.map((region) => ({ cellKey: region.cellKey, sha256: region.sha256 })) });

    const result = await db.runTransaction(async (transaction) => {
      const [captureDoc, sessionDoc, idemDoc] = await Promise.all([transaction.get(captureRef), transaction.get(canonical.sessionRef), transaction.get(idempotencyRef)]);
      if (!captureDoc.exists || !sessionDoc.exists || !idemDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
      const capture = captureDoc.data() || {};
      const session = sessionDoc.data() || {};
      const idem = idemDoc.data() || {};
      if (idem.status !== 'in_progress' || idem.payloadHash !== payloadHash) throw new Error('FINANCE_IDEMPOTENCY_CONFLICT');
      assertCaptureMatchesCanonical(capture, canonical);
      if (!['captured', 'reviewed'].includes(String(capture.status)) || Number(capture.version) !== expectedVersion || capture.denominationExtraction) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
      if (capture.normalized?.sha256 !== normalizedSha256) throw new Error('COUNT_CAPTURE_DENOMINATION_NORMALIZED_MISMATCH');
      const lease = session.captureExtractionLease;
      if (lease?.keyHash !== keyHash || Number(lease.expiresAtEpochMs || 0) <= Date.now()) throw new Error('COUNT_CAPTURE_DENOMINATION_LEASE_EXPIRED');
      assertStageCanExtract(capture.stage, session);

      const nextVersion = expectedVersion + 1;
      transaction.update(captureRef, {
        denominationCandidates: candidates,
        denominationExtraction: {
          schemaVersion: 1,
          provider: providerResponse.provider,
          model: providerResponse.model,
          revision: providerResponse.revision,
          normalizedSha256,
          fields: providerResponse.result.fields.map((field) => ({ cellKey: field.cellKey, status: field.status, observation: field.observation, regionSha256: regions.find((region) => region.cellKey === field.cellKey)?.sha256 || null, provenance: 'client_derived_verified_denomination_cell' })),
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
        eventId: auditId, organizationId, financeEntityId, actor: uid, resource: 'count_capture', resourceId: captureId,
        action: 'count.capture_denomination_candidates_extracted', requestId, idempotencyKey, afterHash: extractionHash,
        metadata: {
          stage: capture.stage, provider: providerResponse.provider, model: providerResponse.model, revision: providerResponse.revision,
          recognizedCount: candidates.filter((candidate) => candidate.state === 'recognized').length,
          uncertainCount: candidates.filter((candidate) => candidate.state === 'uncertain').length,
          unresolvedCount: candidates.filter((candidate) => candidate.state === 'unresolved').length,
          financialValuesEmbedded: false,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      const safeResult = { captureId, version: nextVersion, status: capture.status, extracted: true };
      transaction.set(idempotencyRef, { status: 'completed', payloadHash, result: safeResult, createdAt: idem.createdAt || FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp() });
      return safeResult;
    });
    cleanup = null;
    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    if (cleanup) await cleanupFailedReservation(cleanup);
    const message = String(error?.message || '');
    console.error('Count Capture Denomination Extraction Error:', message.startsWith('COUNT_') || message.startsWith('FINANCE_') ? message : 'UNEXPECTED_ERROR');
    if (['COUNT_CAPTURE_NOT_FOUND', 'COUNT_CAPTURE_FORM_NOT_FOUND', 'COUNT_SESSION_NOT_FOUND'].includes(message)) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    if (['COUNT_CAPTURE_DENOMINATION_EXTRACTION_DISABLED', 'COUNT_CAPTURE_DENOMINATION_EXTRACTION_NOT_CONFIGURED'].includes(message)) return res.status(503).json({ error: 'COUNT_CAPTURE_DENOMINATION_EXTRACTION_UNAVAILABLE' });
    if (['COUNT_CAPTURE_DENOMINATION_PROVIDER_TIMEOUT', 'COUNT_CAPTURE_DENOMINATION_PROVIDER_UNAVAILABLE'].includes(message)) return res.status(503).json({ error: 'COUNT_CAPTURE_DENOMINATION_EXTRACTION_TEMPORARILY_UNAVAILABLE' });
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT') || message.includes('VERSION_CONFLICT') || ['COUNT_CAPTURE_EXTRACTION_IN_PROGRESS', 'COUNT_CAPTURE_DENOMINATION_LEASE_EXPIRED', 'COUNT_CAPTURE_MATERIAL_HIDDEN', 'COUNT_CAPTURE_DENOMINATION_ALREADY_COMPLETED'].includes(message)) return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : message });
    if (message.startsWith('COUNT_CAPTURE_DENOMINATION_') || message === 'COUNT_CAPTURE_FORM_INTEGRITY_FAILED') return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
