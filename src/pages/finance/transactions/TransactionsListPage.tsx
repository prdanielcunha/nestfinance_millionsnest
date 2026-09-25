import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpRight,
  ChevronRight,
  FilePenLine,
  SlidersHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  WalletCards,
  X,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { FirestoreIndexRemediationCard } from '@/src/components/finance/FirestoreIndexRemediationCard';
import { TransactionSavedViews } from '@/src/components/finance/TransactionSavedViews';
import { TransactionInspector } from '@/src/components/finance/TransactionInspector';
import { TransactionStatusSignal, getTransactionStatusCopy, getTransactionStatusTone } from '@/src/components/finance/TransactionStatusSignal';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import { firebaseAuth } from '@/src/lib/firebase';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import type { TransactionWorkspaceFilters } from '../../../../shared/finance/transactionWorkspaceView';
import { parseTransactionNaturalQuery } from '../../../../shared/finance/transactionSearch';
import { TransactionHistoryFilters, type TransactionHistoryFilterValues } from './TransactionHistoryFilters';

type LoadErrorKind = 'forbidden' | 'entity' | 'cursor' | 'index' | 'generic' | null;
type Direction = 'income' | 'expense' | 'transfer' | 'liability_settlement' | string;

type TransactionsCopy = {
  title: string;
  subtitle: string;
  accessDeniedTitle: string;
  accessDeniedText: string;
  back: string;
  review: string;
  create: string;
  filters: string;
  type: string;
  stage: string;
  period: string;
  dateFrom: string;
  dateTo: string;
  order: string;
  newest: string;
  oldest: string;
  clearPeriod: string;
  allTypes: string;
  income: string;
  expense: string;
  transfer: string;
  otherOperation: string;
  allStages: string;
  draftsAndCorrections: string;
  needsChecking: string;
  approved: string;
  posted: string;
  reversed: string;
  correction: string;
  draft: string;
  inProgress: string;
  noEntityTitle: string;
  noEntityText: string;
  errorTitle: string;
  errorText: string;
  cursorErrorTitle: string;
  cursorErrorText: string;
  retry: string;
  emptyAllTitle: string;
  emptyAllText: string;
  emptyDraftTitle: string;
  emptyDraftText: string;
  emptyReviewTitle: string;
  emptyReviewText: string;
  emptyApprovedTitle: string;
  emptyApprovedText: string;
  emptyPostedTitle: string;
  emptyPostedText: string;
  emptyReversedTitle: string;
  emptyReversedText: string;
  loadMore: string;
  loadingMore: string;
  supportCode: string;
  indexError: string;
  account: string;
  category: string;
  noDescription: string;
  returnedHint: string;
  draftDiscarded: string;
  searchPlaceholder: string;
  searchTooShort: string;
  searchEmptyTitle: string;
  searchEmptyText: string;
  searchFallbackHint: string;
  searchTruncatedHint: string;
  clearSearch: string;
};

const COPY: Record<Language, TransactionsCopy> = {
  PT: {
    title: 'Movimentações',
    subtitle: 'Veja o que entrou, saiu ou ainda precisa de uma ação.',
    accessDeniedTitle: 'Acesso somente leitura indisponível',
    accessDeniedText: 'Você não tem permissão para visualizar estas movimentações.',
    back: 'Voltar para Hoje',
    review: 'Conferir movimentações',
    create: 'Registrar movimentação',
    filters: 'Filtrar movimentações',
    type: 'Tipo',
    stage: 'Etapa',
    period: 'Período',
    dateFrom: 'De',
    dateTo: 'Até',
    order: 'Ordem',
    newest: 'Mais recentes',
    oldest: 'Mais antigas',
    clearPeriod: 'Limpar período',
    allTypes: 'Todos',
    income: 'Entradas',
    expense: 'Saídas',
    transfer: 'Transferências',
    otherOperation: 'Outras operações',
    allStages: 'Todas',
    draftsAndCorrections: 'Rascunhos e correções',
    needsChecking: 'Aguardando conferência',
    approved: 'Conferidas — aguardando lançamento',
    posted: 'Lançadas no financeiro',
    reversed: 'Revertidas',
    correction: 'Para corrigir',
    draft: 'Rascunho',
    inProgress: 'Em andamento',
    noEntityTitle: 'Escolha uma entidade financeira',
    noEntityText: 'Selecione onde você quer trabalhar para ver as movimentações.',
    errorTitle: 'Não foi possível carregar as movimentações',
    errorText: 'Tente novamente. Nenhum dado foi alterado.',
    cursorErrorTitle: 'A lista precisa ser atualizada',
    cursorErrorText: 'A continuação desta lista expirou. Recarregue para continuar.',
    retry: 'Tentar novamente',
    emptyAllTitle: 'Nenhuma movimentação encontrada',
    emptyAllText: 'Quando houver registros nesta entidade, eles aparecerão aqui.',
    emptyDraftTitle: 'Nenhum rascunho ou correção pendente',
    emptyDraftText: 'Não há nada para terminar ou corrigir nesta etapa.',
    emptyReviewTitle: 'Nada aguardando conferência',
    emptyReviewText: 'Nenhuma movimentação está esperando revisão agora.',
    emptyApprovedTitle: 'Nenhuma movimentação aprovada',
    emptyApprovedText: 'Não há itens aprovados aguardando o próximo passo.',
    emptyPostedTitle: 'Nenhuma movimentação lançada',
    emptyPostedText: 'Os registros concluídos aparecerão aqui quando existirem.',
    emptyReversedTitle: 'Nenhuma movimentação revertida',
    emptyReversedText: 'Não há reversões nesta entidade.',
    loadMore: 'Carregar mais',
    loadingMore: 'Carregando…',
    supportCode: 'Código de atendimento',
    indexError: 'A consulta precisa de uma configuração de infraestrutura antes de carregar.',
    account: 'Conta',
    category: 'Categoria',
    noDescription: 'Movimentação sem descrição',
    returnedHint: 'Esta movimentação voltou para você ajustar antes de seguir.',
    draftDiscarded: 'Rascunho descartado.',
    searchPlaceholder: 'Buscar descrição, pessoa, conta, método ou código',
    searchTooShort: 'Digite pelo menos 2 caracteres para pesquisar.',
    searchEmptyTitle: 'Nenhum resultado para esta busca',
    searchEmptyText: 'Tente outro termo ou ajuste os filtros.',
    searchFallbackHint: 'Busca segura no histórico enquanto o índice é preparado.',
    searchTruncatedHint: 'Há mais resultados. Refine o termo ou os filtros para encontrar com precisão.',
    clearSearch: 'Limpar busca',
  },
  EN: {
    title: 'Transactions',
    subtitle: 'See what came in, went out, or still needs an action.',
    accessDeniedTitle: 'Read access unavailable',
    accessDeniedText: 'You do not have permission to view these transactions.',
    back: 'Back to Today',
    review: 'Check transactions',
    create: 'Record transaction',
    filters: 'Filter transactions',
    type: 'Type',
    stage: 'Stage',
    period: 'Period',
    dateFrom: 'From',
    dateTo: 'To',
    order: 'Order',
    newest: 'Newest first',
    oldest: 'Oldest first',
    clearPeriod: 'Clear period',
    allTypes: 'All',
    income: 'Income',
    expense: 'Expenses',
    transfer: 'Transfers',
    otherOperation: 'Other operations',
    allStages: 'All',
    draftsAndCorrections: 'Drafts and corrections',
    needsChecking: 'Waiting for review',
    approved: 'Checked — waiting for posting',
    posted: 'Posted to finance',
    reversed: 'Reversed',
    correction: 'Needs correction',
    draft: 'Draft',
    inProgress: 'In progress',
    noEntityTitle: 'Choose a finance entity',
    noEntityText: 'Select where you want to work to view transactions.',
    errorTitle: 'Transactions could not be loaded',
    errorText: 'Try again. No data was changed.',
    cursorErrorTitle: 'The list needs to be refreshed',
    cursorErrorText: 'This list continuation expired. Refresh it to continue.',
    retry: 'Try again',
    emptyAllTitle: 'No transactions found',
    emptyAllText: 'Records for this entity will appear here when they exist.',
    emptyDraftTitle: 'No drafts or corrections pending',
    emptyDraftText: 'There is nothing to finish or correct at this stage.',
    emptyReviewTitle: 'Nothing waiting to be checked',
    emptyReviewText: 'No transactions are waiting for review right now.',
    emptyApprovedTitle: 'No approved transactions',
    emptyApprovedText: 'There are no approved items waiting for the next step.',
    emptyPostedTitle: 'No posted transactions',
    emptyPostedText: 'Completed records will appear here when they exist.',
    emptyReversedTitle: 'No reversed transactions',
    emptyReversedText: 'There are no reversals for this entity.',
    loadMore: 'Load more',
    loadingMore: 'Loading…',
    supportCode: 'Support code',
    indexError: 'This query needs an infrastructure configuration before it can load.',
    account: 'Account',
    category: 'Category',
    noDescription: 'Transaction without a description',
    returnedHint: 'This transaction was returned so you can adjust it before it continues.',
    draftDiscarded: 'Draft discarded.',
    searchPlaceholder: 'Search description, person, account, method, or code',
    searchTooShort: 'Type at least 2 characters to search.',
    searchEmptyTitle: 'No results for this search',
    searchEmptyText: 'Try another term or adjust the filters.',
    searchFallbackHint: 'Safe historical search while the index is being prepared.',
    searchTruncatedHint: 'There are more results. Refine the term or filters for precision.',
    clearSearch: 'Clear search',
  },
  ES: {
    title: 'Movimientos',
    subtitle: 'Consulta lo que ingresó, salió o todavía necesita una acción.',
    accessDeniedTitle: 'Acceso de lectura no disponible',
    accessDeniedText: 'No tienes permiso para ver estos movimientos.',
    back: 'Volver a Hoy',
    review: 'Revisar movimientos',
    create: 'Registrar movimiento',
    filters: 'Filtrar movimientos',
    type: 'Tipo',
    stage: 'Etapa',
    period: 'Período',
    dateFrom: 'Desde',
    dateTo: 'Hasta',
    order: 'Orden',
    newest: 'Más recientes',
    oldest: 'Más antiguos',
    clearPeriod: 'Limpiar período',
    allTypes: 'Todos',
    income: 'Ingresos',
    expense: 'Egresos',
    transfer: 'Transferencias',
    otherOperation: 'Otras operaciones',
    allStages: 'Todas',
    draftsAndCorrections: 'Borradores y correcciones',
    needsChecking: 'Esperando revisión',
    approved: 'Revisados — esperando registro',
    posted: 'Registrados en finanzas',
    reversed: 'Revertidos',
    correction: 'Para corregir',
    draft: 'Borrador',
    inProgress: 'En curso',
    noEntityTitle: 'Elige una entidad financiera',
    noEntityText: 'Selecciona dónde quieres trabajar para ver los movimientos.',
    errorTitle: 'No fue posible cargar los movimientos',
    errorText: 'Inténtalo de nuevo. Ningún dato fue modificado.',
    cursorErrorTitle: 'La lista necesita actualizarse',
    cursorErrorText: 'La continuación de esta lista venció. Actualízala para continuar.',
    retry: 'Intentar de nuevo',
    emptyAllTitle: 'No se encontraron movimientos',
    emptyAllText: 'Los registros de esta entidad aparecerán aquí cuando existan.',
    emptyDraftTitle: 'No hay borradores ni correcciones pendientes',
    emptyDraftText: 'No hay nada que terminar o corregir en esta etapa.',
    emptyReviewTitle: 'Nada pendiente de revisión',
    emptyReviewText: 'Ningún movimiento está esperando revisión ahora.',
    emptyApprovedTitle: 'No hay movimientos aprobados',
    emptyApprovedText: 'No hay elementos aprobados esperando el siguiente paso.',
    emptyPostedTitle: 'No hay movimientos registrados',
    emptyPostedText: 'Los registros concluidos aparecerán aquí cuando existan.',
    emptyReversedTitle: 'No hay movimientos revertidos',
    emptyReversedText: 'No hay reversiones en esta entidad.',
    loadMore: 'Cargar más',
    loadingMore: 'Cargando…',
    supportCode: 'Código de atención',
    indexError: 'Esta consulta necesita una configuración de infraestructura antes de cargar.',
    account: 'Cuenta',
    category: 'Categoría',
    noDescription: 'Movimiento sin descripción',
    returnedHint: 'Este movimiento volvió para que lo ajustes antes de continuar.',
    draftDiscarded: 'Borrador descartado.',
    searchPlaceholder: 'Buscar descripción, persona, cuenta, método o código',
    searchTooShort: 'Escribe al menos 2 caracteres para buscar.',
    searchEmptyTitle: 'No hay resultados para esta búsqueda',
    searchEmptyText: 'Prueba otro término o ajusta los filtros.',
    searchFallbackHint: 'Búsqueda segura en el historial mientras se prepara el índice.',
    searchTruncatedHint: 'Hay más resultados. Refina el término o los filtros para mayor precisión.',
    clearSearch: 'Limpiar búsqueda',
  },
};

function localeFor(language: Language) {
  if (language === 'EN') return 'en-US';
  if (language === 'ES') return 'es-ES';
  return 'pt-BR';
}

function dateOnlyStartIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function dateOnlyEndIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isReturnedDraft(item: any) {
  return item?.status === 'draft' && Boolean(
    item?.returnedToDraftAt || item?.returnedToDraftReason || item?.returnedToDraftComment,
  );
}

function formatMoney(cents: number | undefined, direction: Direction, language: Language) {
  const value = Math.abs(Number(cents || 0)) / 100;
  const formatted = new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

  if (direction === 'expense') return `−${formatted}`;
  if (direction === 'income') return `+${formatted}`;
  return formatted;
}

function formatDate(value: unknown, language: Language) {
  const date = typeof value === 'string' || value instanceof Date ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeFor(language), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function directionPresentation(direction: Direction, copy: TransactionsCopy) {
  if (direction === 'income') {
    return {
      label: copy.income,
      Icon: ArrowDownLeft,
      iconClass: 'bg-semantic-success/10 text-semantic-success',
      amountClass: 'text-semantic-success',
    };
  }
  if (direction === 'expense') {
    return {
      label: copy.expense,
      Icon: ArrowUpRight,
      iconClass: 'bg-semantic-danger/10 text-semantic-danger',
      amountClass: 'text-text-primary',
    };
  }
  if (direction === 'transfer') {
    return {
      label: copy.transfer,
      Icon: ArrowRightLeft,
      iconClass: 'bg-accent-primary/10 text-accent-primary',
      amountClass: 'text-text-primary',
    };
  }
  return {
    label: copy.otherOperation,
    Icon: WalletCards,
    iconClass: 'bg-surface-secondary text-text-secondary',
    amountClass: 'text-text-primary',
  };
}

function statusPresentation(item: any, language: Language) {
  const returned = isReturnedDraft(item);
  const statusCopy = getTransactionStatusCopy(language, item?.status || '', returned);
  return {
    label: statusCopy.label,
    consequence: statusCopy.consequence,
    next: statusCopy.next,
    className: getTransactionStatusTone(item?.status || '', returned),
  };
}

export default function TransactionsListPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];

  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.view')) {
    return (
      <main className="flex min-h-[60vh] flex-1 items-center justify-center p-6 text-center">
        <Surface variant="elevated" radius="xl" className="w-full max-w-lg p-7 sm:p-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-danger/10 text-semantic-danger">
            <ShieldX className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">{copy.accessDeniedTitle}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">{copy.accessDeniedText}</p>
        </Surface>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <TransactionsListContent />
    </FinanceContextGuard>
  );
}

function TransactionsListContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { listTransactions, searchTransactions } = useTransactions();
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];

  const [items, setItems] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorKind, setErrorKind] = useState<LoadErrorKind>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [searchMeta, setSearchMeta] = useState<{
    searchMode: 'index' | 'canonical_fallback';
    indexCertified: boolean;
    sourceTruncated: boolean;
    resultTruncated: boolean;
  } | null>(null);

  const directionFilter = searchParams.get('direction') || 'all';
  const statusFilter = searchParams.get('status') || 'all';
  const fromFilter = searchParams.get('from') || '';
  const toFilter = searchParams.get('to') || '';
  const orderFilter = searchParams.get('order') === 'oldest' ? 'oldest' : 'newest';
  const searchQuery = searchParams.get('q') || '';
  const normalizedSearchQuery = searchQuery.trim();
  const naturalSearch = useMemo(
    () => parseTransactionNaturalQuery(normalizedSearchQuery),
    [normalizedSearchQuery],
  );
  const inspectedTransactionId = searchParams.get('inspect');
  const epochRef = useRef(0);

  const loadData = async (cursor?: string, signal?: AbortSignal, currentEpoch?: number) => {
    if (!cursor) setLoading(true);
    else setLoadingMore(true);

    setErrorKind(null);
    setErrorDetails(null);

    try {
      const filters: Record<string, string | number> = {};
      const naturalFilters = naturalSearch.filters;
      const effectiveDirection = directionFilter !== 'all' ? directionFilter : naturalFilters.direction;
      const effectiveStatus = statusFilter !== 'all' ? statusFilter : naturalFilters.status;
      if (effectiveDirection) filters.direction = effectiveDirection;
      if (effectiveStatus) filters.status = effectiveStatus;
      const occurredFrom = fromFilter
        ? dateOnlyStartIso(fromFilter)
        : naturalFilters.occurredFrom
          ? dateOnlyStartIso(naturalFilters.occurredFrom.slice(0, 10))
          : undefined;
      const occurredTo = toFilter
        ? dateOnlyEndIso(toFilter)
        : naturalFilters.occurredTo
          ? dateOnlyEndIso(naturalFilters.occurredTo.slice(0, 10))
          : undefined;
      if (occurredFrom) filters.occurredFrom = occurredFrom;
      if (occurredTo) filters.occurredTo = occurredTo;
      if (naturalFilters.amountMinCents !== undefined) filters.amountMinCents = naturalFilters.amountMinCents;
      if (naturalFilters.amountMaxCents !== undefined) filters.amountMaxCents = naturalFilters.amountMaxCents;
      filters.order = orderFilter;

      if (normalizedSearchQuery.length >= 2) {
        const res = await searchTransactions(
          naturalSearch.residualQuery,
          filters,
          50,
        );

        if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;

        setItems(res.items);
        setNextCursor(undefined);
        setHasMore(false);
        setSearchMeta({
          searchMode: res.searchMode,
          indexCertified: res.indexCertified,
          sourceTruncated: res.sourceTruncated,
          resultTruncated: res.resultTruncated,
        });
      } else {
        const res = await listTransactions(filters, cursor, 25);

        if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;

        setItems((previous) => cursor ? [...previous, ...res.items] : res.items);
        setNextCursor(res.nextCursor);
        setHasMore(res.hasMore);
        setSearchMeta(null);
      }
    } catch (error: any) {
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;

      const details = error?.details || null;
      const message = String(error?.message || '');
      setErrorDetails(details);

      if (details?.errorCode === 'FINANCE_REVIEW_INDEX_REQUIRED' || details?.remediation?.type === 'CREATE_FIRESTORE_INDEX') {
        setErrorKind('index');
      } else if (/FORBIDDEN|permission/i.test(message)) {
        setErrorKind('forbidden');
      } else if (/financeEntityId is required|Missing context/i.test(message)) {
        setErrorKind('entity');
      } else if (/INVALID_CURSOR|cursor/i.test(message)) {
        setErrorKind('cursor');
      } else {
        setErrorKind('generic');
      }
    } finally {
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    setItems([]);
    setNextCursor(undefined);
    setHasMore(true);
    setSearchMeta(null);

    if (!activeFinanceEntityId) {
      setLoading(false);
      return () => abortController.abort();
    }

    if (normalizedSearchQuery.length === 1) {
      setLoading(false);
      setHasMore(false);
      return () => abortController.abort();
    }

    const currentEpoch = ++epochRef.current;
    if (normalizedSearchQuery.length >= 2) {
      setLoading(true);
      timeoutId = setTimeout(() => {
        void loadData(undefined, abortController.signal, currentEpoch);
      }, 280);
    } else {
      void loadData(undefined, abortController.signal, currentEpoch);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [
    activeFinanceEntityId,
    directionFilter,
    statusFilter,
    fromFilter,
    toFilter,
    orderFilter,
    normalizedSearchQuery,
    naturalSearch,
  ]);

  const updateFilter = (key: 'direction' | 'status', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const updateDateFilter = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);

    const currentFrom = key === 'from' ? value : (next.get('from') || '');
    const currentTo = key === 'to' ? value : (next.get('to') || '');
    if (currentFrom && currentTo && currentFrom > currentTo) {
      if (key === 'from') next.set('to', currentFrom);
      else next.set('from', currentTo);
    }
    setSearchParams(next);
  };

  const updateOrder = (value: 'newest' | 'oldest') => {
    const next = new URLSearchParams(searchParams);
    if (value === 'newest') next.delete('order');
    else next.set('order', value);
    setSearchParams(next);
  };

  const clearPeriod = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('from');
    next.delete('to');
    setSearchParams(next);
  };

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete('q');
    else next.set('q', value.slice(0, 64));
    setSearchParams(next, { replace: true });
  };

  const workspaceFilters: TransactionWorkspaceFilters = {
    direction: directionFilter as TransactionWorkspaceFilters['direction'],
    status: statusFilter as TransactionWorkspaceFilters['status'],
    occurredFrom: fromFilter || null,
    occurredTo: toFilter || null,
    order: orderFilter,
  };

  const applySavedView = (filters: TransactionWorkspaceFilters) => {
    const next = new URLSearchParams(searchParams);
    if (filters.direction === 'all') next.delete('direction');
    else next.set('direction', filters.direction);
    if (filters.status === 'all') next.delete('status');
    else next.set('status', filters.status);
    if (filters.occurredFrom) next.set('from', filters.occurredFrom);
    else next.delete('from');
    if (filters.occurredTo) next.set('to', filters.occurredTo);
    else next.delete('to');
    if (filters.order === 'oldest') next.set('order', 'oldest');
    else next.delete('order');
    setSearchParams(next);
  };

  const openInspector = (transactionId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('inspect', transactionId);
    setSearchParams(next, { replace: true });
  };

  const closeInspector = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('inspect');
    setSearchParams(next, { replace: true });
  };

  const reloadFromStart = () => {
    setItems([]);
    setNextCursor(undefined);
    setHasMore(true);
    void loadData(undefined, undefined, ++epochRef.current);
  };

  const directionOptions = [
    { value: 'all', label: copy.allTypes },
    { value: 'income', label: copy.income },
    { value: 'expense', label: copy.expense },
    { value: 'transfer', label: copy.transfer },
    { value: 'liability_settlement', label: copy.otherOperation },
  ];

  const statusOptions = [
    { value: 'all', label: copy.allStages },
    { value: 'draft', label: copy.draftsAndCorrections },
    { value: 'ready_for_review', label: copy.needsChecking },
    { value: 'approved_for_posting', label: copy.approved },
    { value: 'posted', label: copy.posted },
    { value: 'reversed', label: copy.reversed },
  ];

  const emptyState = (() => {
    if (statusFilter === 'draft') return { title: copy.emptyDraftTitle, text: copy.emptyDraftText };
    if (statusFilter === 'ready_for_review') return { title: copy.emptyReviewTitle, text: copy.emptyReviewText };
    if (statusFilter === 'approved_for_posting') return { title: copy.emptyApprovedTitle, text: copy.emptyApprovedText };
    if (statusFilter === 'posted') return { title: copy.emptyPostedTitle, text: copy.emptyPostedText };
    if (statusFilter === 'reversed') return { title: copy.emptyReversedTitle, text: copy.emptyReversedText };
    return { title: copy.emptyAllTitle, text: copy.emptyAllText };
  })();

  if (errorKind === 'forbidden') {
    return (
      <main className="flex min-h-[60vh] flex-1 items-center justify-center p-6 text-center">
        <Surface variant="elevated" radius="xl" className="w-full max-w-lg p-7 sm:p-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-danger/10 text-semantic-danger">
            <ShieldX className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">{copy.accessDeniedTitle}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">{copy.accessDeniedText}</p>
        </Surface>
      </main>
    );
  }

  if (!activeFinanceEntityId || errorKind === 'entity') {
    return (
      <main className="flex min-h-[60vh] flex-1 items-center justify-center p-6 text-center">
        <Surface variant="elevated" radius="xl" className="w-full max-w-lg p-7 sm:p-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
            <WalletCards className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">{copy.noEntityTitle}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">{copy.noEntityText}</p>
          <Button variant="primary" size="lg" className="mt-6" onClick={() => navigate(APP_ROUTES.finance)}>
            {copy.back}
          </Button>
        </Surface>
      </main>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base">
      <FinanceEntityContextBar areaName={copy.title} />

      <main className="flex-1 overflow-y-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-8 lg:px-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => navigate(APP_ROUTES.finance)}
                className="nf-interactive nf-touch-target -ml-3 mb-2 inline-flex items-center gap-2 rounded-xl px-3 text-sm font-medium text-text-muted hover:bg-surface-secondary hover:text-text-primary"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {copy.back}
              </button>
              <h1 className="text-2xl font-semibold tracking-[-0.035em] text-text-primary sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{copy.subtitle}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              {hasEffectiveCapability(accessState, 'finance.review') ? (
                <Button
                  variant="secondary"
                  size="lg"
                  leadingIcon={<ShieldCheck className="h-5 w-5 text-accent-primary" />}
                  onClick={() => navigate(APP_ROUTES.financeReview)}
                  className="w-full sm:w-auto"
                >
                  {copy.review}
                </Button>
              ) : null}
              {hasEffectiveCapability(accessState, 'finance.create_drafts') ? (
                <Button
                  variant="primary"
                  size="lg"
                  leadingIcon={<Plus className="h-5 w-5" />}
                  onClick={() => navigate(APP_ROUTES.transactionCreate)}
                  className="w-full sm:w-auto"
                >
                  {copy.create}
                </Button>
              ) : null}
            </div>
          </header>

          {notice ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-semantic-success/20 bg-semantic-success/10 px-4 py-3 text-sm font-medium text-text-primary"
            >
              {notice}
            </div>
          ) : null}

          <Surface variant="glass" radius="lg" className="p-4 sm:p-5">
            <label className="relative block">
              <span className="sr-only">{copy.searchPlaceholder}</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                maxLength={64}
                autoComplete="off"
                placeholder={copy.searchPlaceholder}
                onChange={(event) => updateSearch(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border-subtle bg-surface-elevated pl-10 pr-11 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/10"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => updateSearch('')}
                  aria-label={copy.clearSearch}
                  className="nf-interactive absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-text-muted hover:bg-surface-secondary hover:text-text-primary"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </label>

            {naturalSearch.understood && naturalSearch.labels.length > 0 ? (
              <p className="mt-2 text-xs font-medium text-accent-primary">
                {language === 'PT' ? 'Entendi: ' : language === 'ES' ? 'Entendí: ' : 'Understood: '}
                {naturalSearch.labels.join(' · ')}
                {naturalSearch.residualQuery ? ` · “${naturalSearch.residualQuery}”` : ''}
              </p>
            ) : null}
            {normalizedSearchQuery.length === 1 && !naturalSearch.understood ? (
              <p className="mt-2 text-xs text-text-muted">{copy.searchTooShort}</p>
            ) : searchMeta?.searchMode === 'canonical_fallback' ? (
              <p className="mt-2 text-xs text-text-muted">{copy.searchFallbackHint}</p>
            ) : null}
            {searchMeta?.sourceTruncated || searchMeta?.resultTruncated ? (
              <p className="mt-2 text-xs font-medium text-semantic-warning">{copy.searchTruncatedHint}</p>
            ) : null}
          </Surface>

          <TransactionSavedViews
            filters={workspaceFilters}
            onApply={applySavedView}
          />

          <Surface variant="secondary" radius="lg" className="p-4 sm:p-5" aria-label={copy.filters}>
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Filter className="h-4 w-4 text-text-muted" aria-hidden="true" />
              {copy.filters}
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.type}</p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={copy.type}>
                  {directionOptions.map((option) => {
                    const selected = directionFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => updateFilter('direction', option.value)}
                        className={`nf-interactive min-h-11 shrink-0 rounded-xl border px-4 text-sm font-medium ${selected ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary' : 'border-border-subtle bg-surface-default text-text-secondary hover:border-border-strong hover:text-text-primary'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.stage}</p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={copy.stage}>
                  {statusOptions.map((option) => {
                    const selected = statusFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => updateFilter('status', option.value)}
                        className={`nf-interactive min-h-11 shrink-0 rounded-xl border px-4 text-sm font-medium ${selected ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary' : 'border-border-subtle bg-surface-default text-text-secondary hover:border-border-strong hover:text-text-primary'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.period}</p>
                  {fromFilter || toFilter ? (
                    <button
                      type="button"
                      onClick={clearPeriod}
                      className="nf-interactive rounded-lg px-2 py-1 text-xs font-medium text-accent-primary hover:bg-accent-primary/10"
                    >
                      {copy.clearPeriod}
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.dateFrom}</span>
                    <input
                      type="date"
                      value={fromFilter}
                      max={toFilter || undefined}
                      onChange={(event) => updateDateFilter('from', event.target.value)}
                      className="h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm text-text-primary outline-none transition focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/10"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.dateTo}</span>
                    <input
                      type="date"
                      value={toFilter}
                      min={fromFilter || undefined}
                      onChange={(event) => updateDateFilter('to', event.target.value)}
                      className="h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm text-text-primary outline-none transition focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/10"
                    />
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.order}</p>
                <div className="flex gap-2" role="group" aria-label={copy.order}>
                  {([
                    { value: 'newest', label: copy.newest },
                    { value: 'oldest', label: copy.oldest },
                  ] as const).map((option) => {
                    const selected = orderFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => updateOrder(option.value)}
                        className={`nf-interactive min-h-11 rounded-xl border px-4 text-sm font-medium ${selected ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary' : 'border-border-subtle bg-surface-default text-text-secondary hover:border-border-strong hover:text-text-primary'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Surface>

          {errorKind === 'index' ? (
            <FirestoreIndexRemediationCard
              remediation={errorDetails?.remediation}
              requestId={errorDetails?.requestId}
              errorText={copy.indexError}
              onRetry={reloadFromStart}
            />
          ) : errorKind === 'cursor' || errorKind === 'generic' ? (
            <Surface variant="elevated" radius="lg" className="p-5" role="alert">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-warning/10 text-semantic-warning">
                    <AlertCircle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-text-primary">
                      {errorKind === 'cursor' ? copy.cursorErrorTitle : copy.errorTitle}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                      {errorKind === 'cursor' ? copy.cursorErrorText : copy.errorText}
                    </p>
                    {errorDetails?.requestId ? (
                      <p className="mt-2 text-xs font-mono text-text-muted">
                        {copy.supportCode}: {errorDetails.requestId}
                      </p>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  leadingIcon={<RefreshCw className="h-4 w-4" />}
                  onClick={reloadFromStart}
                  className="w-full shrink-0 sm:w-auto"
                >
                  {copy.retry}
                </Button>
              </div>
            </Surface>
          ) : null}

          {loading && items.length === 0 ? (
            <div className="space-y-3" aria-live="polite">
              {[1, 2, 3, 4].map((item) => (
                <Surface key={item} variant="elevated" radius="lg" className="animate-pulse p-4 sm:p-5">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 shrink-0 rounded-xl bg-surface-secondary" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-2/5 rounded bg-surface-secondary" />
                      <div className="h-3 w-3/5 rounded bg-surface-secondary" />
                    </div>
                    <div className="h-5 w-24 rounded bg-surface-secondary" />
                  </div>
                </Surface>
              ))}
            </div>
          ) : !errorKind && items.length === 0 ? (
            <Surface variant="secondary" radius="xl" className="px-6 py-12 text-center sm:py-16">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-elevated text-text-muted">
                <FilePenLine className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">
                {normalizedSearchQuery.length >= 2 ? copy.searchEmptyTitle : emptyState.title}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
                {normalizedSearchQuery.length >= 2 ? copy.searchEmptyText : emptyState.text}
              </p>
              {hasEffectiveCapability(accessState, 'finance.create_drafts') && statusFilter === 'all' ? (
                <Button
                  variant="primary"
                  size="lg"
                  className="mt-6"
                  leadingIcon={<Plus className="h-5 w-5" />}
                  onClick={() => navigate(APP_ROUTES.transactionCreate)}
                >
                  {copy.create}
                </Button>
              ) : null}
            </Surface>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const direction = String(item.transactionKind || item.direction || '');
                const directionUi = directionPresentation(direction, copy);
                const statusUi = statusPresentation(item, copy);
                const returned = isReturnedDraft(item);
                const metadata = [
                  formatDate(item.occurredAt, language),
                  item.accountName ? `${copy.account}: ${item.accountName}` : '',
                  item.categoryName ? `${copy.category}: ${item.categoryName}` : '',
                ].filter(Boolean);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openInspector(item.id)}
                    className="nf-interactive group w-full rounded-2xl border border-border-subtle bg-surface-elevated p-4 text-left hover:border-border-strong hover:bg-surface-secondary sm:p-5"
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${directionUi.iconClass}`}>
                        <directionUi.Icon className="h-5 w-5" aria-hidden="true" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <h2 className="truncate text-sm font-semibold text-text-primary sm:text-base">
                              {item.description || copy.noDescription}
                            </h2>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                              <span>{directionUi.label}</span>
                              {metadata.map((entry, index) => (
                                <span key={`${item.id}-meta-${index}`} className="inline-flex items-center gap-2">
                                  <span aria-hidden="true">·</span>
                                  <span>{entry}</span>
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-2">
                            <span className={`nf-financial-number text-base font-semibold ${directionUi.amountClass}`}>
                              {formatMoney(item.amountCents, direction, language)}
                            </span>
                            <span className={`inline-flex min-h-7 items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusUi.className}`}>
                              {statusUi.label}
                            </span>
                          </div>
                        </div>

                        {returned ? (
                          <div className="mt-3 flex items-start gap-2 rounded-xl border border-semantic-warning/15 bg-semantic-warning/5 px-3 py-2.5 text-xs leading-relaxed text-text-secondary">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-semantic-warning" aria-hidden="true" />
                            <span>{copy.returnedHint}</span>
                          </div>
                        ) : null}
                      </div>

                      <ChevronRight className="mt-3 hidden h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden="true" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {hasMore && items.length > 0 && !loading && !errorKind ? (
            <div className="flex justify-center pt-2">
              <Button
                variant="secondary"
                size="lg"
                disabled={loadingMore}
                leadingIcon={loadingMore ? <RefreshCw className="h-4 w-4 animate-spin" /> : undefined}
                onClick={() => {
                  if (!loadingMore && nextCursor) void loadData(nextCursor, undefined, epochRef.current);
                }}
              >
                {loadingMore ? copy.loadingMore : copy.loadMore}
              </Button>
            </div>
          ) : null}
        </div>
      </main>

      <TransactionInspector
        transactionId={inspectedTransactionId}
        onClose={closeInspector}
        onDiscarded={(transactionId) => {
          setItems((current) => current.filter((item) => item.id !== transactionId));
          setNotice(copy.draftDiscarded);
        }}
      />
    </div>
  );
}