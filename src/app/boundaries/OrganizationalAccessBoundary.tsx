import { ReactNode } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { canManageFinanceEntities } from '@/src/lib/permissions';
import { ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

export function OrganizationalAccessBoundary({ children }: Props) {
  const { accessState } = useAuth();
  
  // se o EcosystemAccessBoundary ainda não liberou (em tese nunca acontece se aninhado, mas por segurança):
  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') {
    return (
      <div className="flex h-[50vh] items-center justify-center fade-in">
        <div className="w-8 h-8 border-4 border-surface-elevated border-t-accent-primary rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = canManageFinanceEntities(accessState);

  if (!hasAccess) {
    return (
      <div className="flex flex-col h-full min-h-[60vh] bg-background-base antialiased text-text-base items-center justify-center p-6 text-center animate-in fade-in">
        <div className="w-12 h-12 bg-surface-elevated border border-semantic-danger/30 rounded-full flex items-center justify-center text-semantic-danger mb-4">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-medium text-text-primary mb-2">Acesso Negado</h1>
        <p className="text-sm text-text-secondary max-w-sm">
          Você não possui permissão para gerenciar a organização.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
