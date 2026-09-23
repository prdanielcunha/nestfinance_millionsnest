import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Building2, ExternalLink, LogOut } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import {
  canManageFinanceEntities,
  hasAnyEffectiveCapability,
  hasEffectiveCapability,
} from '@/src/lib/permissions';
import { getFinanceExperienceMode } from '@/src/lib/financeExperience';
import { buildFinanceNavigation, type FinanceNavigationId } from '@/src/lib/financeNavigationModel';
import { CANONICAL_NAVIGATION } from '@/src/app/layouts/ShellLayout';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { returnToMillionsNest, signOutNestFinanceAndReturnToHub } from '@/src/services/ecosystemExitService';

const ACCOUNT_COPY: Record<Language, { title: string; hub: string; signOut: string }> = {
  PT: { title: 'Conta', hub: 'Voltar ao MillionsNest', signOut: 'Sair do NestFinance' },
  EN: { title: 'Account', hub: 'Back to MillionsNest', signOut: 'Sign out of NestFinance' },
  ES: { title: 'Cuenta', hub: 'Volver a MillionsNest', signOut: 'Salir de NestFinance' },
};

export default function MorePage() {
  const { accessState } = useAuth();
  const { t, language } = useLanguage();
  const accountCopy = ACCOUNT_COPY[language];
  const experienceMode = getFinanceExperienceMode(accessState);
  const navigation = buildFinanceNavigation(experienceMode, {
    canView: hasEffectiveCapability(accessState, 'finance.view'),
    canCreate: hasEffectiveCapability(accessState, 'finance.create_drafts'),
    canReview: hasAnyEffectiveCapability(accessState, ['finance.review', 'finance.approve_for_posting']),
    canManage: hasAnyEffectiveCapability(accessState, ['finance.manage', 'organization.manage_entities']),
  });
  const moreItems = CANONICAL_NAVIGATION.filter(
    (item) =>
      navigation.more.includes(item.id as FinanceNavigationId) &&
      (!item.requiredAnyCapabilities || hasAnyEffectiveCapability(accessState, item.requiredAnyCapabilities)),
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col space-y-6 pt-4 font-sans fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{t('more_title')}</h1>
        <p className="mt-1 text-text-secondary">{t('more_desc')}</p>
      </header>

      {canManageFinanceEntities(accessState) ? (
        <section className="flex flex-col gap-3">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-text-muted">{t('shell_organization')}</h2>

          <Link
            to={APP_ROUTES.financeSettingsEntities}
            className="press-fx flex items-center rounded-xl border border-border-strong bg-surface-secondary p-4 transition-colors hover:bg-surface-elevated"
          >
            <div className="mr-4 rounded-lg bg-surface-elevated p-2 text-accent-primary">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-text-primary">{t('more_churches_title')}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{t('more_churches_desc')}</p>
            </div>
          </Link>
        </section>
      ) : null}

      {moreItems.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-text-muted">{t('more_other_areas')}</h2>

          {moreItems.map((item) => (
            <Link
              key={item.id}
              to={item.route}
              className="press-fx flex items-center rounded-xl border border-border-strong bg-surface-secondary p-4 transition-colors hover:bg-surface-elevated"
            >
              <div className="mr-4 rounded-lg bg-surface-elevated p-2">
                <item.icon className="h-5 w-5 text-text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-text-primary">{t(item.labelKey)}</p>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-text-muted">{accountCopy.title}</h2>
        <button
          type="button"
          onClick={returnToMillionsNest}
          className="press-fx flex min-h-14 items-center rounded-xl border border-border-strong bg-surface-secondary p-4 text-left transition-colors hover:bg-surface-elevated"
        >
          <ExternalLink className="mr-4 h-5 w-5 text-text-secondary" aria-hidden="true" />
          <span className="font-medium text-text-primary">{accountCopy.hub}</span>
        </button>
        <button
          type="button"
          onClick={() => void signOutNestFinanceAndReturnToHub()}
          className="press-fx flex min-h-14 items-center rounded-xl border border-border-subtle bg-background-base p-4 text-left transition-colors hover:bg-surface-secondary"
        >
          <LogOut className="mr-4 h-5 w-5 text-text-muted" aria-hidden="true" />
          <span className="font-medium text-text-secondary">{accountCopy.signOut}</span>
        </button>
      </section>
    </div>
  );
}
