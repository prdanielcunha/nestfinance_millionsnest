import { AllocationId, TransactionId } from './ids.js';
import { assertAmountCents, sumAmountCents } from './money.js';
import { LedgerDomainError } from './errors.js';

export type FinanceAllocation = {
  id: AllocationId;
  organizationId: string;
  financeEntityId: string;
  transactionId: TransactionId;
  categoryId: string;
  categorySnapshot?: { id: string; name: string; type?: string; icon?: string };
  fundId?: string;
  fundSnapshot?: { id: string; name: string };
  costCenterId?: string;
  amountCents: number;
  memo?: string;
  sequence: number;
  createdAt: string; // ISO-8601
  createdBy: string;
  schemaVersion: number;
};

export function validateAllocation(
  allocation: FinanceAllocation,
  expectedEntityId: string,
  expectedDirection: 'income' | 'expense' // transfer not relevant for allocation categories
): void {
  if (allocation.financeEntityId !== expectedEntityId) {
    throw new LedgerDomainError('FINANCE_CROSS_ENTITY_REFERENCE', 'Allocation from different entity');
  }
  
  if (allocation.amountCents === 0) {
    throw new LedgerDomainError('FINANCE_INVALID_ALLOCATION', 'Allocation amount cannot be zero');
  }

  assertAmountCents(allocation.amountCents);
}

export function assertAllocationsTotal(
  allocations: FinanceAllocation[],
  expectedTotal: number
): void {
  const ids = new Set<string>();
  
  for (const alloc of allocations) {
    if (ids.has(alloc.id)) {
      throw new LedgerDomainError('FINANCE_INVALID_ALLOCATION', 'Duplicate allocation ID');
    }
    ids.add(alloc.id);
  }
  
  const amounts = allocations.map(a => a.amountCents);
  const total = sumAmountCents(amounts);
  
  if (total !== expectedTotal) {
    throw new LedgerDomainError('FINANCE_ALLOCATION_TOTAL_MISMATCH');
  }
}
