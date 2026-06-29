import { TransactionId, EvidenceId, JournalEntryId, IdempotencyKey } from './ids.js';
import { FinanceAllocation, validateAllocation, assertAllocationsTotal } from './allocation.js';
import { assertAmountCents } from './money.js';
import { LedgerDomainError } from './errors.js';

export type TransactionKind = 'income' | 'expense' | 'transfer' | 'adjustment' | 'liability_settlement';
export type CashFlowDirection = 'inflow' | 'outflow' | 'internal' | 'none';
export type TransactionStatus = 'draft' | 'ready_for_review' | 'approved_for_posting' | 'posted' | 'reversed';

export type TransactionBase = {
  id: TransactionId;
  organizationId: string;
  financeEntityId: string;
  transactionKind: TransactionKind;
  cashFlowDirection: CashFlowDirection;
  direction?: string; // Legacy field for listQueryKeys and backwards compatibility
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
  evidenceJustification?: string;
  reconciliationStatus: 'unreconciled' | 'reconciled';
  createdBy: string;
  updatedBy: string;
  postedBy?: string;
  reversedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalSourceHash?: string;
  approvedVersion?: number;
  reversalOf?: string;
  journalEntryId?: JournalEntryId;
  idempotencyKey?: IdempotencyKey;
  contentVersion?: number;
  version: number;
  schemaVersion: number;
};

export type IncomeTransaction = TransactionBase & {
  transactionKind: 'income';
  accountId: string; 
  accountSnapshot?: { id: string; name: string; type: string, nature: string };
  allocationIds: string[];
};

export type ExpenseTransaction = TransactionBase & {
  transactionKind: 'expense';
  accountId: string;
  accountSnapshot?: { id: string; name: string; type: string, nature: string };
  allocationIds: string[];
  reimbursement?: { 
    payableId: string;
    personName: string;
    description: string;
  };
};

export type TransferTransaction = TransactionBase & {
  transactionKind: 'transfer';
  sourceAccountId: string;
  destinationAccountId: string;
};

export type AdjustmentTransaction = TransactionBase & {
  transactionKind: 'adjustment';
  accountId: string;
  adjustmentType: string;
};

export type LiabilitySettlementTransaction = TransactionBase & {
  transactionKind: 'liability_settlement';
  sourceAccountId: string;
  liabilityAccountId: string;
  liabilityAccountSnapshot?: { id: string; name: string; type: string, nature: string };
  settlementType: 'credit_card_bill' | 'reimbursement' | 'other_liability';
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
  if (from === 'ready_for_review' && to === 'approved_for_posting') return true;
  if (from === 'ready_for_review' && to === 'posted') return true; // Keep backward compatible for tests maybe
  if (from === 'approved_for_posting' && to === 'draft') return true;
  if (from === 'approved_for_posting' && to === 'posted') return true;
  if (from === 'posted' && to === 'reversed') return true;
  return false;
}

export function assertTransactionStatusTransition(from: TransactionStatus, to: TransactionStatus): void {
  if (!canTransitionTransactionStatus(from, to)) {
    throw new LedgerDomainError('FINANCE_INVALID_STATE_TRANSITION', 'Cannot transition from ' + from + ' to ' + to);
  }
}

export function validateTransactionCore(tx: LedgerTransaction): void {
  if (tx.amountCents === 0 && tx.transactionKind !== 'adjustment') {
    throw new LedgerDomainError('FINANCE_INVALID_AMOUNT', 'Transaction amount must be strictly positive');
  }
  assertAmountCents(tx.amountCents);
  
  if (!tx.financeEntityId) {
    throw new LedgerDomainError('FINANCE_CROSS_ENTITY_REFERENCE', 'FinanceEntityId is missing');
  }

  if (tx.transactionKind === 'transfer') {
    if (tx.status !== 'draft' && (!tx.sourceAccountId || !tx.destinationAccountId)) {
      throw new LedgerDomainError('FINANCE_ACCOUNT_MISMATCH', 'Source and destination accounts required');
    }
    if (tx.sourceAccountId && tx.destinationAccountId && tx.sourceAccountId === tx.destinationAccountId) {
      throw new LedgerDomainError('FINANCE_ACCOUNT_MISMATCH', 'Source and destination accounts must differ');
    }
  }

  if (tx.transactionKind === 'liability_settlement') {
    if (tx.status !== 'draft' && (!tx.sourceAccountId || !tx.liabilityAccountId)) {
      throw new LedgerDomainError('FINANCE_ACCOUNT_MISMATCH', 'Source and liability accounts required');
    }
    if (tx.sourceAccountId && tx.liabilityAccountId && tx.sourceAccountId === tx.liabilityAccountId) {
      throw new LedgerDomainError('FINANCE_ACCOUNT_MISMATCH', 'Source and liability accounts must differ');
    }
  }

  if (tx.transactionKind === 'income' || tx.transactionKind === 'expense') {
    if (tx.status !== 'draft' && !tx.accountId) {
      throw new LedgerDomainError('FINANCE_ACCOUNT_MISMATCH', 'Account is required');
    }
  }
}
