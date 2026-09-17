import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { NestFinanceLogo } from '@/src/components/brand/NestFinanceLogo';

interface Props {
  children: ReactNode;
}

const HUB_LAUNCH_URL = 'https://www.millionsnest.com/apps/nestfinance/launch';

function safeCurrentPath(): string {
  const candidate = String(window.location.pathname || '/finance').trim();
  return candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.includes('://') && !candidate.includes('\\')
    ? candidate
    : '/finance';
}

function DirectEntryRedirect() {
  useEffect(() => {
    const url = new URL(HUB_LAUNCH_URL);
    url.searchParams.set('returnTo', safeCurrentPath());
    window.location.replace(url.toString());
  }, []);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 selection:bg-accent-primary/20">
      <div className="max-w-md w-full flex flex-col items-center text-center space-y-6 fade-in">
        <NestFinanceLogo layout="horizontal" surface="dark" className="w-[512px] max-w-full mb-2 opacity-95" />
        <div className="w-full h-px bg-zinc-800 my-2" />
        <p className="text-sm text-zinc-400">Conectando sua sessão do MillionsNest...</p>
        <div className="w-6 h-6 rounded-full border-2 border-zinc-800 border-t-white animate-spin" />
      </div>
    </div>
  );
}

export function AuthBoundary({ children }: Props) {
  const { authState } = useAuth();
  const isHandoffRoute = window.location.pathname.startsWith('/auth/handoff');

  if (authState === 'initializing') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <NestFinanceLogo layout="horizontal" surface="dark" className="w-[448px] max-w-full mb-6 opacity-90 animate-pulse" />
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
    return <DirectEntryRedirect />;
  }

  return <>{children}</>;
}
