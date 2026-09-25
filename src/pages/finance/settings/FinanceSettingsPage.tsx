import { APP_ROUTES } from '@/src/app/router/routes';
import { ArrowLeft, ChevronRight, Landmark, Tags, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { Surface } from '@/src/components/foundation';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';

const COPY: Record<Language, {
  area: string;
  title: string;
  subtitle: string;
  back: string;
  accounts: string;
  accountsBody: string;
  funds: string;
  fundsBody: string;
  categories: string;
  categoriesBody: string;
}> = {
  PT: {
    area: 'Ajustes',
    title: 'Organização financeira',
    subtitle: 'Configure somente a estrutura que sua equipe realmente usa.',
    back: 'Voltar para o financeiro',
    accounts: 'Contas',
    accountsBody: 'Caixas, bancos e carteiras onde o dinheiro fica.',
    funds: 'Fundos',
    fundsBody: 'Separe recursos livres e valores destinados a uma finalidade.',
    categories: 'Categorias',
    categoriesBody: 'Organize os motivos das entradas e saídas.',
  },
  EN: {
    area: 'Settings',
    title: 'Finance organization',
    subtitle: 'Configure only the structure your team actually uses.',
    back: 'Back to finance',
    accounts: 'Accounts',
    accountsBody: 'Cash boxes, banks, and wallets where money is held.',
    funds: 'Funds',
    fundsBody: 'Separate unrestricted resources from money assigned to a purpose.',
    categories: 'Categories',
    categoriesBody: 'Organize the reasons behind income and expenses.',
  },
  ES: {
    area: 'Ajustes',
    title: 'Organización financiera',
    subtitle: 'Configura solamente la estructura que tu equipo realmente usa.',
    back: 'Volver a finanzas',
    accounts: 'Cuentas',
    accountsBody: 'Cajas, bancos y carteras donde se guarda el dinero.',
    funds: 'Fondos',
    fundsBody: 'Separa recursos libres de valores destinados a una finalidad.',
    categories: 'Categorías',
    categoriesBody: 'Organiza los motivos de los ingresos y egresos.',
  },
};

export default function FinanceSettingsPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COPY[language];

  const items = [
    { id: 'accounts', title: copy.accounts, body: copy.accountsBody, icon: Landmark, route: APP_ROUTES.financeSettingsAccounts },
    { id: 'funds', title: copy.funds, body: copy.fundsBody, icon: Wallet, route: APP_ROUTES.financeSettingsFunds },
    { id: 'categories', title: copy.categories, body: copy.categoriesBody, icon: Tags, route: APP_ROUTES.financeSettingsCategories },
  ];

  return (
    <div className="flex h-full flex-col bg-surface-base pb-20 font-sans fade-in md:pb-0">
      <FinanceEntityContextBar areaName={copy.area} />

      <header className="mx-auto flex w-full max-w-3xl shrink-0 items-start gap-3 px-4 py-5 sm:px-6">
        <button
          type="button"
          onClick={() => navigate(APP_ROUTES.finance)}
          className="nf-interactive flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-text-secondary hover:bg-surface-elevated"
          aria-label={copy.back}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 pt-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.title}</h1>
          <p className="mt-1 max-w-2xl text-base leading-relaxed text-text-secondary">{copy.subtitle}</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <Surface variant="secondary" radius="lg" className="divide-y divide-border-subtle overflow-hidden">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.route)}
              className="nf-interactive flex min-h-24 w-full items-center gap-4 px-4 py-5 text-left hover:bg-surface-elevated sm:px-5"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background-base/65 text-accent-primary">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-text-primary">{item.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-text-secondary">{item.body}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
            </button>
          ))}
        </Surface>
      </main>
    </div>
  );
}
