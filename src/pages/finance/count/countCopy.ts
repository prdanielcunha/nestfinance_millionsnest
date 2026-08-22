import type { Language } from '@/src/contexts/LanguageContext';
import type { CountEntryType, CountSessionStatus } from '@/shared/finance/count';

export type CountCopy = {
  accessDeniedTitle: string;
  accessDeniedBody: string;
  homeTitle: string;
  homeSubtitle: string;
  newSession: string;
  serviceLabel: string;
  serviceLabelPlaceholder: string;
  serviceDate: string;
  create: string;
  creating: string;
  cancel: string;
  recentSessions: string;
  emptyTitle: string;
  emptyBody: string;
  loading: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  continueSession: string;
  firstCount: string;
  savedFirstCount: string;
  secondCountPending: string;
  secondCountSafety: string;
  noPosting: string;
  sessionTitle: string;
  back: string;
  stepChoose: string;
  stepCount: string;
  stepReview: string;
  chooseTitle: string;
  chooseBody: string;
  entryLabels: Record<CountEntryType, string>;
  entryDescriptions: Record<CountEntryType, string>;
  counted: string;
  countNow: string;
  countTitle: (label: string) => string;
  cashMode: string;
  denominationMode: string;
  totalMode: string;
  totalAmount: string;
  quantity: string;
  subtotal: string;
  partialTotal: string;
  saveEntry: string;
  saving: string;
  reviewTitle: string;
  reviewBody: string;
  grandTotal: string;
  editEntry: string;
  firstCountSaved: string;
  firstCountSavedBody: string;
  returnToCount: string;
  conflictTitle: string;
  conflictBody: string;
  reload: string;
  supportCode: string;
  safeError: string;
  startSecond: string;
  startingSecond: string;
  blindProtected: string;
  blindTitle: string;
  blindBody: string;
  recountBlindTitle: string;
  recountBlindBody: string;
  blindChooseTitle: string;
  blindChooseBody: string;
  reviewSecondTitle: string;
  reviewRecountTitle: string;
  reviewBlindBody: string;
  blindStillHidden: string;
  blindStillHiddenBody: string;
  submitSecond: string;
  submitRecount: string;
  submitting: string;
  comparisonTitle: string;
  countA: string;
  countB: string;
  difference: string;
  matchTitle: string;
  matchBody: string;
  divergentTitle: string;
  divergentBody: string;
  startRecount: string;
  startingRecount: string;
  recountHistory: string;
  recountAttempt: (count: number) => string;
  originalEvidence: string;
  hiddenAmount: string;
  statusLabels: Record<CountSessionStatus, string>;
};

export const COUNT_COPY: Record<Language, CountCopy> = {
  PT: {
    accessDeniedTitle: 'Acesso somente leitura',
    accessDeniedBody: 'Seu acesso não permite iniciar ou editar uma contagem desta igreja.',
    homeTitle: 'Cultos e contagens',
    homeSubtitle: 'Conte as entradas com passos simples e deixe tudo preparado para uma segunda conferência.',
    newSession: 'Contar um culto',
    serviceLabel: 'Nome do culto',
    serviceLabelPlaceholder: 'Ex.: Culto de domingo',
    serviceDate: 'Data do culto',
    create: 'Começar contagem',
    creating: 'Criando...',
    cancel: 'Cancelar',
    recentSessions: 'Contagens em andamento',
    emptyTitle: 'Nenhuma contagem iniciada',
    emptyBody: 'Quando um culto for contado, ele aparecerá aqui para continuar e conferir.',
    loading: 'Carregando contagens...',
    errorTitle: 'Não foi possível carregar as contagens',
    errorBody: 'Nenhuma informação foi alterada. Tente novamente em instantes.',
    retry: 'Tentar novamente',
    continueSession: 'Continuar',
    firstCount: 'Primeira contagem',
    savedFirstCount: 'Primeira contagem salva',
    secondCountPending: 'Falta a segunda conferência',
    secondCountSafety: 'A segunda contagem será feita separadamente e não verá estes valores antes de ser selada.',
    noPosting: 'Esta etapa não lança movimentações e não altera saldos.',
    sessionTitle: 'Contar culto',
    back: 'Voltar',
    stepChoose: 'Escolher',
    stepCount: 'Contar',
    stepReview: 'Revisar',
    chooseTitle: 'O que você quer contar?',
    chooseBody: 'Escolha um tipo por vez. O NestFinance soma tudo para você.',
    entryLabels: { tithe: 'Dízimos', offering: 'Ofertas', other: 'Outras entradas', pix: 'Pix' },
    entryDescriptions: {
      tithe: 'Registre os dízimos recebidos.',
      offering: 'Registre as ofertas do culto.',
      other: 'Doações, projetos e outras entradas.',
      pix: 'Registre os recebimentos via Pix.',
    },
    counted: 'Contado',
    countNow: 'Contar',
    countTitle: (label) => `Contar ${label}`,
    cashMode: 'Como deseja contar o dinheiro?',
    denominationMode: 'Por cédulas e moedas',
    totalMode: 'Informar o total',
    totalAmount: 'Valor total',
    quantity: 'Quantidade',
    subtotal: 'Subtotal',
    partialTotal: 'Total desta entrada',
    saveEntry: 'Salvar e continuar',
    saving: 'Salvando...',
    reviewTitle: 'Revise a primeira contagem',
    reviewBody: 'Confira os valores antes da segunda contagem independente.',
    grandTotal: 'Total geral',
    editEntry: 'Editar',
    firstCountSaved: 'Primeira contagem salva',
    firstCountSavedBody: 'Os valores ficaram registrados como primeira contagem. Ainda falta uma segunda conferência antes de qualquer fechamento.',
    returnToCount: 'Voltar às contagens',
    conflictTitle: 'Existe uma versão mais recente',
    conflictBody: 'Esta contagem foi alterada em outro lugar. Recarregue para continuar sem sobrescrever informações.',
    reload: 'Carregar versão mais recente',
    supportCode: 'Código de suporte',
    safeError: 'Não foi possível concluir agora. Nenhum valor foi finalizado. Tente novamente.',
    startSecond: 'Iniciar segunda contagem',
    startingSecond: 'Protegendo os valores...',
    blindProtected: 'Contagem cega',
    blindTitle: 'Faça a segunda contagem sem ver a primeira',
    blindBody: 'Os valores da primeira contagem estão ocultos pelo servidor. Conte tudo novamente de forma independente; a comparação só acontece depois do envio.',
    recountBlindTitle: 'Faça a recontagem sem consultar os valores anteriores',
    recountBlindBody: 'As contagens anteriores continuam preservadas, mas ficam ocultas durante esta nova tentativa para reduzir viés.',
    blindChooseTitle: 'Conte novamente, do zero',
    blindChooseBody: 'Escolha cada tipo e informe apenas o que você está vendo agora. Nenhum valor anterior é usado para preencher esta tela.',
    reviewSecondTitle: 'Revise sua segunda contagem',
    reviewRecountTitle: 'Revise esta recontagem',
    reviewBlindBody: 'Revise somente os valores que você acabou de contar. Os valores anteriores continuam ocultos até este envio ser selado.',
    blindStillHidden: 'A primeira contagem continua protegida',
    blindStillHiddenBody: 'Mesmo nesta revisão, o NestFinance não mostra os valores anteriores. A comparação será feita no servidor depois que você confirmar.',
    submitSecond: 'Selar segunda contagem e comparar',
    submitRecount: 'Selar recontagem e comparar',
    submitting: 'Comparando com segurança...',
    comparisonTitle: 'Resultado da conferência',
    countA: 'Primeira contagem',
    countB: 'Segunda contagem',
    difference: 'Diferença',
    matchTitle: 'As contagens conferem',
    matchBody: 'Os valores independentes coincidem. Isso registra uma conferência, mas ainda não lança movimentações nem altera saldos.',
    divergentTitle: 'Há diferenças para conferir',
    divergentBody: 'O NestFinance não escolheu um valor automaticamente. Veja onde as contagens divergem e faça uma recontagem independente.',
    startRecount: 'Iniciar recontagem cega',
    startingRecount: 'Preparando recontagem...',
    recountHistory: 'Histórico de recontagens preservado',
    recountAttempt: (count) => `${count} ${count === 1 ? 'tentativa registrada' : 'tentativas registradas'}.`,
    originalEvidence: 'A primeira e a segunda contagens originais nunca são sobrescritas.',
    hiddenAmount: 'Valor oculto durante a contagem cega',
    statusLabels: {
      counting_a: 'Primeira contagem',
      counting_b: 'Segunda contagem cega',
      matched: 'Conferido',
      divergent: 'Diferença encontrada',
      recounting: 'Recontagem cega',
    },
  },
  EN: {
    accessDeniedTitle: 'Read-only access',
    accessDeniedBody: 'Your access does not allow you to start or edit a count for this church.',
    homeTitle: 'Services and counts',
    homeSubtitle: 'Count incoming funds in simple steps and prepare everything for an independent second check.',
    newSession: 'Count a service',
    serviceLabel: 'Service name',
    serviceLabelPlaceholder: 'Example: Sunday service',
    serviceDate: 'Service date',
    create: 'Start count',
    creating: 'Creating...',
    cancel: 'Cancel',
    recentSessions: 'Counts in progress',
    emptyTitle: 'No count started',
    emptyBody: 'Once a service count starts, it will appear here so you can continue and review it.',
    loading: 'Loading counts...',
    errorTitle: 'Could not load counts',
    errorBody: 'No information was changed. Try again shortly.',
    retry: 'Try again',
    continueSession: 'Continue',
    firstCount: 'First count',
    savedFirstCount: 'First count saved',
    secondCountPending: 'Second check still required',
    secondCountSafety: 'The second count will be performed separately and will not see these values before it is sealed.',
    noPosting: 'This step does not post transactions or change balances.',
    sessionTitle: 'Count service',
    back: 'Back',
    stepChoose: 'Choose',
    stepCount: 'Count',
    stepReview: 'Review',
    chooseTitle: 'What do you want to count?',
    chooseBody: 'Choose one type at a time. NestFinance adds everything for you.',
    entryLabels: { tithe: 'Tithes', offering: 'Offerings', other: 'Other income', pix: 'Pix' },
    entryDescriptions: {
      tithe: 'Record received tithes.',
      offering: 'Record service offerings.',
      other: 'Donations, projects and other income.',
      pix: 'Record Pix receipts.',
    },
    counted: 'Counted',
    countNow: 'Count',
    countTitle: (label) => `Count ${label}`,
    cashMode: 'How do you want to count the cash?',
    denominationMode: 'By notes and coins',
    totalMode: 'Enter total',
    totalAmount: 'Total amount',
    quantity: 'Quantity',
    subtotal: 'Subtotal',
    partialTotal: 'Entry total',
    saveEntry: 'Save and continue',
    saving: 'Saving...',
    reviewTitle: 'Review the first count',
    reviewBody: 'Check the amounts before the independent second count.',
    grandTotal: 'Grand total',
    editEntry: 'Edit',
    firstCountSaved: 'First count saved',
    firstCountSavedBody: 'The values are stored as the first count. An independent second check is still required before any closing step.',
    returnToCount: 'Back to counts',
    conflictTitle: 'A newer version exists',
    conflictBody: 'This count was changed elsewhere. Reload it before continuing so you do not overwrite information.',
    reload: 'Load latest version',
    supportCode: 'Support code',
    safeError: 'Could not complete this action right now. No amount was finalized. Try again.',
    startSecond: 'Start second count',
    startingSecond: 'Protecting values...',
    blindProtected: 'Blind count',
    blindTitle: 'Perform the second count without seeing the first',
    blindBody: 'The first-count values are hidden by the server. Count everything independently; comparison only happens after submission.',
    recountBlindTitle: 'Recount without consulting previous values',
    recountBlindBody: 'Earlier counts remain preserved but are hidden during this attempt to reduce bias.',
    blindChooseTitle: 'Count again from zero',
    blindChooseBody: 'Choose each type and enter only what you see now. No previous amount is used to prefill this screen.',
    reviewSecondTitle: 'Review your second count',
    reviewRecountTitle: 'Review this recount',
    reviewBlindBody: 'Review only the amounts you just counted. Previous values stay hidden until this submission is sealed.',
    blindStillHidden: 'The first count is still protected',
    blindStillHiddenBody: 'Even on this review screen, NestFinance does not reveal previous amounts. Server-side comparison runs only after confirmation.',
    submitSecond: 'Seal second count and compare',
    submitRecount: 'Seal recount and compare',
    submitting: 'Comparing securely...',
    comparisonTitle: 'Count comparison',
    countA: 'First count',
    countB: 'Second count',
    difference: 'Difference',
    matchTitle: 'The counts match',
    matchBody: 'The independent values match. This records verification, but it still does not post transactions or change balances.',
    divergentTitle: 'There are differences to review',
    divergentBody: 'NestFinance did not choose a value automatically. Review where the counts differ and perform an independent recount.',
    startRecount: 'Start blind recount',
    startingRecount: 'Preparing recount...',
    recountHistory: 'Recount history preserved',
    recountAttempt: (count) => `${count} ${count === 1 ? 'attempt recorded' : 'attempts recorded'}.`,
    originalEvidence: 'The original first and second counts are never overwritten.',
    hiddenAmount: 'Amount hidden during blind count',
    statusLabels: {
      counting_a: 'First count',
      counting_b: 'Blind second count',
      matched: 'Verified',
      divergent: 'Difference found',
      recounting: 'Blind recount',
    },
  },
  ES: {
    accessDeniedTitle: 'Acceso de solo lectura',
    accessDeniedBody: 'Tu acceso no permite iniciar o editar un conteo de esta iglesia.',
    homeTitle: 'Cultos y conteos',
    homeSubtitle: 'Cuenta las entradas con pasos simples y deja todo preparado para una segunda revisión independiente.',
    newSession: 'Contar un culto',
    serviceLabel: 'Nombre del culto',
    serviceLabelPlaceholder: 'Ej.: Culto del domingo',
    serviceDate: 'Fecha del culto',
    create: 'Comenzar conteo',
    creating: 'Creando...',
    cancel: 'Cancelar',
    recentSessions: 'Conteos en curso',
    emptyTitle: 'Ningún conteo iniciado',
    emptyBody: 'Cuando comience el conteo de un culto, aparecerá aquí para continuar y revisarlo.',
    loading: 'Cargando conteos...',
    errorTitle: 'No fue posible cargar los conteos',
    errorBody: 'No se modificó ninguna información. Inténtalo de nuevo en unos instantes.',
    retry: 'Intentar de nuevo',
    continueSession: 'Continuar',
    firstCount: 'Primer conteo',
    savedFirstCount: 'Primer conteo guardado',
    secondCountPending: 'Falta la segunda revisión',
    secondCountSafety: 'El segundo conteo se realizará por separado y no verá estos valores antes de quedar sellado.',
    noPosting: 'Esta etapa no registra movimientos ni modifica saldos.',
    sessionTitle: 'Contar culto',
    back: 'Volver',
    stepChoose: 'Elegir',
    stepCount: 'Contar',
    stepReview: 'Revisar',
    chooseTitle: '¿Qué quieres contar?',
    chooseBody: 'Elige un tipo por vez. NestFinance suma todo por ti.',
    entryLabels: { tithe: 'Diezmos', offering: 'Ofrendas', other: 'Otras entradas', pix: 'Pix' },
    entryDescriptions: {
      tithe: 'Registra los diezmos recibidos.',
      offering: 'Registra las ofrendas del culto.',
      other: 'Donaciones, proyectos y otras entradas.',
      pix: 'Registra los ingresos recibidos por Pix.',
    },
    counted: 'Contado',
    countNow: 'Contar',
    countTitle: (label) => `Contar ${label}`,
    cashMode: '¿Cómo deseas contar el efectivo?',
    denominationMode: 'Por billetes y monedas',
    totalMode: 'Informar total',
    totalAmount: 'Valor total',
    quantity: 'Cantidad',
    subtotal: 'Subtotal',
    partialTotal: 'Total de esta entrada',
    saveEntry: 'Guardar y continuar',
    saving: 'Guardando...',
    reviewTitle: 'Revisa el primer conteo',
    reviewBody: 'Comprueba los valores antes del segundo conteo independiente.',
    grandTotal: 'Total general',
    editEntry: 'Editar',
    firstCountSaved: 'Primer conteo guardado',
    firstCountSavedBody: 'Los valores quedaron registrados como primer conteo. Todavía falta una segunda revisión antes de cualquier cierre.',
    returnToCount: 'Volver a conteos',
    conflictTitle: 'Existe una versión más reciente',
    conflictBody: 'Este conteo fue modificado en otro lugar. Recárgalo antes de continuar para no sobrescribir información.',
    reload: 'Cargar versión más reciente',
    supportCode: 'Código de soporte',
    safeError: 'No fue posible completar la acción ahora. Ningún valor fue finalizado. Inténtalo de nuevo.',
    startSecond: 'Iniciar segundo conteo',
    startingSecond: 'Protegiendo valores...',
    blindProtected: 'Conteo ciego',
    blindTitle: 'Haz el segundo conteo sin ver el primero',
    blindBody: 'Los valores del primer conteo están ocultos por el servidor. Cuenta todo de forma independiente; la comparación ocurre solo después del envío.',
    recountBlindTitle: 'Recuenta sin consultar los valores anteriores',
    recountBlindBody: 'Los conteos anteriores permanecen preservados, pero se ocultan durante este intento para reducir sesgos.',
    blindChooseTitle: 'Cuenta de nuevo desde cero',
    blindChooseBody: 'Elige cada tipo e informa solo lo que ves ahora. Ningún valor anterior completa esta pantalla.',
    reviewSecondTitle: 'Revisa tu segundo conteo',
    reviewRecountTitle: 'Revisa este recuento',
    reviewBlindBody: 'Revisa solamente los valores que acabas de contar. Los valores anteriores siguen ocultos hasta sellar este envío.',
    blindStillHidden: 'El primer conteo sigue protegido',
    blindStillHiddenBody: 'Incluso en esta revisión, NestFinance no muestra valores anteriores. La comparación del servidor ocurre después de confirmar.',
    submitSecond: 'Sellar segundo conteo y comparar',
    submitRecount: 'Sellar recuento y comparar',
    submitting: 'Comparando de forma segura...',
    comparisonTitle: 'Resultado de la revisión',
    countA: 'Primer conteo',
    countB: 'Segundo conteo',
    difference: 'Diferencia',
    matchTitle: 'Los conteos coinciden',
    matchBody: 'Los valores independientes coinciden. Esto registra una revisión, pero aún no publica movimientos ni modifica saldos.',
    divergentTitle: 'Hay diferencias por revisar',
    divergentBody: 'NestFinance no eligió un valor automáticamente. Revisa dónde difieren los conteos y realiza un recuento independiente.',
    startRecount: 'Iniciar recuento ciego',
    startingRecount: 'Preparando recuento...',
    recountHistory: 'Historial de recuentos preservado',
    recountAttempt: (count) => `${count} ${count === 1 ? 'intento registrado' : 'intentos registrados'}.`,
    originalEvidence: 'El primer y el segundo conteo originales nunca se sobrescriben.',
    hiddenAmount: 'Valor oculto durante el conteo ciego',
    statusLabels: {
      counting_a: 'Primer conteo',
      counting_b: 'Segundo conteo ciego',
      matched: 'Revisado',
      divergent: 'Diferencia encontrada',
      recounting: 'Recuento ciego',
    },
  },
};
