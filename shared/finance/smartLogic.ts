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

export const CANONICAL_ACCOUNT_TEMPLATES: Record<string, { type: FinanceAccountType; nature: AccountNature }> = {
  'church.account.cash': {
    type: 'cash',
    nature: 'asset',
  },
  'church.account.checking': {
    type: 'bank_checking',
    nature: 'asset',
  },
  'church.account.savings': {
    type: 'bank_savings',
    nature: 'asset',
  },
  'church.account.digital_wallet': {
    type: 'payment_account',
    nature: 'asset',
  }
};

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

export type TransactionFieldRequirement = {
  field:
    | 'description'
    | 'counterparty'
    | 'evidence'
    | 'evidenceJustification'
    | 'fund'
    | 'costCenter'
    | 'competenceDate'
    | 'paymentMethod'
    | 'account'
    | 'category'
    | 'amount'
    | 'occurredAt';
  requirement: 'required' | 'optional' | 'not_applicable';
  requiredFor: Array<'draft' | 'review' | 'approval'>;
  reason?: string;
  alternativeField?: string;
};

export function getTransactionFieldRequirements(tx: any): TransactionFieldRequirement[] {
  const direction = tx.transactionKind || tx.direction || 'expense';
  
  // Default base requirements
  const reqs: TransactionFieldRequirement[] = [
    { field: 'amount', requirement: 'required', requiredFor: ['review', 'approval'] },
    { field: 'occurredAt', requirement: 'required', requiredFor: ['review', 'approval'] },
    { field: 'description', requirement: 'required', requiredFor: ['review', 'approval'] },
    { field: 'competenceDate', requirement: 'optional', requiredFor: [] },
    { field: 'costCenter', requirement: 'optional', requiredFor: [] },
  ];

  if (direction === 'expense' || direction === 'income') {
    reqs.push(
      { field: 'account', requirement: 'required', requiredFor: ['review', 'approval'] },
      { field: 'paymentMethod', requirement: 'required', requiredFor: ['review', 'approval'] },
      { field: 'category', requirement: 'required', requiredFor: ['review', 'approval'] },
      { field: 'fund', requirement: 'optional', requiredFor: [] },
      { field: 'evidence', requirement: 'required', requiredFor: ['review', 'approval'], alternativeField: 'evidenceJustification' },
      { field: 'evidenceJustification', requirement: 'optional', requiredFor: ['review', 'approval'], alternativeField: 'evidence' }
    );
    
    // counterparty is required for expense if person/supplier etc, but we'll enforce it for all expenses by default for safety as requested
    if (direction === 'expense') {
      reqs.push({ field: 'counterparty', requirement: 'required', requiredFor: ['review', 'approval'], reason: 'Obrigatório para saídas' });
    } else {
      reqs.push({ field: 'counterparty', requirement: 'optional', requiredFor: [] });
    }
  } else if (direction === 'transfer') {
    reqs.push(
      { field: 'account', requirement: 'required', requiredFor: ['review', 'approval'] },
      { field: 'paymentMethod', requirement: 'not_applicable', requiredFor: [] },
      { field: 'category', requirement: 'not_applicable', requiredFor: [] },
      { field: 'fund', requirement: 'not_applicable', requiredFor: [] },
      { field: 'counterparty', requirement: 'not_applicable', requiredFor: [] },
      { field: 'evidence', requirement: 'optional', requiredFor: [] },
      { field: 'evidenceJustification', requirement: 'optional', requiredFor: [] }
    );
  } else if (direction === 'liability_settlement') {
    reqs.push(
      { field: 'account', requirement: 'required', requiredFor: ['review', 'approval'] },
      { field: 'paymentMethod', requirement: 'required', requiredFor: ['review', 'approval'] },
      { field: 'category', requirement: 'not_applicable', requiredFor: [] },
      { field: 'fund', requirement: 'not_applicable', requiredFor: [] },
      { field: 'counterparty', requirement: 'not_applicable', requiredFor: [] },
      { field: 'evidence', requirement: 'required', requiredFor: ['review', 'approval'], alternativeField: 'evidenceJustification' },
      { field: 'evidenceJustification', requirement: 'optional', requiredFor: ['review', 'approval'], alternativeField: 'evidence' }
    );
  }

  return reqs;
}

export function validateSubmissionReadiness(tx: any): { ready: boolean; errors: string[], findings: any[], requirements: TransactionFieldRequirement[] } {
  const errors: string[] = [];
  const findings: any[] = [];
  const reqs = getTransactionFieldRequirements(tx);

  const checkReq = (field: string, condition: boolean, msg: string) => {
    const req = reqs.find(r => r.field === field);
    if (req && req.requirement === 'required' && req.requiredFor.includes('review')) {
      if (!condition) {
        errors.push(msg);
        findings.push({ code: field, severity: 'blocking', message: msg, field });
      }
    }
  };

  const direction = tx.transactionKind || tx.direction;

  if (direction === 'expense' || direction === 'income') {
    checkReq('account', !!tx.accountId, 'Account is required for income/expense');
    checkReq('paymentMethod', !!tx.paymentMethod, 'Payment method is required for income/expense');
    
    if (!tx.allocations || tx.allocations.length === 0) {
      checkReq('category', false, 'At least one allocation (category) is required for income/expense');
    } else {
      const allHaveCategory = tx.allocations.every((a: any) => !!a.categoryId);
      checkReq('category', allHaveCategory, 'All allocations must have a category');
      
      const totalAllocated = tx.allocations.reduce((sum: number, a: any) => sum + (a.amountCents || 0), 0);
      checkReq('amount', totalAllocated === tx.amountCents, 'Sum of allocations must exactly match the total amount');
    }
  }

  if (direction === 'transfer') {
    checkReq('account', !!tx.sourceAccountId, 'Source account is required for transfer');
    // For transfer, destination account uses liability field in some places or destinationAccountId
    checkReq('account', !!tx.destinationAccountId || !!tx.liabilityAccountId, 'Destination account is required for transfer');
    checkReq('amount', !!tx.amountCents && tx.amountCents > 0, 'Valid amount is required for transfer');
    checkReq('occurredAt', !!tx.occurredAt, 'Date is required for transfer');
  }

  if (direction === 'liability_settlement') {
    checkReq('account', !!tx.sourceAccountId, 'Source account is required for settlement');
    checkReq('account', !!tx.liabilityAccountId && !tx.destinationAccountId, 'Liability account is required for settlement');
    checkReq('amount', !!tx.amountCents && tx.amountCents > 0, 'Valid amount is required for settlement');
    checkReq('occurredAt', !!tx.occurredAt, 'Date is required for settlement');
  }

  // Common required checks
  checkReq('description', !!tx.description, 'Descrição é obrigatória');
  checkReq('counterparty', !!tx.counterparty, 'Favorecido / Origem é obrigatório');
  
  // Evidence validation constraint: either evidenceIds is not empty OR evidenceJustification is provided
  const hasEvidence = Array.isArray(tx.evidenceIds) && tx.evidenceIds.length > 0;
  const hasJustification = typeof tx.evidenceJustification === 'string' && tx.evidenceJustification.trim().length > 0;
  
  const evidenceReq = reqs.find(r => r.field === 'evidence');
  if (evidenceReq && evidenceReq.requirement === 'required' && evidenceReq.requiredFor.includes('review')) {
     if (!hasEvidence && !hasJustification) {
       errors.push('Comprovante ou justificativa é obrigatório para enviar para revisão');
       findings.push({ code: 'evidence', severity: 'blocking', message: 'Comprovante ou justificativa é obrigatório', field: 'evidence' });
     }
  }

  return { ready: errors.length === 0, errors, findings, requirements: reqs };
}

export function validateAccountMetadata(accountData: any): { 
  valid: boolean; 
  name?: string; 
  type?: FinanceAccountType; 
  nature?: AccountNature;
  errors?: string[];
} {
  const errors: string[] = [];
  const name = accountData?.name;
  if (!name || (typeof name === 'string' && name.trim() === '')) {
    errors.push('Account name is missing or empty');
  }
  const rawType = accountData?.type;
  const type = normalizeAccountType(rawType);
  const nature = accountData?.nature || getAccountNature(rawType);

  if (!rawType || (type === 'other' && nature === 'clearing')) {
    errors.push('Account type is missing or not configured');
  }
  if (nature === 'clearing') {
    errors.push('Account nature is clearing (unconfigured/invalid type)');
  }

  return {
    valid: errors.length === 0,
    name,
    type,
    nature,
    errors
  };
}

export function validateCategoryMetadata(catData: any): {
  valid: boolean;
  name?: string;
  kind?: string;
  icon?: string;
  errors?: string[];
} {
  const errors: string[] = [];
  const name = catData?.name;
  if (!name || (typeof name === 'string' && name.trim() === '')) {
    errors.push('Category name is missing or empty');
  }
  const kind = catData?.kind;
  if (!kind || !['income', 'expense'].includes(kind)) {
    errors.push('Category kind is missing or invalid');
  }
  return {
    valid: errors.length === 0,
    name,
    kind,
    icon: catData?.icon,
    errors
  };
}

export function validateFundMetadata(fundData: any): {
  valid: boolean;
  name?: string;
  errors?: string[];
} {
  const errors: string[] = [];
  const name = fundData?.name;
  if (!name || (typeof name === 'string' && name.trim() === '')) {
    errors.push('Fund name is missing or empty');
  }
  return {
    valid: errors.length === 0,
    name,
    errors
  };
}

export type CashFlowDirection = 'inflow' | 'outflow' | 'internal' | 'none';

export function deriveCashFlowDirection(ctx: {
  transactionKind: string;
  accountSnapshot?: { nature?: string; type?: string } | null;
  liabilityAccountSnapshot?: { nature?: string; type?: string } | null;
  sourceAccountSnapshot?: { nature?: string; type?: string } | null;
  destinationAccountSnapshot?: { nature?: string; type?: string } | null;
  paymentMethod?: string;
  reimbursement?: any;
}): CashFlowDirection {
  const kind = ctx.transactionKind;
  
  if (kind === 'income') {
    const nature = ctx.accountSnapshot?.nature || (ctx.accountSnapshot?.type ? getAccountNature(ctx.accountSnapshot.type) : 'asset');
    if (nature === 'asset') {
      return 'inflow';
    }
    return 'none';
  }
  
  if (kind === 'expense') {
    const isCreditCard = ctx.paymentMethod === 'credit_card';
    const isReimbursement = ctx.reimbursement && (ctx.reimbursement.personId || ctx.reimbursement.payableId || ctx.reimbursement.personName || ctx.reimbursement.personName === '');
    const nature = ctx.accountSnapshot?.nature || (ctx.accountSnapshot?.type ? getAccountNature(ctx.accountSnapshot.type) : 'asset');
    if (isCreditCard || isReimbursement || nature === 'liability') {
      return 'none';
    }
    return 'outflow';
  }
  
  if (kind === 'transfer') {
    return 'internal';
  }
  
  if (kind === 'liability_settlement') {
    return 'outflow';
  }
  
  if (kind === 'adjustment') {
    return 'none';
  }

  return 'none';
}

export function simulatePosting(tx: any): Array<{ accountId: string; effect: 'increase' | 'decrease'; amount: number; nature: string }> {
  // Pure conceptual mapping for preparing the domain for Posting. No actual writes.
  const postings = [];

  const direction = tx.transactionKind || tx.direction;

  if (direction === 'transfer') {
    postings.push({ accountId: tx.sourceAccountId, effect: 'decrease', amount: tx.amountCents, nature: 'asset' });
    postings.push({ accountId: tx.destinationAccountId, effect: 'increase', amount: tx.amountCents, nature: 'asset' });
  }

  if (direction === 'expense') {
    const isCreditCard = tx.paymentMethod === 'credit_card';
    const isReimbursement = tx.reimbursement?.personId || tx.reimbursement?.payableId || tx.reimbursement?.personName;
    const nature = tx.accountSnapshot?.nature || (tx.accountSnapshot?.type ? getAccountNature(tx.accountSnapshot.type) : 'asset');
    
    if (isCreditCard || isReimbursement || nature === 'liability') {
      postings.push({ accountId: tx.accountId, effect: 'increase', amount: tx.amountCents, nature: 'liability' });
    } else {
      postings.push({ accountId: tx.accountId, effect: 'decrease', amount: tx.amountCents, nature: 'asset' });
    }
  }

  if (direction === 'liability_settlement') {
    postings.push({ accountId: tx.sourceAccountId, effect: 'decrease', amount: tx.amountCents, nature: 'asset' });
    postings.push({ accountId: tx.liabilityAccountId || tx.destinationAccountId, effect: 'decrease', amount: tx.amountCents, nature: 'liability' });
  }
  
  if (direction === 'income') {
    postings.push({ accountId: tx.accountId, effect: 'increase', amount: tx.amountCents, nature: 'asset' });
  }

  return postings;
}
