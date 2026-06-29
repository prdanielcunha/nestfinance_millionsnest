import { createHash } from 'crypto';
import { LedgerTransaction } from './transaction.js';
import { FinanceAllocation } from './allocation.js';
import { canonicalStringify } from './postingPreview.js';

export function computeApprovalSourceHash(tx: LedgerTransaction, allocations: FinanceAllocation[], algorithmVersion: number = 2): string {
  const materialSource: any = {
    organizationId: tx.organizationId,
    financeEntityId: tx.financeEntityId,
    transactionId: tx.id,
    direction: tx.transactionKind,
    amountCents: tx.amountCents,
    currency: tx.currency || 'BRL',
    occurredAt: tx.occurredAt,
    competenceDate: tx.competenceDate || '',
    accountId: (tx as any).accountId || '',
    sourceAccountId: (tx as any).sourceAccountId || '',
    destinationAccountId: (tx as any).destinationAccountId || '',
    liabilityAccountId: (tx as any).liabilityAccountId || '',
    paymentMethod: tx.paymentMethod || '',
    counterparty: tx.counterparty || '',
    allocations: allocations.map(a => ({
      id: a.id,
      categoryId: a.categoryId,
      amountCents: a.amountCents,
      fundId: a.fundId,
      costCenterId: a.costCenterId
    })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  };

  if (algorithmVersion === 1) {
    materialSource.version = tx.version;
  } else {
    materialSource.contentVersion = tx.contentVersion || 1;
    materialSource.algorithmVersion = 2;
  }

  const canonicalString = canonicalStringify(materialSource);
  const hex = createHash('sha256').update(canonicalString).digest('hex');
  return `sha256:${hex.toLowerCase()}`;
}
