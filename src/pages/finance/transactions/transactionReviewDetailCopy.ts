import type { Language } from '@/src/contexts/LanguageContext';

export type ReviewReturnReason =
  | 'need_correction'
  | 'missing_evidence'
  | 'incorrect_classification'
  | 'other';

export type TransactionReviewDetailCopy = {
  accessDeniedTitle: string;
  accessDeniedBody: string;
  pageTitle: string;
  pageSubtitle: string;
  backToQueue: string;
  loading: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  supportCode: string;
  stateChangedTitle: string;
  stateChangedBody: string;
  amount: string;
  date: string;
  type: string;
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
  warningsTitle: string;
  warningsBody: string;
  decisionTitle: string;
  decisionBody: string;
  noBalanceChange: string;
  approveButton: string;
  approving: string;
  approveConfirmTitle: string;
  approveConfirmBody: string;
  confirmApprove: string;
  returnButton: string;
  returning: string;
  returnTitle: string;
  returnBody: string;
  reasonLabel: string;
  reasons: Record<ReviewReturnReason, string>;
  commentLabel: string;
  commentPlaceholder: string;
  confirmReturn: string;
  cancel: string;
  actionError: string;
  directions: Record<string, string>;
  paymentMethods: Record<string, string>;
};

export const TRANSACTION_REVIEW_DETAIL_COPY: Record<Language, TransactionReviewDetailCopy> = {
  PT: {
    accessDeniedTitle: 'Acesso não autorizado',
    accessDeniedBody: 'Seu acesso não permite visualizar e conferir esta movimentação.',
    pageTitle: 'Conferir movimentação',
    pageSubtitle: 'Confira os dados com calma e escolha o próximo passo.',
    backToQueue: 'Voltar para a fila',
    loading: 'Carregando movimentação...',
    errorTitle: 'Não foi possível carregar esta movimentação',
    errorBody: 'Nenhuma informação foi alterada. Tente novamente em instantes.',
    retry: 'Tentar novamente',
    supportCode: 'Código de suporte',
    stateChangedTitle: 'Esta movimentação já saiu da fila',
    stateChangedBody: 'O estado dela mudou desde que a fila foi aberta. Volte para ver os itens que ainda precisam de conferência.',
    amount: 'Valor',
    date: 'Data',
    type: 'Tipo',
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
    allocationMismatch: 'A classificação não fecha exatamente o valor total. A aprovação fica bloqueada até a pendência ser corrigida.',
    warningsTitle: 'Há pontos que precisam de atenção',
    warningsBody: 'A movimentação ainda não está pronta para ser aprovada nesta conferência.',
    decisionTitle: 'Sua decisão',
    decisionBody: 'Aprovar confirma esta segunda conferência e envia a movimentação para o próximo passo controlado.',
    noBalanceChange: 'Esta ação não lança a movimentação e não altera saldos.',
    approveButton: 'Aprovar conferência',
    approving: 'Aprovando...',
    approveConfirmTitle: 'Confirmar conferência',
    approveConfirmBody: 'Você confirma que os dados apresentados estão corretos para seguir ao próximo passo?',
    confirmApprove: 'Confirmar aprovação',
    returnButton: 'Devolver para correção',
    returning: 'Devolvendo...',
    returnTitle: 'Devolver para correção',
    returnBody: 'Informe o principal motivo para quem cadastrou saber o que precisa ajustar.',
    reasonLabel: 'Motivo',
    reasons: {
      need_correction: 'Precisa de correção',
      missing_evidence: 'Falta comprovante ou justificativa',
      incorrect_classification: 'Classificação precisa ser ajustada',
      other: 'Outro motivo',
    },
    commentLabel: 'Observação',
    commentPlaceholder: 'Explique de forma simples o que precisa ser corrigido.',
    confirmReturn: 'Confirmar devolução',
    cancel: 'Cancelar',
    actionError: 'Não foi possível concluir esta ação. Nenhum lançamento foi realizado. Tente novamente.',
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
  },
  EN: {
    accessDeniedTitle: 'Access not authorized',
    accessDeniedBody: 'Your access does not allow you to view and review this transaction.',
    pageTitle: 'Review transaction',
    pageSubtitle: 'Check the information carefully and choose the next step.',
    backToQueue: 'Back to queue',
    loading: 'Loading transaction...',
    errorTitle: 'Could not load this transaction',
    errorBody: 'No information was changed. Try again shortly.',
    retry: 'Try again',
    supportCode: 'Support code',
    stateChangedTitle: 'This transaction is no longer in the queue',
    stateChangedBody: 'Its state changed since the queue was opened. Go back to see the items that still need review.',
    amount: 'Amount',
    date: 'Date',
    type: 'Type',
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
    allocationMismatch: 'The classifications do not exactly match the total amount. Approval stays blocked until this is corrected.',
    warningsTitle: 'Some points need attention',
    warningsBody: 'This transaction is not ready to be approved in this review yet.',
    decisionTitle: 'Your decision',
    decisionBody: 'Approval confirms this second review and sends the transaction to the next controlled step.',
    noBalanceChange: 'This action does not post the transaction or change balances.',
    approveButton: 'Approve review',
    approving: 'Approving...',
    approveConfirmTitle: 'Confirm review',
    approveConfirmBody: 'Do you confirm the information shown is correct to move to the next step?',
    confirmApprove: 'Confirm approval',
    returnButton: 'Return for correction',
    returning: 'Returning...',
    returnTitle: 'Return for correction',
    returnBody: 'Choose the main reason so the person who entered it knows what to fix.',
    reasonLabel: 'Reason',
    reasons: {
      need_correction: 'Needs correction',
      missing_evidence: 'Evidence or justification is missing',
      incorrect_classification: 'Classification needs adjustment',
      other: 'Other reason',
    },
    commentLabel: 'Note',
    commentPlaceholder: 'Explain simply what needs to be corrected.',
    confirmReturn: 'Confirm return',
    cancel: 'Cancel',
    actionError: 'Could not complete this action. Nothing was posted. Try again.',
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
  },
  ES: {
    accessDeniedTitle: 'Acceso no autorizado',
    accessDeniedBody: 'Tu acceso no permite visualizar y revisar este movimiento.',
    pageTitle: 'Revisar movimiento',
    pageSubtitle: 'Verifica los datos con calma y elige el siguiente paso.',
    backToQueue: 'Volver a la cola',
    loading: 'Cargando movimiento...',
    errorTitle: 'No fue posible cargar este movimiento',
    errorBody: 'No se modificó ninguna información. Inténtalo de nuevo en unos instantes.',
    retry: 'Intentar de nuevo',
    supportCode: 'Código de soporte',
    stateChangedTitle: 'Este movimiento ya no está en la cola',
    stateChangedBody: 'Su estado cambió desde que se abrió la cola. Vuelve para ver los movimientos que aún necesitan revisión.',
    amount: 'Valor',
    date: 'Fecha',
    type: 'Tipo',
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
    allocationMismatch: 'Las clasificaciones no coinciden exactamente con el valor total. La aprobación queda bloqueada hasta corregirlo.',
    warningsTitle: 'Hay puntos que necesitan atención',
    warningsBody: 'Este movimiento todavía no está listo para aprobarse en esta revisión.',
    decisionTitle: 'Tu decisión',
    decisionBody: 'Aprobar confirma esta segunda revisión y envía el movimiento al siguiente paso controlado.',
    noBalanceChange: 'Esta acción no registra el movimiento ni modifica saldos.',
    approveButton: 'Aprobar revisión',
    approving: 'Aprobando...',
    approveConfirmTitle: 'Confirmar revisión',
    approveConfirmBody: '¿Confirmas que los datos mostrados son correctos para continuar al siguiente paso?',
    confirmApprove: 'Confirmar aprobación',
    returnButton: 'Devolver para corrección',
    returning: 'Devolviendo...',
    returnTitle: 'Devolver para corrección',
    returnBody: 'Indica el motivo principal para que quien lo registró sepa qué debe corregir.',
    reasonLabel: 'Motivo',
    reasons: {
      need_correction: 'Necesita corrección',
      missing_evidence: 'Falta comprobante o justificación',
      incorrect_classification: 'La clasificación necesita ajuste',
      other: 'Otro motivo',
    },
    commentLabel: 'Observación',
    commentPlaceholder: 'Explica de forma simple qué debe corregirse.',
    confirmReturn: 'Confirmar devolución',
    cancel: 'Cancelar',
    actionError: 'No fue posible completar esta acción. No se realizó ningún registro. Inténtalo de nuevo.',
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
  },
};
