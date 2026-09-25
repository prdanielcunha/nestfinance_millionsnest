import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  Landmark,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  PeriodCloseBlocker,
  PeriodCloseBlockerCode,
  PeriodCloseReadinessResponse,
  PeriodCloseReviewChangedArea,
} from '../../../shared/finance/periodCloseReadiness.js';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { periodCloseService } from '@/src/services/periodCloseService';
import { AccountantPackagePanel } from './AccountantPackagePanel';
import type {
  ReportMetricComparison,
  ReportRateComparison,
  ReportsIntelligenceResponse,
} from '../../../shared/finance/reportsIntelligence.js';

type ReportsCopy = {
  area: string;
  title: string;
  subtitle: string;
  back: string;
  loading: string;
  retry: string;
  accessDeniedTitle: string;
  accessDeniedBody: string;
  errorTitle: string;
  errorBody: string;
  month: string;
  capturedIncome: string;
  capturedExpense: string;
  transactions: string;
  posted: string;
  capturedHint: string;
  comparisonTitle: string;
  comparisonBody: (period: string) => string;
  comparisonPrevious: string;
  comparisonNoBase: string;
  comparisonSame: string;
  qualityTitle: string;
  qualityBody: string;
  postingRate: string;
  countMatchedRate: string;
  documentReviewedRate: string;
  reconciliationRate: string;
  deterministicNote: string;
  notApplicable: string;
  statusAttention: string;
  statusReady: string;
  statusAttentionBody: (count: number) => string;
  statusReadyBody: string;
  officialLocked: string;
  officialLockedBody: string;
  nextActions: string;
  noBlockers: string;
  noBlockersBody: string;
  reviewAction: string;
  reviewReadonly: string;
  reviewConfirmTitle: string;
  reviewConfirmBody: string;
  reviewConfirmAction: string;
  reviewCancel: string;
  reviewSaving: string;
  reviewError: string;
  reviewRegisteredTitle: string;
  reviewRegisteredBody: (name: string, date: string) => string;
  reviewSourceBound: string;
  reviewOutdatedTitle: string;
  reviewOutdatedBody: (name: string, date: string) => string;
  reviewChangedLabel: string;
  reviewChangedAreas: Record<PeriodCloseReviewChangedArea, string>;
  operationalTitle: string;
  operationalBody: string;
  transactionPipeline: string;
  counts: string;
  documents: string;
  reconciliation: string;
  draft: string;
  review: string;
  approved: string;
  postedLabel: string;
  matched: string;
  divergent: string;
  incomplete: string;
  reviewed: string;
  waitingReview: string;
  uploads: string;
  bankAccounts: string;
  reconciled: string;
  unreconciled: string;
  sourceTitle: string;
  sourceBody: string;
  blockerAction: string;
  blockerLabels: Record<PeriodCloseBlockerCode, string>;
};

const COPY: Record<Language, ReportsCopy> = {
  PT: {
    area: 'Relatórios',
    title: 'Relatórios e fechamento',
    subtitle: 'Veja o mês como ele realmente está antes de fechar: movimentações, contagens, documentos e conciliação reunidos em uma visão operacional verificável.',
    back: 'Voltar',
    loading: 'Conferindo o período nas fontes do NestFinance…',
    retry: 'Tentar novamente',
    accessDeniedTitle: 'Acesso somente autorizado',
    accessDeniedBody: 'Seu perfil não pode visualizar os relatórios financeiros desta igreja.',
    errorTitle: 'Não foi possível conferir este período',
    errorBody: 'Tente novamente. Nenhum lançamento, saldo ou fechamento foi alterado.',
    month: 'Período',
    capturedIncome: 'Entradas registradas',
    capturedExpense: 'Saídas registradas',
    transactions: 'Movimentações',
    posted: 'Lançadas no financeiro',
    capturedHint: 'Valores registrados no período; não são um demonstrativo contábil oficial.',
    comparisonTitle: 'Leitura comparativa',
    comparisonBody: (period) => `Comparação objetiva com ${period}, usando o mesmo escopo e as mesmas fontes canônicas.`,
    comparisonPrevious: 'Mês anterior',
    comparisonNoBase: 'Sem base comparável',
    comparisonSame: 'Sem variação',
    qualityTitle: 'Qualidade operacional',
    qualityBody: 'Taxas de conclusão e conferência. Elas mostram a qualidade do processo, não desempenho contábil.',
    postingRate: 'Movimentações postadas',
    countMatchedRate: 'Contagens conferidas',
    documentReviewedRate: 'Documentos conferidos',
    reconciliationRate: 'Conciliação bancária',
    deterministicNote: 'As comparações descrevem diferenças observadas. O NestFinance não atribui causa, previsão ou julgamento a essas variações.',
    notApplicable: 'Não se aplica',
    statusAttention: 'Este mês ainda precisa de atenção',
    statusReady: 'Operação pronta para revisão de fechamento',
    statusAttentionBody: (count) => count === 1 ? 'Há 1 pendência objetiva antes da revisão final.' : 'Há ' + count + ' pendências objetivas antes da revisão final.',
    statusReadyBody: 'Nenhuma pendência operacional foi encontrada no escopo que o NestFinance consegue provar hoje.',
    officialLocked: 'Fechamento oficial protegido',
    officialLockedBody: 'O NestFinance ainda não declara o período como fechado nem emite relatório contábil oficial. Isso só será liberado quando postagem e conciliação integral puderem ser comprovadas sem atalhos.',
    nextActions: 'O que falta resolver',
    noBlockers: 'Nenhum bloqueio operacional',
    noBlockersBody: 'O mês pode seguir para conferência humana. A declaração de fechamento continua bloqueada por segurança.',
    reviewAction: 'Registrar revisão do período',
    reviewReadonly: 'Você pode acompanhar a prontidão, mas somente quem tem permissão para revisar finanças pode registrar esta conferência.',
    reviewConfirmTitle: 'Registrar que você conferiu este período?',
    reviewConfirmBody: 'Você está confirmando apenas a revisão humana deste raio-X. Isso não fecha o mês, não posta lançamentos e não altera saldo. Se qualquer fonte do período mudar depois, esta revisão deixa de valer para o estado atual e precisará ser feita novamente.',
    reviewConfirmAction: 'Sim, registrar revisão',
    reviewCancel: 'Cancelar',
    reviewSaving: 'Registrando revisão…',
    reviewError: 'Não foi possível registrar a revisão. O período pode ter mudado; atualize e confira novamente.',
    reviewRegisteredTitle: 'Revisão humana registrada',
    reviewRegisteredBody: (name, date) => `${name} conferiu este estado do período em ${date}.`,
    reviewSourceBound: 'A revisão vale somente enquanto as fontes permanecerem exatamente neste estado.',
    reviewOutdatedTitle: 'A revisão anterior não representa mais o estado atual',
    reviewOutdatedBody: (name, date) => `${name} havia conferido este período em ${date}, mas fontes do mês mudaram depois disso.`,
    reviewChangedLabel: 'O que mudou desde aquela revisão',
    reviewChangedAreas: {
      transactions: 'Movimentações',
      counts: 'Contagens',
      documents: 'Documentos',
      reconciliation: 'Conciliação',
      unknown: 'Outra fonte do período',
    },
    operationalTitle: 'Raio-X do período',
    operationalBody: 'A leitura abaixo vem das fontes canônicas da entidade atual e é somente leitura.',
    transactionPipeline: 'Fluxo das movimentações',
    counts: 'Contagens',
    documents: 'Documentos',
    reconciliation: 'Conciliação bancária',
    draft: 'Rascunhos',
    review: 'Em revisão',
    approved: 'Conferidas — aguardando lançamento',
    postedLabel: 'Lançadas no financeiro',
    matched: 'Conferidas',
    divergent: 'Divergentes',
    incomplete: 'Em andamento',
    reviewed: 'Conferidos',
    waitingReview: 'Aguardando conferência',
    uploads: 'Envios incompletos',
    bankAccounts: 'Contas configuradas',
    reconciled: 'Conciliadas',
    unreconciled: 'Ainda não conciliadas',
    sourceTitle: 'Escopo transparente',
    sourceBody: 'Movimentações usam a data da ocorrência; contagens usam a data do culto/serviço; documentos usam a data de captura; conciliação considera movimentações postadas em contas bancárias configuradas. Esta visão não altera dados e não substitui escrituração contábil.',
    blockerAction: 'Resolver',
    blockerLabels: {
      draft_transactions: 'Há movimentações que ainda estão em rascunho.',
      transactions_waiting_review: 'Há movimentações aguardando conferência.',
      transactions_waiting_posting: 'Há movimentações conferidas que ainda não entraram no razão financeiro.',
      incomplete_count_sessions: 'Há contagens que ainda não foram concluídas.',
      divergent_count_sessions: 'Há contagens com divergência que precisam de nova conferência.',
      documents_waiting_review: 'Há documentos capturados no período que ainda precisam ser identificados ou conferidos.',
      unfinished_document_uploads: 'Há envios de documentos que não foram finalizados.',
      bank_transactions_unreconciled: 'Há movimentações bancárias postadas que ainda não foram conciliadas.',
    },
  },
  EN: {
    area: 'Relatórios',
    title: 'Reports & close',
    subtitle: 'See the month as it really stands before closing: transactions, counts, documents, and reconciliation in one verifiable operational view.',
    back: 'Back',
    loading: 'Checking the period against NestFinance sources…',
    retry: 'Try again',
    accessDeniedTitle: 'Authorized access only',
    accessDeniedBody: 'Your current role cannot view financial reports for this church.',
    errorTitle: 'This period could not be checked',
    errorBody: 'Try again. No transaction, balance, or close state was changed.',
    month: 'Period',
    capturedIncome: 'Recorded income',
    capturedExpense: 'Recorded expenses',
    transactions: 'Transactions',
    posted: 'Posted',
    capturedHint: 'Amounts recorded in the period; they are not an official accounting statement.',
    comparisonTitle: 'Comparative view',
    comparisonBody: (period) => `Objective comparison with ${period}, using the same scope and canonical sources.`,
    comparisonPrevious: 'Previous month',
    comparisonNoBase: 'No comparable baseline',
    comparisonSame: 'No change',
    qualityTitle: 'Operational quality',
    qualityBody: 'Completion and review rates. They describe process quality, not accounting performance.',
    postingRate: 'Transactions posted',
    countMatchedRate: 'Counts matched',
    documentReviewedRate: 'Documents reviewed',
    reconciliationRate: 'Bank reconciliation',
    deterministicNote: 'Comparisons describe observed differences. NestFinance does not assign cause, forecast, or judgment to these changes.',
    notApplicable: 'Not applicable',
    statusAttention: 'This month still needs attention',
    statusReady: 'Operations ready for close review',
    statusAttentionBody: (count) => count === 1 ? 'There is 1 objective item to resolve before final review.' : 'There are ' + count + ' objective items to resolve before final review.',
    statusReadyBody: 'No operational blocker was found inside the scope NestFinance can currently prove.',
    officialLocked: 'Official close is protected',
    officialLockedBody: 'NestFinance does not yet declare the period closed or issue an official accounting report. That will only be enabled when posting and full reconciliation can be proven without shortcuts.',
    nextActions: 'What still needs action',
    noBlockers: 'No operational blockers',
    noBlockersBody: 'The month can proceed to human review. The formal close declaration remains safely disabled.',
    reviewAction: 'Record period review',
    reviewReadonly: 'You can follow readiness, but only someone with finance review permission can record this check.',
    reviewConfirmTitle: 'Record that you reviewed this period?',
    reviewConfirmBody: 'You are confirming only the human review of this snapshot. This does not close the month, post entries, or change balances. If any period source changes later, this review no longer applies to the current state and must be performed again.',
    reviewConfirmAction: 'Yes, record review',
    reviewCancel: 'Cancel',
    reviewSaving: 'Recording review…',
    reviewError: 'The review could not be recorded. The period may have changed; refresh and check it again.',
    reviewRegisteredTitle: 'Human review recorded',
    reviewRegisteredBody: (name, date) => `${name} reviewed this period state on ${date}.`,
    reviewSourceBound: 'This review only remains current while the underlying sources stay exactly in this state.',
    reviewOutdatedTitle: 'The previous review no longer represents the current state',
    reviewOutdatedBody: (name, date) => `${name} reviewed this period on ${date}, but period sources changed afterwards.`,
    reviewChangedLabel: 'What changed since that review',
    reviewChangedAreas: {
      transactions: 'Transactions',
      counts: 'Counts',
      documents: 'Documents',
      reconciliation: 'Reconciliation',
      unknown: 'Another period source',
    },
    operationalTitle: 'Period snapshot',
    operationalBody: 'The view below comes from canonical sources for the current entity and is read-only.',
    transactionPipeline: 'Transaction flow',
    counts: 'Counts',
    documents: 'Documents',
    reconciliation: 'Bank reconciliation',
    draft: 'Drafts',
    review: 'In review',
    approved: 'Checked — waiting for posting',
    postedLabel: 'Posted to finance',
    matched: 'Matched',
    divergent: 'Divergent',
    incomplete: 'In progress',
    reviewed: 'Reviewed',
    waitingReview: 'To review',
    uploads: 'Incomplete uploads',
    bankAccounts: 'Configured accounts',
    reconciled: 'Reconciled',
    unreconciled: 'Not reconciled yet',
    sourceTitle: 'Transparent scope',
    sourceBody: 'Transactions use occurrence date; counts use service date; documents use capture date; reconciliation considers posted transactions touching configured bank accounts. This view does not mutate data and does not replace accounting books.',
    blockerAction: 'Resolve',
    blockerLabels: {
      draft_transactions: 'Some transactions are still drafts.',
      transactions_waiting_review: 'Some transactions are waiting for review.',
      transactions_waiting_posting: 'Some checked transactions have not entered the financial ledger yet.',
      incomplete_count_sessions: 'Some count sessions are not complete.',
      divergent_count_sessions: 'Some count sessions are divergent and require another check.',
      documents_waiting_review: 'Some documents captured in the period still need identification or review.',
      unfinished_document_uploads: 'Some document uploads were not completed.',
      bank_transactions_unreconciled: 'Some posted bank transactions have not been reconciled yet.',
    },
  },
  ES: {
    area: 'Relatórios',
    title: 'Informes y cierre',
    subtitle: 'Vea el mes como realmente está antes de cerrarlo: movimientos, conteos, documentos y conciliación reunidos en una vista operativa verificable.',
    back: 'Volver',
    loading: 'Comprobando el período con las fuentes de NestFinance…',
    retry: 'Intentar de nuevo',
    accessDeniedTitle: 'Acceso solo autorizado',
    accessDeniedBody: 'Su perfil no puede ver los informes financieros de esta iglesia.',
    errorTitle: 'No fue posible comprobar este período',
    errorBody: 'Inténtelo de nuevo. Ningún movimiento, saldo o cierre fue modificado.',
    month: 'Período',
    capturedIncome: 'Entradas registradas',
    capturedExpense: 'Salidas registradas',
    transactions: 'Movimientos',
    posted: 'Registradas en finanzas',
    capturedHint: 'Valores registrados en el período; no son un estado contable oficial.',
    comparisonTitle: 'Vista comparativa',
    comparisonBody: (period) => `Comparación objetiva con ${period}, usando el mismo alcance y las mismas fuentes canónicas.`,
    comparisonPrevious: 'Mes anterior',
    comparisonNoBase: 'Sin base comparable',
    comparisonSame: 'Sin variación',
    qualityTitle: 'Calidad operativa',
    qualityBody: 'Tasas de finalización y revisión. Describen la calidad del proceso, no el desempeño contable.',
    postingRate: 'Movimientos contabilizados',
    countMatchedRate: 'Conteos comprobados',
    documentReviewedRate: 'Documentos revisados',
    reconciliationRate: 'Conciliación bancaria',
    deterministicNote: 'Las comparaciones describen diferencias observadas. NestFinance no atribuye causa, previsión ni juicio a estas variaciones.',
    notApplicable: 'No aplica',
    statusAttention: 'Este mes todavía necesita atención',
    statusReady: 'Operación lista para revisión de cierre',
    statusAttentionBody: (count) => count === 1 ? 'Hay 1 pendiente objetiva antes de la revisión final.' : 'Hay ' + count + ' pendientes objetivas antes de la revisión final.',
    statusReadyBody: 'No se encontró ningún bloqueo operativo dentro del alcance que NestFinance puede comprobar hoy.',
    officialLocked: 'Cierre oficial protegido',
    officialLockedBody: 'NestFinance todavía no declara el período como cerrado ni emite un informe contable oficial. Solo se habilitará cuando la contabilización y la conciliación integral puedan comprobarse sin atajos.',
    nextActions: 'Lo que falta resolver',
    noBlockers: 'Sin bloqueos operativos',
    noBlockersBody: 'El mes puede avanzar a revisión humana. La declaración formal de cierre continúa bloqueada por seguridad.',
    reviewAction: 'Registrar revisión del período',
    reviewReadonly: 'Puede acompañar la preparación, pero solo quien tenga permiso para revisar finanzas puede registrar esta comprobación.',
    reviewConfirmTitle: '¿Registrar que revisó este período?',
    reviewConfirmBody: 'Está confirmando únicamente la revisión humana de esta vista. Esto no cierra el mes, no contabiliza movimientos ni cambia saldos. Si alguna fuente del período cambia después, esta revisión deja de corresponder al estado actual y deberá hacerse de nuevo.',
    reviewConfirmAction: 'Sí, registrar revisión',
    reviewCancel: 'Cancelar',
    reviewSaving: 'Registrando revisión…',
    reviewError: 'No fue posible registrar la revisión. El período puede haber cambiado; actualice y compruébelo nuevamente.',
    reviewRegisteredTitle: 'Revisión humana registrada',
    reviewRegisteredBody: (name, date) => `${name} revisó este estado del período el ${date}.`,
    reviewSourceBound: 'La revisión solo vale mientras las fuentes permanezcan exactamente en este estado.',
    reviewOutdatedTitle: 'La revisión anterior ya no representa el estado actual',
    reviewOutdatedBody: (name, date) => `${name} revisó este período el ${date}, pero las fuentes del mes cambiaron después.`,
    reviewChangedLabel: 'Qué cambió desde esa revisión',
    reviewChangedAreas: {
      transactions: 'Movimientos',
      counts: 'Conteos',
      documents: 'Documentos',
      reconciliation: 'Conciliación',
      unknown: 'Otra fuente del período',
    },
    operationalTitle: 'Radiografía del período',
    operationalBody: 'La lectura siguiente proviene de fuentes canónicas de la entidad actual y es de solo lectura.',
    transactionPipeline: 'Flujo de movimientos',
    counts: 'Conteos',
    documents: 'Documentos',
    reconciliation: 'Conciliación bancaria',
    draft: 'Borradores',
    review: 'En revisión',
    approved: 'Revisadas — esperando registro',
    postedLabel: 'Registradas en finanzas',
    matched: 'Comprobados',
    divergent: 'Divergentes',
    incomplete: 'En curso',
    reviewed: 'Revisados',
    waitingReview: 'Por revisar',
    uploads: 'Envíos incompletos',
    bankAccounts: 'Cuentas configuradas',
    reconciled: 'Conciliadas',
    unreconciled: 'Aún no conciliadas',
    sourceTitle: 'Alcance transparente',
    sourceBody: 'Los movimientos usan la fecha de ocurrencia; los conteos usan la fecha del servicio; los documentos usan la fecha de captura; la conciliación considera movimientos contabilizados en cuentas bancarias configuradas. Esta vista no modifica datos y no sustituye la contabilidad.',
    blockerAction: 'Resolver',
    blockerLabels: {
      draft_transactions: 'Hay movimientos que todavía están en borrador.',
      transactions_waiting_review: 'Hay movimientos esperando revisión.',
      transactions_waiting_posting: 'Hay movimientos revisados que todavía no entraron en el libro financiero.',
      incomplete_count_sessions: 'Hay conteos que todavía no fueron concluidos.',
      divergent_count_sessions: 'Hay conteos divergentes que requieren una nueva comprobación.',
      documents_waiting_review: 'Hay documentos capturados en el período que todavía necesitan identificación o revisión.',
      unfinished_document_uploads: 'Hay envíos de documentos que no fueron finalizados.',
      bank_transactions_unreconciled: 'Hay movimientos bancarios contabilizados que todavía no fueron conciliados.',
    },
  },
};

function currentPeriod() {
  const date = new Date();
  return String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function localeFor(language: Language) {
  return language === 'PT' ? 'pt-BR' : language === 'EN' ? 'en-US' : 'es-ES';
}

function formatMoney(cents: number, language: Language) {
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDateTime(value: string | null, language: Language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatBasisPoints(value: number, language: Language) {
  return new Intl.NumberFormat(localeFor(language), {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value / 10000);
}

function comparisonChange(
  metric: ReportMetricComparison,
  language: Language,
  noBase: string,
  same: string,
  formatter: (value: number) => string,
) {
  if (metric.delta === 0) return same;
  const delta = formatter(Math.abs(metric.delta));
  const sign = metric.delta > 0 ? '+' : '−';
  if (metric.percentChangeBasisPoints === null) return sign + delta + ' · ' + noBase;
  return sign + delta + ' · ' + formatBasisPoints(Math.abs(metric.percentChangeBasisPoints), language);
}

function ComparisonCard({
  label,
  metric,
  current,
  previous,
  change,
  previousLabel,
}: {
  label: string;
  metric: ReportMetricComparison;
  current: string;
  previous: string;
  change: string;
  previousLabel: string;
}) {
  const Icon = metric.direction === 'higher' ? TrendingUp : metric.direction === 'lower' ? TrendingDown : CheckCircle2;
  return (
    <div className="rounded-2xl bg-surface-secondary/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</p>
          <p className="mt-2 break-words text-xl font-semibold tracking-tight text-text-primary">{current}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-accent-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs">
        <span className="text-text-muted">{previousLabel}: <strong className="font-semibold text-text-secondary">{previous}</strong></span>
        <span className="font-semibold text-text-secondary">{change}</span>
      </div>
    </div>
  );
}

function blockerRoute(blocker: PeriodCloseBlocker) {
  if (blocker.routeHint === 'review') return APP_ROUTES.financeReview;
  if (blocker.routeHint === 'count') return APP_ROUTES.count;
  if (blocker.routeHint === 'inbox') return APP_ROUTES.inbox;
  if (blocker.routeHint === 'balance') return APP_ROUTES.balance;
  return APP_ROUTES.transactions;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-secondary/60 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-text-primary">{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];
  const canView = hasEffectiveCapability(accessState, 'finance.view');

  if (!canView) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
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
      <ReportsContent />
    </FinanceContextGuard>
  );
}

function ReportsContent() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COPY[language];
  const organizationId = accessState.organizationId || '';
  const canReview = hasEffectiveCapability(accessState, 'finance.review');

  const [period, setPeriod] = useState(currentPeriod);
  const [data, setData] = useState<PeriodCloseReadinessResponse | null>(null);
  const [intelligence, setIntelligence] = useState<ReportsIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reviewConfirmOpen, setReviewConfirmOpen] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewFailed, setReviewFailed] = useState(false);

  const load = async () => {
    if (!organizationId || !activeFinanceEntityId) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await periodCloseService.intelligence(organizationId, activeFinanceEntityId, period);
      setIntelligence(response);
      setData(response.currentSnapshot);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData(null);
    setIntelligence(null);
    setFailed(false);
    setReviewConfirmOpen(false);
    setReviewFailed(false);
    if (organizationId && activeFinanceEntityId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId, period]);

  const confirmReview = async () => {
    if (!organizationId || !activeFinanceEntityId || !canReview) return;
    setReviewSubmitting(true);
    setReviewFailed(false);
    try {
      await periodCloseService.confirmReview(organizationId, activeFinanceEntityId, period);
      setReviewConfirmOpen(false);
      await load();
    } catch {
      setReviewFailed(true);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const metrics = useMemo(() => data ? [
    { label: copy.capturedIncome, value: formatMoney(data.transactions.capturedIncomeCents, language), icon: TrendingUp },
    { label: copy.capturedExpense, value: formatMoney(data.transactions.capturedExpenseCents, language), icon: TrendingDown },
    { label: copy.transactions, value: String(data.transactions.total), icon: ClipboardCheck },
    { label: copy.posted, value: String(data.transactions.statusCounts.posted), icon: CheckCircle2 },
  ] : [], [copy, data, language]);

  if (failed && !data) {
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

  const ready = data?.readiness.state === 'ready_for_review';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.area} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
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
                  <CalendarDays className="h-5 w-5 text-accent-primary" aria-hidden="true" />
                  <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.title}</h1>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
              </div>
            </div>

            <label className="ml-15 flex min-w-44 flex-col gap-2 text-xs font-semibold text-text-muted sm:ml-0">
              {copy.month}
              <input
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="min-h-12 rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm font-semibold text-text-primary outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
              />
            </label>
          </header>

          {loading && !data ? (
            <Surface variant="glass" radius="xl" className="p-6" aria-live="polite">
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <RefreshCw className="h-5 w-5 animate-spin text-accent-primary" aria-hidden="true" />
                {copy.loading}
              </div>
            </Surface>
          ) : data ? (
            <>
              <Surface variant="glass" radius="xl" className="overflow-hidden">
                <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
                  <div className="p-5 sm:p-7">
                    <div className="flex items-start gap-4">
                      <div className={ready
                        ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-semantic-success/10 text-semantic-success'
                        : 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-semantic-warning/10 text-semantic-warning'
                      }>
                        {ready
                          ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                          : <AlertTriangle className="h-6 w-6" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{data.period.key}</p>
                        <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
                          {ready ? copy.statusReady : copy.statusAttention}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
                          {ready ? copy.statusReadyBody : copy.statusAttentionBody(data.readiness.blockerCount)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border-subtle bg-surface-secondary/50 p-5 lg:border-l lg:border-t-0 sm:p-7">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
                      <div>
                        <h3 className="text-sm font-semibold text-text-primary">{copy.officialLocked}</h3>
                        <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.officialLockedBody}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Surface>

              {data.humanReview.state === 'review_outdated' ? (
                <Surface variant="elevated" radius="xl" className="border border-semantic-warning/20 p-5 sm:p-6" role="status">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-semantic-warning/10 text-semantic-warning">
                      <RefreshCw className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-text-primary">{copy.reviewOutdatedTitle}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-text-muted">
                        {copy.reviewOutdatedBody(
                          data.humanReview.reviewedByDisplayName || '—',
                          formatDateTime(data.humanReview.reviewedAt, language),
                        )}
                      </p>
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.reviewChangedLabel}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {data.humanReview.changedAreas.map((area) => (
                            <span
                              key={area}
                              className="rounded-full border border-border-subtle bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-secondary"
                            >
                              {copy.reviewChangedAreas[area]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Surface>
              ) : null}

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={copy.operationalTitle}>
                {metrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <Surface key={metric.label} variant="elevated" radius="lg" className="p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">{metric.label}</p>
                        <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                      </div>
                      <p className="mt-2 break-words text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">{metric.value}</p>
                    </Surface>
                  );
                })}
              </section>
              <p className="-mt-3 text-xs text-text-muted">{copy.capturedHint}</p>

              {intelligence ? (
                <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]" aria-label={copy.comparisonTitle}>
                  <Surface variant="glass" radius="xl" className="p-5 sm:p-6">
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">{copy.comparisonTitle}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-text-muted">
                        {copy.comparisonBody(intelligence.comparisonPeriodKey)}
                      </p>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <ComparisonCard
                        label={copy.capturedIncome}
                        metric={intelligence.metrics.recordedIncomeCents}
                        current={formatMoney(intelligence.metrics.recordedIncomeCents.current, language)}
                        previous={formatMoney(intelligence.metrics.recordedIncomeCents.previous, language)}
                        previousLabel={copy.comparisonPrevious}
                        change={comparisonChange(
                          intelligence.metrics.recordedIncomeCents,
                          language,
                          copy.comparisonNoBase,
                          copy.comparisonSame,
                          (value) => formatMoney(value, language),
                        )}
                      />
                      <ComparisonCard
                        label={copy.capturedExpense}
                        metric={intelligence.metrics.recordedExpenseCents}
                        current={formatMoney(intelligence.metrics.recordedExpenseCents.current, language)}
                        previous={formatMoney(intelligence.metrics.recordedExpenseCents.previous, language)}
                        previousLabel={copy.comparisonPrevious}
                        change={comparisonChange(
                          intelligence.metrics.recordedExpenseCents,
                          language,
                          copy.comparisonNoBase,
                          copy.comparisonSame,
                          (value) => formatMoney(value, language),
                        )}
                      />
                      <ComparisonCard
                        label={copy.transactions}
                        metric={intelligence.metrics.transactionCount}
                        current={String(intelligence.metrics.transactionCount.current)}
                        previous={String(intelligence.metrics.transactionCount.previous)}
                        previousLabel={copy.comparisonPrevious}
                        change={comparisonChange(
                          intelligence.metrics.transactionCount,
                          language,
                          copy.comparisonNoBase,
                          copy.comparisonSame,
                          (value) => new Intl.NumberFormat(localeFor(language)).format(value),
                        )}
                      />
                      <ComparisonCard
                        label={copy.nextActions}
                        metric={intelligence.metrics.blockerCount}
                        current={String(intelligence.metrics.blockerCount.current)}
                        previous={String(intelligence.metrics.blockerCount.previous)}
                        previousLabel={copy.comparisonPrevious}
                        change={comparisonChange(
                          intelligence.metrics.blockerCount,
                          language,
                          copy.comparisonNoBase,
                          copy.comparisonSame,
                          (value) => new Intl.NumberFormat(localeFor(language)).format(value),
                        )}
                      />
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-text-muted">{copy.deterministicNote}</p>
                  </Surface>

                  <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-text-primary">{copy.qualityTitle}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.qualityBody}</p>
                    <div className="mt-5 flex flex-col gap-4">
                      {[
                        [copy.postingRate, intelligence.quality.postingRateBasisPoints],
                        [copy.countMatchedRate, intelligence.quality.countMatchedRateBasisPoints],
                        [copy.documentReviewedRate, intelligence.quality.documentReviewedRateBasisPoints],
                        [copy.reconciliationRate, intelligence.quality.reconciliationRateBasisPoints],
                      ].map(([label, metric]) => {
                        const item = metric as ReportRateComparison;
                        const current = item.current === null ? copy.notApplicable : formatBasisPoints(item.current, language);
                        const previous = item.previous === null ? copy.notApplicable : formatBasisPoints(item.previous, language);
                        return (
                          <div key={label as string}>
                            <div className="flex items-end justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-text-muted">{label as string}</p>
                                <p className="mt-1 text-base font-semibold text-text-primary">{current}</p>
                              </div>
                              <p className="text-right text-xs text-text-muted">
                                {copy.comparisonPrevious}: {previous}
                              </p>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
                              <div
                                className="h-full rounded-full bg-accent-primary transition-[width]"
                                style={{ width: item.current === null ? '0%' : Math.max(0, Math.min(100, item.current / 100)) + '%' }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Surface>
                </section>
              ) : null}

              <AccountantPackagePanel
                organizationId={organizationId}
                financeEntityId={activeFinanceEntityId || ''}
                period={period}
              />

              <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                  <h2 className="text-lg font-semibold text-text-primary">{copy.nextActions}</h2>
                  {!data.readiness.blockers.length ? (
                    <div className="mt-5 flex flex-col gap-3">
                      <div className="rounded-2xl border border-semantic-success/20 bg-semantic-success/5 p-4">
                        <div className="flex gap-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-semantic-success" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-text-primary">{copy.noBlockers}</p>
                            <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.noBlockersBody}</p>
                          </div>
                        </div>
                      </div>

                      {data.humanReview.state === 'reviewed_current_snapshot' ? (
                        <div className="rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-4">
                          <div className="flex gap-3">
                            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-primary">{copy.reviewRegisteredTitle}</p>
                              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                                {copy.reviewRegisteredBody(
                                  data.humanReview.reviewedByDisplayName || '—',
                                  formatDateTime(data.humanReview.reviewedAt, language),
                                )}
                              </p>
                              <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.reviewSourceBound}</p>
                            </div>
                          </div>
                        </div>
                      ) : canReview ? (
                        reviewConfirmOpen ? (
                          <div className="rounded-2xl border border-accent-primary/20 bg-surface-secondary/70 p-4">
                            <p className="text-sm font-semibold text-text-primary">{copy.reviewConfirmTitle}</p>
                            <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.reviewConfirmBody}</p>
                            {reviewFailed ? (
                              <p className="mt-3 text-xs font-medium text-semantic-danger" role="alert">{copy.reviewError}</p>
                            ) : null}
                            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              <Button
                                variant="ghost"
                                disabled={reviewSubmitting}
                                onClick={() => {
                                  setReviewConfirmOpen(false);
                                  setReviewFailed(false);
                                }}
                              >
                                {copy.reviewCancel}
                              </Button>
                              <Button disabled={reviewSubmitting} onClick={() => void confirmReview()}>
                                {reviewSubmitting ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                )}
                                {reviewSubmitting ? copy.reviewSaving : copy.reviewConfirmAction}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            fullWidth
                            onClick={() => {
                              setReviewConfirmOpen(true);
                              setReviewFailed(false);
                            }}
                          >
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            {copy.reviewAction}
                          </Button>
                        )
                      ) : (
                        <p className="px-1 text-xs leading-relaxed text-text-muted">{copy.reviewReadonly}</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2">
                      {data.readiness.blockers.map((blocker) => (
                        <button
                          key={blocker.code}
                          type="button"
                          onClick={() => navigate(blockerRoute(blocker))}
                          className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-secondary/50 p-3 text-left transition hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-semantic-warning/10 text-sm font-semibold text-semantic-warning">
                            {blocker.count}
                          </div>
                          <span className="min-w-0 flex-1 text-sm leading-snug text-text-secondary">
                            {copy.blockerLabels[blocker.code]}
                          </span>
                          <span className="hidden text-xs font-semibold text-accent-primary sm:inline">{copy.blockerAction}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                </Surface>

                <Surface variant="glass" radius="xl" className="p-5 sm:p-6">
                  <h2 className="text-lg font-semibold text-text-primary">{copy.operationalTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.operationalBody}</p>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-surface-secondary/70 p-4">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4 text-accent-primary" aria-hidden="true" />
                        <h3 className="text-sm font-semibold text-text-primary">{copy.transactionPipeline}</h3>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <MiniStat label={copy.draft} value={data.transactions.statusCounts.draft} />
                        <MiniStat label={copy.review} value={data.transactions.statusCounts.readyForReview} />
                        <MiniStat label={copy.approved} value={data.transactions.statusCounts.approvedForPosting} />
                        <MiniStat label={copy.postedLabel} value={data.transactions.statusCounts.posted} />
                      </div>
                    </div>

                    <div className="rounded-2xl bg-surface-secondary/70 p-4">
                      <div className="flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-accent-primary" aria-hidden="true" />
                        <h3 className="text-sm font-semibold text-text-primary">{copy.counts}</h3>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <MiniStat label={copy.matched} value={data.countSessions.matched} />
                        <MiniStat label={copy.divergent} value={data.countSessions.divergent} />
                        <MiniStat label={copy.incomplete} value={data.countSessions.incomplete} />
                      </div>
                    </div>

                    <div className="rounded-2xl bg-surface-secondary/70 p-4">
                      <div className="flex items-center gap-2">
                        <FileSearch className="h-4 w-4 text-accent-primary" aria-hidden="true" />
                        <h3 className="text-sm font-semibold text-text-primary">{copy.documents}</h3>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <MiniStat label={copy.reviewed} value={data.documents.reviewed} />
                        <MiniStat label={copy.waitingReview} value={data.documents.waitingReview} />
                        <MiniStat label={copy.uploads} value={data.documents.unfinishedUploads} />
                      </div>
                    </div>

                    <div className="rounded-2xl bg-surface-secondary/70 p-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-accent-primary" aria-hidden="true" />
                        <h3 className="text-sm font-semibold text-text-primary">{copy.reconciliation}</h3>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <MiniStat label={copy.bankAccounts} value={data.reconciliation.configuredBankAccounts} />
                        <MiniStat label={copy.reconciled} value={data.reconciliation.reconciledBankTransactions} />
                        <MiniStat label={copy.unreconciled} value={data.reconciliation.unreconciledBankTransactions} />
                      </div>
                    </div>
                  </div>
                </Surface>
              </section>

              <Surface variant="subtle" radius="lg" className="flex gap-3 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-semantic-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{copy.sourceTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.sourceBody}</p>
                </div>
              </Surface>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
