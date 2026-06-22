export type FinanceErrorCode =
  | 'FINANCE_INVALID_AMOUNT'
  | 'FINANCE_INVALID_ALLOCATION'
  | 'FINANCE_ALLOCATION_TOTAL_MISMATCH'
  | 'FINANCE_INVALID_STATE_TRANSITION'
  | 'FINANCE_JOURNAL_UNBALANCED'
  | 'FINANCE_INVALID_JOURNAL_LINE'
  | 'FINANCE_CROSS_ENTITY_REFERENCE'
  | 'FINANCE_ACCOUNT_MISMATCH'
  | 'FINANCE_CATEGORY_MISMATCH'
  | 'FINANCE_FUND_MISMATCH'
  | 'FINANCE_VERSION_CONFLICT'
  | 'FINANCE_ALREADY_POSTED'
  | 'FINANCE_ALREADY_REVERSED'
  | 'FINANCE_IDEMPOTENCY_CONFLICT'
  | 'FINANCE_PERIOD_CLOSED';

export class LedgerDomainError extends Error {
  public readonly code: FinanceErrorCode;

  constructor(code: FinanceErrorCode, message?: string) {
    super(message || code);
    this.name = 'LedgerDomainError';
    this.code = code;
  }
}
