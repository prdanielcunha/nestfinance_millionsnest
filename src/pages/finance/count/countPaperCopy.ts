import type { CountPaperLocale, CountPaperStage } from '@/shared/finance/countPaper';

export const COUNT_PAPER_COPY: Record<CountPaperLocale, {
  hubTitle: string;
  hubSubtitle: string;
  back: string;
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  safeError: string;
  retry: string;
  generateA: string;
  generateB: string;
  generating: string;
  notReadyB: string;
  alreadyAdvanced: string;
  print: string;
  formTitle: string;
  stageLabel: Record<CountPaperStage, string>;
  reference: string;
  service: string;
  date: string;
  instructionsTitle: string;
  instructionsBody: string;
  denominationTitle: string;
  denomination: string;
  quantity: string;
  tithes: string;
  offerings: string;
  otherIncome: string;
  pix: string;
  total: string;
  finalTotals: string;
  counter: string;
  checker: string;
  signature: string;
  time: string;
  qrNote: string;
  noPosting: string;
  accessDeniedTitle: string;
  accessDeniedBody: string;
}> = {
  PT: {
    hubTitle: 'Folhas Count',
    hubSubtitle: 'Gere uma folha oficial numerada para a primeira ou segunda contagem. A folha não carrega valores anteriores.',
    back: 'Voltar',
    loading: 'Carregando contagens',
    emptyTitle: 'Nenhuma contagem disponível',
    emptyBody: 'Crie uma contagem para gerar a primeira Folha Count.',
    safeError: 'Não foi possível concluir agora. Tente novamente.',
    retry: 'Tentar novamente',
    generateA: 'Gerar folha A',
    generateB: 'Gerar folha B',
    generating: 'Gerando...',
    notReadyB: 'A segunda folha fica disponível depois que a primeira contagem for registrada.',
    alreadyAdvanced: 'Esta contagem já avançou além da emissão de novas folhas A/B.',
    print: 'Imprimir folha',
    formTitle: 'Folha Count oficial',
    stageLabel: { count_a: 'Contagem A', count_b: 'Contagem B' },
    reference: 'Referência da folha',
    service: 'Culto / atividade',
    date: 'Data',
    instructionsTitle: 'Como preencher',
    instructionsBody: 'Conte de forma independente. Registre quantidades e totais sem consultar outra contagem. Não rasure valores: em caso de erro, sinalize e use uma nova folha.',
    denominationTitle: 'Detalhamento de dinheiro',
    denomination: 'Denominação',
    quantity: 'Quantidade',
    tithes: 'Dízimos',
    offerings: 'Ofertas',
    otherIncome: 'Outras entradas',
    pix: 'Pix',
    total: 'Total',
    finalTotals: 'Totais finais',
    counter: 'Responsável pela contagem',
    checker: 'Conferente / responsável',
    signature: 'Assinatura',
    time: 'Horário',
    qrNote: 'O QR contém somente a identidade opaca desta folha, versão do modelo e checksum. Nenhum valor financeiro é gravado no QR.',
    noPosting: 'Esta folha é evidência de contagem. Ela não lança movimentações e não altera saldos.',
    accessDeniedTitle: 'Acesso não permitido',
    accessDeniedBody: 'Seu acesso atual não permite consultar as Folhas Count desta entidade.',
  },
  EN: {
    hubTitle: 'Count Sheets',
    hubSubtitle: 'Generate an official numbered sheet for the first or second count. The sheet never carries prior count values.',
    back: 'Back',
    loading: 'Loading counts',
    emptyTitle: 'No counts available',
    emptyBody: 'Create a count session to generate the first Count Sheet.',
    safeError: 'We could not complete this right now. Try again.',
    retry: 'Try again',
    generateA: 'Generate sheet A',
    generateB: 'Generate sheet B',
    generating: 'Generating...',
    notReadyB: 'The second sheet becomes available after the first count is recorded.',
    alreadyAdvanced: 'This count has already moved beyond new A/B sheet issuance.',
    print: 'Print sheet',
    formTitle: 'Official Count Sheet',
    stageLabel: { count_a: 'Count A', count_b: 'Count B' },
    reference: 'Sheet reference',
    service: 'Service / activity',
    date: 'Date',
    instructionsTitle: 'How to complete',
    instructionsBody: 'Count independently. Record quantities and totals without consulting another count. Do not overwrite values: if there is an error, mark it and use a new sheet.',
    denominationTitle: 'Cash denomination detail',
    denomination: 'Denomination',
    quantity: 'Quantity',
    tithes: 'Tithes',
    offerings: 'Offerings',
    otherIncome: 'Other income',
    pix: 'Pix',
    total: 'Total',
    finalTotals: 'Final totals',
    counter: 'Count responsible person',
    checker: 'Checker / responsible person',
    signature: 'Signature',
    time: 'Time',
    qrNote: 'The QR stores only this sheet’s opaque identity, template version and checksum. No financial value is stored in the QR.',
    noPosting: 'This sheet is count evidence. It does not post transactions or change balances.',
    accessDeniedTitle: 'Access not allowed',
    accessDeniedBody: 'Your current access cannot view Count Sheets for this entity.',
  },
  ES: {
    hubTitle: 'Hojas Count',
    hubSubtitle: 'Genere una hoja oficial numerada para el primer o segundo conteo. La hoja nunca incluye valores de conteos anteriores.',
    back: 'Volver',
    loading: 'Cargando conteos',
    emptyTitle: 'No hay conteos disponibles',
    emptyBody: 'Cree un conteo para generar la primera Hoja Count.',
    safeError: 'No fue posible completar ahora. Inténtelo nuevamente.',
    retry: 'Intentar de nuevo',
    generateA: 'Generar hoja A',
    generateB: 'Generar hoja B',
    generating: 'Generando...',
    notReadyB: 'La segunda hoja estará disponible después de registrar el primer conteo.',
    alreadyAdvanced: 'Este conteo ya avanzó más allá de la emisión de nuevas hojas A/B.',
    print: 'Imprimir hoja',
    formTitle: 'Hoja Count oficial',
    stageLabel: { count_a: 'Conteo A', count_b: 'Conteo B' },
    reference: 'Referencia de la hoja',
    service: 'Culto / actividad',
    date: 'Fecha',
    instructionsTitle: 'Cómo completar',
    instructionsBody: 'Cuente de forma independiente. Registre cantidades y totales sin consultar otro conteo. No sobrescriba valores: si hay un error, márquelo y use una hoja nueva.',
    denominationTitle: 'Detalle de efectivo',
    denomination: 'Denominación',
    quantity: 'Cantidad',
    tithes: 'Diezmos',
    offerings: 'Ofrendas',
    otherIncome: 'Otros ingresos',
    pix: 'Pix',
    total: 'Total',
    finalTotals: 'Totales finales',
    counter: 'Responsable del conteo',
    checker: 'Revisor / responsable',
    signature: 'Firma',
    time: 'Horario',
    qrNote: 'El QR contiene solamente la identidad opaca de esta hoja, la versión del modelo y el checksum. Ningún valor financiero se guarda en el QR.',
    noPosting: 'Esta hoja es evidencia del conteo. No registra movimientos ni altera saldos.',
    accessDeniedTitle: 'Acceso no permitido',
    accessDeniedBody: 'Su acceso actual no permite consultar las Hojas Count de esta entidad.',
  },
};
