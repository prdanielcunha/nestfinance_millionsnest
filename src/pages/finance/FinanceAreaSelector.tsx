import { useNavigate } from 'react-router-dom';
import { Calculator, ClipboardList, BookOpen, ArrowRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import type { Language } from '@/src/contexts/LanguageContext';
import type { FinanceAreaEntry } from '@/src/lib/financeAreaEntry';

const COPY = {
  PT: {
    title: 'O que você vai fazer?',
    subtitle: 'Cada equipe tem seu espaço. A contagem dos cultos não é o trabalho do contador profissional.',
    count: 'Contar dízimos e ofertas',
    countBody: 'Equipe de contagem: escolher ou continuar um culto, registrar os valores e fazer a conferência com outra pessoa.',
    finance: 'Cuidar do financeiro',
    financeBody: 'Tesouraria: registrar entradas, despesas, comprovantes, contas, saldos, repasses e conferir o mês.',
    accountant: 'Espaço do contador',
    accountantBody: 'Profissional de contabilidade: revisar movimentações, conciliação, pendências e pacotes de exportação.',
    income: 'Registrar entrada',
    expense: 'Registrar despesa',
    open: 'Entrar',
  },
  EN: {
    title: 'What will you do?',
    subtitle: 'Each team has its own workspace. Service counting is not the accountant’s job.',
    count: 'Count tithes and offerings',
    countBody: 'Counting team: select or resume a service, record amounts and have another person check independently.',
    finance: 'Manage church finances',
    financeBody: 'Treasury: record income, expenses, receipts, bills, balances, transfers and monthly checks.',
    accountant: 'Accountant workspace',
    accountantBody: 'Professional accountant: review transactions, reconciliation, open issues and export packages.',
    income: 'Record income',
    expense: 'Record expense',
    open: 'Open',
  },
  ES: {
    title: '¿Qué vas a hacer?',
    subtitle: 'Cada equipo tiene su espacio. Contar el culto no es el trabajo del contador profesional.',
    count: 'Contar diezmos y ofrendas',
    countBody: 'Equipo de conteo: elegir o continuar un culto, registrar valores y hacer la segunda revisión con otra persona.',
    finance: 'Cuidar las finanzas',
    financeBody: 'Tesorería: registrar ingresos, gastos, comprobantes, cuentas, saldos, traspasos y revisar el mes.',
    accountant: 'Espacio del contador',
    accountantBody: 'Profesional contable: revisar movimientos, conciliación, pendientes y paquetes de exportación.',
    income: 'Registrar ingreso',
    expense: 'Registrar gasto',
    open: 'Entrar',
  },
} as const;

type Props = {
  language: Language;
  areas: FinanceAreaEntry;
  canRegister: boolean;
};

export function FinanceAreaSelector({ language, areas, canRegister }: Props) {
  const navigate = useNavigate();
  const copy = COPY[language];
  const cards = [
    areas.count ? { id: 'count', icon: ClipboardList, title: copy.count, body: copy.countBody, route: APP_ROUTES.count } : null,
    areas.treasury ? { id: 'treasury', icon: Calculator, title: copy.finance, body: copy.financeBody, route: APP_ROUTES.financeDaily } : null,
    areas.accountant ? { id: 'accountant', icon: BookOpen, title: copy.accountant, body: copy.accountantBody, route: APP_ROUTES.reports } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  if (!cards.length) return null;
  return (
    <section aria-labelledby="finance-area-selector-title" className="nf-spec-paper rounded-[1.75rem] border border-border-strong bg-surface-default px-5 py-6 sm:px-7">
      <h2 id="finance-area-selector-title" className="text-2xl font-semibold tracking-tight text-text-primary">{copy.title}</h2>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-secondary">{copy.subtitle}</p>
      <div className={`mt-5 grid gap-3 ${cards.length >= 3 ? 'lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button type="button" key={card.id} onClick={() => navigate(card.route)}
              className="nf-interactive group flex min-h-48 w-full flex-col items-start rounded-2xl border border-border-subtle bg-surface-elevated p-5 text-left hover:border-accent-primary focus-visible:outline-2 focus-visible:outline-accent-primary">
              <Icon className="h-7 w-7 text-accent-primary" aria-hidden="true" />
              <span className="mt-4 block text-xl font-semibold leading-snug text-text-primary">{card.title}</span>
              <span className="mt-2 block flex-1 text-sm leading-relaxed text-text-secondary">{card.body}</span>
              <span className="mt-4 flex items-center gap-2 text-sm font-bold text-accent-primary">{copy.open}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
            </button>
          );
        })}
      </div>
      {areas.treasury && canRegister ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=income`)}
            className="nf-interactive flex min-h-14 flex-1 items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface-secondary px-4 py-3 text-base font-semibold text-text-primary hover:bg-surface-elevated">
            <ArrowDownLeft className="h-5 w-5 text-semantic-success" aria-hidden="true" />{copy.income}
          </button>
          <button type="button" onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=expense`)}
            className="nf-interactive flex min-h-14 flex-1 items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface-secondary px-4 py-3 text-base font-semibold text-text-primary hover:bg-surface-elevated">
            <ArrowUpRight className="h-5 w-5 text-semantic-danger" aria-hidden="true" />{copy.expense}
          </button>
        </div>
      ) : null}
    </section>
  );
}
