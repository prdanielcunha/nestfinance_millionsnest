import type { Language } from '@/src/contexts/LanguageContext';

type Copy = {
  title: string;
  subtitle: string;
  loading: string;
  loadErrorTitle: string;
  loadErrorBody: string;
  retry: string;
  original: string;
  openOriginal: string;
  openingOriginal: string;
  closeOriginal: string;
  previewError: string;
  openInbox: string;
  analysisTitle: string;
  analysisMissing: string;
  analysisNote: string;
  documentColumn: string;
  transactionColumn: string;
  fieldAmount: string;
  fieldDate: string;
  fieldDirection: string;
  fieldPayment: string;
  fieldCategory: string;
  statusMatch: string;
  statusDifferent: string;
  statusUncertain: string;
  differencesFound: (count: number) => string;
  noDifferences: string;
  reviewed: string;
  pendingReview: string;
  notClassified: string;
  evidencePosition: (current: number, total: number) => string;
  noValue: string;
};

export const TRANSACTION_REVIEW_EVIDENCE_COPY: Record<Language, Copy> = {
  PT: {
    title: 'Documento e lançamento',
    subtitle: 'Compare o comprovante vinculado com os dados desta movimentação sem sair da conferência.',
    loading: 'Carregando contexto documental…',
    loadErrorTitle: 'Não foi possível carregar o comprovante',
    loadErrorBody: 'A movimentação continua intacta. Tente novamente ou siga com a revisão dos dados disponíveis.',
    retry: 'Tentar novamente',
    original: 'Original preservado',
    openOriginal: 'Visualizar original',
    openingOriginal: 'Abrindo original…',
    closeOriginal: 'Fechar original',
    previewError: 'Não foi possível abrir o original agora. Nenhum dado foi alterado.',
    openInbox: 'Abrir detalhes do documento',
    analysisTitle: 'Comparação com a leitura existente',
    analysisMissing: 'Este comprovante ainda não possui uma leitura transacional salva. Nenhuma análise nova será executada automaticamente nesta tela.',
    analysisNote: 'A leitura é assistida e serve como contexto. Diferenças abaixo não aprovam, devolvem nem bloqueiam a movimentação automaticamente.',
    documentColumn: 'Documento',
    transactionColumn: 'Movimentação',
    fieldAmount: 'Valor',
    fieldDate: 'Data',
    fieldDirection: 'Tipo',
    fieldPayment: 'Forma de pagamento',
    fieldCategory: 'Categoria',
    statusMatch: 'Confere',
    statusDifferent: 'Diferença',
    statusUncertain: 'Confirmar',
    differencesFound: (count) => `${count} ${count === 1 ? 'diferença encontrada' : 'diferenças encontradas'}`,
    noDifferences: 'Nenhuma diferença encontrada nos campos comparáveis.',
    reviewed: 'Documento conferido',
    pendingReview: 'Documento aguardando conferência',
    notClassified: 'Documento ainda não identificado',
    evidencePosition: (current, total) => `Comprovante ${current} de ${total}`,
    noValue: 'Não identificado',
  },
  EN: {
    title: 'Document and transaction',
    subtitle: 'Compare the linked evidence with this transaction without leaving the review flow.',
    loading: 'Loading document context…',
    loadErrorTitle: 'Could not load the evidence',
    loadErrorBody: 'The transaction remains unchanged. Try again or continue reviewing the available information.',
    retry: 'Try again',
    original: 'Preserved original',
    openOriginal: 'View original',
    openingOriginal: 'Opening original…',
    closeOriginal: 'Close original',
    previewError: 'The original could not be opened right now. No data was changed.',
    openInbox: 'Open document details',
    analysisTitle: 'Comparison with existing reading',
    analysisMissing: 'This evidence does not have a saved transaction reading yet. No new analysis will run automatically on this screen.',
    analysisNote: 'The reading is assisted context. Differences below do not automatically approve, return, or block the transaction.',
    documentColumn: 'Document',
    transactionColumn: 'Transaction',
    fieldAmount: 'Amount',
    fieldDate: 'Date',
    fieldDirection: 'Type',
    fieldPayment: 'Payment method',
    fieldCategory: 'Category',
    statusMatch: 'Matches',
    statusDifferent: 'Difference',
    statusUncertain: 'Confirm',
    differencesFound: (count) => `${count} ${count === 1 ? 'difference found' : 'differences found'}`,
    noDifferences: 'No differences found in the comparable fields.',
    reviewed: 'Document reviewed',
    pendingReview: 'Document waiting for review',
    notClassified: 'Document not identified yet',
    evidencePosition: (current, total) => `Evidence ${current} of ${total}`,
    noValue: 'Not identified',
  },
  ES: {
    title: 'Documento y movimiento',
    subtitle: 'Compara el comprobante vinculado con este movimiento sin salir de la revisión.',
    loading: 'Cargando contexto documental…',
    loadErrorTitle: 'No fue posible cargar el comprobante',
    loadErrorBody: 'El movimiento continúa intacto. Inténtalo de nuevo o sigue revisando la información disponible.',
    retry: 'Intentar de nuevo',
    original: 'Original preservado',
    openOriginal: 'Ver original',
    openingOriginal: 'Abriendo original…',
    closeOriginal: 'Cerrar original',
    previewError: 'No fue posible abrir el original ahora. No se modificó ningún dato.',
    openInbox: 'Abrir detalles del documento',
    analysisTitle: 'Comparación con la lectura existente',
    analysisMissing: 'Este comprobante aún no tiene una lectura transaccional guardada. No se ejecutará un análisis nuevo automáticamente en esta pantalla.',
    analysisNote: 'La lectura es contexto asistido. Las diferencias de abajo no aprueban, devuelven ni bloquean el movimiento automáticamente.',
    documentColumn: 'Documento',
    transactionColumn: 'Movimiento',
    fieldAmount: 'Valor',
    fieldDate: 'Fecha',
    fieldDirection: 'Tipo',
    fieldPayment: 'Forma de pago',
    fieldCategory: 'Categoría',
    statusMatch: 'Coincide',
    statusDifferent: 'Diferencia',
    statusUncertain: 'Confirmar',
    differencesFound: (count) => `${count} ${count === 1 ? 'diferencia encontrada' : 'diferencias encontradas'}`,
    noDifferences: 'No se encontraron diferencias en los campos comparables.',
    reviewed: 'Documento revisado',
    pendingReview: 'Documento pendiente de revisión',
    notClassified: 'Documento aún no identificado',
    evidencePosition: (current, total) => `Comprobante ${current} de ${total}`,
    noValue: 'No identificado',
  },
};
