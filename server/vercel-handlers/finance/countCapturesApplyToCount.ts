import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageFinanceFact } from './factStream.js';
import { stageFinanceSignalOpen } from './signalProjection.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { calculateCountEntriesTotalCents, compareCountEntries } from '../../../shared/finance/count.js';
import { isCountCaptureMaterialHidden, isValidCountCaptureId } from '../../../shared/finance/countCapture.js';
import { buildCountCaptureApplyPlan } from '../../../shared/finance/countCaptureApply.js';
import { hasActiveCountCaptureExtractionLease } from '../../../shared/finance/countCaptureExtraction.js';
import { generateCountCaptureAuditId } from './countCaptureHelpers.js';
import { resolveCountCaptureContext } from './countCaptureContext.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, captureId, expectedCaptureVersion, idempotencyKey, requestId } = req.body || {};
    if (
      typeof financeEntityId !== 'string' ||
      !isValidCountCaptureId(captureId) ||
      !Number.isInteger(expectedCaptureVersion) ||
      expectedCaptureVersion < 2 ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, uid, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const captureRef = entityRef.collection('countCaptures').doc(captureId);
    const captureDoc = await captureRef.get();

    if (!captureDoc.exists) return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    const capture = captureDoc.data() || {};
    if (capture.organizationId !== organizationId || capture.financeEntityId !== financeEntityId) {
      return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    }

    if (capture.appliedToCount?.countSessionId && capture.appliedToCount?.stage) {
      return res.status(200).json({
        captureId,
        countSessionId: String(capture.appliedToCount.countSessionId),
        stage: String(capture.appliedToCount.stage),
        status: String(capture.appliedToCount.resultingStatus || ''),
        replayed: true,
        requestId,
      });
    }

    if (capture.status !== 'reviewed' || Number(capture.version) !== expectedCaptureVersion) {
      return res.status(409).json({ error: 'COUNT_CAPTURE_VERSION_CONFLICT' });
    }

    const resolved = await resolveCountCaptureContext({ db, organizationId, financeEntityId, capture });
    const { identity, provenance } = resolved;
    if (isCountCaptureMaterialHidden(identity.stage, resolved.session.status)) {
      return res.status(409).json({ error: 'COUNT_CAPTURE_MATERIAL_HIDDEN' });
    }

    const applyPlan = buildCountCaptureApplyPlan({
      reviewedFields: capture.review?.fields,
      reviewedDenominations: provenance === 'free_form_note' ? undefined : capture.denominationReview?.fields,
    });
    const totalCents = calculateCountEntriesTotalCents(applyPlan.entries);
    const payloadHash = hashPayload({
      captureId,
      expectedCaptureVersion,
      countSessionId: identity.countSessionId,
      stage: identity.stage,
      entries: applyPlan.entries,
      sources: applyPlan.sources,
    });
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'count_capture_apply_' + identity.stage,
      idempotencyKey,
    );

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const [liveCaptureDoc, liveSessionDoc] = await Promise.all([
          transaction.get(captureRef),
          transaction.get(resolved.sessionRef),
        ]);
        if (!liveCaptureDoc.exists || !liveSessionDoc.exists) throw new Error('COUNT_CAPTURE_NOT_FOUND');
        const liveCapture = liveCaptureDoc.data() || {};
        const session = liveSessionDoc.data() || {};

        if (liveCapture.organizationId !== organizationId || liveCapture.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_CAPTURE_NOT_FOUND');
        }
        if (liveCapture.appliedToCount?.countSessionId && liveCapture.appliedToCount?.stage) {
          return {
            captureId,
            countSessionId: String(liveCapture.appliedToCount.countSessionId),
            stage: String(liveCapture.appliedToCount.stage),
            status: String(liveCapture.appliedToCount.resultingStatus || ''),
            replayed: true,
          };
        }
        if (liveCapture.status !== 'reviewed' || Number(liveCapture.version) !== expectedCaptureVersion) {
          throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');
        }
        if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_SESSION_NOT_FOUND');
        }
        if (isCountCaptureMaterialHidden(identity.stage, session.status)) {
          throw new Error('COUNT_CAPTURE_MATERIAL_HIDDEN');
        }

        const livePlan = buildCountCaptureApplyPlan({
          reviewedFields: liveCapture.review?.fields,
          reviewedDenominations: provenance === 'free_form_note' ? undefined : liveCapture.denominationReview?.fields,
        });
        if (hashPayload(livePlan) !== hashPayload(applyPlan)) throw new Error('COUNT_CAPTURE_VERSION_CONFLICT');

        const currentSessionVersion = Number(session.version);
        if (!Number.isInteger(currentSessionVersion) || currentSessionVersion < 1) throw new Error('COUNT_VERSION_CONFLICT');
        const nextSessionVersion = currentSessionVersion + 1;
        const nextCaptureVersion = expectedCaptureVersion + 1;
        let resultingStatus = String(session.status || '');

        const sessionAuditId = 'audit_' + identity.countSessionId.slice(4) + '_' + nextSessionVersion;
        const sessionAuditRef = context.repository.getAuditRef().doc(sessionAuditId);
        const captureAuditId = generateCountCaptureAuditId();
        const captureAuditRef = context.repository.getAuditRef().doc(captureAuditId);

        if (identity.stage === 'count_a') {
          if (session.status !== 'counting_a') throw new Error('COUNT_INVALID_STATE');
          if (Array.isArray(session.countA?.entries) && session.countA.entries.length > 0) {
            throw new Error('COUNT_CAPTURE_APPLY_FIRST_COUNT_ALREADY_EXISTS');
          }
          resultingStatus = 'counting_a';
          transaction.update(resolved.sessionRef, {
            countA: {
              entries: applyPlan.entries,
              totalCents,
              countedByUid: null,
              enteredByUid: uid,
              source: 'count_capture',
              sourceProvenance: provenance,
              sourceCaptureId: captureId,
              sourceFormId: identity.formId,
              savedAt: FieldValue.serverTimestamp(),
            },
            updatedByUid: uid,
            version: nextSessionVersion,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.set(sessionAuditRef, {
            eventId: sessionAuditId,
            organizationId,
            financeEntityId,
            actor: uid,
            resource: 'count_session',
            resourceId: identity.countSessionId,
            action: provenance === 'free_form_note'
              ? 'count.first_count_imported_from_reviewed_note'
              : 'count.first_count_imported_from_reviewed_sheet',
            requestId,
            idempotencyKey,
            afterHash: payloadHash,
            metadata: {
              versionBefore: currentSessionVersion,
              versionAfter: nextSessionVersion,
              stage: 'count_a',
              entryTypes: applyPlan.entries.map((entry) => entry.type),
              sourceCaptureId: captureId,
              sourceFormId: identity.formId,
              provenance,
              materialRedacted: true,
            },
            createdAt: FieldValue.serverTimestamp(),
          });
          stageFinanceFact(transaction, db, {
            organizationId,
            eventType: 'COUNT_UPDATED',
            entityType: 'count_session',
            entityId: identity.countSessionId,
            actorUserId: uid,
            correlationId: requestId,
            payload: {
              financeEntityId,
              status: resultingStatus,
              version: nextSessionVersion,
              stage: provenance === 'free_form_note'
                ? 'first_count_imported_from_reviewed_note'
                : 'first_count_imported_from_reviewed_sheet',
              entryCount: applyPlan.entries.length,
            },
            sourceRefs: [
              { kind: 'record', ref: resolved.sessionRef.path, version: nextSessionVersion },
              { kind: 'record', ref: captureRef.path, version: nextCaptureVersion },
              { kind: 'audit', ref: sessionAuditRef.path },
            ],
          });
        } else if (identity.stage === 'count_b') {
          if (session.status !== 'counting_b') throw new Error('COUNT_INVALID_STATE');
          if (!Array.isArray(session.countA?.entries) || session.countA.entries.length === 0) {
            throw new Error('COUNT_FIRST_COUNT_REQUIRED');
          }
          if (session.countB?.entries?.length > 0) throw new Error('COUNT_CAPTURE_APPLY_SECOND_COUNT_ALREADY_EXISTS');
          if (hasActiveCountCaptureExtractionLease(session)) throw new Error('COUNT_CAPTURE_EXTRACTION_IN_PROGRESS');

          const comparison = compareCountEntries(session.countA.entries, applyPlan.entries);
          resultingStatus = comparison.matched ? 'matched' : 'divergent';
          transaction.update(resolved.sessionRef, {
            status: resultingStatus,
            countB: {
              entries: applyPlan.entries,
              totalCents,
              countedByUid: null,
              enteredByUid: uid,
              source: 'count_capture',
              sourceProvenance: provenance,
              sourceCaptureId: captureId,
              sourceFormId: identity.formId,
              sealedAt: FieldValue.serverTimestamp(),
            },
            comparison: {
              ...comparison,
              resolvedBy: comparison.matched ? 'direct_match' : null,
              sealedAt: FieldValue.serverTimestamp(),
            },
            updatedByUid: uid,
            version: nextSessionVersion,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.set(sessionAuditRef, {
            eventId: sessionAuditId,
            organizationId,
            financeEntityId,
            actor: uid,
            resource: 'count_session',
            resourceId: identity.countSessionId,
            action: provenance === 'free_form_note'
              ? 'count.second_count_imported_from_reviewed_note'
              : 'count.second_count_imported_from_reviewed_sheet',
            requestId,
            idempotencyKey,
            afterHash: payloadHash,
            metadata: {
              versionBefore: currentSessionVersion,
              versionAfter: nextSessionVersion,
              stage: 'count_b',
              status: resultingStatus,
              matched: comparison.matched,
              sourceCaptureId: captureId,
              sourceFormId: identity.formId,
              materialRedacted: true,
            },
            createdAt: FieldValue.serverTimestamp(),
          });
          const sourceRefs = [
            { kind: 'record' as const, ref: resolved.sessionRef.path, version: nextSessionVersion },
            { kind: 'record' as const, ref: captureRef.path, version: nextCaptureVersion },
            { kind: 'audit' as const, ref: sessionAuditRef.path },
          ];
          const factId = stageFinanceFact(transaction, db, {
            organizationId,
            eventType: comparison.matched ? 'COUNT_COMPLETED' : 'COUNT_DIVERGENCE_FOUND',
            entityType: 'count_session',
            entityId: identity.countSessionId,
            actorUserId: uid,
            correlationId: requestId,
            payload: {
              financeEntityId,
              status: resultingStatus,
              version: nextSessionVersion,
              stage: provenance === 'free_form_note'
                ? 'second_count_imported_from_reviewed_note'
                : 'second_count_imported_from_reviewed_sheet',
              matched: comparison.matched,
              divergenceCount: comparison.differences.length,
            },
            sourceRefs,
          });
          if (!comparison.matched) {
            stageFinanceSignalOpen(transaction, db, {
              organizationId,
              financeEntityId,
              signalType: 'COUNT_DIVERGENCE_REVIEW_REQUIRED',
              entityType: 'count_session',
              entityId: identity.countSessionId,
              sourceFactId: factId,
              sourceRefs,
            });
          }
        } else {
          throw new Error('COUNT_CAPTURE_APPLY_UNSUPPORTED_STAGE');
        }

        transaction.update(captureRef, {
          appliedToCount: {
            countSessionId: identity.countSessionId,
            stage: identity.stage,
            sessionVersion: nextSessionVersion,
            resultingStatus,
            appliedByUid: uid,
            appliedAt: FieldValue.serverTimestamp(),
          },
          version: nextCaptureVersion,
          updatedByUid: uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(captureAuditRef, {
          eventId: captureAuditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'count_capture',
              sourceProvenance: provenance,
          resourceId: captureId,
          action: 'count.capture_applied_to_count',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            countSessionId: identity.countSessionId,
            stage: identity.stage,
            resultingStatus,
            provenance,
            materialRedacted: true,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          captureId,
          countSessionId: identity.countSessionId,
          stage: identity.stage,
          status: resultingStatus,
          replayed: false,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || '');
    console.error('Count Capture Apply Error:', message.startsWith('COUNT_') ? message : 'UNEXPECTED_ERROR');
    if (['COUNT_CAPTURE_NOT_FOUND', 'COUNT_CAPTURE_FORM_NOT_FOUND', 'COUNT_SESSION_NOT_FOUND'].includes(message)) {
      return res.status(404).json({ error: 'COUNT_CAPTURE_NOT_FOUND' });
    }
    if (
      message.includes('VERSION_CONFLICT') ||
      message.includes('FINANCE_IDEMPOTENCY_CONFLICT') ||
      message === 'COUNT_CAPTURE_MATERIAL_HIDDEN' ||
      message === 'COUNT_CAPTURE_DENOMINATION_TOTAL_MISMATCH' ||
      message === 'COUNT_CAPTURE_APPLY_FIRST_COUNT_ALREADY_EXISTS' ||
      message === 'COUNT_CAPTURE_APPLY_SECOND_COUNT_ALREADY_EXISTS' ||
      message === 'COUNT_CAPTURE_EXTRACTION_IN_PROGRESS'
    ) {
      return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : message });
    }
    if (message.startsWith('COUNT_')) return res.status(400).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
