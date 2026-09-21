import type { Language } from '@/src/contexts/LanguageContext';

export type ReviewHistoryCopy = {
  title: string;
  subtitle: string;
  load: string;
  loading: string;
  retry: string;
  errorTitle: string;
  errorBody: string;
  emptyTitle: string;
  emptyBody: string;
  recentOnly: string;
  systemActor: string;
  teamActor: string;
  unknownAction: string;
  reason: string;
  status: string;
  actions: Record<string, string>;
};

export const TRANSACTION_REVIEW_HISTORY_COPY: Record<Language, ReviewHistoryCopy> = {
  PT: {
    title: 'Histórico relacionado',
    subtitle: 'Consulte a atividade recente desta movimentação e dos comprovantes vinculados, sem sair da conferência.',
    load: 'Carregar histórico',
    loading: 'Carregando atividade recente…',
    retry: 'Tentar novamente',
    errorTitle: 'Não foi possível carregar o histórico',
    errorBody: 'A movimentação não foi alterada. Você pode tentar novamente ou continuar a conferência.',
    emptyTitle: 'Nenhuma atividade relacionada apareceu nos eventos recentes',
    emptyBody: 'Isso não significa que nunca houve atividade. A trilha canônica continua disponível na área de Auditoria.',
    recentOnly: 'A auditoria da entidade possui mais eventos do que esta leitura trouxe. Este painel mostra apenas atividade relacionada encontrada entre os eventos recentes.',
    systemActor: 'Sistema NestFinance',
    teamActor: 'Usuário da equipe',
    unknownAction: 'Atividade registrada',
    reason: 'Motivo',
    status: 'Estado',
    actions: {
      'transaction.created': 'Movimentação criada',
      'transaction.updated': 'Movimentação atualizada',
      'transaction.submitted': 'Enviada para conferência',
      'transaction.returned': 'Devolvida para correção',
      'transaction.returned_to_draft': 'Devolvida para correção',
      'transaction.approved_for_posting': 'Aprovada para o próximo passo',
      'transaction.approval_invalidated': 'Aprovação invalidada',
      'transaction.reconciled': 'Conferência com extrato registrada',
      'transaction.reconciliation_reversed': 'Conferência com extrato desfeita',
      'evidence.classified': 'Documento identificado',
      'evidence.reviewed': 'Documento conferido',
    },
  },
  EN: {
    title: 'Related history',
    subtitle: 'View recent activity for this transaction and its linked evidence without leaving the review flow.',
    load: 'Load history',
    loading: 'Loading recent activity…',
    retry: 'Try again',
    errorTitle: 'Could not load history',
    errorBody: 'The transaction was not changed. You can try again or continue the review.',
    emptyTitle: 'No related activity appeared in the recent events',
    emptyBody: 'This does not mean there was never any activity. The canonical trail remains available in Audit.',
    recentOnly: 'This entity has more audit events than this read returned. This panel only shows related activity found among the recent events.',
    systemActor: 'NestFinance system',
    teamActor: 'Team member',
    unknownAction: 'Recorded activity',
    reason: 'Reason',
    status: 'Status',
    actions: {
      'transaction.created': 'Transaction created',
      'transaction.updated': 'Transaction updated',
      'transaction.submitted': 'Sent for review',
      'transaction.returned': 'Returned for correction',
      'transaction.returned_to_draft': 'Returned for correction',
      'transaction.approved_for_posting': 'Approved for the next step',
      'transaction.approval_invalidated': 'Approval invalidated',
      'transaction.reconciled': 'Statement check recorded',
      'transaction.reconciliation_reversed': 'Statement check undone',
      'evidence.classified': 'Document identified',
      'evidence.reviewed': 'Document reviewed',
    },
  },
  ES: {
    title: 'Historial relacionado',
    subtitle: 'Consulta la actividad reciente de este movimiento y de los comprobantes vinculados sin salir de la revisión.',
    load: 'Cargar historial',
    loading: 'Cargando actividad reciente…',
    retry: 'Intentar de nuevo',
    errorTitle: 'No fue posible cargar el historial',
    errorBody: 'El movimiento no fue modificado. Puedes intentarlo de nuevo o continuar la revisión.',
    emptyTitle: 'No apareció actividad relacionada entre los eventos recientes',
    emptyBody: 'Esto no significa que nunca haya existido actividad. El historial canónico sigue disponible en Auditoría.',
    recentOnly: 'La entidad tiene más eventos de auditoría de los que devolvió esta lectura. Este panel muestra solo la actividad relacionada encontrada entre los eventos recientes.',
    systemActor: 'Sistema NestFinance',
    teamActor: 'Usuario del equipo',
    unknownAction: 'Actividad registrada',
    reason: 'Motivo',
    status: 'Estado',
    actions: {
      'transaction.created': 'Movimiento creado',
      'transaction.updated': 'Movimiento actualizado',
      'transaction.submitted': 'Enviado a revisión',
      'transaction.returned': 'Devuelto para corrección',
      'transaction.returned_to_draft': 'Devuelto para corrección',
      'transaction.approved_for_posting': 'Aprobado para el siguiente paso',
      'transaction.approval_invalidated': 'Aprobación invalidada',
      'transaction.reconciled': 'Comprobación con extracto registrada',
      'transaction.reconciliation_reversed': 'Comprobación con extracto deshecha',
      'evidence.classified': 'Documento identificado',
      'evidence.reviewed': 'Documento revisado',
    },
  },
};
