import type { Language } from '@/src/contexts/LanguageContext';

export type TransactionEditCopy = {
  accessDeniedTitle: string;
  accessDeniedBody: string;
  pageTitle: string;
  pageSubtitle: string;
  back: string;
  loading: string;
  loadErrorTitle: string;
  loadErrorBody: string;
  retry: string;
  immutableTitle: string;
  immutableBody: string;
  viewDetail: string;
  saved: string;
  noChanges: string;
  conflictTitle: string;
  conflictBody: string;
  reloadLatest: string;
  discardChanges: string;
  supportCode: string;
  copyCode: string;
  saveError: string;
  uncertainError: string;
  reviewSuccess: string;
  draftSavedNoBalance: string;
  reviewSentNoBalance: string;
};

export const TRANSACTION_EDIT_COPY: Record<Language, TransactionEditCopy> = {
  PT: {
    accessDeniedTitle: 'Acesso somente leitura',
    accessDeniedBody: 'Seu acesso não permite editar rascunhos desta igreja.',
    pageTitle: 'Editar movimentação',
    pageSubtitle: 'Ajuste somente o que precisa e salve com segurança.',
    back: 'Voltar para a movimentação',
    loading: 'Carregando rascunho...',
    loadErrorTitle: 'Não foi possível carregar o rascunho',
    loadErrorBody: 'Nenhuma alteração foi feita. Tente novamente em instantes.',
    retry: 'Tentar novamente',
    immutableTitle: 'Esta movimentação não pode mais ser editada',
    immutableBody: 'O estado mudou desde que você abriu o rascunho. Veja a movimentação para continuar pelo passo correto.',
    viewDetail: 'Ver movimentação',
    saved: 'Alterações salvas.',
    noChanges: 'Não havia alterações novas para salvar.',
    conflictTitle: 'Existe uma versão mais recente',
    conflictBody: 'Esta movimentação foi alterada em outro lugar. Recarregue antes de salvar para não sobrescrever informações.',
    reloadLatest: 'Carregar versão mais recente',
    discardChanges: 'Descartar minhas alterações',
    supportCode: 'Código de suporte',
    copyCode: 'Copiar código',
    saveError: 'Não foi possível salvar a movimentação. Tente novamente.',
    uncertainError: 'Não foi possível confirmar a conclusão da tentativa. Tente novamente com segurança.',
    reviewSuccess: 'Movimentação enviada para conferência.',
    draftSavedNoBalance: 'Salvar o rascunho não altera saldo.',
    reviewSentNoBalance: 'Enviar para conferência também não altera saldo.',
  },
  EN: {
    accessDeniedTitle: 'Read-only access',
    accessDeniedBody: 'Your access does not allow you to edit drafts for this church.',
    pageTitle: 'Edit transaction',
    pageSubtitle: 'Adjust only what is needed and save safely.',
    back: 'Back to transaction',
    loading: 'Loading draft...',
    loadErrorTitle: 'Could not load the draft',
    loadErrorBody: 'No information was changed. Try again shortly.',
    retry: 'Try again',
    immutableTitle: 'This transaction can no longer be edited',
    immutableBody: 'Its state changed since you opened the draft. View the transaction to continue from the correct step.',
    viewDetail: 'View transaction',
    saved: 'Changes saved.',
    noChanges: 'There were no new changes to save.',
    conflictTitle: 'A newer version exists',
    conflictBody: 'This transaction was changed elsewhere. Reload it before saving so you do not overwrite information.',
    reloadLatest: 'Load latest version',
    discardChanges: 'Discard my changes',
    supportCode: 'Support code',
    copyCode: 'Copy code',
    saveError: 'Could not save the transaction. Try again.',
    uncertainError: 'Could not confirm whether the attempt completed. Retry safely.',
    reviewSuccess: 'Transaction sent for review.',
    draftSavedNoBalance: 'Saving a draft does not change balances.',
    reviewSentNoBalance: 'Sending for review does not change balances either.',
  },
  ES: {
    accessDeniedTitle: 'Acceso de solo lectura',
    accessDeniedBody: 'Tu acceso no permite editar borradores de esta iglesia.',
    pageTitle: 'Editar movimiento',
    pageSubtitle: 'Ajusta solamente lo necesario y guarda con seguridad.',
    back: 'Volver al movimiento',
    loading: 'Cargando borrador...',
    loadErrorTitle: 'No fue posible cargar el borrador',
    loadErrorBody: 'No se modificó ninguna información. Inténtalo de nuevo en unos instantes.',
    retry: 'Intentar de nuevo',
    immutableTitle: 'Este movimiento ya no se puede editar',
    immutableBody: 'El estado cambió desde que abriste el borrador. Consulta el movimiento para continuar por el paso correcto.',
    viewDetail: 'Ver movimiento',
    saved: 'Cambios guardados.',
    noChanges: 'No había cambios nuevos para guardar.',
    conflictTitle: 'Existe una versión más reciente',
    conflictBody: 'Este movimiento fue modificado en otro lugar. Recárgalo antes de guardar para no sobrescribir información.',
    reloadLatest: 'Cargar versión más reciente',
    discardChanges: 'Descartar mis cambios',
    supportCode: 'Código de soporte',
    copyCode: 'Copiar código',
    saveError: 'No fue posible guardar el movimiento. Inténtalo de nuevo.',
    uncertainError: 'No fue posible confirmar si el intento terminó. Inténtalo de nuevo con seguridad.',
    reviewSuccess: 'Movimiento enviado a revisión.',
    draftSavedNoBalance: 'Guardar el borrador no modifica saldos.',
    reviewSentNoBalance: 'Enviar a revisión tampoco modifica saldos.',
  },
};
