import { LedgerTransaction } from './transaction.js';

export type ReviewIssue = {
  code: string;
  details: string;
};

export type ReviewCheck = {
  code: string;
  details: string;
};

export type ReviewReadinessResult = {
  ready: boolean;
  blockers: ReviewIssue[];
  warnings: ReviewIssue[];
  confirmations: ReviewCheck[];
};

export function evaluateReviewReadiness(tx: LedgerTransaction, accounts: any[]): ReviewReadinessResult {
  const blockers: ReviewIssue[] = [];
  const warnings: ReviewIssue[] = [];
  const confirmations: ReviewCheck[] = [];

  // 1. Basic validation
  if (!tx.amountCents || tx.amountCents <= 0) {
    blockers.push({ code: 'INVALID_AMOUNT', details: 'Valor inválido ou zerado' });
  } else if (tx.amountCents > 10000000) { // 100k
    warnings.push({ code: 'UNUSUAL_AMOUNT', details: 'Valor incomum para operação padrão' });
  }

  if (!tx.occurredAt) {
    blockers.push({ code: 'INVALID_DATE', details: 'Data da movimentação ausente' });
  } else {
    const occurredDate = new Date(tx.occurredAt);
    const now = new Date();
    const daysDiff = (now.getTime() - occurredDate.getTime()) / (1000 * 3600 * 24);
    if (daysDiff > 90) {
      warnings.push({ code: 'OLD_DATE', details: 'Data muito antiga (> 90 dias)' });
    }
  }

  if (!tx.financeEntityId) {
    blockers.push({ code: 'CROSS_ENTITY', details: 'Entidade financeira ausente' });
  }

  // 2. Kind-specific validation
  if (tx.transactionKind === 'income' || tx.transactionKind === 'expense') {
    if (!tx.accountId) {
      blockers.push({ code: 'MISSING_ACCOUNT', details: 'Conta inexistente' });
    } else {
      const account = accounts.find(a => a.id === tx.accountId);
      if (!account) {
        blockers.push({ code: 'MISSING_ACCOUNT', details: 'Conta não encontrada no catálogo' });
      } else {
        if (account.configurationStatus !== 'complete' || !account.type || !account.nature) {
          blockers.push({ code: 'INCOMPLETE_ACCOUNT', details: 'Conta incompleta ou não configurada' });
        }
        if (!account.templateKey) {
          warnings.push({ code: 'CUSTOM_ACCOUNT', details: 'Conta personalizada utilizada' });
        }
        if (account.supportedPaymentInstruments && tx.paymentMethod && account.supportedPaymentInstruments.length > 0 && !account.supportedPaymentInstruments.includes(tx.paymentMethod)) {
          blockers.push({ code: 'INCOMPATIBLE_METHOD', details: 'Forma de pagamento incompatível com a conta' });
        }
      }
    }

    if (!tx.allocationIds || tx.allocationIds.length === 0) {
      blockers.push({ code: 'MISSING_CATEGORY', details: 'Categoria obrigatória ausente (falta rateio)' });
    }

    if (!tx.counterparty) {
      warnings.push({ code: 'MISSING_COUNTERPARTY', details: 'Sem favorecido/origem especificado' });
    }
  }

  if (tx.transactionKind === 'transfer') {
    if (!tx.sourceAccountId || !tx.destinationAccountId) {
      blockers.push({ code: 'MISSING_ACCOUNT', details: 'Conta de origem ou destino ausente' });
    } else if (tx.sourceAccountId === tx.destinationAccountId) {
      blockers.push({ code: 'SAME_ACCOUNT', details: 'Transferência com a mesma conta de origem e destino' });
    } else {
      const srcAcc = accounts.find(a => a.id === tx.sourceAccountId);
      const destAcc = accounts.find(a => a.id === tx.destinationAccountId);
      if (!srcAcc || !destAcc) {
        blockers.push({ code: 'MISSING_ACCOUNT', details: 'Conta origem ou destino não encontrada no catálogo' });
      } else {
        if (srcAcc.configurationStatus !== 'complete' || !srcAcc.type || !srcAcc.nature || destAcc.configurationStatus !== 'complete' || !destAcc.type || !destAcc.nature) {
          blockers.push({ code: 'INCOMPLETE_ACCOUNT', details: 'Conta incompleta ou não configurada' });
        }
      }
    }
  }

  if (tx.transactionKind === 'liability_settlement') {
    if (!tx.sourceAccountId || !tx.liabilityAccountId) {
      blockers.push({ code: 'MISSING_ACCOUNT', details: 'Conta origem ou obrigação ausente' });
    } else {
      const srcAcc = accounts.find(a => a.id === tx.sourceAccountId);
      const liabAcc = accounts.find(a => a.id === tx.liabilityAccountId);
      if (!srcAcc || !liabAcc) {
        blockers.push({ code: 'MISSING_ACCOUNT', details: 'Conta origem ou obrigação não encontrada no catálogo' });
      } else {
        if (srcAcc.configurationStatus !== 'complete' || !srcAcc.type || !srcAcc.nature || liabAcc.configurationStatus !== 'complete' || !liabAcc.type || !liabAcc.nature) {
          blockers.push({ code: 'INCOMPLETE_ACCOUNT', details: 'Conta incompleta ou não configurada' });
        }
      }
    }
    // Liability settlement sem obrigação handled above by checking liabilityAccountId
  }

  if ((!tx.evidenceIds || tx.evidenceIds.length === 0) && !tx.evidenceJustification) {
    warnings.push({ code: 'NO_EVIDENCE', details: 'Sem anexo ou justificativa' });
  }

  if (!tx.description || tx.description.length < 5) {
    warnings.push({ code: 'SHORT_DESCRIPTION', details: 'Descrição muito curta' });
  }

  const ready = blockers.length === 0;

  return {
    ready,
    blockers,
    warnings,
    confirmations
  };
}
