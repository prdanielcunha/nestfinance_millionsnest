export type PaymentMethodCode =
  | 'cash'
  | 'pix'
  | 'bank_transfer'
  | 'bank_deposit'
  | 'debit_card'
  | 'credit_card'
  | 'prepaid_card'
  | 'bank_slip'
  | 'check'
  | 'automatic_debit'
  | 'other';

export type PaymentMethodDefinition = {
  code: PaymentMethodCode;
  label: string;
  description: string;

  supportsIncome: boolean;
  supportsExpense: boolean;

  supportsFees: boolean;
  supportsInstallments: boolean;
  requiresSettlement: boolean;

  defaultEnabled: boolean;
  recommended: boolean;
  sortOrder: number;
};

export const PAYMENT_METHODS: PaymentMethodDefinition[] = [
  {
    code: 'cash',
    label: 'Dinheiro',
    description: 'Valores físicos contados e guardados em caixa.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: false,
    supportsInstallments: false,
    requiresSettlement: false,
    defaultEnabled: true,
    recommended: true,
    sortOrder: 1,
  },
  {
    code: 'pix',
    label: 'Pix',
    description: 'Transferências instantâneas recebidas nas contas da igreja.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: false,
    supportsInstallments: false,
    requiresSettlement: false,
    defaultEnabled: true,
    recommended: true,
    sortOrder: 2,
  },
  {
    code: 'bank_transfer',
    label: 'Transferência bancária',
    description: 'Valores enviados diretamente entre contas.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: false,
    supportsInstallments: false,
    requiresSettlement: false,
    defaultEnabled: true,
    recommended: true,
    sortOrder: 3,
  },
  {
    code: 'debit_card',
    label: 'Cartão de débito',
    description: 'Valores recebidos por maquininha.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: true,
    supportsInstallments: false,
    requiresSettlement: true,
    defaultEnabled: true,
    recommended: true,
    sortOrder: 4,
  },
  {
    code: 'credit_card',
    label: 'Cartão de crédito',
    description: 'Valores recebidos por maquininha ou link de pagamento.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: true,
    supportsInstallments: true,
    requiresSettlement: true,
    defaultEnabled: true,
    recommended: true,
    sortOrder: 5,
  },
  {
    code: 'bank_deposit',
    label: 'Depósito bancário',
    description: 'Valores depositados diretamente em caixa eletrônico ou agência.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: false,
    supportsInstallments: false,
    requiresSettlement: false,
    defaultEnabled: false,
    recommended: false,
    sortOrder: 6,
  },
  {
    code: 'prepaid_card',
    label: 'Cartão pré-pago',
    description: 'Pagamentos feitos com cartões pré-pagos.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: true,
    supportsInstallments: false,
    requiresSettlement: true,
    defaultEnabled: false,
    recommended: false,
    sortOrder: 7,
  },
  {
    code: 'bank_slip',
    label: 'Boleto',
    description: 'Cobranças pagas por boleto bancário.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: true,
    supportsInstallments: false,
    requiresSettlement: true,
    defaultEnabled: false,
    recommended: false,
    sortOrder: 8,
  },
  {
    code: 'check',
    label: 'Cheque',
    description: 'Pagamento recebido em folha de cheque.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: false,
    supportsInstallments: false,
    requiresSettlement: true,
    defaultEnabled: false,
    recommended: false,
    sortOrder: 9,
  },
  {
    code: 'automatic_debit',
    label: 'Débito automático',
    description: 'Pagamentos descontados automaticamente.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: false,
    supportsInstallments: false,
    requiresSettlement: false,
    defaultEnabled: false,
    recommended: false,
    sortOrder: 10,
  },
  {
    code: 'other',
    label: 'Outro',
    description: 'Outras formas de pagamento ou recebimento.',
    supportsIncome: true,
    supportsExpense: true,
    supportsFees: false,
    supportsInstallments: false,
    requiresSettlement: false,
    defaultEnabled: false,
    recommended: false,
    sortOrder: 11,
  }
];

export type CollectionModeCode =
  | 'manual'
  | 'static_qr'
  | 'dynamic_qr'
  | 'automatic'
  | 'scheduled'
  | 'card_terminal'
  | 'payment_link'
  | 'bank_import'
  | 'other';
