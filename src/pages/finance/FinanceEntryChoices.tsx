import { ArrowDownLeft, ArrowUpRight, BookOpenCheck, ChevronRight, ClipboardCheck, ShieldCheck, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import type { FinanceEntryProfile } from '@/src/lib/financeEntryProfile';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { COUNT_V3_UI_ENABLED } from '@/src/services/countV3Service';
import type { Language } from '@/src/contexts/LanguageContext';

const COPY = {
  PT: {
    heading: 'O que você vai cuidar hoje?',
    sub: 'Escolha sua atividade. Você verá apenas os caminhos permitidos para sua função.',
    count: 'Contar dízimos e ofertas',
    countSub: 'Equipe de contagem · Escolha o culto, conte e confira com segurança.',
    money: 'Cuidar do financeiro',
    moneySub: 'Tesouraria · Entradas, despesas, comprovantes, saldos e fechamento.',
    accountant: 'Espaço do contador',
    accountantSub: 'Contabilidade · Relatórios, auditoria e pacote mensal.',
    income: 'Registrar entrada', expense: 'Registrar despesa',
    progress: 'Contagem concluída? Consulte o resumo conferido antes de registrar no financeiro.',
    reviewCount: 'Revisar contagens conferidas',
    reviewCountSub: 'Tesouraria · Consulte valores lacrados, pendências e critérios de revisão, sem movimentar saldo.',
  },
  EN: {
    heading: 'What will you take care of today?',
    sub: 'Choose your work. Only authorized workflows are displayed.',
    count: 'Count tithes and offerings',
    countSub: 'Count team · Select a service, count and verify securely.',
    money: 'Manage the finances',
    moneySub: 'Treasury · Income, expenses, receipts, balances and monthly review.',
    accountant: 'Accountant workspace',
    accountantSub: 'Accounting · Reports, audit and monthly package.',
    income: 'Record income', expense: 'Record expense',
    progress: 'Once verified, review the Count summary before recording it in finance.',
    reviewCount: 'Review completed counts',
    reviewCountSub: 'Treasury · Inspect sealed totals, issues and review requirements without changing balances.',
  },
  ES: {
    heading: '¿Qué vas a atender hoy?',
    sub: 'Elige tu actividad. Solo aparecen las tareas autorizadas.',
    count: 'Contar diezmos y ofrendas',
    countSub: 'Equipo de conteo · Elige el culto, cuenta y revisa con seguridad.',
    money: 'Cuidar las finanzas',
    moneySub: 'Tesorería · Ingresos, gastos, comprobantes, saldos y revisión mensual.',
    accountant: 'Espacio del contador',
    accountantSub: 'Contabilidad · Informes, auditoría y paquete mensual.',
    income: 'Registrar ingreso', expense: 'Registrar gasto',
    progress: 'Cuando el conteo termine, revise el resumen antes de registrarlo en tesorería.',
    reviewCount: 'Revisar conteos verificados',
    reviewCountSub: 'Tesorería · Vea importes sellados, pendientes y criterios sin alterar saldos.',
  },
} as const;

export function FinanceEntryChoices({ language, profile }: { language: Language; profile: FinanceEntryProfile }) {
  const navigate = useNavigate();
  const copy = COPY[language];
  const { accessState } = useAuth();
  const canUseTeamCount = COUNT_V3_UI_ENABLED &&
    (hasEffectiveCapability(accessState, 'finance.count.view') ||
      hasEffectiveCapability(accessState, 'finance.count.execute'));
  const countTarget = canUseTeamCount ? APP_ROUTES.countVerificationV3 : APP_ROUTES.count;
  const canReviewCount = COUNT_V3_UI_ENABLED && hasEffectiveCapability(accessState, 'finance.review');
  if (!profile.canCount && !profile.canFinance && !profile.canAccountant && !canReviewCount) return null;
  return (
    <section className="nf-paper-surface rounded-2xl p-4 sm:p-6" aria-labelledby="finance-entry-title">
      <div>
        <h2 id="finance-entry-title" className="text-xl font-semibold text-text-primary">{copy.heading}</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{copy.sub}</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {profile.canCount ? (
          <button type="button" onClick={() => navigate(countTarget)} className="nf-interactive flex min-h-28 items-center gap-4 rounded-xl border border-border-strong bg-surface-secondary p-4 text-left hover:border-accent-primary">
            <ClipboardCheck className="h-9 w-9 shrink-0 text-accent-primary" aria-hidden="true"/>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-text-primary">{copy.count}</span>
              <span className="mt-1 block text-sm leading-snug text-text-secondary">{copy.countSub}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true"/>
          </button>
        ) : null}
        {profile.canFinance ? (
          <button type="button" onClick={() => navigate(APP_ROUTES.treasury)} className="nf-interactive flex min-h-28 items-center gap-4 rounded-xl border border-border-strong bg-surface-secondary p-4 text-left hover:border-accent-primary">
            <Wallet className="h-9 w-9 shrink-0 text-accent-primary" aria-hidden="true"/>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-text-primary">{copy.money}</span>
              <span className="mt-1 block text-sm leading-snug text-text-secondary">{copy.moneySub}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true"/>
          </button>
        ) : null}
        {canReviewCount && !profile.canCount ? (
          <button type="button" onClick={() => navigate(APP_ROUTES.countVerificationV3)}
            className="nf-interactive flex min-h-24 items-center gap-4 rounded-xl border border-border-subtle bg-surface-secondary p-4 text-left hover:border-accent-primary">
            <ClipboardCheck className="h-8 w-8 shrink-0 text-accent-primary" aria-hidden="true"/>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-text-primary">{copy.reviewCount}</span>
              <span className="mt-1 block text-sm leading-snug text-text-secondary">{copy.reviewCountSub}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true"/>
          </button>
        ) : null}
        {profile.canAccountant ? (
          <button type="button" onClick={() => navigate(APP_ROUTES.accountant)} className="nf-interactive flex min-h-24 items-center gap-4 rounded-xl border border-border-subtle bg-surface-default p-4 text-left hover:border-accent-primary sm:col-span-2">
            <BookOpenCheck className="h-8 w-8 shrink-0 text-accent-primary" aria-hidden="true"/>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-text-primary">{copy.accountant}</span>
              <span className="mt-1 block text-sm leading-snug text-text-secondary">{copy.accountantSub}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true"/>
          </button>
        ) : null}
      </div>
      {profile.canFinance ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=income`)} className="nf-interactive flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent-primary px-3 text-sm font-semibold text-background-base">
            <ArrowDownLeft className="h-5 w-5 shrink-0" aria-hidden="true"/>{copy.income}
          </button>
          <button type="button" onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=expense`)} className="nf-interactive flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border-strong px-3 text-sm font-semibold text-accent-primary">
            <ArrowUpRight className="h-5 w-5 shrink-0" aria-hidden="true"/>{copy.expense}
          </button>
        </div>
      ) : null}
      {profile.canCount && profile.canFinance ? (
        <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-semantic-success" aria-hidden="true" />{copy.progress}
        </p>
      ) : null}
    </section>
  );
}
