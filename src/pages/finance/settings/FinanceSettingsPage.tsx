import { APP_ROUTES } from '@/src/app/router/routes';
import { Wallet, Tags, Landmark, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FinanceContextHeader } from '@/src/components/finance/FinanceContextHeader';

export default function FinanceSettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0">
      <FinanceContextHeader
        pageName="Organização Financeira"
        title="Organização Financeira"
        backTo={APP_ROUTES.finance}
      />

      {/* Content */}
      <main className="flex-1 overflow-y-auto font-sans max-w-2xl px-4 py-8">
        <div className="space-y-4">
          <button
            onClick={() => navigate(APP_ROUTES.financeSettingsAccounts)}
            className="w-full bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-5 text-left transition-colors flex items-center gap-4 group"
          >
            <div className="w-12 h-12 bg-surface-elevated rounded-xl flex items-center justify-center border border-border-subtle shrink-0 group-hover:scale-105 transition-transform text-text-base">
              <Landmark className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-medium text-text-primary mb-1">Contas</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Cadastre caixas, bancos e carteiras onde o dinheiro fica.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
          </button>

          <button
            onClick={() => navigate(APP_ROUTES.financeSettingsFunds)}
            className="w-full bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-5 text-left transition-colors flex items-center gap-4 group"
          >
            <div className="w-12 h-12 bg-surface-elevated rounded-xl flex items-center justify-center border border-border-subtle shrink-0 group-hover:scale-105 transition-transform text-text-base">
              <Wallet className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-medium text-text-primary mb-1">Fundos</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Separe recursos livres e valores destinados a uma finalidade.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
          </button>

          <button
            onClick={() => navigate(APP_ROUTES.financeSettingsCategories)}
            className="w-full bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-5 text-left transition-colors flex items-center gap-4 group"
          >
            <div className="w-12 h-12 bg-surface-elevated rounded-xl flex items-center justify-center border border-border-subtle shrink-0 group-hover:scale-105 transition-transform text-text-base">
              <Tags className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-medium text-text-primary mb-1">Categorias</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Organize os motivos das entradas e saídas.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
          </button>
        </div>
      </main>
    </div>
  );
}
