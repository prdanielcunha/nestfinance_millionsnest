import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  FileCheck2,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  ShieldX,
  UserRound,
} from 'lucide-react';
import type { AuditTimelineItem } from '../../../shared/finance/auditReadModel.js';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { auditService } from '@/src/services/auditService';

type AuditCopy = {
  area: string;
  title: string;
  subtitle: string;
  back: string;
  loading: string;
  retry: string;
  loadMore: string;
  accessDeniedTitle: string;
  accessDeniedBody: string;
  errorTitle: string;
  errorBody: string;
  total: string;
  transactions: string;
  documents: string;
  controls: string;
  recentTitle: string;
  recentText: string;
  filter: string;
  all: string;
  emptyTitle: string;
  emptyText: string;
  emptyFilter: string;
  truncated: string;
  details: string;
  actor: string;
  when: string;
  item: string;
  request: string;
  internalAction: string;
  versions: string;
  line: string;
  reason: string;
  systemActor: string;
  teamActor: string;
  unknownAction: string;
  trustTitle: string;
  trustText: string;
  resourceLabels: Record<string, string>;
  actionLabels: Record<string, string>;
};

const COPY: Record<Language, AuditCopy> = {
  PT: {
    area: 'Auditoria',
    title: 'Histórico e auditoria',
    subtitle: 'Veja quem fez cada ação, quando aconteceu e a qual item ela pertence. Os detalhes técnicos ficam disponíveis somente quando ajudam na conferência.',
    back: 'Voltar',
    loading: 'Carregando histórico verificável…',
    retry: 'Tentar novamente',
    loadMore: 'Carregar mais',
    accessDeniedTitle: 'Acesso somente autorizado',
    accessDeniedBody: 'Seu perfil não pode visualizar a auditoria financeira desta igreja.',
    errorTitle: 'Não foi possível carregar a auditoria',
    errorBody: 'Tente novamente. Nenhum dado financeiro foi alterado.',
    total: 'Eventos recentes',
    transactions: 'Movimentações',
    documents: 'Documentos',
    controls: 'Contagens e conciliações',
    recentTitle: 'Atividade registrada',
    recentText: 'A ordem vem da trilha canônica do NestFinance. Esta tela não altera lançamentos, saldos ou o próprio histórico.',
    filter: 'Filtrar por tipo',
    all: 'Tudo',
    emptyTitle: 'Ainda não há atividade registrada',
    emptyText: 'Quando alguém criar, revisar ou conferir itens financeiros, o histórico aparecerá aqui.',
    emptyFilter: 'Nenhum evento corresponde a este filtro.',
    truncated: 'Há mais eventos neste histórico. Carregue a próxima página quando precisar.',
    details: 'Detalhes de auditoria',
    actor: 'Quem',
    when: 'Quando',
    item: 'Item',
    request: 'Requisição',
    internalAction: 'Ação registrada',
    versions: 'Versão',
    line: 'Linha do extrato',
    reason: 'Motivo',
    systemActor: 'Sistema NestFinance',
    teamActor: 'Usuário da equipe',
    unknownAction: 'Atividade registrada',
    trustTitle: 'Histórico somente leitura',
    trustText: 'Esta área lê a trilha canônica da entidade atual. Ela não cria, edita nem apaga eventos e não expõe hashes ou chaves de idempotência na interface.',
    resourceLabels: {
      transaction: 'Movimentação',
      universal_evidence: 'Documento',
      count_session: 'Contagem',
      reconciliation: 'Conciliação',
      period_close_review: 'Revisão de fechamento',
      allocation: 'Rateio',
      journal: 'Diário',
      unknown: 'Item financeiro',
    },
    actionLabels: {
      'transaction.created': 'Movimentação criada',
      'transaction.updated': 'Movimentação atualizada',
      'transaction.submitted': 'Movimentação enviada para conferência',
      'transaction.returned': 'Movimentação devolvida para correção',
      'transaction.returned_to_draft': 'Movimentação devolvida para correção',
      'transaction.approved_for_posting': 'Movimentação aprovada para o próximo passo',
      'transaction.approval_invalidated': 'Aprovação invalidada',
      'transaction.reconciled': 'Conferência com extrato registrada',
      'transaction.reconciliation_reversed': 'Conferência com extrato desfeita',
      'period.close_review_confirmed': 'Revisão de fechamento registrada',
      'evidence.classified': 'Documento identificado',
      'evidence.reviewed': 'Documento conferido',
      'count.first_count_saved': 'Primeira contagem registrada',
      'count.second_count_sealed': 'Segunda contagem concluída',
      'count.recount_started': 'Nova conferência de contagem iniciada',
      'count.recount_submitted': 'Nova conferência de contagem concluída',
    },
  },
  EN: {
    area: 'Audit',
    title: 'History & audit',
    subtitle: 'See who performed each action, when it happened, and which item it belongs to. Technical detail stays available only when it helps verification.',
    back: 'Back',
    loading: 'Loading verifiable history…',
    retry: 'Try again',
    loadMore: 'Load more',
    accessDeniedTitle: 'Authorized access only',
    accessDeniedBody: 'Your current role cannot view financial audit history for this church.',
    errorTitle: 'Audit history could not be loaded',
    errorBody: 'Try again. No financial data was changed.',
    total: 'Recent events',
    transactions: 'Transactions',
    documents: 'Documents',
    controls: 'Counts & reconciliation',
    recentTitle: 'Recorded activity',
    recentText: 'Ordering comes from NestFinance canonical history. This screen does not change transactions, balances, or the audit trail itself.',
    filter: 'Filter by type',
    all: 'All',
    emptyTitle: 'No activity has been recorded yet',
    emptyText: 'When someone creates, reviews, or checks financial items, the history will appear here.',
    emptyFilter: 'No event matches this filter.',
    truncated: 'There are more events in this history. Load the next page when needed.',
    details: 'Audit details',
    actor: 'Who',
    when: 'When',
    item: 'Item',
    request: 'Request',
    internalAction: 'Recorded action',
    versions: 'Version',
    line: 'Statement line',
    reason: 'Reason',
    systemActor: 'NestFinance system',
    teamActor: 'Team member',
    unknownAction: 'Recorded activity',
    trustTitle: 'Read-only history',
    trustText: 'This area reads the canonical trail for the current entity. It cannot create, edit, or delete events and does not expose hashes or idempotency keys in the interface.',
    resourceLabels: {
      transaction: 'Transaction',
      universal_evidence: 'Document',
      count_session: 'Count',
      reconciliation: 'Reconciliation',
      period_close_review: 'Close review',
      allocation: 'Allocation',
      journal: 'Journal',
      unknown: 'Financial item',
    },
    actionLabels: {
      'transaction.created': 'Transaction created',
      'transaction.updated': 'Transaction updated',
      'transaction.submitted': 'Transaction sent for review',
      'transaction.returned': 'Transaction returned for correction',
      'transaction.returned_to_draft': 'Transaction returned for correction',
      'transaction.approved_for_posting': 'Transaction approved for the next step',
      'transaction.approval_invalidated': 'Approval invalidated',
      'transaction.reconciled': 'Statement check recorded',
      'transaction.reconciliation_reversed': 'Statement check undone',
      'period.close_review_confirmed': 'Close review recorded',
      'evidence.classified': 'Document identified',
      'evidence.reviewed': 'Document reviewed',
      'count.first_count_saved': 'First count recorded',
      'count.second_count_sealed': 'Second count completed',
      'count.recount_started': 'Count recheck started',
      'count.recount_submitted': 'Count recheck completed',
    },
  },
  ES: {
    area: 'Auditoría',
    title: 'Historial y auditoría',
    subtitle: 'Vea quién realizó cada acción, cuándo ocurrió y a qué elemento pertenece. Los detalles técnicos aparecen solo cuando ayudan a la revisión.',
    back: 'Volver',
    loading: 'Cargando historial verificable…',
    retry: 'Intentar de nuevo',
    loadMore: 'Cargar más',
    accessDeniedTitle: 'Acceso solo autorizado',
    accessDeniedBody: 'Su perfil no puede ver la auditoría financiera de esta iglesia.',
    errorTitle: 'No fue posible cargar la auditoría',
    errorBody: 'Inténtelo de nuevo. Ningún dato financiero fue modificado.',
    total: 'Eventos recientes',
    transactions: 'Movimientos',
    documents: 'Documentos',
    controls: 'Conteos y conciliación',
    recentTitle: 'Actividad registrada',
    recentText: 'El orden proviene del historial canónico de NestFinance. Esta pantalla no cambia movimientos, saldos ni el propio historial.',
    filter: 'Filtrar por tipo',
    all: 'Todo',
    emptyTitle: 'Todavía no hay actividad registrada',
    emptyText: 'Cuando alguien cree, revise o compruebe elementos financieros, el historial aparecerá aquí.',
    emptyFilter: 'Ningún evento coincide con este filtro.',
    truncated: 'Hay más eventos en este historial. Carga la siguiente página cuando la necesites.',
    details: 'Detalles de auditoría',
    actor: 'Quién',
    when: 'Cuándo',
    item: 'Elemento',
    request: 'Solicitud',
    internalAction: 'Acción registrada',
    versions: 'Versión',
    line: 'Línea del extracto',
    reason: 'Motivo',
    systemActor: 'Sistema NestFinance',
    teamActor: 'Usuario del equipo',
    unknownAction: 'Actividad registrada',
    trustTitle: 'Historial de solo lectura',
    trustText: 'Esta área lee el historial canónico de la entidad actual. No crea, edita ni elimina eventos y no expone hashes ni claves de idempotencia en la interfaz.',
    resourceLabels: {
      transaction: 'Movimiento',
      universal_evidence: 'Documento',
      count_session: 'Conteo',
      reconciliation: 'Conciliación',
      period_close_review: 'Revisión de cierre',
      allocation: 'Distribución',
      journal: 'Diario',
      unknown: 'Elemento financiero',
    },
    actionLabels: {
      'transaction.created': 'Movimiento creado',
      'transaction.updated': 'Movimiento actualizado',
      'transaction.submitted': 'Movimiento enviado a revisión',
      'transaction.returned': 'Movimiento devuelto para corrección',
      'transaction.returned_to_draft': 'Movimiento devuelto para corrección',
      'transaction.approved_for_posting': 'Movimiento aprobado para el siguiente paso',
      'transaction.approval_invalidated': 'Aprobación invalidada',
      'transaction.reconciled': 'Comprobación con extracto registrada',
      'transaction.reconciliation_reversed': 'Comprobación con extracto deshecha',
      'period.close_review_confirmed': 'Revisión de cierre registrada',
      'evidence.classified': 'Documento identificado',
      'evidence.reviewed': 'Documento revisado',
      'count.first_count_saved': 'Primer conteo registrado',
      'count.second_count_sealed': 'Segundo conteo concluido',
      'count.recount_started': 'Nueva revisión del conteo iniciada',
      'count.recount_submitted': 'Nueva revisión del conteo concluida',
    },
  },
};

function formatDate(value: string | null, language: Language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function actorLabel(item: AuditTimelineItem, copy: AuditCopy) {
  if (item.actorKind === 'system') return copy.systemActor;
  return item.actorDisplayName || copy.teamActor;
}

function resourceLabel(resource: string, copy: AuditCopy) {
  return copy.resourceLabels[resource] || copy.resourceLabels.unknown;
}

function actionLabel(action: string, copy: AuditCopy) {
  return copy.actionLabels[action] || copy.unknownAction;
}

export default function AuditPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];

  if (
    accessState.status === 'initializing' ||
    accessState.status === 'authenticated_unresolved'
  ) {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.view')) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center border-t border-border-subtle bg-surface-base p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
          <ShieldX className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-text-primary">{copy.accessDeniedTitle}</h1>
        <p className="max-w-sm text-sm leading-relaxed text-text-muted">{copy.accessDeniedBody}</p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <AuditContent />
    </FinanceContextGuard>
  );
}

function AuditContent() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COPY[language];

  const [items, setItems] = useState<AuditTimelineItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('all');

  const organizationId = accessState.organizationId || '';

  const load = async (cursor?: string) => {
    if (!organizationId || !activeFinanceEntityId) return;
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setFailed(false);
    try {
      const response = await auditService.list(organizationId, activeFinanceEntityId, cursor, 50);
      setItems((current) => cursor ? [...current, ...response.items] : response.items);
      setTruncated(response.hasMore);
      setNextCursor(response.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      if (cursor) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setNextCursor(undefined);
    setTruncated(false);
    setFilter('all');
    setFailed(false);
    if (organizationId && activeFinanceEntityId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId]);

  const resources = useMemo(
    () => Array.from(new Set(items.map((item) => item.resource))).sort(),
    [items],
  );
  const filtered = useMemo(
    () => filter === 'all' ? items : items.filter((item) => item.resource === filter),
    [filter, items],
  );
  const summary = useMemo(() => ({
    total: items.length,
    transactions: items.filter((item) => item.resource === 'transaction').length,
    documents: items.filter((item) => item.resource === 'universal_evidence').length,
    controls: items.filter((item) =>
      item.resource === 'count_session' || item.resource === 'reconciliation' || item.resource === 'period_close_review',
    ).length,
  }), [items]);

  if (failed && items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.area} />
        <div className="flex flex-1 items-center justify-center p-4 md:p-6">
          <Surface variant="elevated" radius="xl" role="alert" className="w-full max-w-md p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-semantic-danger" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-semibold text-text-primary">{copy.errorTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.errorBody}</p>
            <Button className="mt-6" fullWidth onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {copy.retry}
            </Button>
          </Surface>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.area} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="flex items-start gap-3">
            <Button
              variant="ghost"
              className="!min-h-12 !w-12 !px-0"
              aria-label={copy.back}
              onClick={() => navigate(APP_ROUTES.finance)}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0 pt-1">
              <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-accent-primary" aria-hidden="true" />
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.title}</h1>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
            </div>
          </header>

          {loading && items.length === 0 ? (
            <Surface variant="glass" radius="xl" className="p-6" aria-live="polite">
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <RefreshCw className="h-5 w-5 animate-spin text-accent-primary" aria-hidden="true" />
                {copy.loading}
              </div>
            </Surface>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={copy.title}>
                {[
                  { label: copy.total, value: summary.total },
                  { label: copy.transactions, value: summary.transactions },
                  { label: copy.documents, value: summary.documents },
                  { label: copy.controls, value: summary.controls },
                ].map((metric) => (
                  <Surface key={metric.label} variant="elevated" radius="lg" className="p-4 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{metric.value}</p>
                  </Surface>
                ))}
              </section>

              <Surface variant="glass" radius="xl" className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">{copy.recentTitle}</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.recentText}</p>
                  </div>
                  <label className="flex min-w-52 flex-col gap-2 text-xs font-semibold text-text-muted">
                    {copy.filter}
                    <select
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      className="min-h-12 rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-primary outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                    >
                      <option value="all">{copy.all}</option>
                      {resources.map((resource) => (
                        <option key={resource} value={resource}>{resourceLabel(resource, copy)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </Surface>

              {items.length === 0 ? (
                <Surface variant="elevated" radius="xl" className="p-8 text-center">
                  <Activity className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true" />
                  <h2 className="mt-4 text-base font-semibold text-text-primary">{copy.emptyTitle}</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">{copy.emptyText}</p>
                </Surface>
              ) : filtered.length === 0 ? (
                <Surface variant="elevated" radius="lg" className="p-5 text-sm text-text-muted">
                  {copy.emptyFilter}
                </Surface>
              ) : (
                <section className="flex flex-col gap-3" aria-label={copy.recentTitle}>
                  {filtered.map((item) => (
                    <Surface key={item.eventId} variant="elevated" radius="lg" className="overflow-hidden">
                      <div className="flex items-start gap-4 p-4 sm:p-5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-text-secondary">
                          <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-primary">{actionLabel(item.action, copy)}</p>
                              <p className="mt-1 text-xs text-text-muted">
                                {resourceLabel(item.resource, copy)}
                                {item.resourceId ? ` · ${item.resourceId}` : ''}
                              </p>
                            </div>
                            <p className="shrink-0 text-xs text-text-muted">{formatDate(item.occurredAt, language)}</p>
                          </div>

                          <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                            <UserRound className="h-4 w-4 text-text-muted" aria-hidden="true" />
                            {actorLabel(item, copy)}
                          </div>

                          <details className="mt-4 border-t border-border-subtle pt-3">
                            <summary className="cursor-pointer select-none text-xs font-semibold text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary">
                              {copy.details}
                            </summary>
                            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                              <div>
                                <dt className="font-semibold text-text-muted">{copy.actor}</dt>
                                <dd className="mt-1 break-words text-text-secondary">{actorLabel(item, copy)}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-text-muted">{copy.when}</dt>
                                <dd className="mt-1 text-text-secondary">{formatDate(item.occurredAt, language)}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-text-muted">{copy.item}</dt>
                                <dd className="mt-1 break-all text-text-secondary">{item.resourceId || '—'}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-text-muted">{copy.request}</dt>
                                <dd className="mt-1 break-all text-text-secondary">{item.requestId || '—'}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-text-muted">{copy.internalAction}</dt>
                                <dd className="mt-1 break-all text-text-secondary">{item.action}</dd>
                              </div>
                              {(item.metadata.versionBefore !== undefined || item.metadata.versionAfter !== undefined) ? (
                                <div>
                                  <dt className="font-semibold text-text-muted">{copy.versions}</dt>
                                  <dd className="mt-1 text-text-secondary">
                                    {item.metadata.versionBefore ?? '—'} → {item.metadata.versionAfter ?? '—'}
                                  </dd>
                                </div>
                              ) : null}
                              {item.metadata.lineNumber !== undefined ? (
                                <div>
                                  <dt className="font-semibold text-text-muted">{copy.line}</dt>
                                  <dd className="mt-1 text-text-secondary">{item.metadata.lineNumber}</dd>
                                </div>
                              ) : null}
                              {item.metadata.periodKey ? (
                                <div>
                                  <dt className="font-semibold text-text-muted">{copy.resourceLabels.period_close_review || copy.item}</dt>
                                  <dd className="mt-1 text-text-secondary">{item.metadata.periodKey}</dd>
                                </div>
                              ) : null}
                              {(item.metadata.reason || item.metadata.reasonCode) ? (
                                <div>
                                  <dt className="font-semibold text-text-muted">{copy.reason}</dt>
                                  <dd className="mt-1 break-words text-text-secondary">
                                    {item.metadata.reason || item.metadata.reasonCode}
                                  </dd>
                                </div>
                              ) : null}
                            </dl>
                          </details>
                        </div>
                      </div>
                    </Surface>
                  ))}
                </section>
              )}

              {truncated && nextCursor ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-center text-xs text-text-muted">{copy.truncated}</p>
                  <Button
                    variant="secondary"
                    disabled={loadingMore}
                    onClick={() => void load(nextCursor)}
                  >
                    {loadingMore ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {copy.loadMore}
                  </Button>
                </div>
              ) : null}

              <Surface variant="subtle" radius="lg" className="flex gap-3 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-semantic-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{copy.trustTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.trustText}</p>
                </div>
              </Surface>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
