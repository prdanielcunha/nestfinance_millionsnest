export const TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION = 1 as const;
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

export type TransactionWorkspaceDirection =
  (typeof TRANSACTION_WORKSPACE_DIRECTIONS)[number];
export type TransactionWorkspaceStatus =
  (typeof TRANSACTION_WORKSPACE_STATUSES)[number];

export const TRANSACTION_WORKSPACE_ORDERS = ['newest', 'oldest'] as const;
export type TransactionWorkspaceOrder =
  (typeof TRANSACTION_WORKSPACE_ORDERS)[number];

export type TransactionWorkspaceFilters = {
  direction: TransactionWorkspaceDirection;
  status: TransactionWorkspaceStatus;
  occurredFrom: string | null;
  occurredTo: string | null;
  order: TransactionWorkspaceOrder;
};

export type TransactionWorkspaceView = {
  viewId: string;
  organizationId: string;
  financeEntityId: string;
  ownerUid: string;
  name: string;
  filters: TransactionWorkspaceFilters;
  schemaVersion: typeof TRANSACTION_WORKSPACE_VIEW_SCHEMA_VERSION;
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
    !(TRANSACTION_WORKSPACE_ORDERS as readonly string[]).includes(order)
  ) {
    return null;
  }
  if (occurredFrom && occurredTo && occurredFrom > occurredTo) {
    return null;
  }

  return {
    direction: direction as TransactionWorkspaceDirection,
    status: status as TransactionWorkspaceStatus,
    occurredFrom,
    occurredTo,
    order: order as TransactionWorkspaceOrder,
  };
}
