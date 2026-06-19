import { APP_ROUTES } from '@/src/app/router/routes';
import { ArrowLeft, Wallet, Building2, Tags, Landmark, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FinanceSettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0">
      {/* Header */}
      <header className="flex-shrink-0 pt-8 pb-6 md:pt-10 md:pb-8">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(APP_ROUTES.finance)}
            className="p-2 -ml-2 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Voltar para Visão geral"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight">
              Organização financeira
            </h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto font-sans max-w-2xl">
        <div className="space-y-4">
          <button
            onClick={() => navigate(APP_ROUTES.financeSettingsEntities)}
            className="w-full bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-5 text-left transition-colors flex items-center gap-4 group"
          >
            <div className="w-12 h-12 bg-surface-elevated rounded-xl flex items-center justify-center border border-border-subtle shrink-0 group-hover:scale-105 transition-transform text-accent-primary">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-medium text-text-primary mb-1">Igrejas e CNPJs</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                 Cada igreja mantém seus próprios dados financeiros, mesmo quando é administrada pela mesma equipe.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
          </button>

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
