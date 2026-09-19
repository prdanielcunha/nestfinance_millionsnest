import type { PeriodCloseReadinessResponse } from './periodCloseReadiness.js';

export const REPORTS_INTELLIGENCE_VERSION = 1 as const;

export type ReportTrendDirection = 'higher' | 'lower' | 'same';

export type ReportMetricComparison = {
  current: number;
  previous: number;
  delta: number;
  direction: ReportTrendDirection;
  percentChangeBasisPoints: number | null;
};

export type ReportRateComparison = {
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: ReportTrendDirection | 'not_comparable';
};

export type ReportsIntelligenceResponse = {
  version: typeof REPORTS_INTELLIGENCE_VERSION;
  financeEntityId: string;
  currentPeriodKey: string;
  comparisonPeriodKey: string;
  currentSnapshot: PeriodCloseReadinessResponse;
  authority: {
    readOnly: true;
    financialMutation: false;
    closeMutation: false;
    officialReport: false;
    causalInference: false;
  };
  metrics: {
    recordedIncomeCents: ReportMetricComparison;
    recordedExpenseCents: ReportMetricComparison;
    transactionCount: ReportMetricComparison;
    blockerCount: ReportMetricComparison;
  };
  quality: {
    postingRateBasisPoints: ReportRateComparison;
    countMatchedRateBasisPoints: ReportRateComparison;
    documentReviewedRateBasisPoints: ReportRateComparison;
    reconciliationRateBasisPoints: ReportRateComparison;
  };
};

function comparison(current: number, previous: number): ReportMetricComparison {
  const safeCurrent = Number.isFinite(current) ? Math.trunc(current) : 0;
  const safePrevious = Number.isFinite(previous) ? Math.trunc(previous) : 0;
  const delta = safeCurrent - safePrevious;
  return {
    current: safeCurrent,
    previous: safePrevious,
    delta,
    direction: delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'same',
    percentChangeBasisPoints:
      safePrevious === 0
        ? null
        : Math.round((delta / Math.abs(safePrevious)) * 10000),
  };
}

function rateBasisPoints(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.max(0, Math.min(10000, Math.round((numerator / denominator) * 10000)));
}

function rateComparison(current: number | null, previous: number | null): ReportRateComparison {
  if (current === null || previous === null) {
    return { current, previous, delta: null, direction: 'not_comparable' };
  }
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    direction: delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'same',
  };
}

export function previousPeriodKey(periodKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) throw new Error('INVALID_PERIOD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) throw new Error('INVALID_PERIOD');
  const date = new Date(Date.UTC(year, month - 2, 1));
  return String(date.getUTCFullYear()).padStart(4, '0') + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
}

function quality(period: PeriodCloseReadinessResponse) {
  return {
    postingRateBasisPoints: rateBasisPoints(
      period.transactions.statusCounts.posted,
      period.transactions.total,
    ),
    countMatchedRateBasisPoints: rateBasisPoints(
      period.countSessions.matched,
      period.countSessions.total,
    ),
    documentReviewedRateBasisPoints: rateBasisPoints(
      period.documents.reviewed,
      period.documents.total,
    ),
    reconciliationRateBasisPoints: rateBasisPoints(
      period.reconciliation.reconciledBankTransactions,
      period.reconciliation.postedBankTransactions,
    ),
  };
}

export function buildReportsIntelligence(args: {
  current: PeriodCloseReadinessResponse;
  previous: PeriodCloseReadinessResponse;
}): ReportsIntelligenceResponse {
  if (args.current.financeEntityId !== args.previous.financeEntityId) {
    throw new Error('FINANCE_ENTITY_MISMATCH');
  }

  const currentQuality = quality(args.current);
  const previousQuality = quality(args.previous);

  return {
    version: REPORTS_INTELLIGENCE_VERSION,
    financeEntityId: args.current.financeEntityId,
    currentPeriodKey: args.current.period.key,
    comparisonPeriodKey: args.previous.period.key,
    currentSnapshot: args.current,
    authority: {
      readOnly: true,
      financialMutation: false,
      closeMutation: false,
      officialReport: false,
      causalInference: false,
    },
    metrics: {
      recordedIncomeCents: comparison(
        args.current.transactions.capturedIncomeCents,
        args.previous.transactions.capturedIncomeCents,
      ),
      recordedExpenseCents: comparison(
        args.current.transactions.capturedExpenseCents,
        args.previous.transactions.capturedExpenseCents,
      ),
      transactionCount: comparison(
        args.current.transactions.total,
        args.previous.transactions.total,
      ),
      blockerCount: comparison(
        args.current.readiness.blockerCount,
        args.previous.readiness.blockerCount,
      ),
    },
    quality: {
      postingRateBasisPoints: rateComparison(
        currentQuality.postingRateBasisPoints,
        previousQuality.postingRateBasisPoints,
      ),
      countMatchedRateBasisPoints: rateComparison(
        currentQuality.countMatchedRateBasisPoints,
        previousQuality.countMatchedRateBasisPoints,
      ),
      documentReviewedRateBasisPoints: rateComparison(
        currentQuality.documentReviewedRateBasisPoints,
        previousQuality.documentReviewedRateBasisPoints,
      ),
      reconciliationRateBasisPoints: rateComparison(
        currentQuality.reconciliationRateBasisPoints,
        previousQuality.reconciliationRateBasisPoints,
      ),
    },
  };
}
