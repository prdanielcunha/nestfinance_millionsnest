export const FINANCE_EDIT_LEASE_MS = 45_000;
export const FINANCE_EDIT_HEARTBEAT_MS = 20_000;
export const FINANCE_EDIT_SESSION_PATTERN = /^edit_[a-zA-Z0-9_-]{16,120}$/;

export function isFinanceEditSessionId(value: unknown): value is string {
  return typeof value === 'string' && FINANCE_EDIT_SESSION_PATTERN.test(value);
}

export type FinanceEditPresenceResult = {
  editable: boolean;
  ownerLabel: string | null;
  expiresAt: string | null;
  leaseMs: number;
  financialMutation: false;
};
