import type { Language } from '@/src/contexts/LanguageContext';

export type ReviewDirectionFilter =
  | 'all'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'liability_settlement';

export type ReviewOrder = 'oldest' | 'newest';

const REVIEW_DIRECTIONS: readonly ReviewDirectionFilter[] = [
  'all',
  'income',
  'expense',
  'transfer',
  'liability_settlement',
] as const;

const REVIEW_ORDERS: readonly ReviewOrder[] = ['oldest', 'newest'] as const;

const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  PT: 'pt-BR',
  EN: 'en-US',
  ES: 'es-ES',
};

export function normalizeReviewDirection(
  value: string | null | undefined,
): ReviewDirectionFilter {
  return REVIEW_DIRECTIONS.includes(value as ReviewDirectionFilter)
    ? (value as ReviewDirectionFilter)
    : 'all';
}

export function normalizeReviewOrder(
  value: string | null | undefined,
): ReviewOrder {
  return REVIEW_ORDERS.includes(value as ReviewOrder)
    ? (value as ReviewOrder)
    : 'oldest';
}

export function formatReviewMoney(
  cents: number,
  language: Language,
  currency = 'BRL',
): string {
  const safeCents = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat(LOCALE_BY_LANGUAGE[language], {
    style: 'currency',
    currency: currency || 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

export function formatReviewDate(
  value: string | number | Date | null | undefined,
  language: Language,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(LOCALE_BY_LANGUAGE[language], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}


export function buildReviewQueueReturnPath(
  params: URLSearchParams,
  canonicalPath: string,
): string {
  const next = new URLSearchParams();

  const direction = normalizeReviewDirection(params.get('direction'));
  if (direction !== 'all') next.set('direction', direction);

  const order = normalizeReviewOrder(params.get('order'));
  if (order !== 'oldest') next.set('order', order);

  const query = (params.get('q') || '').trim().slice(0, 64);
  if (query) next.set('q', query);

  const serialized = next.toString();
  return serialized ? `${canonicalPath}?${serialized}` : canonicalPath;
}

export function normalizeReviewQueueReturnPath(
  value: string | null | undefined,
  canonicalPath: string,
): string {
  const candidate = String(value || '').trim();
  if (!candidate) return canonicalPath;

  const queryIndex = candidate.indexOf('?');
  const pathname =
    queryIndex === -1 ? candidate : candidate.slice(0, queryIndex);
  if (pathname !== canonicalPath) return canonicalPath;

  const rawQuery = queryIndex === -1 ? '' : candidate.slice(queryIndex + 1);
  return buildReviewQueueReturnPath(new URLSearchParams(rawQuery), canonicalPath);
}


const REVIEW_TRANSACTION_ID_PATTERN = /^tx_[a-f0-9]{16,64}$/;

export function normalizeReviewQueueSequence(
  value: unknown,
  currentTransactionId?: string | null,
): string[] {
  if (!Array.isArray(value)) return [];

  const current = String(currentTransactionId || '').trim();
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const id = candidate.trim();
    if (!REVIEW_TRANSACTION_ID_PATTERN.test(id)) continue;
    if (id === current || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= 24) break;
  }

  return normalized;
}


export type ReviewQueueSignal = 'blocked' | 'warning' | 'ready' | 'unknown';

export function resolveReviewQueueSignal(transaction: any): ReviewQueueSignal {
  const blockerCount = Math.max(0, Number(transaction?.blockerCount || 0));
  const warningCount = Math.max(0, Number(transaction?.warningCount || 0));

  if (blockerCount > 0) return 'blocked';
  if (warningCount > 0) return 'warning';
  if (transaction?.isReady === true) return 'ready';
  return 'unknown';
}
