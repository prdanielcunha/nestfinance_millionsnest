import type { Language } from '@/src/contexts/LanguageContext';

export type TransactionCreateCopy = {
  accessDeniedTitle: string;
  accessDeniedBody: string;
  accountPending: string;
  loadErrorTitle: string;
  loadErrorBody: string;
  retry: string;
  pageTitle: string;
  back: string;
  supportCode: string;
  copyCode: string;
  whatHappened: string;
  amount: string;
  date: string;
  directions: Record<'income' | 'expense' | 'transfer' | 'liability_settlement', string>;
  howQuestion: Record<'income' | 'expense' | 'transfer' | 'liability_settlement', string>;
  paymentMethodIncome: string;
  paymentMethodExpense: string;
  select: string;
  settlementType: string;
  settlementCreditCard: string;
  settlementReimbursement: string;
  liabilityAccount: string;
  selectLiability: string;
  account: string;
  sourceAccount: string;
  payingAccount: string;
  destinationAccount: string;
  selectAccount: string;
  selectDestination: string;
  noCompatibleAccount: string;
  noAccount: string;
  physicalCash: string;
  description: string;
  descriptionPlaceholder: Record<'income' | 'expense' | 'transfer' | 'liability_settlement', string>;
  required: string;
  optional: string;
  requiredOrJustify: string;
  showDetails: string;
  hideDetails: string;
  detailsHint: string;
  counterparty: Record<'income' | 'expense' | 'transfer' | 'liability_settlement', string>;
  counterpartyPlaceholder: string;
  evidence: string;
  evidenceJustification: string;
  evidenceJustificationPlaceholder: string;
  classificationTitle: string;
  classificationHint: string;
  showClassification: string;
  hideClassification: string;
  split: string;
  unsplit: string;
  splitNeedsAmount: string;
  remaining: string;
  exceeded: string;
  allocationAmount: string;
  removeAllocation: string;
  category: string;
  selectCategory: string;
  noCompatibleCategory: string;
  fund: string;
  noFund: string;
  noActiveFund: string;
  costCenter: string;
  costCenterPlaceholder: string;
  addAllocation: string;
  summaryTitle: string;
  summaryAccount: string;
  summaryOrigin: string;
  summaryDestination: string;
  summaryMethod: string;
  summaryCategory: string;
  summaryChurch: string;
  summarySettlement: string;
  pending: string;
  invoice: string;
  reimbursement: string;
  selectedPlural: string;
  reviewMissing: string;
  reviewMissingHint: string;
  revealMissing: string;
  sendForReview: string;
  sending: string;
  saveDraft: string;
  saving: string;
  flowTitle: string;
  draftTitle: string;
  draftBody: string;
  reviewTitle: string;
  reviewBody: string;
  unsavedConfirm: string;
  paymentRemoved: string;
  paymentUnsupported: (accountName: string) => string;
  errorSelectAccount: string;
  errorIncompleteAccount: string;
  errorSelectDestination: string;
  errorSameAccounts: string;
  errorIncompleteDestination: string;
  errorSettlementType: string;
  errorLiabilityAccount: string;
  errorIncompleteLiability: string;
  errorPositiveAmount: string;
  errorAllocationCategory: string;
  errorAllocationAmount: string;
  errorPaymentAndCategory: string;
  errorCategory: string;
  errorAllocationTotal: string;
  errorAllocationMismatch: string;
  errorAccountMismatch: string;
  errorCategoryMismatch: string;
  errorFundMismatch: string;
  errorIdempotency: string;
  errorPaymentMismatch: string;
  errorForbidden: string;
  errorServiceUnavailable: string;
  errorSave: string;
  errorUncertain: string;
  accountRepaired: string;
  customAccountNeedsSetup: string;
  repairFailed: string;
};

export const TRANSACTION_CREATE_COPY: Record<Language, TransactionCreateCopy> = {
  PT: {
    accessDeniedTitle: 'Acesso somente leitura',
    accessDeniedBody: 'Seu acesso permite consultar as finanças, mas não registrar novas movimentações.',
    accountPending: 'Pendente de configuração',
    loadErrorTitle: 'Não foi possível preparar o formulário',
    loadErrorBody: 'Confira sua conexão e tente novamente. Nenhuma movimentação foi criada.',
    retry: 'Tentar novamente',
    pageTitle: 'Nova movimentação',
    back: 'Voltar para movimentações',
    supportCode: 'Código de suporte',
    copyCode: 'Copiar código',
    whatHappened: 'O que aconteceu?',
    amount: 'Valor',
    date: 'Data',
    directions: { income: 'Entrou dinheiro', expense: 'Saiu dinheiro', transfer: 'Transferência', liability_settlement: 'Pagar uma obrigação' },
    howQuestion: { income: 'Como o dinheiro entrou?', expense: 'Como o dinheiro saiu?', transfer: 'Entre quais contas?', liability_settlement: 'Como a obrigação foi paga?' },
    paymentMethodIncome: 'Forma de recebimento',
    paymentMethodExpense: 'Forma de pagamento',
    select: 'Selecione...',
    settlementType: 'Tipo de pagamento',
    settlementCreditCard: 'Pagar fatura de cartão',
    settlementReimbursement: 'Reembolsar uma pessoa',
    liabilityAccount: 'Obrigação a pagar',
    selectLiability: 'Selecione a obrigação...',
    account: 'Conta',
    sourceAccount: 'Conta de origem',
    payingAccount: 'Conta que pagou',
    destinationAccount: 'Conta de destino',
    selectAccount: 'Selecione uma conta...',
    selectDestination: 'Selecione a conta de destino...',
    noCompatibleAccount: 'Nenhuma conta compatível com esta escolha',
    noAccount: 'Nenhuma conta disponível',
    physicalCash: 'Esta movimentação passa pelo caixa físico da igreja.',
    description: 'Descrição',
    descriptionPlaceholder: { income: 'Ex.: Dízimo, oferta, contribuição...', expense: 'Ex.: Energia, manutenção, material...', transfer: 'Ex.: Transferência para o caixa físico...', liability_settlement: 'Ex.: Pagamento da fatura de agosto...' },
    required: 'Obrigatório', optional: 'Opcional', requiredOrJustify: 'Obrigatório ou justificar',
    showDetails: 'Adicionar detalhes e comprovantes', hideDetails: 'Ocultar detalhes', detailsHint: 'Favorecido, origem e comprovantes ficam aqui quando forem necessários.',
    counterparty: { income: 'De quem veio?', expense: 'Quem recebeu ou foi pago?', transfer: 'Origem ou favorecido', liability_settlement: 'Favorecido' },
    counterpartyPlaceholder: 'Pessoa, fornecedor, ministério...', evidence: 'Comprovantes', evidenceJustification: 'Sem comprovante?', evidenceJustificationPlaceholder: 'Explique de forma breve por que não há comprovante...',
    classificationTitle: 'Como classificar?', classificationHint: 'Categoria é necessária para enviar entradas e saídas à revisão. Fundo e centro de custo continuam opcionais.', showClassification: 'Classificar movimentação', hideClassification: 'Ocultar classificação',
    split: 'Dividir em mais categorias', unsplit: 'Usar uma categoria', splitNeedsAmount: 'Informe o valor antes de dividir.', remaining: 'Ainda falta', exceeded: 'Passou do valor', allocationAmount: 'Valor desta parte', removeAllocation: 'Remover parte',
    category: 'Categoria', selectCategory: 'Selecione uma categoria...', noCompatibleCategory: 'Nenhuma categoria compatível', fund: 'Fundo (opcional)', noFund: 'Nenhum fundo', noActiveFund: 'Nenhum fundo ativo', costCenter: 'Centro de custo (opcional)', costCenterPlaceholder: 'Ex.: Sede, jovens, missões...', addAllocation: 'Adicionar outra categoria',
    summaryTitle: 'Confira antes de continuar', summaryAccount: 'Conta', summaryOrigin: 'Origem', summaryDestination: 'Destino', summaryMethod: 'Forma', summaryCategory: 'Categoria', summaryChurch: 'Igreja', summarySettlement: 'Pagamento', pending: 'Pendente', invoice: 'Fatura', reimbursement: 'Reembolso', selectedPlural: 'selecionadas',
    reviewMissing: 'Faltam {count} informações para enviar à revisão', reviewMissingHint: 'O rascunho pode ser salvo agora. Para enviar à revisão, complete o que falta.', revealMissing: 'Mostrar o que falta', sendForReview: 'Enviar para revisão', sending: 'Enviando...', saveDraft: 'Salvar como rascunho', saving: 'Salvando...',
    flowTitle: 'O que acontece depois?', draftTitle: 'Rascunho', draftBody: 'Guarda o que você já informou e não altera saldo.', reviewTitle: 'Em revisão', reviewBody: 'Outra pessoa autorizada confere os dados. Ainda não altera saldo.',
    unsavedConfirm: 'Há alterações não salvas. Deseja trocar de igreja e descartar este rascunho?', paymentRemoved: 'A forma anterior foi removida porque não combina com o tipo de movimentação escolhido.', paymentUnsupported: (name) => `A forma escolhida foi removida porque a conta “${name}” não a aceita.`,
    errorSelectAccount: 'Escolha a conta onde esta movimentação aconteceu.', errorIncompleteAccount: 'A conta escolhida precisa de um ajuste antes de continuar.', errorSelectDestination: 'Escolha a conta de destino.', errorSameAccounts: 'Origem e destino precisam ser contas diferentes.', errorIncompleteDestination: 'A conta de destino precisa de um ajuste antes de continuar.', errorSettlementType: 'Escolha o tipo de pagamento da obrigação.', errorLiabilityAccount: 'Escolha a obrigação que está sendo paga.', errorIncompleteLiability: 'A obrigação escolhida precisa de um ajuste antes de continuar.', errorPositiveAmount: 'Informe um valor maior que zero.', errorAllocationCategory: 'Escolha uma categoria para cada parte da divisão.', errorAllocationAmount: 'Cada parte da divisão precisa ter valor maior que zero.', errorPaymentAndCategory: 'Informe a forma e a categoria antes de enviar à revisão.', errorCategory: 'Informe a categoria antes de enviar à revisão.', errorAllocationTotal: 'A soma das categorias precisa ser exatamente igual ao valor total.', errorAllocationMismatch: 'Revise a divisão: a soma não corresponde ao valor total.', errorAccountMismatch: 'A conta escolhida não pertence à igreja atual.', errorCategoryMismatch: 'Esta categoria não pode ser usada nesta movimentação.', errorFundMismatch: 'Este fundo não pertence à igreja atual.', errorIdempotency: 'Os dados mudaram durante uma tentativa anterior. Revise e tente novamente.', errorPaymentMismatch: 'A forma escolhida não é compatível com esta conta.', errorForbidden: 'Seu acesso não permite registrar esta movimentação.', errorServiceUnavailable: 'O serviço financeiro está temporariamente indisponível. Tente novamente em instantes.', errorSave: 'Não foi possível salvar a movimentação.', errorUncertain: 'Não foi possível confirmar a conclusão da tentativa. Tente novamente com segurança.', accountRepaired: 'A conta foi preparada. Revise os dados destacados para continuar.', customAccountNeedsSetup: 'Conclua o ajuste rápido da conta para continuar.', repairFailed: 'Não foi possível preparar a conta agora. Tente novamente.'
  },
  EN: {
    accessDeniedTitle: 'Read-only access', accessDeniedBody: 'Your access allows you to view finance data, but not register new transactions.', accountPending: 'Setup pending', loadErrorTitle: 'Could not prepare the form', loadErrorBody: 'Check your connection and try again. No transaction was created.', retry: 'Try again', pageTitle: 'New transaction', back: 'Back to transactions', supportCode: 'Support code', copyCode: 'Copy code', whatHappened: 'What happened?', amount: 'Amount', date: 'Date',
    directions: { income: 'Money came in', expense: 'Money went out', transfer: 'Transfer', liability_settlement: 'Pay an obligation' }, howQuestion: { income: 'How did the money come in?', expense: 'How did the money go out?', transfer: 'Between which accounts?', liability_settlement: 'How was the obligation paid?' }, paymentMethodIncome: 'Receiving method', paymentMethodExpense: 'Payment method', select: 'Select...', settlementType: 'Payment type', settlementCreditCard: 'Pay credit-card bill', settlementReimbursement: 'Reimburse a person', liabilityAccount: 'Obligation to pay', selectLiability: 'Select the obligation...', account: 'Account', sourceAccount: 'Source account', payingAccount: 'Paying account', destinationAccount: 'Destination account', selectAccount: 'Select an account...', selectDestination: 'Select the destination account...', noCompatibleAccount: 'No account is compatible with this choice', noAccount: 'No account available', physicalCash: 'This transaction goes through the church physical cash box.', description: 'Description',
    descriptionPlaceholder: { income: 'E.g. Tithe, offering, contribution...', expense: 'E.g. Electricity, maintenance, supplies...', transfer: 'E.g. Transfer to physical cash...', liability_settlement: 'E.g. August card bill payment...' }, required: 'Required', optional: 'Optional', requiredOrJustify: 'Required or explain why not', showDetails: 'Add details and receipts', hideDetails: 'Hide details', detailsHint: 'Payee, source and receipts stay here when they are needed.', counterparty: { income: 'Who did it come from?', expense: 'Who was paid?', transfer: 'Source or payee', liability_settlement: 'Payee' }, counterpartyPlaceholder: 'Person, supplier, ministry...', evidence: 'Receipts', evidenceJustification: 'No receipt?', evidenceJustificationPlaceholder: 'Briefly explain why there is no receipt...', classificationTitle: 'How should this be classified?', classificationHint: 'A category is required before income and expenses can be sent for review. Fund and cost center remain optional.', showClassification: 'Classify transaction', hideClassification: 'Hide classification', split: 'Split into more categories', unsplit: 'Use one category', splitNeedsAmount: 'Enter the amount before splitting.', remaining: 'Still missing', exceeded: 'Over by', allocationAmount: 'Amount for this part', removeAllocation: 'Remove part', category: 'Category', selectCategory: 'Select a category...', noCompatibleCategory: 'No compatible category', fund: 'Fund (optional)', noFund: 'No fund', noActiveFund: 'No active fund', costCenter: 'Cost center (optional)', costCenterPlaceholder: 'E.g. Main campus, youth, missions...', addAllocation: 'Add another category', summaryTitle: 'Review before continuing', summaryAccount: 'Account', summaryOrigin: 'Source', summaryDestination: 'Destination', summaryMethod: 'Method', summaryCategory: 'Category', summaryChurch: 'Church', summarySettlement: 'Payment', pending: 'Pending', invoice: 'Bill', reimbursement: 'Reimbursement', selectedPlural: 'selected', reviewMissing: '{count} items are still needed before review', reviewMissingHint: 'You can save a draft now. Complete the missing items before sending for review.', revealMissing: 'Show what is missing', sendForReview: 'Send for review', sending: 'Sending...', saveDraft: 'Save as draft', saving: 'Saving...', flowTitle: 'What happens next?', draftTitle: 'Draft', draftBody: 'Keeps what you entered and does not change balances.', reviewTitle: 'In review', reviewBody: 'Another authorized person checks the information. Balances still do not change.', unsavedConfirm: 'There are unsaved changes. Switch church and discard this draft?', paymentRemoved: 'The previous method was removed because it does not match the selected transaction type.', paymentUnsupported: (name) => `The selected method was removed because “${name}” does not support it.`, errorSelectAccount: 'Choose the account where this transaction happened.', errorIncompleteAccount: 'The selected account needs a quick setup before you can continue.', errorSelectDestination: 'Choose the destination account.', errorSameAccounts: 'Source and destination must be different accounts.', errorIncompleteDestination: 'The destination account needs a quick setup before you can continue.', errorSettlementType: 'Choose the obligation payment type.', errorLiabilityAccount: 'Choose the obligation being paid.', errorIncompleteLiability: 'The selected obligation needs a quick setup before you can continue.', errorPositiveAmount: 'Enter an amount greater than zero.', errorAllocationCategory: 'Choose a category for every split part.', errorAllocationAmount: 'Every split part must be greater than zero.', errorPaymentAndCategory: 'Enter the payment method and category before sending for review.', errorCategory: 'Enter the category before sending for review.', errorAllocationTotal: 'The category total must exactly match the transaction amount.', errorAllocationMismatch: 'Review the split: the total does not match the transaction amount.', errorAccountMismatch: 'The selected account does not belong to the current church.', errorCategoryMismatch: 'This category cannot be used for this transaction.', errorFundMismatch: 'This fund does not belong to the current church.', errorIdempotency: 'The data changed during a previous attempt. Review it and try again.', errorPaymentMismatch: 'The selected payment method is not compatible with this account.', errorForbidden: 'Your access does not allow this transaction to be registered.', errorServiceUnavailable: 'The finance service is temporarily unavailable. Try again shortly.', errorSave: 'Could not save the transaction.', errorUncertain: 'We could not confirm whether the attempt completed. Retry safely.', accountRepaired: 'The account was prepared. Review the highlighted data to continue.', customAccountNeedsSetup: 'Complete the account quick setup to continue.', repairFailed: 'The account could not be prepared right now. Try again.'
  },
  ES: {
    accessDeniedTitle: 'Acceso de solo lectura', accessDeniedBody: 'Tu acceso permite consultar las finanzas, pero no registrar nuevos movimientos.', accountPending: 'Configuración pendiente', loadErrorTitle: 'No fue posible preparar el formulario', loadErrorBody: 'Verifica tu conexión e inténtalo de nuevo. No se creó ningún movimiento.', retry: 'Intentar de nuevo', pageTitle: 'Nuevo movimiento', back: 'Volver a movimientos', supportCode: 'Código de soporte', copyCode: 'Copiar código', whatHappened: '¿Qué ocurrió?', amount: 'Valor', date: 'Fecha',
    directions: { income: 'Entró dinero', expense: 'Salió dinero', transfer: 'Transferencia', liability_settlement: 'Pagar una obligación' }, howQuestion: { income: '¿Cómo entró el dinero?', expense: '¿Cómo salió el dinero?', transfer: '¿Entre qué cuentas?', liability_settlement: '¿Cómo se pagó la obligación?' }, paymentMethodIncome: 'Forma de recepción', paymentMethodExpense: 'Forma de pago', select: 'Seleccionar...', settlementType: 'Tipo de pago', settlementCreditCard: 'Pagar factura de tarjeta', settlementReimbursement: 'Reembolsar a una persona', liabilityAccount: 'Obligación a pagar', selectLiability: 'Selecciona la obligación...', account: 'Cuenta', sourceAccount: 'Cuenta de origen', payingAccount: 'Cuenta que pagó', destinationAccount: 'Cuenta de destino', selectAccount: 'Selecciona una cuenta...', selectDestination: 'Selecciona la cuenta de destino...', noCompatibleAccount: 'Ninguna cuenta es compatible con esta elección', noAccount: 'Ninguna cuenta disponible', physicalCash: 'Este movimiento pasa por la caja física de la iglesia.', description: 'Descripción', descriptionPlaceholder: { income: 'Ej.: Diezmo, ofrenda, contribución...', expense: 'Ej.: Energía, mantenimiento, materiales...', transfer: 'Ej.: Transferencia a la caja física...', liability_settlement: 'Ej.: Pago de la factura de agosto...' }, required: 'Obligatorio', optional: 'Opcional', requiredOrJustify: 'Obligatorio o justificar', showDetails: 'Agregar detalles y comprobantes', hideDetails: 'Ocultar detalles', detailsHint: 'Beneficiario, origen y comprobantes aparecen aquí cuando son necesarios.', counterparty: { income: '¿De quién vino?', expense: '¿Quién recibió el pago?', transfer: 'Origen o beneficiario', liability_settlement: 'Beneficiario' }, counterpartyPlaceholder: 'Persona, proveedor, ministerio...', evidence: 'Comprobantes', evidenceJustification: '¿Sin comprobante?', evidenceJustificationPlaceholder: 'Explica brevemente por qué no hay comprobante...', classificationTitle: '¿Cómo clasificarlo?', classificationHint: 'La categoría es necesaria para enviar ingresos y egresos a revisión. Fondo y centro de costo siguen siendo opcionales.', showClassification: 'Clasificar movimiento', hideClassification: 'Ocultar clasificación', split: 'Dividir en más categorías', unsplit: 'Usar una categoría', splitNeedsAmount: 'Informa el valor antes de dividir.', remaining: 'Aún falta', exceeded: 'Superó el valor por', allocationAmount: 'Valor de esta parte', removeAllocation: 'Eliminar parte', category: 'Categoría', selectCategory: 'Selecciona una categoría...', noCompatibleCategory: 'Ninguna categoría compatible', fund: 'Fondo (opcional)', noFund: 'Ningún fondo', noActiveFund: 'Ningún fondo activo', costCenter: 'Centro de costo (opcional)', costCenterPlaceholder: 'Ej.: Sede, jóvenes, misiones...', addAllocation: 'Agregar otra categoría', summaryTitle: 'Revisa antes de continuar', summaryAccount: 'Cuenta', summaryOrigin: 'Origen', summaryDestination: 'Destino', summaryMethod: 'Forma', summaryCategory: 'Categoría', summaryChurch: 'Iglesia', summarySettlement: 'Pago', pending: 'Pendiente', invoice: 'Factura', reimbursement: 'Reembolso', selectedPlural: 'seleccionadas', reviewMissing: 'Faltan {count} datos antes de enviar a revisión', reviewMissingHint: 'Puedes guardar un borrador ahora. Completa lo que falta antes de enviarlo a revisión.', revealMissing: 'Mostrar lo que falta', sendForReview: 'Enviar a revisión', sending: 'Enviando...', saveDraft: 'Guardar como borrador', saving: 'Guardando...', flowTitle: '¿Qué sucede después?', draftTitle: 'Borrador', draftBody: 'Guarda lo que ya informaste y no modifica saldos.', reviewTitle: 'En revisión', reviewBody: 'Otra persona autorizada revisa los datos. Los saldos todavía no cambian.', unsavedConfirm: 'Hay cambios sin guardar. ¿Cambiar de iglesia y descartar este borrador?', paymentRemoved: 'La forma anterior se eliminó porque no coincide con el tipo de movimiento elegido.', paymentUnsupported: (name) => `La forma elegida se eliminó porque “${name}” no la acepta.`, errorSelectAccount: 'Elige la cuenta donde ocurrió este movimiento.', errorIncompleteAccount: 'La cuenta elegida necesita un ajuste antes de continuar.', errorSelectDestination: 'Elige la cuenta de destino.', errorSameAccounts: 'Origen y destino deben ser cuentas diferentes.', errorIncompleteDestination: 'La cuenta de destino necesita un ajuste antes de continuar.', errorSettlementType: 'Elige el tipo de pago de la obligación.', errorLiabilityAccount: 'Elige la obligación que se está pagando.', errorIncompleteLiability: 'La obligación elegida necesita un ajuste antes de continuar.', errorPositiveAmount: 'Informa un valor mayor que cero.', errorAllocationCategory: 'Elige una categoría para cada parte de la división.', errorAllocationAmount: 'Cada parte de la división debe tener un valor mayor que cero.', errorPaymentAndCategory: 'Informa la forma y la categoría antes de enviar a revisión.', errorCategory: 'Informa la categoría antes de enviar a revisión.', errorAllocationTotal: 'La suma de las categorías debe coincidir exactamente con el valor total.', errorAllocationMismatch: 'Revisa la división: la suma no coincide con el valor total.', errorAccountMismatch: 'La cuenta elegida no pertenece a la iglesia actual.', errorCategoryMismatch: 'Esta categoría no puede usarse en este movimiento.', errorFundMismatch: 'Este fondo no pertenece a la iglesia actual.', errorIdempotency: 'Los datos cambiaron durante un intento anterior. Revisa e inténtalo de nuevo.', errorPaymentMismatch: 'La forma elegida no es compatible con esta cuenta.', errorForbidden: 'Tu acceso no permite registrar este movimiento.', errorServiceUnavailable: 'El servicio financiero no está disponible temporalmente. Inténtalo de nuevo en unos instantes.', errorSave: 'No fue posible guardar el movimiento.', errorUncertain: 'No pudimos confirmar si el intento terminó. Vuelve a intentarlo de forma segura.', accountRepaired: 'La cuenta fue preparada. Revisa los datos destacados para continuar.', customAccountNeedsSetup: 'Completa el ajuste rápido de la cuenta para continuar.', repairFailed: 'No fue posible preparar la cuenta ahora. Inténtalo de nuevo.'
  },
};

export const PAYMENT_METHOD_LABELS: Record<Language, Record<string, string>> = {
  PT: { cash: 'Dinheiro', pix: 'Pix', bank_transfer: 'Transferência bancária', bank_deposit: 'Depósito bancário', debit_card: 'Cartão de débito', credit_card: 'Cartão de crédito', prepaid_card: 'Cartão pré-pago', bank_slip: 'Boleto', check: 'Cheque', automatic_debit: 'Débito automático', other: 'Outro' },
  EN: { cash: 'Cash', pix: 'Pix', bank_transfer: 'Bank transfer', bank_deposit: 'Bank deposit', debit_card: 'Debit card', credit_card: 'Credit card', prepaid_card: 'Prepaid card', bank_slip: 'Bank slip', check: 'Check', automatic_debit: 'Automatic debit', other: 'Other' },
  ES: { cash: 'Efectivo', pix: 'Pix', bank_transfer: 'Transferencia bancaria', bank_deposit: 'Depósito bancario', debit_card: 'Tarjeta de débito', credit_card: 'Tarjeta de crédito', prepaid_card: 'Tarjeta prepaga', bank_slip: 'Boleto bancario', check: 'Cheque', automatic_debit: 'Débito automático', other: 'Otro' },
};
