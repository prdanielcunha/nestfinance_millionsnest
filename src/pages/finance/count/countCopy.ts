import type { Language } from '@/src/contexts/LanguageContext';
import type { CountEntryType } from '@/shared/finance/count';

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
    back: 'Voltar para cultos',
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
    safeError: 'Não foi possível salvar agora. Nenhum valor foi finalizado. Tente novamente.',
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
    back: 'Back to services',
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
    safeError: 'Could not save right now. No amount was finalized. Try again.',
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
    back: 'Volver a cultos',
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
    safeError: 'No fue posible guardar ahora. Ningún valor fue finalizado. Inténtalo de nuevo.',
  },
};
