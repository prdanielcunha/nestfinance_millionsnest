import { ReactNode } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { ShieldAlert, LogIn, AlertTriangle, CloudOff } from 'lucide-react';
import { config } from '@/src/config/env';

interface Props {
  children: ReactNode;
}

export function EcosystemAccessBoundary({ children }: Props) {
  const { accessState } = useAuth();
  
  const isPreview = import.meta.env.DEV && window.location.pathname === '/__preview/foundation';

  if (isPreview) {
    return <>{children}</>;
  }

  const { status } = accessState;

  if (status === 'initializing' || status === 'authenticated_unresolved') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <img src="/logo_load.png" alt="NestFinance" className="w-[448px] max-w-full h-auto mb-6 opacity-90 animate-pulse" referrerPolicy="no-referrer" />
        <p className="text-xs text-zinc-500 tracking-widest uppercase animate-pulse">Verificando segurança do ecossistema...</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <img src="/logo_load.png" alt="NestFinance" className="w-[512px] max-w-full h-auto mb-6 opacity-95" referrerPolicy="no-referrer" />
        <h1 className="text-lg font-medium text-white mb-2">Acesso necessário</h1>
        <p className="text-sm text-zinc-400 max-w-sm mb-6">
          Você precisa entrar pelo Hub MillionsNest para acessar o NestFinance.
        </p>
        <button disabled className="px-5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-medium text-zinc-500 opacity-50 cursor-not-allowed">
          Ir para o {config.platformName} Hub
        </button>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen bg-background-base flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 bg-surface-elevated border border-semantic-danger/30 rounded-full flex items-center justify-center text-semantic-danger mb-4">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-medium text-text-primary mb-2">Acesso Negado</h1>
        <p className="text-sm text-text-secondary max-w-sm">
          Você não possui permissão para acessar o NestFinance com esta conta.
        </p>
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="min-h-screen bg-background-base flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 bg-surface-elevated border border-semantic-warning/30 rounded-full flex items-center justify-center text-semantic-warning mb-4">
          <CloudOff className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-medium text-text-primary mb-2">Serviço Indisponível</h1>
        <p className="text-sm text-text-secondary max-w-sm mb-6">
          A resolução de acesso temporariamente indisponível.
        </p>
        <button onClick={() => window.location.reload()} className="px-5 py-2 bg-surface-elevated border border-border-strong rounded-lg text-sm font-medium transition-colors hover:bg-surface-hover text-text-primary">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-background-base flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 bg-surface-elevated border border-semantic-danger/30 rounded-full flex items-center justify-center text-semantic-danger mb-4">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-medium text-text-primary mb-2">Falha Genérica</h1>
        <p className="text-sm text-text-secondary max-w-sm mb-6">
          Não foi possível verificar seu acesso no momento.
        </p>
        <button onClick={() => window.location.reload()} className="px-5 py-2 bg-surface-elevated border border-border-strong rounded-lg text-sm font-medium transition-colors hover:bg-surface-hover text-text-primary">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (status === 'granted') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center">
      <p className="text-sm text-text-muted">Acesso indisponível.</p>
    </div>
  );
}
