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
  onCount: () => void;
};

const COPY = {
  PT: {
    eyebrow: 'Sua igreja, com clareza',
    title: 'Hoje na tesouraria',
    balance: 'Saldo registrado',
    unavailable: 'Ainda não comprovável',
    whyBalance: 'Como este saldo é calculado?',
    balanceKnown: 'Este valor usa os saldos iniciais disponíveis e somente os lançamentos já efetivados. Não inclui propostas, rascunhos nem aprovações pendentes.',
    balanceUnknown: 'O NestFinance ainda não tem todos os saldos de abertura e lançamentos necessários para comprovar o saldo. Nenhum valor será estimado.',
    due: 'Contas próximas do vencimento',
    dueSuffix: (n: number) => `${n} ${n === 1 ? 'item identificado' : 'itens identificados'} em até 7 dias`,
    dueIncomplete: 'A lista pode ter mais itens; confira todos antes de decidir.',
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
    unavailable: 'Not yet verifiable',
    whyBalance: 'How is this balance calculated?',
    balanceKnown: 'This amount uses available opening balances and posted transactions only. Proposals, drafts and pending approvals are excluded.',
    balanceUnknown: 'Opening balances or posted transactions are not sufficiently verified yet. NestFinance will not estimate a balance.',
    due: 'Bills approaching due date',
    dueSuffix: (n: number) => `${n} ${n === 1 ? 'identified item' : 'identified items'} within 7 days`,
    dueIncomplete: 'Additional items may exist; check the complete list before deciding.',
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
    unavailable: 'Aún no comprobable',
    whyBalance: '¿Cómo se calcula este saldo?',
    balanceKnown: 'Este importe usa saldos iniciales disponibles y solo movimientos contabilizados. Excluye propuestas, borradores y aprobaciones pendientes.',
    balanceUnknown: 'Todavía faltan saldos iniciales o movimientos verificados. NestFinance no estimará ningún saldo.',
    due: 'Cuentas próximas a vencer',
    dueSuffix: (n: number) => `${n} ${n === 1 ? 'elemento identificado' : 'elementos identificados'} en 7 días`,
    dueIncomplete: 'Puede haber más elementos; revisa la lista completa antes de decidir.',
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
  onCount,
}: Props) {
  const copy = COPY[language];
  const balanceKnown = operational?.balance.state === 'available';
  const balanceText = balanceKnown
    ? new Intl.NumberFormat(LOCALE[language], { style: 'currency', currency: 'BRL' }).format(
        operational.balance.amountCents / 100,
      )
    : operational ? copy.unavailable : '—';
  const dueCount = operational?.dueSoonCount ?? null;

  return (
    <section aria-labelledby="nf-ledger-today-title" className="nf-spec-paper overflow-hidden rounded-[1.75rem] border border-border-strong bg-surface-default">
      <div className="px-5 pt-7 pb-5 sm:px-8 sm:pt-8">
        <p className="text-sm font-semibold tracking-wide text-text-secondary">{copy.eyebrow}</p>
        <h1 id="nf-ledger-today-title" className="mt-1 text-[1.75rem] font-semibold leading-tight tracking-tight text-text-primary sm:text-[2rem]">
          {copy.title}
        </h1>
        <p className="mt-2 break-words text-base text-text-secondary">{entityName || '—'}</p>
      </div>
      <div className="mx-5 border-y border-border-subtle py-6 sm:mx-8">
        <p className="text-sm font-semibold uppercase tracking-[0.09em] text-text-secondary">{copy.balance}</p>
        <p className="nf-financial-number mt-2 break-words text-[2.25rem] font-semibold leading-[1.15] tracking-tight text-text-primary sm:text-[2.75rem]" aria-live="polite">
          {balanceText}
        </p>
        <details className="group mt-3">
          <summary className="min-h-11 w-fit cursor-pointer rounded-lg py-2 text-sm font-medium text-accent-primary underline-offset-4 hover:underline focus-visible:underline">
            {copy.whyBalance}
          </summary>
          <p className="max-w-prose pb-2 text-sm leading-6 text-text-secondary">
            {balanceKnown ? copy.balanceKnown : copy.balanceUnknown}
          </p>
        </details>
      </div>
      <div className="mx-5 divide-y divide-border-subtle sm:mx-8">
        {countInProgress ? (
          <button type="button" onClick={onCount} className="nf-interactive flex min-h-20 w-full items-center justify-between gap-4 py-4 text-left focus-visible:rounded-xl">
            <span className="min-w-0">
              <span className="block text-base font-semibold text-text-primary">{copy.count}</span>
              <span className="mt-1 block break-words text-sm text-text-secondary">{countInProgress.serviceLabel}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-accent-primary">{copy.countAction} →</span>
          </button>
        ) : null}
        {transactionsToReview > 0 ? (
          <div className="flex min-h-16 items-center justify-between gap-4 py-4">
            <span className="text-base text-text-secondary">{copy.review}</span>
            <strong className="nf-financial-number text-lg text-text-primary">{transactionsToReview}</strong>
          </div>
        ) : null}
        {documentsToReview > 0 ? (
          <div className="flex min-h-16 items-center justify-between gap-4 py-4">
            <span className="text-base text-text-secondary">{copy.documents}</span>
            <strong className="nf-financial-number text-lg text-text-primary">{documentsToReview}</strong>
          </div>
        ) : null}
        <div className="flex min-h-20 items-center justify-between gap-4 py-4">
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text-primary">{copy.due}</span>
            <span className="mt-1 block text-sm text-text-secondary">{dueCount === null ? copy.availability : copy.dueSuffix(dueCount)}</span>
            {operational?.dueSoonTruncated ? <span className="mt-1 block text-sm text-semantic-warning">{copy.dueIncomplete}</span> : null}
          </span>
        </div>
      </div>
      <div className="border-t border-border-subtle bg-surface-secondary/60 px-5 py-6 sm:px-8 sm:py-7">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-text-secondary">{copy.next}</p>
        <h2 className="mt-2 text-xl font-semibold leading-snug text-text-primary">{nextTitle}</h2>
        <p className="mt-1 text-base leading-relaxed text-text-secondary">{nextDescription}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onNext} className="nf-interactive min-h-14 flex-1 rounded-xl bg-accent-primary px-5 py-3 text-base font-semibold text-background-base hover:opacity-90">
            {nextAction}
          </button>
          {canRegister ? <button type="button" onClick={onRegister} className="nf-interactive min-h-14 flex-1 rounded-xl border border-border-strong bg-surface-default px-5 py-3 text-base font-semibold text-text-primary hover:bg-surface-elevated">
            {copy.register}
          </button> : null}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-text-muted">{copy.source}</p>
      </div>
    </section>
  );
}
