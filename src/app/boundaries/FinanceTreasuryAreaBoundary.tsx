import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { getFinanceEntryProfile } from '@/src/lib/financeEntryProfile';

/** UI containment only. Canonical roles must ALSO be enforced by API handlers. */
export function FinanceTreasuryAreaBoundary({ children }: { children: ReactNode }) {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const profile = getFinanceEntryProfile(accessState);
  if (profile.countOnly) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <div role="alert" className="rounded-2xl border border-border-strong bg-surface-default p-6">
          <h1 className="text-xl font-semibold text-text-primary">{language === 'PT' ? 'Área de trabalho financeiro' : language === 'EN' ? 'Finance workspace' : 'Área de trabajo financiero'}</h1>
          <p className="mt-3 text-base leading-relaxed text-text-secondary">
            {language === 'PT' ? 'Sua função atual é da equipe de contagem. Para registrar despesas ou consultar a tesouraria, solicite autorização para essa função.' : language === 'EN' ? 'Your current role is on the count team. Ask for treasury access to record expenses or review financial transactions.' : 'Tu función actual es del equipo de conteo. Solicita acceso a tesorería para registrar gastos o revisar movimientos financieros.'}
          </p>
          <Link className="nf-interactive mt-5 inline-flex min-h-12 items-center rounded-xl bg-accent-primary px-5 text-base font-semibold text-background-base" to={APP_ROUTES.count}>
            {language === 'PT' ? 'Ir para a contagem' : language === 'EN' ? 'Go to counting' : 'Ir al conteo'}
          </Link>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
