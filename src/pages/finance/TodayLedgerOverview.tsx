import { ArrowDownLeft, ArrowUpRight, ArrowRight, CalendarDays, ChevronRight, ClipboardCheck, RefreshCw } from 'lucide-react';
import type { Language } from '@/src/contexts/LanguageContext';
import type { TodayOperationalSnapshot } from '../../../shared/finance/todayOperationalSummary.js';

type Props = {
  language: Language;
  entityName: string | null;
  operational: TodayOperationalSnapshot | null;
  countInProgress: { serviceLabel: string } | null;
  transactionsToReview: number;
  documentsToReview: number;
  nextTitle: string;
  nextDescription: string;
  nextAction: string;
  onNext: () => void;
  onRegister: () => void;
  canRegister: boolean;
  canViewBalance?: boolean;
  onCount: () => void;
  canCount?: boolean;
  priorityState?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
};

const COPY = {
  PT: {
    eyebrow: 'Sua igreja, com clareza',
    title: 'Hoje na tesouraria',
    balance: 'Saldo registrado',
    restricted: 'Saldo restrito',
    restrictedHint: 'Somente pessoas autorizadas podem ver o saldo. Você pode continuar nas tarefas liberadas para você.',
    unavailable: 'Ainda não comprovável',
    whyBalance: 'Como este saldo é calculado?',
    balanceKnown: 'Este valor usa os saldos iniciais disponíveis e somente os lançamentos já efetivados. Não inclui propostas, rascunhos nem aprovações pendentes.',
    balanceUnknown: 'O NestFinance ainda não tem todos os saldos de abertura e lançamentos necessários para comprovar o saldo. Nenhum valor será estimado.',
    due: 'Contas próximas do vencimento',
    dueSuffix: (n: number) => `${n} ${n === 1 ? 'item identificado' : 'itens identificados'} em até 7 dias`,
    dueIncomplete: 'A lista pode ter mais itens; confira todos antes de decidir.',
    bills: 'Contas a pagar cadastradas',
    billsSuffix: (n:number) => n===1 ? '1 conta vence nos próximos 7 dias' : `${n} contas vencem nos próximos 7 dias`,
    billsIncomplete: 'Podem existir mais contas; abra a lista completa.',
    count: 'Contagem em andamento',
    review: 'Movimentações para conferir',
    documents: 'Documentos para conferir',
    next: 'PRÓXIMO PASSO',
    register: 'Registrar entrada ou despesa',
    countAction: 'Contar culto',
    availability: 'Ainda não foi possível carregar o resumo; tente novamente nos detalhes.',
    source: 'Os valores dependem dos registros desta igreja. Uma aprovação não altera o saldo.',
  },
  EN: {
    eyebrow: 'Your church, clearly',
    title: 'Today in finance',
    balance: 'Recorded balance',
    restricted: 'Restricted balance',
    restrictedHint: 'Only authorized people can view the balance. You can continue with the tasks available to you.',
    unavailable: 'Not yet verifiable',
    whyBalance: 'How is this balance calculated?',
    balanceKnown: 'This amount uses available opening balances and posted transactions only. Proposals, drafts and pending approvals are excluded.',
    balanceUnknown: 'Opening balances or posted transactions are not sufficiently verified yet. NestFinance will not estimate a balance.',
    due: 'Bills approaching due date',
    dueSuffix: (n: number) => `${n} ${n === 1 ? 'identified item' : 'identified items'} within 7 days`,
    dueIncomplete: 'Additional items may exist; check the complete list before deciding.',
    bills: 'Registered unpaid bills',
    billsSuffix: (n:number) => n===1 ? '1 bill is due in the next 7 days' : `${n} bills are due in the next 7 days`,
    billsIncomplete: 'More bills may exist; open the full list.',
    count: 'Count in progress',
    review: 'Transactions to review',
    documents: 'Documents to review',
    next: 'NEXT STEP',
    register: 'Record income or expense',
    countAction: 'Count a service',
    availability: 'The summary could not be loaded yet; retry from the detailed view.',
    source: 'Amounts depend on this church’s records. Approval does not change the balance.',
  },
  ES: {
    eyebrow: 'Tu iglesia, con claridad',
    title: 'Hoy en tesorería',
    balance: 'Saldo registrado',
    restricted: 'Saldo restringido',
    restrictedHint: 'Solo las personas autorizadas pueden ver el saldo. Puedes continuar con las tareas habilitadas para ti.',
    unavailable: 'Aún no comprobable',
    whyBalance: '¿Cómo se calcula este saldo?',
    balanceKnown: 'Este importe usa saldos iniciales disponibles y solo movimientos contabilizados. Excluye propuestas, borradores y aprobaciones pendientes.',
    balanceUnknown: 'Todavía faltan saldos iniciales o movimientos verificados. NestFinance no estimará ningún saldo.',
    due: 'Cuentas próximas a vencer',
    dueSuffix: (n: number) => `${n} ${n === 1 ? 'elemento identificado' : 'elementos identificados'} en 7 días`,
    dueIncomplete: 'Puede haber más elementos; revisa la lista completa antes de decidir.',
    bills: 'Cuentas por pagar registradas',
    billsSuffix: (n:number) => n===1 ? '1 cuenta vence en los próximos 7 días' : `${n} cuentas vencen en los próximos 7 días`,
    billsIncomplete: 'Puede haber más cuentas; abre la lista completa.',
    count: 'Conteo en curso',
    review: 'Movimientos por revisar',
    documents: 'Documentos por revisar',
    next: 'PRÓXIMO PASO',
    register: 'Registrar ingreso o gasto',
    countAction: 'Contar un culto',
    availability: 'Aún no se pudo cargar el resumen; inténtalo desde la vista detallada.',
    source: 'Los valores dependen de los registros de esta iglesia. Una aprobación no modifica el saldo.',
  },
} as const;

const LOCALE: Record<Language, string> = { PT: 'pt-BR', EN: 'en-US', ES: 'es-ES' };

export function TodayLedgerOverview({
  language,
  entityName,
  operational,
  countInProgress,
  transactionsToReview,
  documentsToReview,
  nextTitle,
  nextDescription,
  nextAction,
  onNext,
  onRegister,
  canRegister,
  canViewBalance = false,
  onCount,
  canCount = false,
  priorityState = 'ready',
  onRetry,
}: Props) {
  const copy = COPY[language];
  const balanceAllowed = canViewBalance && operational?.balance.state !== 'restricted';
  const balanceKnown = balanceAllowed && operational?.balance.state === 'available';
  const balanceText = balanceKnown
    ? new Intl.NumberFormat(LOCALE[language], { style: 'currency', currency: 'BRL' }).format(
        operational.balance.amountCents / 100,
      )
    : operational ? copy.unavailable : '—';
  const dueCount = operational?.dueSoonCount ?? null;
  const labels = {
    PT: { income: 'Entradas registradas hoje', expense: 'Saídas registradas hoje', movementHint: 'Movimentos do dia · podem incluir rascunhos', pending: 'Fila de conferência', available: 'Base verificada', needsBase: 'Base ainda incompleta', waiting: 'Aguardando dados', loading: 'Atualizando suas prioridades', failed: 'Não foi possível confirmar as prioridades', failedBody: 'Tente atualizar. Enquanto os dados não carregarem, não podemos afirmar que está tudo em dia.', retry: 'Atualizar resumo', countHint: 'Notas e moedas do culto', priority: 'Sua próxima ação', period: 'PRÓXIMOS 7 DIAS' },
    EN: { income: 'Income recorded today', expense: 'Expenses recorded today', movementHint: 'Daily movements · may include drafts', pending: 'Review queue', available: 'Verified basis', needsBase: 'Incomplete basis', waiting: 'Waiting for data', loading: 'Refreshing your priorities', failed: 'Priorities could not be confirmed', failedBody: 'Try refreshing. Until the data loads, we cannot confirm that everything is up to date.', retry: 'Refresh summary', countHint: 'Service banknotes and coins', priority: 'Your next action', period: 'NEXT 7 DAYS' },
    ES: { income: 'Ingresos registrados hoy', expense: 'Gastos registrados hoy', movementHint: 'Movimientos del día · pueden incluir borradores', pending: 'Cola de revisión', available: 'Base verificada', needsBase: 'Base incompleta', waiting: 'Esperando datos', loading: 'Actualizando tus prioridades', failed: 'No fue posible confirmar las prioridades', failedBody: 'Intenta actualizar. Hasta cargar los datos, no podemos confirmar que todo esté al día.', retry: 'Actualizar resumen', countHint: 'Billetes y monedas del culto', priority: 'Tu próxima acción', period: 'PRÓXIMOS 7 DÍAS' },
  }[language];
  const money = (cents: number) => new Intl.NumberFormat(LOCALE[language], { style: 'currency', currency: 'BRL' }).format(cents / 100);


  return (
    <section aria-labelledby="nf-ledger-today-title" className="nf-today-overview">
      <header className="nf-today-heading">
        <div>
          <p className="nf-section-eyebrow">{copy.eyebrow}</p>
          <h1 id="nf-ledger-today-title" className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight text-text-primary lg:text-[2.25rem]">{copy.title}</h1>
        </div>
        <span className="nf-entity-label"><span aria-hidden="true" />{entityName || '—'}</span>
      </header>

      <div className="nf-today-primary-grid">
        <div className="nf-balance-panel">
          {balanceAllowed ? <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="nf-section-eyebrow">{copy.balance}</p>
            <span className="nf-balance-state">{balanceKnown ? labels.available : operational ? labels.needsBase : labels.waiting}</span>
          </div>
          <p className={`nf-financial-number nf-balance-value ${balanceKnown ? '' : 'nf-balance-unavailable'}`} aria-live="polite">{balanceText}</p>
          <details className="nf-balance-explanation group">
            <summary className="min-h-11 w-fit cursor-pointer rounded-lg py-2 text-sm font-medium text-accent-primary underline-offset-4 hover:underline focus-visible:underline">{copy.whyBalance}</summary>
            <p className="max-w-prose pb-3 text-sm leading-6 text-text-secondary">{balanceKnown ? copy.balanceKnown : copy.balanceUnknown}</p>
          </details>
          </> : <div className="py-2">
            <p className="nf-section-eyebrow">{copy.restricted}</p>
            <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">{copy.restrictedHint}</p>
          </div>}
          <div className="nf-daily-movements">
            <div>
              <span className="flex items-center gap-2 text-sm text-text-secondary"><ArrowDownLeft className="h-4 w-4 text-semantic-success" aria-hidden="true" />{labels.income}</span>
              <strong className="nf-financial-number mt-2 block text-2xl font-semibold tracking-tight text-text-primary">{operational ? money(operational.incomeCents) : '—'}</strong>
            </div>
            <div>
              <span className="flex items-center gap-2 text-sm text-text-secondary"><ArrowUpRight className="h-4 w-4 text-text-muted" aria-hidden="true" />{labels.expense}</span>
              <strong className="nf-financial-number mt-2 block text-2xl font-semibold tracking-tight text-text-primary">{operational ? money(operational.expenseCents) : '—'}</strong>
            </div>
          </div>
          <p className="mt-4 text-xs text-text-muted">{labels.movementHint}</p>
        </div>

        <div className="nf-next-action-panel" aria-busy={priorityState === 'loading'}>
          <p className="nf-section-eyebrow">{labels.priority}</p>
          <h2 className="mt-5 text-[1.4rem] font-semibold leading-snug tracking-tight text-text-primary">
            {priorityState === 'error' ? labels.failed : priorityState === 'loading' ? labels.loading : nextTitle}
          </h2>
          <p className="mt-3 text-sm leading-6 text-text-secondary">{priorityState === 'error' ? labels.failedBody : priorityState === 'loading' ? labels.waiting : nextDescription}</p>
          <div className="nf-next-action-buttons">
            {priorityState === 'ready' ? <button type="button" onClick={onNext} className="nf-desktop-primary nf-interactive min-h-12 rounded-xl px-5 py-3 text-sm font-semibold">
              {nextAction}<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button> : onRetry ? <button type="button" onClick={onRetry} disabled={priorityState === 'loading'} className="nf-desktop-primary nf-interactive min-h-12 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-60">
              {labels.retry}<RefreshCw className={`h-4 w-4 ${priorityState === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button> : null}
            {canRegister ? <button type="button" onClick={onRegister} className="nf-interactive min-h-12 rounded-xl border border-border-strong bg-surface-default px-5 py-3 text-sm font-semibold text-text-primary hover:bg-surface-elevated">{copy.register}</button> : null}
          </div>
        </div>
      </div>

      <div className="nf-today-secondary-grid">
        <section className="nf-today-agenda" aria-label={copy.due}>
          <header className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text-primary">{copy.due}</h2>
            <span className="nf-section-eyebrow">{labels.period}</span>
          </header>
          {operational?.registeredPayablesDueSoonCount !== undefined ? <div className="nf-agenda-row">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
            <div><p className="text-sm font-medium text-text-primary">{copy.bills}</p><p className="mt-1 text-sm text-text-secondary">{copy.billsSuffix(operational.registeredPayablesDueSoonCount)}</p>
              {operational.registeredPayablesDueSoonTruncated ? <p className="mt-1 text-sm text-semantic-warning">{copy.billsIncomplete}</p> : null}
            </div>
          </div> : null}
          <div className="nf-agenda-row">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
            <div><p className="text-sm text-text-secondary">{dueCount === null ? copy.availability : copy.dueSuffix(dueCount)}</p>
              {operational?.dueSoonTruncated ? <p className="mt-1 text-sm text-semantic-warning">{copy.dueIncomplete}</p> : null}
            </div>
          </div>
        </section>
        <section className="nf-today-work-queue" aria-label={labels.pending}>
          <h2 className="mb-4 text-base font-semibold text-text-primary">{labels.pending}</h2>
          <div className="nf-work-queue-row"><span>{copy.review}</span><strong className="nf-financial-number">{priorityState === 'ready' ? transactionsToReview : '—'}</strong></div>
          <div className="nf-work-queue-row"><span>{copy.documents}</span><strong className="nf-financial-number">{priorityState === 'ready' ? documentsToReview : '—'}</strong></div>
          {canCount ? <button type="button" onClick={onCount} className="nf-count-shortcut nf-interactive">
            <ClipboardCheck className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text-primary">{countInProgress ? copy.count : copy.countAction}</span><span className="mt-1 block break-words text-sm text-text-secondary">{countInProgress?.serviceLabel || labels.countHint}</span></span>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          </button> : null}
        </section>
      </div>
      <p className="nf-today-source">{copy.source}</p>
    </section>
  );
}
