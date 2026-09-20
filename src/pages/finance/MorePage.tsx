import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Building2 } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import {
  canManageFinanceEntities,
  hasAnyEffectiveCapability,
  hasEffectiveCapability,
} from '@/src/lib/permissions';
import { getFinanceExperienceMode } from '@/src/lib/financeExperience';
import { buildFinanceNavigation } from '@/src/lib/financeNavigationModel';
import { CANONICAL_NAVIGATION } from '@/src/app/layouts/ShellLayout';
import { useLanguage } from '@/src/contexts/LanguageContext';

export default function MorePage() {
  const { accessState } = useAuth();
  const { t } = useLanguage();
  const experienceMode = getFinanceExperienceMode(accessState);
  const navigation = buildFinanceNavigation(experienceMode, {
    canView: hasEffectiveCapability(accessState, 'finance.view'),
    canCreate: hasEffectiveCapability(accessState, 'finance.create_drafts'),
    canReview: hasAnyEffectiveCapability(accessState, ['finance.review', 'finance.approve_for_posting']),
    canManage: hasAnyEffectiveCapability(accessState, ['finance.manage', 'organization.manage_entities']),
  });
  const moreItems = CANONICAL_NAVIGATION.filter(
    (item) =>
      navigation.more.includes(item.id as Parameters<typeof navigation.more.includes>[0]) &&
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
    </div>
  );
}
