export const TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION = 2 as const;
export const TRANSACTION_WORKSPACE_VIEW_MAX_PER_ENTITY = 12 as const;
export const TRANSACTION_WORKSPACE_VIEW_NAME_MAX = 48 as const;

export const TRANSACTION_WORKSPACE_DIRECTIONS = [
  'all',
  'income',
  'expense',
  'transfer',
  'liability_settlement',
] as const;

export const TRANSACTION_WORKSPACE_STATUSES = [
  'all',
  'draft',
  'ready_for_review',
  'approved_for_posting',
  'posted',
  'reversed',
] as const;

export const TRANSACTION_WORKSPACE_DATE_BASES = [
  'occurred',
  'competence',
  'recorded',
] as const;

export const TRANSACTION_WORKSPACE_EVIDENCE_FILTERS = [
  'all',
  'with_evidence',
  'without_evidence',
] as const;

export const TRANSACTION_WORKSPACE_QUALITY_FILTERS = [
  'all',
  'missing_description',
  'missing_category',
  'unreconciled',
] as const;

export type TransactionWorkspaceDirection =
  (typeof TRANSACTION_WORKSPACE_DIRECTIONS)[number];
export type TransactionWorkspaceStatus =
  (typeof TRANSACTION_WORKSPACE_STATUSES)[number];
export type TransactionWorkspaceDateBase =
  (typeof TRANSACTION_WORKSPACE_DATE_BASES)[number];
export type TransactionWorkspaceEvidenceFilter =
  (typeof TRANSACTION_WORKSPACE_EVIDENCE_FILTERS)[number];
export type TransactionWorkspaceQualityFilter =
  (typeof TRANSACTION_WORKSPACE_QUALITY_FILTERS)[number];

export const TRANSACTION_WORKSPACE_ORDERS = ['newest', 'oldest'] as const;
export type TransactionWorkspaceOrder =
  (typeof TRANSACTION_WORKSPACE_ORDERS)[number];

export type TransactionWorkspaceFilters = {
  direction: TransactionWorkspaceDirection;
  status: TransactionWorkspaceStatus;
  occurredFrom: string | null;
  occurredTo: string | null;
  order: TransactionWorkspaceOrder;

  // Schema v2: optional so existing callers/views migrate without breaking.
  dateBase?: TransactionWorkspaceDateBase;
  categoryId?: string | null;
  accountId?: string | null;
  fundId?: string | null;
  costCenterId?: string | null;
  paymentMethod?: string | null;
  sourceContext?: string | null;
  origin?: 'all' | 'manual' | 'count' | 'evidence' | 'imported' | 'unknown';
  evidence?: TransactionWorkspaceEvidenceFilter;
  quality?: TransactionWorkspaceQualityFilter;
  amountMinCents?: number | null;
  amountMaxCents?: number | null;
  searchQuery?: string | null;
};

export type TransactionWorkspaceView = {
  viewId: string;
  organizationId: string;
  financeEntityId: string;
  ownerUid: string;
  name: string;
  filters: TransactionWorkspaceFilters;
  schemaVersion: 1 | typeof TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function normalizeTransactionWorkspaceViewName(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > TRANSACTION_WORKSPACE_VIEW_NAME_MAX) {
    return null;
  }
  return normalized;
}

function normalizeDateOnly(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return value;
}

function normalizeOptionalId(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) return undefined;
  return normalized;
}

function normalizeOptionalSearch(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > 64) return undefined;
  return normalized;
}

function normalizeOptionalCents(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) return undefined;
  return cents;
}

export function normalizeTransactionWorkspaceFilters(
  input: unknown,
): TransactionWorkspaceFilters | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const direction = value.direction;
  const status = value.status;
  const occurredFrom = normalizeDateOnly(value.occurredFrom);
  const occurredTo = normalizeDateOnly(value.occurredTo);
  const order =
    typeof value.order === 'string' && value.order
      ? value.order
      : 'newest';

  const dateBase =
    typeof value.dateBase === 'string' && value.dateBase
      ? value.dateBase
      : 'occurred';
  const evidence =
    typeof value.evidence === 'string' && value.evidence
      ? value.evidence
      : 'all';
  const quality =
    typeof value.quality === 'string' && value.quality
      ? value.quality
      : 'all';

  const categoryId = normalizeOptionalId(value.categoryId);
  const accountId = normalizeOptionalId(value.accountId);
  const fundId = normalizeOptionalId(value.fundId);
  const costCenterId = normalizeOptionalId(value.costCenterId);
  const paymentMethod = normalizeOptionalId(value.paymentMethod);
  const sourceContext = normalizeOptionalId(value.sourceContext);
  const origin =
    typeof value.origin === 'string' && value.origin
      ? value.origin
      : 'all';
  const amountMinCents = normalizeOptionalCents(value.amountMinCents);
  const amountMaxCents = normalizeOptionalCents(value.amountMaxCents);
  const searchQuery = normalizeOptionalSearch(value.searchQuery);

  if (
    typeof direction !== 'string' ||
    !(TRANSACTION_WORKSPACE_DIRECTIONS as readonly string[]).includes(direction)
  ) {
    return null;
  }
  if (
    typeof status !== 'string' ||
    !(TRANSACTION_WORKSPACE_STATUSES as readonly string[]).includes(status)
  ) {
    return null;
  }
  if (
    occurredFrom === undefined ||
    occurredTo === undefined ||
    !(TRANSACTION_WORKSPACE_ORDERS as readonly string[]).includes(order) ||
    !(TRANSACTION_WORKSPACE_DATE_BASES as readonly string[]).includes(dateBase) ||
    !(TRANSACTION_WORKSPACE_EVIDENCE_FILTERS as readonly string[]).includes(evidence) ||
    !(TRANSACTION_WORKSPACE_QUALITY_FILTERS as readonly string[]).includes(quality) ||
    categoryId === undefined ||
    accountId === undefined ||
    fundId === undefined ||
    costCenterId === undefined ||
    paymentMethod === undefined ||
    sourceContext === undefined ||
    !['all', 'manual', 'count', 'evidence', 'imported', 'unknown'].includes(origin) ||
    amountMinCents === undefined ||
    amountMaxCents === undefined ||
    searchQuery === undefined
  ) {
    return null;
  }
  if (occurredFrom && occurredTo && occurredFrom > occurredTo) {
    return null;
  }
  if (
    amountMinCents !== null &&
    amountMaxCents !== null &&
    amountMinCents > amountMaxCents
  ) {
    return null;
  }

  const baseFilters: TransactionWorkspaceFilters = {
    direction: direction as TransactionWorkspaceDirection,
    status: status as TransactionWorkspaceStatus,
    occurredFrom,
    occurredTo,
    order: order as TransactionWorkspaceOrder,
  };

  const hasV2Fields = [
    'dateBase',
    'categoryId',
    'accountId',
    'fundId',
    'costCenterId',
    'paymentMethod',
    'sourceContext',
    'origin',
    'evidence',
    'quality',
    'amountMinCents',
    'amountMaxCents',
    'searchQuery',
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));

  if (!hasV2Fields) return baseFilters;

  return {
    ...baseFilters,
    dateBase: dateBase as TransactionWorkspaceDateBase,
    categoryId,
    accountId,
    fundId,
    costCenterId,
    paymentMethod,
    sourceContext,
    origin: origin as TransactionWorkspaceFilters['origin'],
    evidence: evidence as TransactionWorkspaceEvidenceFilter,
    quality: quality as TransactionWorkspaceQualityFilter,
    amountMinCents,
    amountMaxCents,
    searchQuery,
  };
}
