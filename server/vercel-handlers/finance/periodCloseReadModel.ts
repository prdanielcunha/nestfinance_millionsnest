import { createHash } from 'node:crypto';
import type { firestore } from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  buildPeriodCloseReadiness,
  PERIOD_CLOSE_MAX_COUNT_SESSIONS,
  PERIOD_CLOSE_MAX_EVIDENCE,
  PERIOD_CLOSE_MAX_TRANSACTIONS,
  type PeriodCloseReadinessResponse,
  type PeriodCloseReviewChangedArea,
} from '../../../shared/finance/periodCloseReadiness.js';
import { getTransactionListQueryBounds } from '../../../shared/finance/ledger/listQueryKeys.js';
import { normalizeAccountType } from '../../../shared/finance/smartLogic.js';

export type ParsedPeriod = {
  key: string;
  start: Date;
  end: Date;
  startDate: string;
  endDateExclusive: string;
};

export type PeriodCloseReadModel = {
  response: PeriodCloseReadinessResponse;
  sourceFingerprint: string;
  expectedReviewId: string;
};

export function parsePeriod(value: unknown): ParsedPeriod | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    key: value,
    start,
    end,
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  };
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') {
    try { return value.toDate().toISOString(); } catch { return null; }
  }
  return null;
}

function eligibleBankAccount(data: any) {
  const type = normalizeAccountType(data?.type);
  return data?.active !== false &&
    data?.configurationStatus === 'complete' &&
    data?.nature === 'asset' &&
    (type === 'bank_checking' || type === 'bank_savings' || type === 'payment_account');
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

async function queryGet(query: any, tx?: firestore.Transaction) {
  return tx ? tx.get(query) : query.get();
}

async function docGet(ref: any, tx?: firestore.Transaction) {
  return tx ? tx.get(ref) : ref.get();
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function detectChangedAreas(previousSnapshot: any, current: PeriodCloseReadinessResponse): PeriodCloseReviewChangedArea[] {
  if (!previousSnapshot || typeof previousSnapshot !== 'object') return ['unknown'];

  const areas: PeriodCloseReviewChangedArea[] = [];

  const previousTransactions =
    previousSnapshot.transactions && typeof previousSnapshot.transactions === 'object'
      ? previousSnapshot.transactions
      : {
          total: previousSnapshot.transactionTotal,
          statusCounts: previousSnapshot.transactionStatusCounts,
        };

  const currentTransactions = {
    total: current.transactions.total,
    capturedIncomeCents: current.transactions.capturedIncomeCents,
    capturedExpenseCents: current.transactions.capturedExpenseCents,
    postedIncomeCents: current.transactions.postedIncomeCents,
    postedExpenseCents: current.transactions.postedExpenseCents,
    statusCounts: current.transactions.statusCounts,
  };

  if (!sameJson(previousTransactions, currentTransactions)) areas.push('transactions');
  if (!sameJson(previousSnapshot.countSessions, current.countSessions)) areas.push('counts');
  if (!sameJson(previousSnapshot.documents, current.documents)) areas.push('documents');
  if (!sameJson(previousSnapshot.reconciliation, current.reconciliation)) areas.push('reconciliation');

  return areas.length ? areas : ['unknown'];
}

export async function loadPeriodCloseReadModel(args: {
  db: firestore.Firestore;
  organizationId: string;
  financeEntityId: string;
  context: any;
  period: ParsedPeriod;
  transaction?: firestore.Transaction;
}): Promise<PeriodCloseReadModel> {
  const { db, organizationId, financeEntityId, context, period, transaction } = args;
  const txBounds = getTransactionListQueryBounds(
    financeEntityId,
    undefined,
    undefined,
    period.start.toISOString(),
    period.end.toISOString(),
  );

  const entityRef = db
    .collection('organizations')
    .doc(organizationId)
    .collection('financeEntities')
    .doc(financeEntityId);

  const transactionQuery = context.repository
    .getTransactionsQuery()
    .where(txBounds.field, '>=', txBounds.startAt)
    .where(txBounds.field, '<', txBounds.endBefore)
    .orderBy(txBounds.field, 'asc')
    .limit(PERIOD_CLOSE_MAX_TRANSACTIONS + 1);

  const countQuery = entityRef
    .collection('countSessions')
    .where('serviceDate', '>=', period.startDate)
    .where('serviceDate', '<', period.endDateExclusive)
    .limit(PERIOD_CLOSE_MAX_COUNT_SESSIONS + 1);

  const evidenceQuery = entityRef
    .collection('universalEvidence')
    .where('createdAt', '>=', Timestamp.fromDate(period.start))
    .where('createdAt', '<', Timestamp.fromDate(period.end))
    .limit(PERIOD_CLOSE_MAX_EVIDENCE + 1);

  const accountsQuery = context.repository.getAccountsQuery().limit(1000);

  const [txSnapshot, countSnapshot, evidenceSnapshot, accountsSnapshot] = await Promise.all([
    queryGet(transactionQuery, transaction),
    queryGet(countQuery, transaction),
    queryGet(evidenceQuery, transaction),
    queryGet(accountsQuery, transaction),
  ]);

  if (txSnapshot.size > PERIOD_CLOSE_MAX_TRANSACTIONS) {
    throw Object.assign(new Error('PERIOD_CLOSE_TRANSACTION_SCOPE_TOO_LARGE'), { status: 422 });
  }
  if (countSnapshot.size > PERIOD_CLOSE_MAX_COUNT_SESSIONS) {
    throw Object.assign(new Error('PERIOD_CLOSE_COUNT_SCOPE_TOO_LARGE'), { status: 422 });
  }
  if (evidenceSnapshot.size > PERIOD_CLOSE_MAX_EVIDENCE) {
    throw Object.assign(new Error('PERIOD_CLOSE_EVIDENCE_SCOPE_TOO_LARGE'), { status: 422 });
  }

  const fingerprintTransactions: any[] = [];
  const transactions = txSnapshot.docs.flatMap((doc: any) => {
    const data = doc.data() || {};
    context.repository.assertEntityIsolation(data);
    const occurredAt = toIso(data.occurredAt);
    if (!occurredAt) return [];
    const occurred = new Date(occurredAt);
    if (occurred < period.start || occurred >= period.end) return [];

    fingerprintTransactions.push({
      id: doc.id,
      transactionKind: String(data.transactionKind || data.direction || ''),
      status: String(data.status || ''),
      amountCents: Number(data.amountCents || 0),
      occurredAt,
      version: Number(data.version || 0),
      contentVersion: Number(data.contentVersion || 0),
      reconciliationStatus: data.reconciliationStatus || null,
      reconciliationId: data.reconciliationId || null,
      accountId: data.accountId || null,
      sourceAccountId: data.sourceAccountId || null,
      destinationAccountId: data.destinationAccountId || null,
    });

    return [{
      transactionKind: String(data.transactionKind || data.direction || ''),
      status: String(data.status || ''),
      amountCents: Number(data.amountCents || 0),
      reconciliationStatus: data.reconciliationStatus || null,
      accountId: data.accountId || null,
      sourceAccountId: data.sourceAccountId || null,
      destinationAccountId: data.destinationAccountId || null,
    }];
  });

  const fingerprintCounts: any[] = [];
  const countSessions = countSnapshot.docs.map((doc: any) => {
    const data = doc.data() || {};
    if (data.financeEntityId && data.financeEntityId !== financeEntityId) {
      throw new Error('FINANCE_ENTITY_MISMATCH');
    }
    fingerprintCounts.push({
      id: doc.id,
      status: String(data.status || ''),
      serviceDate: String(data.serviceDate || ''),
      version: Number(data.version || 0),
      updatedAt: toIso(data.updatedAt),
    });
    return { status: String(data.status || '') };
  });

  const fingerprintEvidence: any[] = [];
  const evidence = evidenceSnapshot.docs.map((doc: any) => {
    const data = doc.data() || {};
    if (data.organizationId !== organizationId || data.financeEntityId !== financeEntityId) {
      throw new Error('FINANCE_ENTITY_MISMATCH');
    }
    fingerprintEvidence.push({
      id: doc.id,
      version: Number(data.version || 0),
      processingState: String(data.processingState || ''),
      duplicate: data.duplicate === true,
      classificationSource: data.classification?.source || null,
      documentType: data.classification?.documentType || null,
      reviewStatus: data.review?.status || null,
      reviewedAt: toIso(data.review?.reviewedAt),
    });
    return {
      processingState: String(data.processingState || ''),
      duplicate: data.duplicate === true,
      humanClassified: data.classification?.source === 'human',
      reviewStatus: typeof data.review?.status === 'string' ? data.review.status : null,
    };
  });

  const configuredBankAccountIds = accountsSnapshot.docs.flatMap((doc: any) => {
    const data = doc.data() || {};
    context.repository.assertEntityIsolation(data);
    return eligibleBankAccount(data) ? [doc.id] : [];
  }).sort();

  fingerprintTransactions.sort((a, b) => a.id.localeCompare(b.id));
  fingerprintCounts.sort((a, b) => a.id.localeCompare(b.id));
  fingerprintEvidence.sort((a, b) => a.id.localeCompare(b.id));

  const sourceFingerprint = hash(stableJson({
    schema: 1,
    organizationId,
    financeEntityId,
    periodKey: period.key,
    configuredBankAccountIds,
    transactions: fingerprintTransactions,
    countSessions: fingerprintCounts,
    evidence: fingerprintEvidence,
  }));
  const expectedReviewId = 'pcr_' + hash(
    'period-close-review|' + organizationId + '|' + financeEntityId + '|' + period.key + '|' + sourceFingerprint,
  ).slice(0, 40);

  const reviewRef = context.repository.getPeriodCloseReviewsRef().doc(expectedReviewId);
  const reviewSnapshot = await docGet(reviewRef, transaction);
  const reviewData = reviewSnapshot.exists ? reviewSnapshot.data() || {} : null;
  if (reviewData) {
    context.repository.assertEntityIsolation(reviewData);
    if (
      reviewData.organizationId !== organizationId ||
      reviewData.periodKey !== period.key ||
      reviewData.sourceFingerprint !== sourceFingerprint
    ) {
      throw new Error('PERIOD_CLOSE_REVIEW_INTEGRITY_MISMATCH');
    }
  }

  const response = buildPeriodCloseReadiness({
    financeEntityId,
    periodKey: period.key,
    startDate: period.startDate,
    endDateExclusive: period.endDateExclusive,
    configuredBankAccountIds,
    transactions,
    countSessions,
    evidence,
  });

  if (reviewData) {
    response.humanReview = {
      state: 'reviewed_current_snapshot',
      reviewId: expectedReviewId,
      reviewedAt: toIso(reviewData.reviewedAt),
      reviewedByDisplayName:
        typeof reviewData.reviewedByDisplayName === 'string'
          ? reviewData.reviewedByDisplayName.slice(0, 120)
          : null,
      sourceSnapshotMatches: true,
      changedAreas: [],
    };
  } else {
    const latestReviewQuery = context.repository
      .getPeriodCloseReviewsQuery()
      .where('periodKey', '==', period.key)
      .orderBy('reviewedAt', 'desc')
      .limit(1);
    const latestReviewSnapshot = await queryGet(latestReviewQuery, transaction);
    const latestReviewDoc = latestReviewSnapshot.docs?.[0];

    if (latestReviewDoc) {
      const latestReview = latestReviewDoc.data() || {};
      context.repository.assertEntityIsolation(latestReview);
      if (
        latestReview.organizationId !== organizationId ||
        latestReview.periodKey !== period.key
      ) {
        throw new Error('PERIOD_CLOSE_REVIEW_INTEGRITY_MISMATCH');
      }

      response.humanReview = {
        state: 'review_outdated',
        reviewId: latestReviewDoc.id,
        reviewedAt: toIso(latestReview.reviewedAt),
        reviewedByDisplayName:
          typeof latestReview.reviewedByDisplayName === 'string'
            ? latestReview.reviewedByDisplayName.slice(0, 120)
            : null,
        sourceSnapshotMatches: false,
        changedAreas: detectChangedAreas(latestReview.snapshot, response),
      };
    }
  }

  return { response, sourceFingerprint, expectedReviewId };
}
