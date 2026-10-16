import type { Language } from '@/src/contexts/LanguageContext';
import type { PeriodCloseReadinessResponse } from '../../../shared/finance/periodCloseReadiness.js';

const COPY = {
  PT: {
    title: 'Conferir o mês',
    subtitle: 'Resumo de movimentos efetivados e pendências, sem declarar fechamento.',
    step: 'Prévia operacional',
    opening: 'Saldo que veio do mês anterior',
    openingUnknown: 'Ainda não comprovável',
    income: 'Entradas efetivadas no período',
    expense: 'Despesas efetivadas no período',
    closing: 'Saldo para o próximo mês',
    closingUnknown: 'Ainda não comprovável',
    why: 'Por que o saldo não aparece?',
    whyBody: 'O saldo de abertura com data, todas as contas, transferências, reversões e o razão precisam estar reconciliados antes de declarar o saldo que continua no próximo mês. Não podemos calcular esse valor apenas subtraindo receitas e despesas do período.',
    captured: 'Também há movimentações registradas que ainda não entraram no saldo: confira o estado de cada uma.',
    pending: (n: number) => n === 1 ? 'Há 1 pendência para resolver.' : `Há ${n} pendências para resolver.`,
    ready: 'Sem pendências operacionais neste recorte; ainda não equivale a mês fechado.',
    next: 'Conferir pendências',
    unavailable: 'Não existe fechamento oficial nem transferência automática do saldo neste painel.',
  },
  EN: {
    title: 'Review the month',
    subtitle: 'Posted movements and outstanding work, without declaring an official close.',
    step: 'Operational preview',
    opening: 'Balance carried from the previous month',
    openingUnknown: 'Not yet verifiable',
    income: 'Posted income in this period',
    expense: 'Posted expenses in this period',
    closing: 'Balance for the following month',
    closingUnknown: 'Not yet verifiable',
    why: 'Why is the balance unavailable?',
    whyBody: 'Dated opening balances, all accounts, transfers, reversals and the general ledger must reconcile before a closing balance can be carried forward. Subtracting this month’s income and expenses alone is not sufficient.',
    captured: 'There are also recorded transactions that have not yet affected the posted balance. Review their states.',
    pending: (n: number) => n === 1 ? '1 issue still needs resolution.' : `${n} issues still need resolution.`,
    ready: 'No operational blocker in this scope; this does not mean the month is officially closed.',
    next: 'Review pending items',
    unavailable: 'This screen does not close a period or carry forward its balance.',
  },
  ES: {
    title: 'Revisar el mes',
    subtitle: 'Movimientos contabilizados y pendientes, sin declarar un cierre oficial.',
    step: 'Vista previa operativa',
    opening: 'Saldo procedente del mes anterior',
    openingUnknown: 'Aún no comprobable',
    income: 'Ingresos contabilizados del período',
    expense: 'Gastos contabilizados del período',
    closing: 'Saldo para el próximo mes',
    closingUnknown: 'Aún no comprobable',
    why: '¿Por qué no aparece el saldo?',
    whyBody: 'Los saldos iniciales fechados, todas las cuentas, transferencias, reversiones y el libro mayor deben conciliarse antes de trasladar el saldo. Restar los ingresos y gastos del mes no es suficiente.',
    captured: 'También hay movimientos registrados que todavía no afectan al saldo contabilizado. Revisa su situación.',
    pending: (n: number) => n === 1 ? 'Hay 1 pendiente por resolver.' : `Hay ${n} pendientes por resolver.`,
    ready: 'Sin bloqueos operativos en este alcance; no implica un mes oficialmente cerrado.',
    next: 'Revisar pendientes',
    unavailable: 'Esta pantalla no cierra el período ni traslada saldos automáticamente.',
  },
} as const;

type Props = {
  language: Language;
  period: string;
  result: PeriodCloseReadinessResponse;
};

const LOCALE = { PT: 'pt-BR', EN: 'en-US', ES: 'es-ES' } as const;

export function MonthReviewOverview({ language, period, result }: Props) {
  const copy = COPY[language];
  const amounts = result.transactions;
  const money = (cents: number) => new Intl.NumberFormat(LOCALE[language], {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
  const blockerCount = result.readiness.blockerCount;
  const hasUnposted = amounts.statusCounts.draft > 0 ||
    amounts.statusCounts.readyForReview > 0 ||
    amounts.statusCounts.approvedForPosting > 0;

  const rows = [
    { key: 'opening', label: copy.opening, amount: null },
    { key: 'income', label: copy.income, amount: amounts.postedIncomeCents },
    { key: 'expense', label: copy.expense, amount: amounts.postedExpenseCents },
  ];

  return (
    <section aria-labelledby="month-review-overview-title" className="nf-spec-paper overflow-hidden rounded-[1.75rem] border border-border-strong bg-surface-default">
      <header className="px-5 pt-7 pb-5 sm:px-8">
        <p className="text-sm font-semibold tracking-wide text-text-secondary">{period} · {copy.step}</p>
        <h2 id="month-review-overview-title" className="mt-2 text-[1.75rem] font-semibold leading-tight text-text-primary">{copy.title}</h2>
        <p className="mt-2 text-base leading-relaxed text-text-secondary">{copy.subtitle}</p>
      </header>
      <div className="mx-5 divide-y divide-border-subtle border-y border-border-subtle sm:mx-8">
        {rows.map((row) => (
          <div key={row.key} className="flex min-h-20 items-center justify-between gap-4 py-4">
            <p className="min-w-0 text-base text-text-secondary">{row.label}</p>
            <p className="nf-financial-number shrink-0 text-right text-lg font-semibold text-text-primary">
              {row.amount === null ? copy.openingUnknown : money(row.amount)}
            </p>
          </div>
        ))}
      </div>
      <div className="px-5 py-6 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.09em] text-text-secondary">{copy.closing}</p>
        <p className="mt-2 text-3xl font-semibold leading-tight text-text-primary">{copy.closingUnknown}</p>
        <details className="mt-3">
          <summary className="min-h-11 w-fit cursor-pointer py-2 text-sm font-semibold text-accent-primary underline-offset-4 hover:underline focus-visible:underline">{copy.why}</summary>
          <p className="max-w-prose pb-2 text-sm leading-relaxed text-text-secondary">{copy.whyBody}</p>
        </details>
      </div>
      <footer className="border-t border-border-subtle bg-surface-secondary/60 px-5 py-6 sm:px-8">
        <p className="text-base font-semibold text-text-primary">{blockerCount > 0 ? copy.pending(blockerCount) : copy.ready}</p>
        {hasUnposted ? <p className="mt-2 text-sm leading-relaxed text-text-secondary">{copy.captured}</p> : null}
        <button type="button" onClick={() => document.getElementById('reports-blockers')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="nf-interactive mt-5 min-h-14 w-full rounded-xl bg-accent-primary px-5 py-3 text-base font-semibold text-background-base hover:opacity-90 sm:w-auto">
          {copy.next}
        </button>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{copy.unavailable}</p>
      </footer>
    </section>
  );
}
