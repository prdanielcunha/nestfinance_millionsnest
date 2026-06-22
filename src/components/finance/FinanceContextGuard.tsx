import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useAuth } from '@/src/hooks/useAuth';

export function FinanceContextGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { accessState } = useAuth();
  
  if (!accessState.organization) return null;
  if (activeFinanceEntityId) return <>{children}</>;

  // Redirect to /finance to select an entity, preserving intended route
  const returnTo = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`${APP_ROUTES.finance}?returnTo=${returnTo}`} replace />;
}
