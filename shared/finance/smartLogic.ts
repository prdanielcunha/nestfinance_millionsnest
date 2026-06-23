import { PaymentMethodCode } from './paymentMethods';

export type TransactionKind = 'income' | 'expense' | 'transfer' | 'liability_settlement';

export type FinanceAccountType =
  | 'cash'
  | 'checking'
  | 'bank_checking'
  | 'savings'
  | 'bank_savings'
  | 'payment_account'
  | 'digital_wallet'
  | 'credit_card'
  | 'petty_cash'
  | 'reimbursement_payable'
  | 'card_receivable'
  | 'other';

export type AccountNature = 'asset' | 'liability' | 'receivable' | 'clearing';

export function getAccountNature(rawType: string | undefined): AccountNature {
  const type = normalizeAccountType(rawType);
  if (['cash', 'bank_checking', 'bank_savings', 'payment_account', 'petty_cash'].includes(type)) return 'asset';
  if (['credit_card', 'reimbursement_payable'].includes(type)) return 'liability';
  if (['card_receivable'].includes(type)) return 'receivable';
  return 'clearing';
}

export type CompatibilityResult =
  | { level: 'recommended' }
  | { level: 'allowed_with_context'; explanation: string }
  | { level: 'guided_flow'; flow: string }
  | { level: 'impossible'; explanation: string };

export function normalizeAccountType(rawType: string | undefined): FinanceAccountType {
  if (!rawType) return 'other';
  switch (rawType) {
    case 'cash': return 'cash';
    case 'checking':
    case 'bank_checking': return 'bank_checking';
    case 'savings':
    case 'bank_savings': return 'bank_savings';
    case 'digital_wallet':
    case 'payment_account': return 'payment_account';
    case 'credit_card': return 'credit_card';
    case 'petty_cash': return 'petty_cash';
    case 'reimbursement_payable': return 'reimbursement_payable';
    case 'card_receivable': return 'card_receivable';
    default: return 'other';
  }
}

export function getCompatibility(
  accountTypeStr: string | undefined,
  paymentInstrument: PaymentMethodCode | string | undefined,
  transactionKind: TransactionKind
): CompatibilityResult {
  const accountType = normalizeAccountType(accountTypeStr);

  if (transactionKind === 'liability_settlement') {
    return { level: 'recommended' };
  }

  if (!paymentInstrument || paymentInstrument === 'unspecified') {
    if (transactionKind === 'transfer') return { level: 'recommended' };
    return { level: 'allowed_with_context', explanation: 'Forma de pagamento ou recebimento pendente de definição.' };
  }

  // Para transferências as contas são chaves, o instrumento não importa muito
  if (transactionKind === 'transfer') {
    return { level: 'recommended' };
  }

  // Dinheiro + Caixa (Saída ou Entrada)
  if (accountType === 'cash' || accountType === 'petty_cash') {
    if (paymentInstrument === 'cash') {
      return { level: 'recommended' };
    }
    if (paymentInstrument === 'other') {
      return { level: 'allowed_with_context', explanation: 'Use dinheiro físico ou documente na descrição.' };
    }
    return { level: 'impossible', explanation: `O dinheiro físico no caixa não pode ser movimentado via ${paymentInstrument}.` };
  }

  // Conta Bancária
  if (accountType === 'bank_checking' || accountType === 'bank_savings' || accountType === 'payment_account') {
    const bankingMethods = ['pix', 'bank_transfer', 'debit_card', 'cheque', 'bank_deposit', 'bank_slip', 'check', 'automatic_debit', 'other'];
    if (bankingMethods.includes(paymentInstrument as string)) {
      return { level: 'recommended' };
    }
    if (paymentInstrument === 'credit_card') {
      if (transactionKind === 'income') {
          return { level: 'allowed_with_context', explanation: 'Recebimentos de cartão costumam passar por uma operadora antes.' };
      } else {
          return { level: 'impossible', explanation: 'Use a conta específica de "Cartão de crédito" para registrar as compras, e a conta do banco apenas para o pagamento da fatura.' };
      }
    }
    if (paymentInstrument === 'cash') {
       if (transactionKind === 'expense') {
           return { level: 'guided_flow', flow: 'withdraw_to_pay' };
       } else {
           return { level: 'guided_flow', flow: 'cash_deposit' };
       }
    }
    return { level: 'recommended' }; // Fallback
  }

  // Cartão de Crédito da Igreja
  if (accountType === 'credit_card') {
    if (paymentInstrument === 'credit_card' && transactionKind === 'expense') {
      return { level: 'recommended' };
    }
    return { level: 'impossible', explanation: 'Esta conta só aceita registro de despesas feitas no crédito do cartão.' };
  }

  // Recebíveis de Cartão
  if (accountType === 'card_receivable') {
     if ((paymentInstrument === 'credit_card' || paymentInstrument === 'debit_card') && transactionKind === 'income') {
        return { level: 'recommended' };
     }
     return { level: 'impossible', explanation: 'Conta exclusiva para recebimento faturado no cartão.' };
  }

  // Reembolsos a pagar (A pessoa pagou com meios dela mesma em beneficio da igreja)
  if (accountType === 'reimbursement_payable') {
    if (transactionKind === 'expense') {
       return { level: 'allowed_with_context', explanation: 'O valor ficará pendente no passivo da igreja até ser devolvido ao responsável.' };
    }
    return { level: 'impossible', explanation: 'Reembolsos servem apenas como registro de despesas da igreja pagas por outra pessoa.' };
  }

  return { level: 'recommended' };
}

export function getCompatiblePaymentInstruments(accountTypeStr: string | undefined, transactionKind: TransactionKind): PaymentMethodCode[] {
    const allValid: PaymentMethodCode[] = ['cash', 'pix', 'bank_transfer', 'bank_deposit', 'debit_card', 'credit_card', 'prepaid_card', 'bank_slip', 'check', 'automatic_debit', 'other'];
    return allValid.filter(p => {
        const comp = getCompatibility(accountTypeStr, p, transactionKind);
        return comp.level === 'recommended' || comp.level === 'allowed_with_context';
    });
}

export function getCompatibleAccounts(paymentInstrument: PaymentMethodCode | string | undefined, transactionKind: TransactionKind, accounts: any[]): any[] {
    return accounts.filter(acc => {
        const comp = getCompatibility(acc.type, paymentInstrument, transactionKind);
        return comp.level === 'recommended' || comp.level === 'allowed_with_context';
    });
}

export function validateDraftMinimum(draft: any, financeEntityId: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!financeEntityId) errors.push('financeEntityId is required');
  
  if (!draft.direction || !['income', 'expense', 'transfer', 'liability_settlement'].includes(draft.direction)) {
    errors.push('transactionKind (direction) is invalid');
  }

  if (typeof draft.amountCents !== 'number' || !Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0) {
    errors.push('amountCents must be a positive safe integer');
  }

  if (!draft.occurredAt) {
    errors.push('occurredAt is required');
  }

  if (draft.accountId && draft.paymentMethod) {
    const comp = getCompatibility(draft.accountSnapshot?.type || 'other', draft.paymentMethod, draft.direction as TransactionKind);
    if (comp.level === 'impossible') {
      errors.push(`Incompatible account and payment method: ${comp.explanation}`);
    }
  }

  if (draft.direction === 'transfer' && draft.sourceAccountId && draft.destinationAccountId) {
    if (draft.sourceAccountId === draft.destinationAccountId) {
      errors.push('Source and destination accounts must be different for a transfer');
    }
  }
  
  if (draft.allocations && Array.isArray(draft.allocations)) {
    let totalAllocated = 0;
    for (const alloc of draft.allocations) {
      if (typeof alloc.amountCents !== 'number' || alloc.amountCents < 0) {
        errors.push('Allocation amount must be a positive number');
      }
      totalAllocated += alloc.amountCents;
    }
    if (totalAllocated > draft.amountCents) {
      errors.push('Allocations total cannot exceed transaction amount');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateSubmissionReadiness(tx: any): { ready: boolean; errors: string[] } {
  const errors: string[] = [];

  if (tx.direction === 'expense' || tx.direction === 'income') {
    if (!tx.accountId) errors.push('Account is required for income/expense');
    if (!tx.paymentMethod) errors.push('Payment method is required for income/expense');
    
    if (!tx.allocations || tx.allocations.length === 0) {
      errors.push('At least one allocation (category) is required for income/expense');
    } else {
      const allHaveCategory = tx.allocations.every((a: any) => !!a.categoryId);
      if (!allHaveCategory) errors.push('All allocations must have a category');
      
      const totalAllocated = tx.allocations.reduce((sum: number, a: any) => sum + (a.amountCents || 0), 0);
      if (totalAllocated !== tx.amountCents) {
        errors.push('Sum of allocations must exactly match the total amount');
      }
    }
  }

  if (tx.direction === 'transfer') {
    if (!tx.sourceAccountId) errors.push('Source account is required for transfer');
    if (!tx.destinationAccountId) errors.push('Destination account is required for transfer');
    if (!tx.amountCents || tx.amountCents <= 0) errors.push('Valid amount is required for transfer');
    if (!tx.occurredAt) errors.push('Date is required for transfer');
  }

  if (tx.direction === 'liability_settlement') {
    if (!tx.sourceAccountId) errors.push('Source account is required for settlement');
    if (!tx.liabilityAccountId && !tx.destinationAccountId) errors.push('Liability account is required for settlement');
    if (!tx.amountCents || tx.amountCents <= 0) errors.push('Valid amount is required for settlement');
    if (!tx.occurredAt) errors.push('Date is required for settlement');
    if (!tx.settlementType) errors.push('Settlement type is required');
  }

  return { ready: errors.length === 0, errors };
}

export function simulatePosting(tx: any): Array<{ accountId: string; effect: 'increase' | 'decrease'; amount: number; nature: string }> {
  // Pure conceptual mapping for preparing the domain for Posting. No actual writes.
  const postings = [];

  if (tx.direction === 'transfer') {
    postings.push({ accountId: tx.sourceAccountId, effect: 'decrease', amount: tx.amountCents, nature: 'asset' });
    postings.push({ accountId: tx.destinationAccountId, effect: 'increase', amount: tx.amountCents, nature: 'asset' });
  }

  if (tx.direction === 'expense') {
    const isCreditCard = tx.paymentMethod === 'credit_card';
    const isReimbursement = tx.reimbursement?.personId;
    
    if (isCreditCard || isReimbursement) {
      postings.push({ accountId: tx.accountId, effect: 'increase', amount: tx.amountCents, nature: 'liability' });
    } else {
      postings.push({ accountId: tx.accountId, effect: 'decrease', amount: tx.amountCents, nature: 'asset' });
    }
  }

  if (tx.direction === 'liability_settlement') {
    postings.push({ accountId: tx.sourceAccountId, effect: 'decrease', amount: tx.amountCents, nature: 'asset' });
    postings.push({ accountId: tx.liabilityAccountId || tx.destinationAccountId, effect: 'decrease', amount: tx.amountCents, nature: 'liability' });
  }
  
  if (tx.direction === 'income') {
    postings.push({ accountId: tx.accountId, effect: 'increase', amount: tx.amountCents, nature: 'asset' });
  }

  return postings;
}
