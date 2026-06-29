import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Building2 } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { canManageFinanceEntities } from '@/src/lib/permissions';
import { CANONICAL_NAVIGATION } from '@/src/app/layouts/ShellLayout';

export default function MorePage() {
  const { accessState } = useAuth();
  const moreItems = CANONICAL_NAVIGATION.filter(i => i.group === 'more');

  return (
    <div className="flex flex-col h-full fade-in space-y-6 max-w-2xl mx-auto w-full pt-4">
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1">Outras Áreas</h2>
        
        {moreItems.map(item => (
          <Link 
            key={item.id}
            to={item.route}
            className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
          >
            <div className="p-2 bg-surface-elevated rounded-lg mr-4">
              <item.icon className="w-5 h-5 text-text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text-primary">{item.label}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
