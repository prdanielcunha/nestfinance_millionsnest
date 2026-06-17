import { ReactNode } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { Shield } from 'lucide-react';
import { config } from '@/src/config/env';

interface Props {
  children: ReactNode;
}

export function AuthBoundary({ children }: Props) {
  const { authState } = useAuth();
  
  const isHandoffRoute = window.location.pathname.startsWith('/auth/handoff');

  if (authState === 'initializing') {
    return (
      <div className="min-h-screen bg-background-base flex items-center justify-center p-4">
        <p className="text-sm text-text-muted animate-pulse">Verificando sessão segura...</p>
      </div>
    );
  }

  if (authState === 'error') {
    return (
      <div className="min-h-screen bg-background-base flex flex-col items-center justify-center p-4">
        <p className="text-sm text-semantic-danger mb-4">Falha ao verificar segurança local.</p>
      </div>
    );
  }

  if (authState === 'unauthenticated' && !isHandoffRoute) {
    return (
      <div className="min-h-screen bg-background-base flex flex-col items-center justify-center p-6 selection:bg-accent-primary/20">
        <div className="max-w-md w-full flex flex-col items-center text-center space-y-6 fade-in">
          <div className="h-16 w-16 bg-surface-elevated border border-border-strong rounded-2xl flex items-center justify-center shadow-lg mb-2">
            <Shield className="w-8 h-8 text-text-primary opacity-20" />
          </div>
          
          <div>
            <h1 className="text-xl font-medium text-text-primary mb-1">{config.appName}</h1>
            <p className="text-xs text-text-muted uppercase tracking-widest font-medium">Parte do ecossistema {config.platformName}</p>
          </div>

          <div className="w-full h-px bg-border-subtle my-2" />

          <p className="text-sm text-text-secondary">
            Entre pelo Hub MillionsNest para acessar com segurança.
          </p>
          
          <button 
            disabled
            className="mt-4 px-6 py-2.5 bg-surface-elevated border border-border-strong rounded-lg text-sm font-medium transition-colors text-text-muted w-full sm:w-auto opacity-50 cursor-not-allowed"
          >
            Voltar ao {config.platformName}
          </button>
        </div>
      </div>
    );
  }

  // Se handoff e unauthenticated, renderiza os childrens para a rota conseguir resolver
  return <>{children}</>;
}
