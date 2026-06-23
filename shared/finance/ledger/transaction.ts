import { TransactionId, EvidenceId, JournalEntryId, IdempotencyKey } from './ids.js';
import { FinanceAllocation, validateAllocation, assertAllocationsTotal } from './allocation.js';
import { assertAmountCents } from './money.js';
import { LedgerDomainError } from './errors.js';

export type TransactionDirection = 'income' | 'expense' | 'transfer' | 'adjustment' | 'liability_settlement';
export type TransactionStatus = 'draft' | 'ready_for_review' | 'posted' | 'reversed';

export type TransactionBase = {
  id: TransactionId;
  organizationId: string;
  financeEntityId: string;
  direction: TransactionDirection;
  status: TransactionStatus;
  amountCents: number;
  currency: string;
  occurredAt: string; // ISO Date
  recordedAt: string; // ISO Date
  competenceDate?: string;
  paymentMethod: string;
  sourceContext: string;
  description?: string;
  counterparty?: string;
  evidenceIds: EvidenceId[];
  reconciliationStatus: 'unreconciled' | 'reconciled';
  createdBy: string;
  updatedBy: string;
  postedBy?: string;
  reversedBy?: string;
  reversalOf?: string;
  journalEntryId?: JournalEntryId;
  idempotencyKey?: IdempotencyKey;
  version: number;
  schemaVersion: number;
};

export type IncomeTransaction = TransactionBase & {
  direction: 'income';
  accountId: string; 
  accountSnapshot?: { id: string; name: string; type: string };
  allocationIds: string[];
};

export type ExpenseTransaction = TransactionBase & {
  direction: 'expense';
  accountId: string;
  accountSnapshot?: { id: string; name: string; type: string };
  allocationIds: string[];
  reimbursement?: { 
    payableId: string;
    personName: string;
    description: string;
  };
};

export type TransferTransaction = TransactionBase & {
  direction: 'transfer';
  sourceAccountId: string;
  destinationAccountId: string;
};

export type AdjustmentTransaction = TransactionBase & {
  direction: 'adjustment';
  accountId: string;
  adjustmentType: string;
};

export type LiabilitySettlementTransaction = TransactionBase & {
  direction: 'liability_settlement';
  sourceAccountId: string;
  liabilityAccountId: string;
  liabilityAccountSnapshot?: { id: string; name: string; type: string };
  settlementType: 'credit_card_bill' | 'reimbursement';
};

export type LedgerTransaction = 
  | IncomeTransaction 
  | ExpenseTransaction 
  | TransferTransaction 
  | AdjustmentTransaction
  | LiabilitySettlementTransaction;

export function canTransitionTransactionStatus(from: TransactionStatus, to: TransactionStatus): boolean {
  if (from === 'draft' && to === 'ready_for_review') return true;
  if (from === 'ready_for_review' && to === 'draft') return true;
  if (from === 'ready_for_review' && to === 'posted') return true;
  if (from === 'posted' && to === 'reversed') return true;
  return false;
}

export function assertTransactionStatusTransition(from: TransactionStatus, to: TransactionStatus): void {
  if (!canTransitionTransactionStatus(from, to)) {
    throw new LedgerDomainError('FINANCE_INVALID_STATE_TRANSITION', 'Cannot transition from ' + from + ' to ' + to);
  }
}

export function validateTransactionCore(tx: LedgerTransaction): void {
  if (tx.amountCents === 0 && tx.direction !== 'adjustment') {
    throw new LedgerDomainError('FINANCE_INVALID_AMOUNT', 'Transaction amount must be strictly positive');
  }
  assertAmountCents(tx.amountCents);
  
  if (!tx.financeEntityId) {
    throw new LedgerDomainError('FINANCE_CROSS_ENTITY_REFERENCE', 'FinanceEntityId is missing');
  }

  if (tx.direction === 'transfer') {
    if (tx.sourceAccountId === tx.destinationAccountId) {
      throw new LedgerDomainError('FINANCE_ACCOUNT_MISMATCH', 'Source and destination accounts must differ');
    }
    if (!tx.sourceAccountId || !tx.destinationAccountId) {
      throw new LedgerDomainError('FINANCE_ACCOUNT_MISMATCH', 'Source and destination accounts required');
    }
  }

  if (tx.direction === 'income' || tx.direction === 'expense') {
    if (!tx.accountId) {
      throw new LedgerDomainError('FINANCE_ACCOUNT_MISMATCH', 'Account is required');
    }
  }
}
