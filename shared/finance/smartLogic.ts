import { PaymentMethodCode } from './paymentMethods';

export type TransactionKind = 'income' | 'expense' | 'transfer';

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
