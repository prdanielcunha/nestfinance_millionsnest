import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  FilePenLine,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { LedgerTransaction } from '../../../shared/finance/ledger/transaction';
import { Button, Surface } from '@/src/components/foundation';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import {
  transactionsService,
  type TransactionsActionSummary,
} from '@/src/services/transactionsService';
import { APP_ROUTES } from '@/src/app/router/routes';

type PriorityKind = 'correction' | 'review' | 'approved' | 'draft' | 'clear';
type Direction = 'income' | 'expense' | 'transfer';

type TodayCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  noEntityTitle: string;
  noEntityText: string;
  chooseEntity: string;
  attention: string;
  everythingClear: string;
  correctionTitle: (count: number) => string;
  correctionText: string;
  reviewTitle: (count: number) => string;
  reviewText: string;
  approvedTitle: (count: number) => string;
  approvedText: string;
  draftTitle: (count: number) => string;
  draftText: string;
  clearTitle: string;
  clearText: string;
  fixNow: string;
  reviewNow: string;
  openApprovals: string;
  finishDrafts: string;
  openTransactions: string;
  summaryTitle: string;
  returned: string;
  drafts: string;
  review: string;
  approved: string;
  quickTitle: string;
  income: string;
  expense: string;
  transfer: string;
  recentTitle: string;
  recentEmpty: string;
  recentFailed: string;
  summaryFailedTitle: string;
  summaryFailedText: string;
  retry: string;
  loading: string;
  trust: string;
  today: string;
  yesterday: string;
  statusDraft: string;
  statusReview: string;
  statusApproved: string;
  statusOther: string;
  incomeLabel: string;
  expenseLabel: string;
  transferLabel: string;
};

const COPY: Record<Language, TodayCopy> = {
  PT: {
    eyebrow: 'Hoje',
    title: 'O que precisa de você',
    subtitle: 'Comece pelo que destrava o financeiro agora. O restante pode esperar.',
    noEntityTitle: 'Escolha onde você vai trabalhar',
    noEntityText: 'Selecione uma entidade financeira para ver pendências, movimentações e próximos passos.',
    chooseEntity: 'Configurar entidade',
    attention: 'Prioridade agora',
    everythingClear: 'Tudo em dia',
    correctionTitle: (count) => `${count} ${count === 1 ? 'movimentação voltou para correção' : 'movimentações voltaram para correção'}`,
    correctionText: 'Esses itens já foram conferidos e precisam de um ajuste antes de seguir.',
    reviewTitle: (count) => `${count} ${count === 1 ? 'movimentação está pronta para conferência' : 'movimentações estão prontas para conferência'}`,
    reviewText: 'Confira os dados e decida o próximo passo.',
    approvedTitle: (count) => `${count} ${count === 1 ? 'movimentação está aprovada' : 'movimentações estão aprovadas'}`,
    approvedText: 'A aprovação foi registrada. O lançamento real continua bloqueado nesta fase.',
    draftTitle: (count) => `${count} ${count === 1 ? 'rascunho precisa ser terminado' : 'rascunhos precisam ser terminados'}`,
    draftText: 'Complete apenas o que falta e envie para conferência quando estiver pronto.',
    clearTitle: 'Não há pendências abertas agora',
    clearText: 'Você pode registrar uma nova entrada ou saída, ou consultar as movimentações recentes.',
    fixNow: 'Corrigir agora',
    reviewNow: 'Conferir agora',
    openApprovals: 'Ver aprovadas',
    finishDrafts: 'Continuar rascunhos',
    openTransactions: 'Ver movimentações',
    summaryTitle: 'Resumo do trabalho aberto',
    returned: 'Para corrigir',
    drafts: 'Rascunhos',
    review: 'Para conferir',
    approved: 'Aprovadas',
    quickTitle: 'Registrar rapidamente',
    income: 'Nova entrada',
    expense: 'Nova saída',
    transfer: 'Transferência',
    recentTitle: 'Atividade recente',
    recentEmpty: 'Ainda não há movimentações recentes nesta entidade.',
    recentFailed: 'Não foi possível carregar a atividade recente.',
    summaryFailedTitle: 'Não foi possível atualizar suas prioridades',
    summaryFailedText: 'Tente novamente. Nenhum dado foi alterado.',
    retry: 'Tentar novamente',
    loading: 'Atualizando o que precisa da sua atenção…',
    trust: 'Rascunhos, conferências e aprovações não alteram saldos. O lançamento contábil real permanece desativado.',
    today: 'Hoje',
    yesterday: 'Ontem',
    statusDraft: 'Rascunho',
    statusReview: 'Para conferir',
    statusApproved: 'Aprovada',
    statusOther: 'Em andamento',
    incomeLabel: 'Entrada',
    expenseLabel: 'Saída',
    transferLabel: 'Transferência',
  },
  EN: {
    eyebrow: 'Today',
    title: 'What needs your attention',
    subtitle: 'Start with what moves the finance workflow forward now. The rest can wait.',
    noEntityTitle: 'Choose where you want to work',
    noEntityText: 'Select a finance entity to see pending work, transactions, and next steps.',
    chooseEntity: 'Set up entity',
    attention: 'Priority now',
    everythingClear: 'All caught up',
    correctionTitle: (count) => `${count} ${count === 1 ? 'transaction needs a correction' : 'transactions need corrections'}`,
    correctionText: 'These items were already checked and need an adjustment before they can continue.',
    reviewTitle: (count) => `${count} ${count === 1 ? 'transaction is ready to be checked' : 'transactions are ready to be checked'}`,
    reviewText: 'Check the information and decide the next step.',
    approvedTitle: (count) => `${count} ${count === 1 ? 'transaction is approved' : 'transactions are approved'}`,
    approvedText: 'The approval is recorded. Real posting remains disabled in this phase.',
    draftTitle: (count) => `${count} ${count === 1 ? 'draft needs to be finished' : 'drafts need to be finished'}`,
    draftText: 'Complete only what is missing and send it for checking when ready.',
    clearTitle: 'There is no open work right now',
    clearText: 'You can record a new income or expense, or review recent transactions.',
    fixNow: 'Fix now',
    reviewNow: 'Check now',
    openApprovals: 'View approved',
    finishDrafts: 'Continue drafts',
    openTransactions: 'View transactions',
    summaryTitle: 'Open work summary',
    returned: 'Needs correction',
    drafts: 'Drafts',
    review: 'Needs checking',
    approved: 'Approved',
    quickTitle: 'Record quickly',
    income: 'New income',
    expense: 'New expense',
    transfer: 'Transfer',
    recentTitle: 'Recent activity',
    recentEmpty: 'There are no recent transactions for this entity yet.',
    recentFailed: 'Recent activity could not be loaded.',
    summaryFailedTitle: 'Your priorities could not be refreshed',
    summaryFailedText: 'Try again. No data was changed.',
    retry: 'Try again',
    loading: 'Refreshing what needs your attention…',
    trust: 'Drafts, checks, and approvals do not change balances. Real accounting posting remains disabled.',
    today: 'Today',
    yesterday: 'Yesterday',
    statusDraft: 'Draft',
    statusReview: 'Needs checking',
    statusApproved: 'Approved',
    statusOther: 'In progress',
    incomeLabel: 'Income',
    expenseLabel: 'Expense',
    transferLabel: 'Transfer',
  },
  ES: {
    eyebrow: 'Hoy',
    title: 'Lo que necesita tu atención',
    subtitle: 'Empieza por lo que hace avanzar el trabajo financiero ahora. Lo demás puede esperar.',
    noEntityTitle: 'Elige dónde vas a trabajar',
    noEntityText: 'Selecciona una entidad financiera para ver pendientes, movimientos y próximos pasos.',
    chooseEntity: 'Configurar entidad',
    attention: 'Prioridad ahora',
    everythingClear: 'Todo al día',
    correctionTitle: (count) => `${count} ${count === 1 ? 'movimiento volvió para corrección' : 'movimientos volvieron para corrección'}`,
    correctionText: 'Estos elementos ya fueron revisados y necesitan un ajuste antes de continuar.',
    reviewTitle: (count) => `${count} ${count === 1 ? 'movimiento está listo para revisión' : 'movimientos están listos para revisión'}`,
    reviewText: 'Revisa los datos y decide el siguiente paso.',
    approvedTitle: (count) => `${count} ${count === 1 ? 'movimiento está aprobado' : 'movimientos están aprobados'}`,
    approvedText: 'La aprobación quedó registrada. El asiento real continúa bloqueado en esta fase.',
    draftTitle: (count) => `${count} ${count === 1 ? 'borrador necesita terminarse' : 'borradores necesitan terminarse'}`,
    draftText: 'Completa solo lo que falta y envíalo para revisión cuando esté listo.',
    clearTitle: 'No hay pendientes abiertos ahora',
    clearText: 'Puedes registrar un nuevo ingreso o egreso, o consultar los movimientos recientes.',
    fixNow: 'Corregir ahora',
    reviewNow: 'Revisar ahora',
    openApprovals: 'Ver aprobados',
    finishDrafts: 'Continuar borradores',
    openTransactions: 'Ver movimientos',
    summaryTitle: 'Resumen del trabajo abierto',
    returned: 'Para corregir',
    drafts: 'Borradores',
    review: 'Para revisar',
    approved: 'Aprobados',
    quickTitle: 'Registrar rápidamente',
    income: 'Nuevo ingreso',
    expense: 'Nuevo egreso',
    transfer: 'Transferencia',
    recentTitle: 'Actividad reciente',
    recentEmpty: 'Todavía no hay movimientos recientes en esta entidad.',
    recentFailed: 'No fue posible cargar la actividad reciente.',
    summaryFailedTitle: 'No fue posible actualizar tus prioridades',
    summaryFailedText: 'Inténtalo de nuevo. Ningún dato fue modificado.',
    retry: 'Intentar de nuevo',
    loading: 'Actualizando lo que necesita tu atención…',
    trust: 'Los borradores, revisiones y aprobaciones no cambian saldos. El asiento contable real permanece desactivado.',
    today: 'Hoy',
    yesterday: 'Ayer',
    statusDraft: 'Borrador',
    statusReview: 'Para revisar',
    statusApproved: 'Aprobado',
    statusOther: 'En curso',
    incomeLabel: 'Ingreso',
    expenseLabel: 'Egreso',
    transferLabel: 'Transferencia',
  },
};

const EMPTY_SUMMARY: TransactionsActionSummary = {
  returnedCorrections: 0,
  simpleDrafts: 0,
  readyForReview: 0,
  approvedForPosting: 0,
  totalOpen: 0,
};

function localeFor(language: Language) {
  if (language === 'EN') return 'en-US';
  if (language === 'ES') return 'es-ES';
  return 'pt-BR';
}

function formatMoney(amountCents: number | undefined, language: Language) {
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: 'BRL',
  }).format((amountCents || 0) / 100);
}

function formatRelativeDate(value: unknown, language: Language, copy: TodayCopy) {
  const date = typeof value === 'string' || value instanceof Date ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const valueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((dayStart - valueStart) / 86_400_000);
  if (days === 0) return copy.today;
  if (days === 1) return copy.yesterday;
  return new Intl.DateTimeFormat(localeFor(language), { day: '2-digit', month: 'short' }).format(date);
}

function transactionDirection(transaction: LedgerTransaction): Direction {
  const kind = String((transaction as any).transactionKind || (transaction as any).direction || 'income');
  if (kind === 'expense') return 'expense';
  if (kind === 'transfer') return 'transfer';
  return 'income';
}

export function TodayActionCenter() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COPY[language];

  const organizationId = accessState.organization?.id || '';
  const canCreate = hasEffectiveCapability(accessState, 'finance.create_drafts');

  const [summary, setSummary] = useState<TransactionsActionSummary | null>(null);
  const [recent, setRecent] = useState<LedgerTransaction[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [recentFailed, setRecentFailed] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!organizationId || !activeFinanceEntityId) return;
    setSummaryLoading(true);
    setSummaryFailed(false);
    try {
      const result = await transactionsService.summary(organizationId, activeFinanceEntityId);
      setSummary(result.summary);
    } catch {
      setSummaryFailed(true);
    } finally {
      setSummaryLoading(false);
    }
  }, [activeFinanceEntityId, organizationId]);

  const loadRecent = useCallback(async () => {
    if (!organizationId || !activeFinanceEntityId) return;
    setRecentLoading(true);
    setRecentFailed(false);
    try {
      const result = await transactionsService.list(organizationId, activeFinanceEntityId, undefined, undefined, 5);
      setRecent(result.items);
    } catch {
      setRecentFailed(true);
    } finally {
      setRecentLoading(false);
    }
  }, [activeFinanceEntityId, organizationId]);

  useEffect(() => {
    if (!organizationId || !activeFinanceEntityId) {
      setSummary(null);
      setRecent([]);
      return;
    }
    void loadSummary();
    void loadRecent();
  }, [activeFinanceEntityId, loadRecent, loadSummary, organizationId]);

  const effectiveSummary = summary || EMPTY_SUMMARY;

  const priority = useMemo(() => {
    if (effectiveSummary.returnedCorrections > 0) {
      return { kind: 'correction' as PriorityKind, count: effectiveSummary.returnedCorrections };
    }
    if (effectiveSummary.readyForReview > 0) {
      return { kind: 'review' as PriorityKind, count: effectiveSummary.readyForReview };
    }
    if (effectiveSummary.approvedForPosting > 0) {
      return { kind: 'approved' as PriorityKind, count: effectiveSummary.approvedForPosting };
    }
    if (effectiveSummary.simpleDrafts > 0) {
      return { kind: 'draft' as PriorityKind, count: effectiveSummary.simpleDrafts };
    }
    return { kind: 'clear' as PriorityKind, count: 0 };
  }, [effectiveSummary]);

  const priorityPresentation = useMemo(() => {
    switch (priority.kind) {
      case 'correction':
        return {
          title: copy.correctionTitle(priority.count),
          text: copy.correctionText,
          action: copy.fixNow,
          route: APP_ROUTES.transactions,
          icon: AlertTriangle,
          iconClass: 'bg-semantic-warning/10 text-semantic-warning',
        };
      case 'review':
        return {
          title: copy.reviewTitle(priority.count),
          text: copy.reviewText,
          action: copy.reviewNow,
          route: APP_ROUTES.review,
          icon: FileCheck2,
          iconClass: 'bg-accent-primary/10 text-accent-primary',
        };
      case 'approved':
        return {
          title: copy.approvedTitle(priority.count),
          text: copy.approvedText,
          action: copy.openApprovals,
          route: APP_ROUTES.review,
          icon: CheckCircle2,
          iconClass: 'bg-semantic-success/10 text-semantic-success',
        };
      case 'draft':
        return {
          title: copy.draftTitle(priority.count),
          text: copy.draftText,
          action: copy.finishDrafts,
          route: APP_ROUTES.transactions,
          icon: FilePenLine,
          iconClass: 'bg-surface-elevated text-text-secondary',
        };
      default:
        return {
          title: copy.clearTitle,
          text: copy.clearText,
          action: copy.openTransactions,
          route: APP_ROUTES.transactions,
          icon: Sparkles,
          iconClass: 'bg-semantic-success/10 text-semantic-success',
        };
    }
  }, [copy, priority]);

  if (!activeFinanceEntityId) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
        <Surface variant="elevated" radius="xl" className="w-full p-6 text-center sm:p-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
            <Clock3 className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">{copy.noEntityTitle}</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">{copy.noEntityText}</p>
          <Button variant="primary" size="lg" className="mt-6" onClick={() => navigate(APP_ROUTES.financeSettings)}>
            {copy.chooseEntity}
          </Button>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-text-primary sm:text-3xl">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{copy.subtitle}</p>
        </div>
        {activeFinanceEntityName ? (
          <span className="self-start rounded-xl border border-border-subtle bg-surface-secondary px-3 py-2 text-xs font-medium text-text-secondary sm:self-auto">
            {activeFinanceEntityName}
          </span>
        ) : null}
      </header>

      {summaryFailed ? (
        <Surface variant="elevated" radius="lg" className="p-5" role="alert">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-warning/10 text-semantic-warning">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">{copy.summaryFailedTitle}</h2>
                <p className="mt-1 text-sm text-text-secondary">{copy.summaryFailedText}</p>
              </div>
            </div>
            <Button variant="secondary" leadingIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void loadSummary()}>
              {copy.retry}
            </Button>
          </div>
        </Surface>
      ) : summaryLoading && !summary ? (
        <Surface variant="glass" radius="xl" className="p-6" aria-live="polite">
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <RefreshCw className="h-5 w-5 animate-spin text-accent-primary" aria-hidden="true" />
            {copy.loading}
          </div>
        </Surface>
      ) : (
        <Surface variant="glass" radius="xl" className="overflow-hidden p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${priorityPresentation.iconClass}`}>
                <priorityPresentation.icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {priority.kind === 'clear' ? copy.everythingClear : copy.attention}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-primary sm:text-xl">{priorityPresentation.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">{priorityPresentation.text}</p>
              </div>
            </div>
            <Button
              variant={priority.kind === 'clear' ? 'secondary' : 'primary'}
              size="lg"
              trailingIcon={<ChevronRight className="h-4 w-4" />}
              className="w-full shrink-0 sm:w-auto"
              onClick={() => navigate(priorityPresentation.route)}
            >
              {priorityPresentation.action}
            </Button>
          </div>
        </Surface>
      )}

      <section aria-labelledby="today-summary-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="today-summary-title" className="text-sm font-semibold text-text-primary">{copy.summaryTitle}</h2>
          {!summaryLoading && !summaryFailed ? (
            <button
              type="button"
              className="nf-interactive nf-touch-target rounded-xl px-3 text-xs font-medium text-text-muted hover:bg-surface-secondary hover:text-text-primary"
              onClick={() => void loadSummary()}
              aria-label={copy.retry}
            >
              <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
              {copy.retry}
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: copy.returned, value: effectiveSummary.returnedCorrections, emphasis: effectiveSummary.returnedCorrections > 0 ? 'text-semantic-warning' : 'text-text-primary' },
            { label: copy.review, value: effectiveSummary.readyForReview, emphasis: effectiveSummary.readyForReview > 0 ? 'text-accent-primary' : 'text-text-primary' },
            { label: copy.approved, value: effectiveSummary.approvedForPosting, emphasis: effectiveSummary.approvedForPosting > 0 ? 'text-semantic-success' : 'text-text-primary' },
            { label: copy.drafts, value: effectiveSummary.simpleDrafts, emphasis: 'text-text-primary' },
          ].map((item) => (
            <Surface key={item.label} variant="secondary" radius="lg" className="p-4">
              <div className={`nf-financial-number text-2xl font-semibold tracking-tight ${item.emphasis}`}>{item.value}</div>
              <div className="mt-1 text-xs font-medium text-text-muted">{item.label}</div>
            </Surface>
          ))}
        </div>
      </section>

      {canCreate ? (
        <section aria-labelledby="today-quick-title">
          <h2 id="today-quick-title" className="mb-3 text-sm font-semibold text-text-primary">{copy.quickTitle}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="justify-start"
              leadingIcon={<ArrowDownLeft className="h-5 w-5 text-semantic-success" />}
              onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=income`)}
            >
              {copy.income}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="justify-start"
              leadingIcon={<ArrowUpRight className="h-5 w-5 text-semantic-danger" />}
              onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=expense`)}
            >
              {copy.expense}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="justify-start"
              leadingIcon={<ArrowRightLeft className="h-5 w-5 text-accent-primary" />}
              onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=transfer`)}
            >
              {copy.transfer}
            </Button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="today-recent-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="today-recent-title" className="text-sm font-semibold text-text-primary">{copy.recentTitle}</h2>
          <Button variant="ghost" trailingIcon={<ChevronRight className="h-4 w-4" />} onClick={() => navigate(APP_ROUTES.transactions)}>
            {copy.openTransactions}
          </Button>
        </div>

        <Surface variant="default" radius="lg" className="overflow-hidden">
          {recentLoading && recent.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center gap-2 p-5 text-sm text-text-secondary" aria-live="polite">
              <RefreshCw className="h-4 w-4 animate-spin text-accent-primary" aria-hidden="true" />
              {copy.loading}
            </div>
          ) : recentFailed ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <p className="text-sm text-text-secondary">{copy.recentFailed}</p>
              <Button variant="ghost" className="mt-2" leadingIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void loadRecent()}>
                {copy.retry}
              </Button>
            </div>
          ) : recent.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-muted">{copy.recentEmpty}</div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {recent.map((transaction) => {
                const direction = transactionDirection(transaction);
                const status = String((transaction as any).status || '');
                const directionLabel = direction === 'expense' ? copy.expenseLabel : direction === 'transfer' ? copy.transferLabel : copy.incomeLabel;
                const statusLabel = status === 'draft'
                  ? copy.statusDraft
                  : status === 'ready_for_review'
                    ? copy.statusReview
                    : status === 'approved_for_posting'
                      ? copy.statusApproved
                      : copy.statusOther;
                const DirectionIcon = direction === 'expense' ? ArrowUpRight : direction === 'transfer' ? ArrowRightLeft : ArrowDownLeft;
                const directionClass = direction === 'expense' ? 'text-semantic-danger bg-semantic-danger/10' : direction === 'transfer' ? 'text-accent-primary bg-accent-primary/10' : 'text-semantic-success bg-semantic-success/10';

                return (
                  <div key={(transaction as any).id} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${directionClass}`}>
                      <DirectionIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-text-primary">{(transaction as any).description || directionLabel}</span>
                        <span className="hidden shrink-0 rounded-md bg-surface-secondary px-2 py-1 text-[10px] font-semibold text-text-muted sm:inline">{statusLabel}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                        <span>{directionLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeDate((transaction as any).occurredAt, language, copy)}</span>
                      </div>
                    </div>
                    <div className="nf-financial-number shrink-0 text-sm font-semibold text-text-primary">
                      {formatMoney((transaction as any).amountCents, language)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Surface>
      </section>

      <p className="flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-secondary/60 px-4 py-3 text-xs leading-relaxed text-text-muted">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-semantic-success" aria-hidden="true" />
        {copy.trust}
      </p>
    </div>
  );
}

export default TodayActionCenter;
