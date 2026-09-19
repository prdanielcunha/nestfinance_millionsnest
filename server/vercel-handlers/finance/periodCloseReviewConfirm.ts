import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import type { PeriodCloseReviewConfirmResponse } from '../../../shared/finance/periodCloseReview.js';
import { isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { loadPeriodCloseReadModel, parsePeriod } from './periodCloseReadModel.js';

function auditIdFor(reviewId: string) {
  return 'audit_' + createHash('sha256')
    .update('period-close-review|' + reviewId)
    .digest('hex')
    .slice(0, 40);
}

async function actorDisplayName(db: any, uid: string) {
  try {
    const snapshot = await db.collection('user_profiles').doc(uid).get();
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const value =
      typeof data.name === 'string' && data.name.trim()
        ? data.name.trim()
        : typeof data.displayName === 'string' && data.displayName.trim()
          ? data.displayName.trim()
          : null;
    if (value) return value.slice(0, 120);
  } catch {
    // Human-readable enrichment only; authorization never depends on the profile document.
  }
  return 'Usuário da equipe';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const financeEntityId = req.body?.financeEntityId;
    const period = parsePeriod(req.body?.period);
    const requestId = req.body?.requestId;
    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !period ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, uid, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.review');
    const displayName = await actorDisplayName(db, uid);

    const result = await db.runTransaction(async (transaction: any) => {
      const loaded = await loadPeriodCloseReadModel({
        db,
        organizationId,
        financeEntityId,
        context,
        period,
        transaction,
      });

      if (
        loaded.response.readiness.state !== 'ready_for_review' ||
        loaded.response.readiness.blockerCount !== 0
      ) {
        const blocked: any = new Error('PERIOD_CLOSE_REVIEW_BLOCKED');
        blocked.status = 409;
        blocked.blockers = loaded.response.readiness.blockers.map((item) => ({
          code: item.code,
          count: item.count,
        }));
        throw blocked;
      }

      if (
        loaded.response.humanReview.state === 'reviewed_current_snapshot' &&
        loaded.response.humanReview.reviewId
      ) {
        const reviewedAt = loaded.response.humanReview.reviewedAt || new Date(0).toISOString();
        const response: PeriodCloseReviewConfirmResponse = {
          reviewId: loaded.response.humanReview.reviewId,
          financeEntityId,
          periodKey: period.key,
          reviewedAt,
          reviewedByDisplayName:
            loaded.response.humanReview.reviewedByDisplayName || displayName,
          replayed: true,
          currentSnapshot: true,
          authority: {
            financialMutation: false,
            closeMutation: false,
            periodClosed: false,
            officialReport: false,
          },
        };
        return response;
      }

      const reviewedAt = Timestamp.now();
      const reviewedAtIso = reviewedAt.toDate().toISOString();
      const reviewRef = context.repository
        .getPeriodCloseReviewsRef()
        .doc(loaded.expectedReviewId);

      transaction.set(reviewRef, {
        reviewId: loaded.expectedReviewId,
        organizationId,
        financeEntityId,
        periodKey: period.key,
        periodStartDate: period.startDate,
        periodEndDateExclusive: period.endDateExclusive,
        sourceFingerprint: loaded.sourceFingerprint,
        sourceSnapshotSchema: 1,
        status: 'reviewed_current_snapshot',
        immutable: true,
        reviewedByUid: uid,
        reviewedByDisplayName: displayName,
        reviewedAt,
        requestId,
        authority: {
          financialMutation: false,
          closeMutation: false,
          periodClosed: false,
          officialReport: false,
        },
        snapshot: {
          readinessVersion: loaded.response.version,
          readinessState: loaded.response.readiness.state,
          blockerCount: loaded.response.readiness.blockerCount,
          transactions: {
            total: loaded.response.transactions.total,
            capturedIncomeCents: loaded.response.transactions.capturedIncomeCents,
            capturedExpenseCents: loaded.response.transactions.capturedExpenseCents,
            postedIncomeCents: loaded.response.transactions.postedIncomeCents,
            postedExpenseCents: loaded.response.transactions.postedExpenseCents,
            statusCounts: loaded.response.transactions.statusCounts,
          },
          countSessions: loaded.response.countSessions,
          documents: loaded.response.documents,
          reconciliation: loaded.response.reconciliation,
        },
        schemaVersion: 1,
      });

      transaction.set(context.repository.getAuditRef().doc(auditIdFor(loaded.expectedReviewId)), {
        eventId: auditIdFor(loaded.expectedReviewId),
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'period_close_review',
        resourceId: loaded.expectedReviewId,
        action: 'period.close_review_confirmed',
        requestId,
        metadata: {
          periodKey: period.key,
          status: 'reviewed_current_snapshot',
        },
        createdAt: reviewedAt,
      });

      const response: PeriodCloseReviewConfirmResponse = {
        reviewId: loaded.expectedReviewId,
        financeEntityId,
        periodKey: period.key,
        reviewedAt: reviewedAtIso,
        reviewedByDisplayName: displayName,
        replayed: false,
        currentSnapshot: true,
        authority: {
          financialMutation: false,
          closeMutation: false,
          periodClosed: false,
          officialReport: false,
        },
      };
      return response;
    });

    return res.status(200).json(result);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status === 409 && message === 'PERIOD_CLOSE_REVIEW_BLOCKED') {
      return res.status(409).json({
        error: message,
        blockers: Array.isArray(error.blockers) ? error.blockers : [],
      });
    }
    if (error?.status) {
      return res.status(error.status).json({ error: message || error.error || 'REQUEST_FAILED' });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (
      message === 'FINANCE_ENTITY_MISMATCH' ||
      message === 'PERIOD_CLOSE_REVIEW_INTEGRITY_MISMATCH'
    ) {
      return res.status(409).json({ error: message });
    }
    if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Period Close Review Confirm Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
