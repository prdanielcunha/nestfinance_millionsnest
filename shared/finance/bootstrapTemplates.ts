export type BootstrapTemplateId = 'church-br-v1' | 'obpc-br-v1';

export type BootstrapItem = {
  templateKey: string;
  entityType: 'account' | 'fund' | 'category';
  kind?: 'income' | 'expense';
  name: string;
  description: string;
  defaultSelected: boolean;
  recommended: boolean;
  sortOrder: number;
  metadata?: Record<string, string | boolean>;
};

const COMMON_ACCOUNTS: BootstrapItem[] = [
  { templateKey: 'church.account.cash', entityType: 'account', name: 'Caixa físico', description: 'Recomendado para dinheiro contado nos cultos.', defaultSelected: true, recommended: true, sortOrder: 1, metadata: { type: 'cash' } },
  { templateKey: 'church.account.checking', entityType: 'account', name: 'Conta corrente', description: 'Adicione quando a igreja possuir conta bancária.', defaultSelected: false, recommended: false, sortOrder: 2, metadata: { type: 'checking' } },
  { templateKey: 'church.account.savings', entityType: 'account', name: 'Conta poupança', description: 'Opcional.', defaultSelected: false, recommended: false, sortOrder: 3, metadata: { type: 'savings' } },
  { templateKey: 'church.account.digital_wallet', entityType: 'account', name: 'Carteira digital', description: 'Opcional.', defaultSelected: false, recommended: false, sortOrder: 4, metadata: { type: 'digital_wallet' } },
];

const COMMON_FUNDS: BootstrapItem[] = [
  { templateKey: 'church.fund.general', entityType: 'fund', name: 'Geral', description: 'Fundo livre', defaultSelected: true, recommended: true, sortOrder: 1, metadata: { restricted: false } },
  { templateKey: 'church.fund.missions', entityType: 'fund', name: 'Missões', description: 'Fundo destinado', defaultSelected: false, recommended: false, sortOrder: 3, metadata: { restricted: true } },
  { templateKey: 'church.fund.building', entityType: 'fund', name: 'Construção e Reforma', description: 'Fundo destinado', defaultSelected: false, recommended: false, sortOrder: 4, metadata: { restricted: true } },
  { templateKey: 'church.fund.social', entityType: 'fund', name: 'Ação Social', description: 'Fundo destinado', defaultSelected: false, recommended: false, sortOrder: 5, metadata: { restricted: true } },
  { templateKey: 'church.fund.events', entityType: 'fund', name: 'Eventos', description: 'Fundo destinado', defaultSelected: false, recommended: false, sortOrder: 6, metadata: { restricted: true } },
];

const OBPC_FUNDS: BootstrapItem[] = [
  { templateKey: 'church.fund.general', entityType: 'fund', name: 'Geral', description: 'Fundo livre', defaultSelected: true, recommended: true, sortOrder: 1, metadata: { restricted: false } },
  { templateKey: 'obpc.fund.tithe_of_tithes', entityType: 'fund', name: 'Dízimo dos Dízimos', description: 'Fundo destinado', defaultSelected: true, recommended: true, sortOrder: 2, metadata: { restricted: true } },
  { templateKey: 'church.fund.missions', entityType: 'fund', name: 'Missões', description: 'Fundo destinado', defaultSelected: true, recommended: true, sortOrder: 3, metadata: { restricted: true } },
  { templateKey: 'church.fund.building', entityType: 'fund', name: 'Construção e Reforma', description: 'Fundo destinado', defaultSelected: false, recommended: false, sortOrder: 4, metadata: { restricted: true } },
  { templateKey: 'church.fund.social', entityType: 'fund', name: 'Ação Social', description: 'Fundo destinado', defaultSelected: false, recommended: false, sortOrder: 5, metadata: { restricted: true } },
  { templateKey: 'church.fund.events', entityType: 'fund', name: 'Eventos', description: 'Fundo destinado', defaultSelected: false, recommended: false, sortOrder: 6, metadata: { restricted: true } },
];

const COMMON_INCOME_CATEGORIES: BootstrapItem[] = [
  { templateKey: 'church.category.income.tithes', entityType: 'category', kind: 'income', name: 'Dízimos', description: '', defaultSelected: true, recommended: true, sortOrder: 1 },
  { templateKey: 'church.category.income.offerings', entityType: 'category', kind: 'income', name: 'Ofertas', description: '', defaultSelected: true, recommended: true, sortOrder: 2 },
  { templateKey: 'church.category.income.donations', entityType: 'category', kind: 'income', name: 'Doações', description: '', defaultSelected: true, recommended: true, sortOrder: 3 },
  { templateKey: 'church.category.income.campaigns', entityType: 'category', kind: 'income', name: 'Campanhas', description: '', defaultSelected: true, recommended: true, sortOrder: 4 },
  { templateKey: 'church.category.income.other', entityType: 'category', kind: 'income', name: 'Outras entradas', description: '', defaultSelected: true, recommended: true, sortOrder: 5 },
  { templateKey: 'church.category.income.events', entityType: 'category', kind: 'income', name: 'Eventos', description: '', defaultSelected: false, recommended: false, sortOrder: 6 },
];

const COMMON_EXPENSE_CATEGORIES: BootstrapItem[] = [
  { templateKey: 'church.category.expense.water', entityType: 'category', kind: 'expense', name: 'Água', description: '', defaultSelected: true, recommended: true, sortOrder: 1 },
  { templateKey: 'church.category.expense.electricity', entityType: 'category', kind: 'expense', name: 'Energia elétrica', description: '', defaultSelected: true, recommended: true, sortOrder: 2 },
  { templateKey: 'church.category.expense.phone_internet', entityType: 'category', kind: 'expense', name: 'Internet e telefone', description: '', defaultSelected: true, recommended: true, sortOrder: 3 },
  { templateKey: 'church.category.expense.maintenance', entityType: 'category', kind: 'expense', name: 'Manutenção e reparos', description: '', defaultSelected: true, recommended: true, sortOrder: 4 },
  { templateKey: 'church.category.expense.supplies', entityType: 'category', kind: 'expense', name: 'Materiais de consumo', description: '', defaultSelected: true, recommended: true, sortOrder: 5 },
  { templateKey: 'church.category.expense.cleaning', entityType: 'category', kind: 'expense', name: 'Limpeza', description: '', defaultSelected: true, recommended: true, sortOrder: 6 },
  { templateKey: 'church.category.expense.stipend', entityType: 'category', kind: 'expense', name: 'Ajuda de custo', description: '', defaultSelected: true, recommended: true, sortOrder: 7 },
  { templateKey: 'church.category.expense.denom_transfer', entityType: 'category', kind: 'expense', name: 'Repasse denominacional', description: '', defaultSelected: true, recommended: true, sortOrder: 8 },
  { templateKey: 'church.category.expense.missions_transfer', entityType: 'category', kind: 'expense', name: 'Repasse missionário', description: '', defaultSelected: true, recommended: true, sortOrder: 9 },
  { templateKey: 'church.category.expense.accounting', entityType: 'category', kind: 'expense', name: 'Serviços contábeis', description: '', defaultSelected: true, recommended: true, sortOrder: 10 },
  { templateKey: 'church.category.expense.bank_fees', entityType: 'category', kind: 'expense', name: 'Taxas bancárias', description: '', defaultSelected: true, recommended: true, sortOrder: 11 },
  { templateKey: 'church.category.expense.other', entityType: 'category', kind: 'expense', name: 'Outras saídas', description: '', defaultSelected: true, recommended: true, sortOrder: 12 },
  
  { templateKey: 'church.category.expense.rent', entityType: 'category', kind: 'expense', name: 'Aluguel e locações', description: '', defaultSelected: false, recommended: false, sortOrder: 13 },
  { templateKey: 'church.category.expense.multimedia', entityType: 'category', kind: 'expense', name: 'Som e multimídia', description: '', defaultSelected: false, recommended: false, sortOrder: 14 },
  { templateKey: 'church.category.expense.transport', entityType: 'category', kind: 'expense', name: 'Transporte', description: '', defaultSelected: false, recommended: false, sortOrder: 15 },
  { templateKey: 'church.category.expense.social', entityType: 'category', kind: 'expense', name: 'Ação social', description: '', defaultSelected: false, recommended: false, sortOrder: 16 },
  { templateKey: 'church.category.expense.taxes', entityType: 'category', kind: 'expense', name: 'Impostos e taxas', description: '', defaultSelected: false, recommended: false, sortOrder: 17 },
  { templateKey: 'church.category.expense.events', entityType: 'category', kind: 'expense', name: 'Eventos', description: '', defaultSelected: false, recommended: false, sortOrder: 18 },
];

export const BOOTSTRAP_TEMPLATES: Record<BootstrapTemplateId, BootstrapItem[]> = {
  'church-br-v1': [
    ...COMMON_ACCOUNTS,
    ...COMMON_FUNDS,
    ...COMMON_INCOME_CATEGORIES,
    ...COMMON_EXPENSE_CATEGORIES
  ],
  'obpc-br-v1': [
    ...COMMON_ACCOUNTS,
    ...OBPC_FUNDS,
    ...COMMON_INCOME_CATEGORIES,
    ...COMMON_EXPENSE_CATEGORIES
  ]
};
