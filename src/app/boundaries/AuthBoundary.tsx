import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { NestFinanceLogo } from '@/src/components/brand/NestFinanceLogo';
import { APP_ROUTES } from '@/src/app/router/routes';

interface Props {
  children: ReactNode;
}

function safeCurrentPath(): string {
  const candidate = `${window.location.pathname || APP_ROUTES.finance}${window.location.search || ''}`;
  return candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.includes('://') && !candidate.includes('\\')
    ? candidate
    : APP_ROUTES.finance;
}

export function AuthBoundary({ children }: Props) {
  const { authState } = useAuth();
  const isHandoffRoute = window.location.pathname.startsWith(APP_ROUTES.handoff);
  const isLoginRoute = window.location.pathname.startsWith(APP_ROUTES.login);

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

  if (authState === 'unauthenticated' && !isHandoffRoute && !isLoginRoute) {
    const destination = `${APP_ROUTES.login}?returnTo=${encodeURIComponent(safeCurrentPath())}`;
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}
