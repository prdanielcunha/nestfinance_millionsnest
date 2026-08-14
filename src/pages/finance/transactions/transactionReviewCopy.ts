import type { Language } from '@/src/contexts/LanguageContext';
import type { ReviewDirectionFilter, ReviewOrder } from './transactionReviewModel';

export type TransactionReviewCopy = {
  accessDeniedTitle: string;
  accessDeniedBody: string;
  pageTitle: string;
  pageSubtitle: string;
  back: string;
  filtersLabel: string;
  directions: Record<ReviewDirectionFilter, string>;
  orders: Record<ReviewOrder, string>;
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  backToFinance: string;
  supportCode: string;
  amount: string;
  account: string;
  date: string;
  type: string;
  description: string;
  noDescription: string;
  noAccount: string;
  review: string;
  awaitingReview: string;
  loadMore: string;
  loadingMore: string;
  endOfQueue: string;
  warnings: (count: number) => string;
};

export const TRANSACTION_REVIEW_COPY: Record<Language, TransactionReviewCopy> = {
  PT: {
    accessDeniedTitle: 'Acesso somente leitura',
    accessDeniedBody: 'Seu acesso não permite revisar movimentações desta igreja.',
    pageTitle: 'Para conferir',
    pageSubtitle: 'Movimentações que aguardam uma segunda conferência antes do próximo passo.',
    back: 'Voltar para Finance',
    filtersLabel: 'Filtrar fila de revisão',
    directions: {
      all: 'Tudo',
      income: 'Entradas',
      expense: 'Saídas',
      transfer: 'Transferências',
      liability_settlement: 'Obrigações',
    },
    orders: {
      oldest: 'Mais antigas primeiro',
      newest: 'Mais recentes primeiro',
    },
    loading: 'Carregando movimentações...',
    emptyTitle: 'Nada para conferir agora',
    emptyBody: 'Quando uma movimentação for enviada para revisão, ela aparecerá aqui.',
    errorTitle: 'Não foi possível carregar a fila',
    errorBody: 'Nenhuma informação foi alterada. Tente novamente em instantes.',
    retry: 'Tentar novamente',
    backToFinance: 'Voltar para Finance',
    supportCode: 'Código de suporte',
    amount: 'Valor',
    account: 'Conta',
    date: 'Data',
    type: 'Tipo',
    description: 'Descrição',
    noDescription: 'Sem descrição',
    noAccount: 'Conta não informada',
    review: 'Conferir',
    awaitingReview: 'Aguardando conferência',
    loadMore: 'Carregar mais',
    loadingMore: 'Carregando...',
    endOfQueue: 'Você chegou ao fim da fila.',
    warnings: (count) => `${count} ${count === 1 ? 'aviso' : 'avisos'}`,
  },
  EN: {
    accessDeniedTitle: 'Read-only access',
    accessDeniedBody: 'Your access does not allow you to review this church’s transactions.',
    pageTitle: 'Needs review',
    pageSubtitle: 'Transactions waiting for a second check before the next step.',
    back: 'Back to Finance',
    filtersLabel: 'Filter review queue',
    directions: {
      all: 'All',
      income: 'Income',
      expense: 'Expenses',
      transfer: 'Transfers',
      liability_settlement: 'Obligations',
    },
    orders: {
      oldest: 'Oldest first',
      newest: 'Newest first',
    },
    loading: 'Loading transactions...',
    emptyTitle: 'Nothing to review right now',
    emptyBody: 'Transactions sent for review will appear here.',
    errorTitle: 'Could not load the queue',
    errorBody: 'No information was changed. Try again shortly.',
    retry: 'Try again',
    backToFinance: 'Back to Finance',
    supportCode: 'Support code',
    amount: 'Amount',
    account: 'Account',
    date: 'Date',
    type: 'Type',
    description: 'Description',
    noDescription: 'No description',
    noAccount: 'Account not provided',
    review: 'Review',
    awaitingReview: 'Waiting for review',
    loadMore: 'Load more',
    loadingMore: 'Loading...',
    endOfQueue: 'You reached the end of the queue.',
    warnings: (count) => `${count} ${count === 1 ? 'warning' : 'warnings'}`,
  },
  ES: {
    accessDeniedTitle: 'Acceso de solo lectura',
    accessDeniedBody: 'Tu acceso no permite revisar los movimientos de esta iglesia.',
    pageTitle: 'Para revisar',
    pageSubtitle: 'Movimientos que esperan una segunda revisión antes del siguiente paso.',
    back: 'Volver a Finanzas',
    filtersLabel: 'Filtrar cola de revisión',
    directions: {
      all: 'Todo',
      income: 'Ingresos',
      expense: 'Egresos',
      transfer: 'Transferencias',
      liability_settlement: 'Obligaciones',
    },
    orders: {
      oldest: 'Más antiguos primero',
      newest: 'Más recientes primero',
    },
    loading: 'Cargando movimientos...',
    emptyTitle: 'Nada para revisar ahora',
    emptyBody: 'Los movimientos enviados a revisión aparecerán aquí.',
    errorTitle: 'No fue posible cargar la cola',
    errorBody: 'No se modificó ninguna información. Inténtalo de nuevo en unos instantes.',
    retry: 'Intentar de nuevo',
    backToFinance: 'Volver a Finanzas',
    supportCode: 'Código de soporte',
    amount: 'Valor',
    account: 'Cuenta',
    date: 'Fecha',
    type: 'Tipo',
    description: 'Descripción',
    noDescription: 'Sin descripción',
    noAccount: 'Cuenta no informada',
    review: 'Revisar',
    awaitingReview: 'Esperando revisión',
    loadMore: 'Cargar más',
    loadingMore: 'Cargando...',
    endOfQueue: 'Llegaste al final de la cola.',
    warnings: (count) => `${count} ${count === 1 ? 'aviso' : 'avisos'}`,
  },
};
