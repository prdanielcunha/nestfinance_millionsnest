import type { Language } from '@/src/contexts/LanguageContext';

type CatalogItem = Record<string, unknown> & { name?: string };

const TEXT = {
  PT: {
    recommended: 'Recomendado',
    restricted: 'Finalidade específica',
    free: 'Uso livre',
    paymentGuidance: 'Escolha como o dinheiro realmente foi recebido ou pago.',
    clearPayment: 'Remove a forma escolhida. Você precisará selecionar uma antes de enviar para revisão.',
    accountGuidance: 'Escolha onde o dinheiro entrou, saiu ou ficou guardado.',
    categoryGuidance: 'Escolha o motivo principal desta movimentação.',
    fundGuidance: 'Fundo indica para qual finalidade o dinheiro foi reservado. Só escolha um quando houver essa separação.',
    noFund: 'O valor não ficará reservado para uma finalidade específica.',
    settlementGuidance: 'Escolha o que está sendo quitado agora.',
    directions: {
      income: 'Use quando a igreja recebeu um valor.',
      expense: 'Use quando a igreja realizou um pagamento.',
      transfer: 'Use para mover dinheiro entre contas da própria igreja.',
      liability_settlement: 'Use para quitar uma fatura ou compromisso já registrado.',
    },
    settlement: {
      credit_card_bill: 'Quita uma fatura de cartão já registrada.',
      reimbursement: 'Devolve a alguém um valor pago em nome da igreja.',
    },
    payments: {
      cash: 'Dinheiro físico recebido ou entregue em mãos.',
      pix: 'Pagamento ou recebimento instantâneo por chave Pix.',
      bank_transfer: 'Movimentação bancária entre contas.',
      bank_deposit: 'Valor depositado diretamente em uma conta bancária.',
      debit_card: 'Pagamento debitado na hora da conta bancária.',
      credit_card: 'Compra feita no cartão para pagamento posterior da fatura.',
      prepaid_card: 'Pagamento usando saldo já carregado no cartão.',
      bank_slip: 'Pagamento realizado por boleto bancário.',
      check: 'Pagamento ou recebimento feito por cheque.',
      automatic_debit: 'Cobrança debitada automaticamente da conta.',
      other: 'Use somente quando nenhuma das opções anteriores representar o caso.',
    },
    category: (name: string) => `Use quando o motivo principal for ${name.toLocaleLowerCase('pt-BR')}.`,
    restrictedFund: (name: string) => `Reserva este valor exclusivamente para ${name}.`,
    freeFund: 'Dinheiro disponível para as necessidades gerais, sem restrição específica.',
    cashAccount: 'Dinheiro físico guardado pela tesouraria.',
    liabilityAccount: 'Valor que a igreja ainda precisa pagar.',
    bankAccount: 'Dinheiro guardado ou movimentado nesta conta bancária.',
    genericAccount: 'Local onde este dinheiro está guardado ou foi movimentado.',
  },
  EN: {
    recommended: 'Recommended',
    restricted: 'Specific purpose',
    free: 'Flexible use',
    paymentGuidance: 'Choose how the money was actually received or paid.',
    clearPayment: 'Removes the selected method. You will need to choose one before sending for review.',
    accountGuidance: 'Choose where the money came in, went out, or is held.',
    categoryGuidance: 'Choose the main reason for this transaction.',
    fundGuidance: 'A fund shows what the money was set aside for. Select one only when that separation exists.',
    noFund: 'The amount will not be reserved for a specific purpose.',
    settlementGuidance: 'Choose what is being paid off now.',
    directions: {
      income: 'Use when the church received money.',
      expense: 'Use when the church made a payment.',
      transfer: 'Use to move money between the church’s own accounts.',
      liability_settlement: 'Use to pay a bill or commitment already recorded.',
    },
    settlement: {
      credit_card_bill: 'Pays a credit-card bill that has already been recorded.',
      reimbursement: 'Pays someone back for an expense made for the church.',
    },
    payments: {
      cash: 'Physical money received or handed over in person.',
      pix: 'Instant payment or receipt through a Pix key.',
      bank_transfer: 'Bank movement between accounts.',
      bank_deposit: 'Money deposited directly into a bank account.',
      debit_card: 'Payment immediately debited from the bank account.',
      credit_card: 'Card purchase to be paid later through the bill.',
      prepaid_card: 'Payment using balance previously loaded onto the card.',
      bank_slip: 'Payment made through a bank slip.',
      check: 'Payment or receipt made by check.',
      automatic_debit: 'Charge automatically debited from the account.',
      other: 'Use only when none of the previous options represents the case.',
    },
    category: (name: string) => `Use when the main reason is ${name.toLocaleLowerCase('en-US')}.`,
    restrictedFund: (name: string) => `Reserves this amount exclusively for ${name}.`,
    freeFund: 'Money available for general needs without a specific restriction.',
    cashAccount: 'Physical money held by the treasury.',
    liabilityAccount: 'An amount the church still needs to pay.',
    bankAccount: 'Money held or moved through this bank account.',
    genericAccount: 'Where this money is held or was moved.',
  },
  ES: {
    recommended: 'Recomendado',
    restricted: 'Finalidad específica',
    free: 'Uso libre',
    paymentGuidance: 'Elige cómo se recibió o pagó realmente el dinero.',
    clearPayment: 'Elimina la forma elegida. Deberás seleccionar una antes de enviar a revisión.',
    accountGuidance: 'Elige dónde entró, salió o quedó guardado el dinero.',
    categoryGuidance: 'Elige el motivo principal de este movimiento.',
    fundGuidance: 'El fondo indica para qué finalidad se reservó el dinero. Elige uno solo cuando exista esa separación.',
    noFund: 'El valor no quedará reservado para una finalidad específica.',
    settlementGuidance: 'Elige qué se está pagando ahora.',
    directions: {
      income: 'Úsalo cuando la iglesia recibió un valor.',
      expense: 'Úsalo cuando la iglesia realizó un pago.',
      transfer: 'Úsalo para mover dinero entre cuentas de la propia iglesia.',
      liability_settlement: 'Úsalo para pagar una factura o compromiso ya registrado.',
    },
    settlement: {
      credit_card_bill: 'Paga una factura de tarjeta ya registrada.',
      reimbursement: 'Devuelve a alguien un valor pagado en nombre de la iglesia.',
    },
    payments: {
      cash: 'Dinero físico recibido o entregado en manos.',
      pix: 'Pago o cobro instantáneo mediante una clave Pix.',
      bank_transfer: 'Movimiento bancario entre cuentas.',
      bank_deposit: 'Valor depositado directamente en una cuenta bancaria.',
      debit_card: 'Pago debitado de inmediato de la cuenta bancaria.',
      credit_card: 'Compra con tarjeta para pagar posteriormente en la factura.',
      prepaid_card: 'Pago usando saldo cargado previamente en la tarjeta.',
      bank_slip: 'Pago realizado mediante boleto bancario.',
      check: 'Pago o cobro realizado con cheque.',
      automatic_debit: 'Cobro debitado automáticamente de la cuenta.',
      other: 'Úsalo solo cuando ninguna opción anterior represente el caso.',
    },
    category: (name: string) => `Úsala cuando el motivo principal sea ${name.toLocaleLowerCase('es')}.`,
    restrictedFund: (name: string) => `Reserva este valor exclusivamente para ${name}.`,
    freeFund: 'Dinero disponible para necesidades generales, sin una restricción específica.',
    cashAccount: 'Dinero físico guardado por la tesorería.',
    liabilityAccount: 'Valor que la iglesia todavía debe pagar.',
    bankAccount: 'Dinero guardado o movido en esta cuenta bancaria.',
    genericAccount: 'Lugar donde este dinero está guardado o fue movido.',
  },
} as const;

export function getTransactionOptionGuidance(language: Language) {
  return TEXT[language];
}

export function describePaymentMethod(language: Language, code: string): string | undefined {
  const payments = TEXT[language].payments as Record<string, string>;
  return payments[code];
}

export function describeAccount(language: Language, account: CatalogItem): string {
  const copy = TEXT[language];
  if (account.nature === 'liability') return copy.liabilityAccount;
  if (account.type === 'cash') return copy.cashAccount;
  if (['checking', 'savings', 'digital_wallet'].includes(String(account.type))) return copy.bankAccount;
  return copy.genericAccount;
}

export function describeCategory(language: Language, category: CatalogItem): string {
  return TEXT[language].category(String(category.name || ''));
}

export function describeFund(language: Language, fund: CatalogItem): string {
  const copy = TEXT[language];
  return fund.restricted
    ? copy.restrictedFund(String(fund.name || ''))
    : copy.freeFund;
}

export function fundBadge(language: Language, fund: CatalogItem): string {
  return fund.restricted ? TEXT[language].restricted : TEXT[language].free;
}
