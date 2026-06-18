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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <img src="/logo_load.png" alt="NestFinance" className="w-56 max-w-full h-auto mb-6 opacity-90 animate-pulse" referrerPolicy="no-referrer" />
        <p className="text-xs text-zinc-500 tracking-widest uppercase animate-pulse">Verificando sessão segura...</p>
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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 selection:bg-accent-primary/20">
        <div className="max-w-md w-full flex flex-col items-center text-center space-y-6 fade-in">
          <img src="/logo_load.png" alt="NestFinance" className="w-64 max-w-full h-auto mb-2 opacity-95" referrerPolicy="no-referrer" />
          
          <div className="w-full h-px bg-zinc-800 my-2" />

          <p className="text-sm text-zinc-400">
            Entre pelo Hub MillionsNest para acessar com segurança.
          </p>
          
          <button 
            disabled
            className="mt-4 px-6 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-medium transition-colors text-zinc-500 w-full sm:w-auto opacity-50 cursor-not-allowed"
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
