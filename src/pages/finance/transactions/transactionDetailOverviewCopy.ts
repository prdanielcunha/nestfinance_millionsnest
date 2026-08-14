import type { Language } from '@/src/contexts/LanguageContext';

export type TransactionDetailOverviewCopy = {
  accessDeniedTitle: string;
  accessDeniedBody: string;
  advancedDeniedTitle: string;
  advancedDeniedBody: string;
  pageTitle: string;
  pageSubtitle: string;
  backToList: string;
  loading: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  supportCode: string;
  amount: string;
  date: string;
  type: string;
  status: string;
  description: string;
  account: string;
  fromAccount: string;
  toAccount: string;
  paymentMethod: string;
  counterparty: string;
  evidence: string;
  classification: string;
  category: string;
  fund: string;
  costCenter: string;
  noDescription: string;
  noAccount: string;
  notInformed: string;
  evidenceCount: (count: number) => string;
  allocationCount: (count: number) => string;
  allocationMismatch: string;
  statuses: Record<string, string>;
  directions: Record<string, string>;
  paymentMethods: Record<string, string>;
  returnedTitle: string;
  returnedBody: string;
  returnedNote: string;
  draftReadyTitle: string;
  draftReadyBody: string;
  draftIncompleteTitle: string;
  draftIncompleteBody: string;
  editDraft: string;
  submitForReview: string;
  submitting: string;
  awaitingReviewTitle: string;
  awaitingReviewBody: string;
  openReview: string;
  approvedTitle: string;
  approvedBody: string;
  advancedVerification: string;
  postedTitle: string;
  postedBody: string;
  reversedTitle: string;
  reversedBody: string;
  historicalTitle: string;
  historicalBody: string;
  noBalanceChange: string;
  actionError: string;
};

export const TRANSACTION_DETAIL_OVERVIEW_COPY: Record<Language, TransactionDetailOverviewCopy> = {
  PT: {
    accessDeniedTitle: 'Acesso não autorizado',
    accessDeniedBody: 'Seu acesso não permite visualizar esta movimentação.',
    advancedDeniedTitle: 'Verificação restrita',
    advancedDeniedBody: 'Seu acesso não permite abrir as ferramentas avançadas de verificação desta movimentação.',
    pageTitle: 'Movimentação',
    pageSubtitle: 'Veja o que aconteceu, o estado atual e o próximo passo com clareza.',
    backToList: 'Voltar para movimentações',
    loading: 'Carregando movimentação...',
    errorTitle: 'Não foi possível carregar esta movimentação',
    errorBody: 'Nenhuma informação foi alterada. Tente novamente em instantes.',
    retry: 'Tentar novamente',
    supportCode: 'Código de suporte',
    amount: 'Valor',
    date: 'Data',
    type: 'Tipo',
    status: 'Etapa',
    description: 'Descrição',
    account: 'Conta',
    fromAccount: 'Conta de origem',
    toAccount: 'Conta de destino',
    paymentMethod: 'Forma',
    counterparty: 'Favorecido / origem',
    evidence: 'Comprovantes',
    classification: 'Classificação do valor',
    category: 'Categoria',
    fund: 'Fundo',
    costCenter: 'Centro de custo',
    noDescription: 'Sem descrição',
    noAccount: 'Conta não informada',
    notInformed: 'Não informado',
    evidenceCount: (count) => `${count} ${count === 1 ? 'comprovante' : 'comprovantes'}`,
    allocationCount: (count) => `${count} ${count === 1 ? 'classificação' : 'classificações'}`,
    allocationMismatch: 'A classificação não fecha exatamente o valor total. Corrija antes de seguir.',
    statuses: {
      draft: 'Rascunho',
      returned: 'Para corrigir',
      ready_for_review: 'Para conferir',
      approved_for_posting: 'Conferência aprovada',
      posted: 'Registrada',
      reversed: 'Revertida',
      unknown: 'Estado atual',
    },
    directions: {
      income: 'Entrada',
      expense: 'Saída',
      transfer: 'Transferência',
      liability_settlement: 'Obrigação',
    },
    paymentMethods: {
      cash: 'Dinheiro',
      pix: 'Pix',
      bank_transfer: 'Transferência bancária',
      bank_deposit: 'Depósito bancário',
      debit_card: 'Cartão de débito',
      credit_card: 'Cartão de crédito',
      prepaid_card: 'Cartão pré-pago',
      bank_slip: 'Boleto',
      check: 'Cheque',
      automatic_debit: 'Débito automático',
      other: 'Outro',
    },
    returnedTitle: 'Precisa de correção',
    returnedBody: 'A movimentação voltou para rascunho. Ajuste o que foi apontado e envie novamente quando estiver pronta.',
    returnedNote: 'Observação da revisão',
    draftReadyTitle: 'Pronta para conferir',
    draftReadyBody: 'As informações essenciais estão completas. Você pode editar ou enviar para a segunda conferência.',
    draftIncompleteTitle: 'Ainda faltam informações',
    draftIncompleteBody: 'Complete o rascunho antes de enviar. Nada foi lançado e o saldo continua inalterado.',
    editDraft: 'Editar rascunho',
    submitForReview: 'Enviar para conferência',
    submitting: 'Enviando...',
    awaitingReviewTitle: 'Aguardando conferência',
    awaitingReviewBody: 'Esta movimentação já foi enviada para uma segunda conferência. Ela ainda não alterou o saldo.',
    openReview: 'Abrir conferência',
    approvedTitle: 'Conferência aprovada',
    approvedBody: 'A segunda conferência foi concluída. A movimentação segue aguardando a próxima etapa controlada.',
    advancedVerification: 'Abrir verificação avançada',
    postedTitle: 'Movimentação registrada',
    postedBody: 'Este é um estado histórico de uma movimentação já registrada.',
    reversedTitle: 'Movimentação revertida',
    reversedBody: 'Este é um estado histórico de uma movimentação que passou por reversão.',
    historicalTitle: 'Movimentação',
    historicalBody: 'Consulte os dados desta movimentação e seu estado atual.',
    noBalanceChange: 'Neste estágio, nenhum lançamento real foi executado e o saldo não foi alterado.',
    actionError: 'Não foi possível concluir esta ação. Nenhum lançamento foi realizado. Tente novamente.',
  },
  EN: {
    accessDeniedTitle: 'Access not authorized',
    accessDeniedBody: 'Your access does not allow you to view this transaction.',
    advancedDeniedTitle: 'Restricted verification',
    advancedDeniedBody: 'Your access does not allow you to open the advanced verification tools for this transaction.',
    pageTitle: 'Transaction',
    pageSubtitle: 'See what happened, the current state, and the next step clearly.',
    backToList: 'Back to transactions',
    loading: 'Loading transaction...',
    errorTitle: 'Could not load this transaction',
    errorBody: 'No information was changed. Try again shortly.',
    retry: 'Try again',
    supportCode: 'Support code',
    amount: 'Amount',
    date: 'Date',
    type: 'Type',
    status: 'Stage',
    description: 'Description',
    account: 'Account',
    fromAccount: 'Source account',
    toAccount: 'Destination account',
    paymentMethod: 'Method',
    counterparty: 'Payee / source',
    evidence: 'Evidence',
    classification: 'Amount classification',
    category: 'Category',
    fund: 'Fund',
    costCenter: 'Cost center',
    noDescription: 'No description',
    noAccount: 'Account not provided',
    notInformed: 'Not provided',
    evidenceCount: (count) => `${count} ${count === 1 ? 'attachment' : 'attachments'}`,
    allocationCount: (count) => `${count} ${count === 1 ? 'classification' : 'classifications'}`,
    allocationMismatch: 'The classifications do not exactly match the total amount. Correct them before continuing.',
    statuses: {
      draft: 'Draft',
      returned: 'Needs correction',
      ready_for_review: 'Needs review',
      approved_for_posting: 'Review approved',
      posted: 'Recorded',
      reversed: 'Reversed',
      unknown: 'Current state',
    },
    directions: {
      income: 'Income',
      expense: 'Expense',
      transfer: 'Transfer',
      liability_settlement: 'Obligation',
    },
    paymentMethods: {
      cash: 'Cash',
      pix: 'Pix',
      bank_transfer: 'Bank transfer',
      bank_deposit: 'Bank deposit',
      debit_card: 'Debit card',
      credit_card: 'Credit card',
      prepaid_card: 'Prepaid card',
      bank_slip: 'Bank slip',
      check: 'Check',
      automatic_debit: 'Automatic debit',
      other: 'Other',
    },
    returnedTitle: 'Needs correction',
    returnedBody: 'The transaction returned to draft. Adjust what was pointed out and send it again when ready.',
    returnedNote: 'Review note',
    draftReadyTitle: 'Ready for review',
    draftReadyBody: 'The essential information is complete. You can edit it or send it for a second review.',
    draftIncompleteTitle: 'Some information is still missing',
    draftIncompleteBody: 'Complete the draft before sending it. Nothing was posted and balances remain unchanged.',
    editDraft: 'Edit draft',
    submitForReview: 'Send for review',
    submitting: 'Sending...',
    awaitingReviewTitle: 'Waiting for review',
    awaitingReviewBody: 'This transaction has already been sent for a second review. It has not changed balances.',
    openReview: 'Open review',
    approvedTitle: 'Review approved',
    approvedBody: 'The second review is complete. The transaction is still waiting for the next controlled step.',
    advancedVerification: 'Open advanced verification',
    postedTitle: 'Transaction recorded',
    postedBody: 'This is a historical state for a transaction that has already been recorded.',
    reversedTitle: 'Transaction reversed',
    reversedBody: 'This is a historical state for a transaction that went through reversal.',
    historicalTitle: 'Transaction',
    historicalBody: 'Review this transaction and its current state.',
    noBalanceChange: 'At this stage, no real posting was executed and balances were not changed.',
    actionError: 'Could not complete this action. Nothing was posted. Try again.',
  },
  ES: {
    accessDeniedTitle: 'Acceso no autorizado',
    accessDeniedBody: 'Tu acceso no permite visualizar este movimiento.',
    advancedDeniedTitle: 'Verificación restringida',
    advancedDeniedBody: 'Tu acceso no permite abrir las herramientas avanzadas de verificación de este movimiento.',
    pageTitle: 'Movimiento',
    pageSubtitle: 'Consulta con claridad qué ocurrió, el estado actual y el siguiente paso.',
    backToList: 'Volver a movimientos',
    loading: 'Cargando movimiento...',
    errorTitle: 'No fue posible cargar este movimiento',
    errorBody: 'No se modificó ninguna información. Inténtalo de nuevo en unos instantes.',
    retry: 'Intentar de nuevo',
    supportCode: 'Código de soporte',
    amount: 'Valor',
    date: 'Fecha',
    type: 'Tipo',
    status: 'Etapa',
    description: 'Descripción',
    account: 'Cuenta',
    fromAccount: 'Cuenta de origen',
    toAccount: 'Cuenta de destino',
    paymentMethod: 'Forma',
    counterparty: 'Beneficiario / origen',
    evidence: 'Comprobantes',
    classification: 'Clasificación del valor',
    category: 'Categoría',
    fund: 'Fondo',
    costCenter: 'Centro de costo',
    noDescription: 'Sin descripción',
    noAccount: 'Cuenta no informada',
    notInformed: 'No informado',
    evidenceCount: (count) => `${count} ${count === 1 ? 'comprobante' : 'comprobantes'}`,
    allocationCount: (count) => `${count} ${count === 1 ? 'clasificación' : 'clasificaciones'}`,
    allocationMismatch: 'Las clasificaciones no coinciden exactamente con el valor total. Corrige antes de continuar.',
    statuses: {
      draft: 'Borrador',
      returned: 'Para corregir',
      ready_for_review: 'Para revisar',
      approved_for_posting: 'Revisión aprobada',
      posted: 'Registrado',
      reversed: 'Revertido',
      unknown: 'Estado actual',
    },
    directions: {
      income: 'Ingreso',
      expense: 'Egreso',
      transfer: 'Transferencia',
      liability_settlement: 'Obligación',
    },
    paymentMethods: {
      cash: 'Efectivo',
      pix: 'Pix',
      bank_transfer: 'Transferencia bancaria',
      bank_deposit: 'Depósito bancario',
      debit_card: 'Tarjeta de débito',
      credit_card: 'Tarjeta de crédito',
      prepaid_card: 'Tarjeta prepaga',
      bank_slip: 'Boleto',
      check: 'Cheque',
      automatic_debit: 'Débito automático',
      other: 'Otro',
    },
    returnedTitle: 'Necesita corrección',
    returnedBody: 'El movimiento volvió a borrador. Ajusta lo señalado y envíalo de nuevo cuando esté listo.',
    returnedNote: 'Observación de la revisión',
    draftReadyTitle: 'Listo para revisión',
    draftReadyBody: 'La información esencial está completa. Puedes editarlo o enviarlo a una segunda revisión.',
    draftIncompleteTitle: 'Todavía faltan datos',
    draftIncompleteBody: 'Completa el borrador antes de enviarlo. No se realizó ningún registro y los saldos siguen sin cambios.',
    editDraft: 'Editar borrador',
    submitForReview: 'Enviar a revisión',
    submitting: 'Enviando...',
    awaitingReviewTitle: 'Esperando revisión',
    awaitingReviewBody: 'Este movimiento ya fue enviado a una segunda revisión. Todavía no modificó los saldos.',
    openReview: 'Abrir revisión',
    approvedTitle: 'Revisión aprobada',
    approvedBody: 'La segunda revisión fue concluida. El movimiento sigue esperando la próxima etapa controlada.',
    advancedVerification: 'Abrir verificación avanzada',
    postedTitle: 'Movimiento registrado',
    postedBody: 'Este es un estado histórico de un movimiento que ya fue registrado.',
    reversedTitle: 'Movimiento revertido',
    reversedBody: 'Este es un estado histórico de un movimiento que pasó por reversión.',
    historicalTitle: 'Movimiento',
    historicalBody: 'Consulta los datos de este movimiento y su estado actual.',
    noBalanceChange: 'En esta etapa no se ejecutó ningún registro real y los saldos no fueron modificados.',
    actionError: 'No fue posible completar esta acción. No se realizó ningún registro. Inténtalo de nuevo.',
  },
};
