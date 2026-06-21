import { ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useAuth } from '@/src/hooks/useAuth';

export function FinanceContextGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { accessState } = useAuth();
  
  if (!accessState.organization) return null;
  if (activeFinanceEntityId) return <>{children}</>;

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
      <div className="w-16 h-16 bg-surface-secondary rounded-2xl flex items-center justify-center mb-6 text-text-muted border border-border-subtle">
        <Building2 className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">Selecione uma igreja para continuar.</h3>
      <p className="text-sm text-text-muted max-w-sm mb-6">
         Você precisa escolher qual entidade financeira deseja acessar antes de visualizar esta seção.
      </p>
      <button
        onClick={() => navigate(APP_ROUTES.finance)}
        className="h-10 px-4 flex items-center justify-center mx-auto bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
      >
        Voltar para o início
      </button>
    </main>
  );
}
