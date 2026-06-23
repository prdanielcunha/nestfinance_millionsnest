import { LedgerTransaction } from './transaction.js';

export function describeAccountingEffect(transaction: LedgerTransaction): string {
  switch (transaction.transactionKind) {
    case 'income':
      return 'Income: asset increases, income increases';
    case 'expense':
      if (transaction.cashFlowDirection === 'outflow') {
        return 'Expense paid now: expense increases, asset decreases';
      } else {
        return 'Expense on credit card: expense increases, liability increases';
      }
    case 'transfer':
      return 'Transfer: source asset decreases, destination asset increases';
    case 'liability_settlement':
      return 'Liability settlement: asset decreases, liability decreases';
    case 'adjustment':
      return 'Adjustment: manual balance change';
    default:
      return 'Unknown';
  }
}
