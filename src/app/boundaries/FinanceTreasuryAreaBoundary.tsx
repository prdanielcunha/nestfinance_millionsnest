import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { getFinanceEntryProfile } from '@/src/lib/financeEntryProfile';

/** UI containment only. Canonical roles must ALSO be enforced by API handlers. */
export function FinanceTreasuryAreaBoundary({ children }: { children: ReactNode }) {
  const { accessState } = useAuth();
  const profile = getFinanceEntryProfile(accessState);
  if (profile.countOnly) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <div role="alert" className="rounded-2xl border border-border-strong bg-surface-default p-6">
          <h1 className="text-xl font-semibold text-text-primary">Área de trabalho financeiro</h1>
          <p className="mt-3 text-base leading-relaxed text-text-secondary">
            Sua função atual é da equipe de contagem. Para registrar despesas ou consultar a tesouraria, solicite autorização para essa função.
          </p>
          <Link className="nf-interactive mt-5 inline-flex min-h-12 items-center rounded-xl bg-accent-primary px-5 text-base font-semibold text-background-base" to={APP_ROUTES.count}>
            Ir para a contagem
          </Link>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
