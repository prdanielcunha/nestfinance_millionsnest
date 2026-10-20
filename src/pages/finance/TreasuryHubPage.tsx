import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Banknote, CalendarDays, ChevronRight, ClipboardList, FileText, Landmark, Receipt } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { FinanceScreenHero } from '@/src/components/finance/FinanceScreenHero';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceTreasuryAreaBoundary } from '@/src/app/boundaries/FinanceTreasuryAreaBoundary';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';

const TEXT = {
  PT: {
    title: 'Cuidar do financeiro',
    subtitle: 'Entradas, despesas, comprovantes, saldos e fechamento da igreja em um só lugar.',
    back: 'Voltar', initial: 'Registrar agora', work: 'Acompanhar o financeiro',
    income: 'Registrar entrada', incomeDesc: 'Registre o que entrou na tesouraria, sem repetir uma contagem já importada.',
    expense: 'Registrar despesa', expenseDesc: 'Registre o que precisa pagar ou o que já foi pago.',
    documents: 'Comprovantes e documentos', documentsDesc: 'Envie fotos e arquivos para conferir, sem lançar saldos automaticamente.',
    transactions: 'Movimentações', transactionsDesc: 'Confira entradas, despesas, transferências e estados de revisão.',
    payable: 'Contas e despesas', payableDesc: 'Consulte as despesas registradas e seus vencimentos.',
    balance: 'Saldos e conciliação', balanceDesc: 'Confira valores conhecidos e documentos do banco.',
    month: 'Conferir o mês', monthDesc: 'Analise o período, as pendências e as informações para o contador.',
    transfer: 'Transferir entre contas', transferDesc: 'Uma transferência não deve duplicar receita.',
    incomingCount: 'Contagem já concluída?', incomingCountDesc: 'Confira as propostas com a origem do culto e as evidências, sem redigitar os valores.',
    viewReview: 'Revisar lançamentos preparados',
    openCount: 'Abrir contagens conferidas',
    repass: 'Repasses', repassDesc: 'Confira a regra, apure o mês e prepare a conta a pagar.',
  },
  EN: {
    title: 'Manage church finances', subtitle: 'Income, expenses, evidence, balances and month review in one place.',
    back: 'Back', initial: 'Record now', work: 'Manage finances',
    income: 'Record income', incomeDesc: 'Record treasury income without duplicating an imported service count.',
    expense: 'Record expense', expenseDesc: 'Record expenses due or already paid.',
    documents: 'Receipts and documents', documentsDesc: 'Send files for review without posting money automatically.',
    transactions: 'Transactions', transactionsDesc: 'Review income, expenses, transfers and review status.',
    payable: 'Bills and expenses', payableDesc: 'Check registered expenses and due dates.',
    balance: 'Balances and reconciliation', balanceDesc: 'Check known balances and bank evidence.',
    month: 'Review the month', monthDesc: 'Inspect the period, outstanding items and accountant information.',
    transfer: 'Transfer between accounts', transferDesc: 'A transfer must not duplicate income.',
    incomingCount: 'Service count completed?', incomingCountDesc: 'Review proposals with service provenance and evidence; no manual re-entry.',
    viewReview: 'Review prepared entries', openCount: 'Open verified counts', repass: 'Remittances', repassDesc: 'Review the policy, assess the month and prepare the payable.',
  },
  ES: {
    title: 'Cuidar las finanzas', subtitle: 'Ingresos, gastos, comprobantes, saldos y revisión mensual en un lugar.',
    back: 'Volver', initial: 'Registrar ahora', work: 'Gestionar finanzas',
    income: 'Registrar ingreso', incomeDesc: 'Registra lo recibido sin duplicar el conteo importado de un culto.',
    expense: 'Registrar gasto', expenseDesc: 'Registra cuentas por vencer o ya pagadas.',
    documents: 'Comprobantes y documentos', documentsDesc: 'Envía archivos para revisión sin contabilización automática.',
    transactions: 'Movimientos', transactionsDesc: 'Revisa ingresos, gastos, transferencias y estados.',
    payable: 'Cuentas y gastos', payableDesc: 'Consulta gastos registrados y vencimientos.',
    balance: 'Saldos y conciliación', balanceDesc: 'Comprueba saldos conocidos y documentos del banco.',
    month: 'Revisar el mes', monthDesc: 'Revisa el período, pendientes e información para el contador.',
    transfer: 'Transferir entre cuentas', transferDesc: 'Una transferencia no debe duplicar ingresos.',
    incomingCount: '¿Conteo terminado?', incomingCountDesc: 'Revisa propuestas con origen del culto y evidencias, sin volver a introducir valores.',
    viewReview: 'Revisar movimientos preparados', openCount: 'Abrir conteos verificados', repass: 'Remesas', repassDesc: 'Revise la regla, calcule el mes y prepare la cuenta por pagar.',
  },
} as const;

function TreasuryHubContent() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { accessState } = useAuth();
  const copy = TEXT[language];
  const canCreate = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const canReview = hasEffectiveCapability(accessState, 'finance.review') || hasEffectiveCapability(accessState, 'finance.approve_for_posting');
  const items = [
    { title: copy.incomingCount, body: copy.incomingCountDesc, icon: ClipboardList, route: APP_ROUTES.count },
    { title: copy.documents, body: copy.documentsDesc, icon: FileText, route: APP_ROUTES.inbox },
    { title: copy.transactions, body: copy.transactionsDesc, icon: ClipboardList, route: APP_ROUTES.transactions },
    { title: copy.payable, body: copy.payableDesc, icon: Receipt, route: APP_ROUTES.payables },
    { title: copy.balance, body: copy.balanceDesc, icon: Landmark, route: APP_ROUTES.balance },
    { title: copy.month, body: copy.monthDesc, icon: CalendarDays, route: APP_ROUTES.reports },
    ...(canCreate ? [{ title: copy.transfer, body: copy.transferDesc, icon: ArrowRightLeft, route: `${APP_ROUTES.transactionCreate}?direction=transfer` }] : []),
  ];

  return (
    <main className="mx-auto max-w-5xl pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.title} />
      <FinanceScreenHero title={copy.title} subtitle={copy.subtitle} backLabel={copy.back} onBack={() => navigate(APP_ROUTES.finance)} />
      <div className="space-y-6 px-3 pt-5 sm:px-6">
        {canCreate ? (
          <section aria-labelledby="treasury-register-title">
            <h2 id="treasury-register-title" className="mb-3 text-xl font-semibold text-text-primary">{copy.initial}</h2>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=income`)} className="nf-primary-action nf-interactive flex min-h-20 items-center justify-center gap-2 rounded-2xl px-3 text-base font-semibold">
                <ArrowDownLeft className="h-6 w-6 shrink-0" aria-hidden="true"/>{copy.income}
              </button>
              <button type="button" onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=expense`)} className="nf-interactive flex min-h-20 items-center justify-center gap-2 rounded-2xl border border-border-strong bg-surface-default px-3 text-base font-semibold text-text-primary">
                <ArrowUpRight className="h-6 w-6 shrink-0 text-accent-primary" aria-hidden="true"/>{copy.expense}
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">{copy.incomeDesc}</p>
          </section>
        ) : null}
        {canCreate || canReview ? (
          <section className="nf-paper-surface rounded-2xl p-5" aria-label={copy.incomingCount}>
            <h2 className="text-lg font-semibold text-text-primary">{copy.incomingCount}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{copy.incomingCountDesc}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {canCreate ? <button type="button" onClick={() => navigate(APP_ROUTES.count)}
                className="nf-interactive min-h-14 rounded-xl border border-[#164a52] bg-[#073d47] px-4 text-base font-semibold text-white">
                {copy.openCount} <ChevronRight className="ml-1 inline h-5 w-5" aria-hidden="true"/>
              </button> : null}
              {canReview ? <button type="button" onClick={() => navigate(APP_ROUTES.financeReview)}
                className="nf-interactive min-h-14 rounded-xl border border-border-strong bg-surface-default px-4 text-base font-semibold text-text-primary">
                {copy.viewReview} <ChevronRight className="ml-1 inline h-5 w-5" aria-hidden="true"/>
              </button> : null}
            </div>
          </section>
        ) : null}
        <section aria-labelledby="treasury-follow-up-title">
          <h2 id="treasury-follow-up-title" className="mb-3 text-xl font-semibold text-text-primary">{copy.work}</h2>
          <div className="nf-paper-surface divide-y divide-border-subtle overflow-hidden rounded-2xl">
            {items.map((item) => (
              <button type="button" key={item.title} onClick={() => navigate(item.route)}
                className="nf-interactive flex min-h-20 w-full items-center gap-4 px-4 py-4 text-left hover:bg-surface-secondary">
                <item.icon className="h-6 w-6 shrink-0 text-accent-primary" aria-hidden="true"/>
                <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-text-primary">{item.title}</span><span className="mt-1 block text-sm leading-relaxed text-text-secondary">{item.body}</span></span>
                <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true"/>
              </button>
            ))}
            <button type="button" onClick={()=>navigate(`${APP_ROUTES.payables}#remittances`)} className="nf-interactive flex min-h-20 w-full items-center gap-4 px-4 py-4 text-left hover:bg-surface-secondary">
              <Banknote className="h-6 w-6 shrink-0 text-text-muted" aria-hidden="true"/>
              <span className="min-w-0"><span className="block text-base font-semibold text-text-primary">{copy.repass}</span><span className="mt-1 block text-sm leading-relaxed text-text-secondary">{copy.repassDesc}</span></span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function TreasuryHubPage() {
  return <FinanceContextGuard><FinanceTreasuryAreaBoundary><TreasuryHubContent /></FinanceTreasuryAreaBoundary></FinanceContextGuard>;
}
