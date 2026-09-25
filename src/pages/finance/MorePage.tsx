import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Building2, ChevronRight, ExternalLink, LogOut } from 'lucide-react';
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
import { Surface } from '@/src/components/foundation';

const ACCOUNT_COPY: Record<Language, { title: string; hub: string; signOut: string }> = {
  PT: { title: 'Conta', hub: 'Voltar ao MillionsNest', signOut: 'Sair do NestFinance' },
  EN: { title: 'Account', hub: 'Back to MillionsNest', signOut: 'Sign out of NestFinance' },
  ES: { title: 'Cuenta', hub: 'Volver a MillionsNest', signOut: 'Salir de NestFinance' },
};

const NAV_DESCRIPTIONS: Record<Language, Partial<Record<FinanceNavigationId, string>>> = {
  PT: {
    transactions: 'Consulte entradas, saídas e transferências com filtros e detalhes.',
    balance: 'Confira diferenças e correspondências com o banco.',
    reports: 'Entenda resultados, fechamento e informações para o contador.',
    audit: 'Veja quem alterou o quê, quando e por qual origem.',
    settings: 'Organize contas, fundos, categorias e entidades financeiras.',
    inbox: 'Veja comprovantes recebidos e o que ainda precisa de confirmação.',
    review: 'Trabalhe apenas no que realmente precisa de conferência.',
    count: 'Acompanhe contagens, divergências e histórico dos cultos.',
  },
  EN: {
    transactions: 'Review income, expenses, and transfers with filters and detail.',
    balance: 'Check differences and likely matches against the bank.',
    reports: 'Understand results, closing status, and accountant-ready information.',
    audit: 'See who changed what, when, and from which source.',
    settings: 'Organize accounts, funds, categories, and finance entities.',
    inbox: 'See received receipts and what still needs confirmation.',
    review: 'Work only on items that truly need checking.',
    count: 'Track service counts, differences, and history.',
  },
  ES: {
    transactions: 'Consulta ingresos, egresos y transferencias con filtros y detalle.',
    balance: 'Revisa diferencias y coincidencias probables con el banco.',
    reports: 'Entiende resultados, cierre e información lista para el contador.',
    audit: 'Consulta quién cambió qué, cuándo y desde qué origen.',
    settings: 'Organiza cuentas, fondos, categorías y entidades financieras.',
    inbox: 'Revisa comprobantes recibidos y lo que aún necesita confirmación.',
    review: 'Trabaja solo en lo que realmente necesita revisión.',
    count: 'Acompaña conteos, diferencias e historial de los cultos.',
  },
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
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col space-y-7 pt-4 font-sans fade-in">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{t('more_title')}</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-secondary">{t('more_desc')}</p>
      </header>

      {canManageFinanceEntities(accessState) ? (
        <section aria-labelledby="more-organization-title">
          <h2 id="more-organization-title" className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
            {t('shell_organization')}
          </h2>
          <Surface variant="secondary" radius="lg" className="overflow-hidden">
            <Link
              to={APP_ROUTES.financeSettingsEntities}
              className="nf-interactive flex min-h-20 items-center gap-4 px-4 py-4 hover:bg-surface-elevated"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-text-primary">{t('more_churches_title')}</span>
                <span className="mt-1 block text-sm leading-relaxed text-text-secondary">{t('more_churches_desc')}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
            </Link>
          </Surface>
        </section>
      ) : null}

      {moreItems.length > 0 ? (
        <section aria-labelledby="more-areas-title">
          <h2 id="more-areas-title" className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
            {t('more_other_areas')}
          </h2>
          <Surface variant="secondary" radius="lg" className="divide-y divide-border-subtle overflow-hidden">
            {moreItems.map((item) => (
              <Link
                key={item.id}
                to={item.route}
                className="nf-interactive flex min-h-20 items-center gap-4 px-4 py-4 hover:bg-surface-elevated"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background-base/65 text-text-secondary">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-text-primary">{t(item.labelKey)}</span>
                  {NAV_DESCRIPTIONS[language][item.id as FinanceNavigationId] ? (
                    <span className="mt-1 block text-sm leading-relaxed text-text-secondary">
                      {NAV_DESCRIPTIONS[language][item.id as FinanceNavigationId]}
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
              </Link>
            ))}
          </Surface>
        </section>
      ) : null}

      <section aria-labelledby="more-account-title">
        <h2 id="more-account-title" className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
          {accountCopy.title}
        </h2>
        <Surface variant="secondary" radius="lg" className="divide-y divide-border-subtle overflow-hidden">
          <button
            type="button"
            onClick={returnToMillionsNest}
            className="nf-interactive flex min-h-16 w-full items-center gap-4 px-4 py-4 text-left hover:bg-surface-elevated"
          >
            <ExternalLink className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="flex-1 text-base font-semibold text-text-primary">{accountCopy.hub}</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void signOutNestFinanceAndReturnToHub()}
            className="nf-interactive flex min-h-16 w-full items-center gap-4 px-4 py-4 text-left hover:bg-surface-elevated"
          >
            <LogOut className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
            <span className="flex-1 text-base font-semibold text-text-secondary">{accountCopy.signOut}</span>
          </button>
        </Surface>
      </section>
    </div>
  );
}
