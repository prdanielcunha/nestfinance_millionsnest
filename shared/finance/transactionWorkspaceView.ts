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

export type TransactionWorkspaceFilters = {
  direction: TransactionWorkspaceDirection;
  status: TransactionWorkspaceStatus;
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

export function normalizeTransactionWorkspaceFilters(
  input: unknown,
): TransactionWorkspaceFilters | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const direction = value.direction;
  const status = value.status;

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

  return {
    direction: direction as TransactionWorkspaceDirection,
    status: status as TransactionWorkspaceStatus,
  };
}
