import type { DocumentTransactionAnalysis } from '../../../../shared/finance/documentTransactionIntelligence.js';

const EVIDENCE_ID_PATTERN = /^evd_[a-f0-9]{32}$/;

export type ReviewEvidenceComparisonKey =
  | 'amount'
  | 'date'
  | 'direction'
  | 'payment_method'
  | 'category';

export type ReviewEvidenceComparisonStatus = 'match' | 'different' | 'uncertain';

export type ReviewEvidenceComparisonStatuses = Record<
  ReviewEvidenceComparisonKey,
  ReviewEvidenceComparisonStatus
>;

export function normalizeReviewEvidenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const id = candidate.trim();
    if (!EVIDENCE_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 6) break;
  }

  return ids;
}

export function normalizeReviewEvidenceDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);

  if (isoDay) {
    const candidate = `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`;
    const date = new Date(`${candidate}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate) {
      return candidate;
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function candidateStatus<T>(
  state: string | null | undefined,
  documentValue: T | null | undefined,
  transactionValue: T | null | undefined,
): ReviewEvidenceComparisonStatus {
  if (state !== 'recognized' || documentValue === null || documentValue === undefined) {
    return 'uncertain';
  }
  if (transactionValue === null || transactionValue === undefined) {
    return 'different';
  }
  return documentValue === transactionValue ? 'match' : 'different';
}

export function compareDocumentAnalysisToTransaction(
  analysis: DocumentTransactionAnalysis | null | undefined,
  transaction: any,
  allocations: any[],
): ReviewEvidenceComparisonStatuses {
  if (!analysis) {
    return {
      amount: 'uncertain',
      date: 'uncertain',
      direction: 'uncertain',
      payment_method: 'uncertain',
      category: 'uncertain',
    };
  }

  const transactionDirection =
    typeof transaction?.transactionKind === 'string'
      ? transaction.transactionKind
      : typeof transaction?.direction === 'string'
        ? transaction.direction
        : null;

  const transactionPaymentMethod =
    typeof transaction?.paymentMethod === 'string' ? transaction.paymentMethod : null;

  const transactionDate = normalizeReviewEvidenceDate(transaction?.occurredAt);
  const documentDate = normalizeReviewEvidenceDate(analysis.occurredAt.value);

  const categoryIds = new Set(
    (Array.isArray(allocations) ? allocations : [])
      .map((allocation) =>
        typeof allocation?.categoryId === 'string' ? allocation.categoryId : null,
      )
      .filter((value): value is string => Boolean(value)),
  );

  const categoryStatus: ReviewEvidenceComparisonStatus =
    analysis.categoryId.state !== 'recognized' || !analysis.categoryId.value
      ? 'uncertain'
      : categoryIds.has(analysis.categoryId.value)
        ? 'match'
        : 'different';

  return {
    amount: candidateStatus(
      analysis.totalAmountCents.state,
      analysis.totalAmountCents.value,
      Number.isFinite(Number(transaction?.amountCents))
        ? Number(transaction.amountCents)
        : null,
    ),
    date:
      analysis.occurredAt.state !== 'recognized' || !documentDate
        ? 'uncertain'
        : documentDate === transactionDate
          ? 'match'
          : 'different',
    direction: candidateStatus(
      analysis.transactionKind.state,
      analysis.transactionKind.value,
      transactionDirection,
    ),
    payment_method:
      analysis.paymentMethod.value === 'unknown'
        ? 'uncertain'
        : candidateStatus(
            analysis.paymentMethod.state,
            analysis.paymentMethod.value,
            transactionPaymentMethod,
          ),
    category: categoryStatus,
  };
}
