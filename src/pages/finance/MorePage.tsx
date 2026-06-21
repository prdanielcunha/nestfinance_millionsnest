import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FileText, ShieldCheck, Building2, Wallet, Tags } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { canManageFinanceEntities } from '@/src/lib/permissions';

export default function MorePage() {
  const { accessState } = useAuth();

  return (
    <div className="flex flex-col h-full fade-in space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Mais Opções</h1>
        <p className="text-text-secondary mt-1">Navegação adicional do sistema corporativo.</p>
      </header>

      {canManageFinanceEntities(accessState) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1">Organização</h2>
          
          <Link 
            to={APP_ROUTES.financeSettingsEntities}
            className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
          >
            <div className="p-2 bg-surface-elevated rounded-lg mr-4 text-accent-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text-primary">Igrejas e CNPJs</p>
              <p className="text-xs text-text-secondary mt-0.5">Gestão das igrejas que compõem a organização.</p>
            </div>
          </Link>
        </section>
      )}
      
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1">Gestão financeira</h2>
        
        <Link 
          to={APP_ROUTES.financeSettingsAccounts}
          className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
        >
          <div className="p-2 bg-surface-elevated rounded-lg mr-4">
            <Building2 className="w-5 h-5 text-text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Contas</p>
            <p className="text-xs text-text-secondary mt-0.5">Onde o dinheiro fica.</p>
          </div>
        </Link>
        <Link 
          to={APP_ROUTES.financeSettingsFunds}
          className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
        >
          <div className="p-2 bg-surface-elevated rounded-lg mr-4">
            <Wallet className="w-5 h-5 text-text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Fundos</p>
            <p className="text-xs text-text-secondary mt-0.5">Para que o dinheiro foi separado.</p>
          </div>
        </Link>
        <Link 
          to={APP_ROUTES.financeSettingsCategories}
          className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
        >
          <div className="p-2 bg-surface-elevated rounded-lg mr-4">
            <Tags className="w-5 h-5 text-text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Categorias</p>
            <p className="text-xs text-text-secondary mt-0.5">Por que o dinheiro entrou ou saiu.</p>
          </div>
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1 mt-2">Relatórios e Segurança</h2>
        <Link 
          to={APP_ROUTES.reports}
          className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
        >
          <div className="p-2 bg-surface-elevated rounded-lg mr-4">
            <FileText className="w-5 h-5 text-text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Reports</p>
            <p className="text-xs text-text-secondary mt-0.5">Relatórios e prestações de contas.</p>
          </div>
        </Link>
        <Link 
          to={APP_ROUTES.audit}
          className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
        >
          <div className="p-2 bg-surface-elevated rounded-lg mr-4">
            <ShieldCheck className="w-5 h-5 text-text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Audit</p>
            <p className="text-xs text-text-secondary mt-0.5">Histórico e trilha de auditoria.</p>
          </div>
        </Link>
      </section>
    </div>
  );
}
