import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Landmark,
  RefreshCw,
  Rows3,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Surface } from '@/src/components/foundation';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import {
  loadEcosystemOverview,
  type EcosystemOrganizationOverview,
  type EcosystemOverview,
} from '@/src/services/ecosystemOverviewService';
import { chooseCurrentSessionOrganization } from '@/src/services/directEntryService';
import { APP_ROUTES } from '@/src/app/router/routes';

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  organizations: string;
  entities: string;
  openWork: string;
  review: string;
  attentionOrganizations: string;
  current: string;
  open: string;
  noOpenWork: string;
  attention: string;
  active: string;
  unavailable: string;
  unavailableText: string;
  failedTitle: string;
  failedText: string;
  retry: string;
  switching: string;
  switchFailed: string;
  truncated: string;
};

const COPY: Record<Language, Copy> = {
  PT: {
    eyebrow: 'Visão do ecossistema',
    title: 'MillionsNest Finance agora',
    subtitle: 'Veja onde existe trabalho financeiro aberto antes de entrar em cada organização.',
    organizations: 'Organizações',
    entities: 'Entidades financeiras',
    openWork: 'Movimentações abertas',
    review: 'Para conferência',
    attentionOrganizations: 'Com atenção',
    current: 'Atual',
    open: 'Abrir organização',
    noOpenWork: 'Sem movimentações abertas',
    attention: 'Precisa de atenção',
    active: 'Em andamento',
    unavailable: 'Indisponível',
    unavailableText: 'Alguns dados desta organização não puderam ser resumidos agora.',
    failedTitle: 'A visão do ecossistema não carregou',
    failedText: 'Sua organização atual continua disponível. Tente atualizar esta visão.',
    retry: 'Atualizar',
    switching: 'Abrindo organização…',
    switchFailed: 'Não foi possível trocar de organização agora.',
    truncated: 'Mostrando as primeiras 100 organizações com NestFinance ativo.',
  },
  EN: {
    eyebrow: 'Ecosystem view',
    title: 'MillionsNest Finance now',
    subtitle: 'See where finance work is open before entering each organization.',
    organizations: 'Organizations',
    entities: 'Finance entities',
    openWork: 'Open transactions',
    review: 'Needs review',
    attentionOrganizations: 'Need attention',
    current: 'Current',
    open: 'Open organization',
    noOpenWork: 'No open transactions',
    attention: 'Needs attention',
    active: 'In progress',
    unavailable: 'Unavailable',
    unavailableText: 'Some data for this organization could not be summarized right now.',
    failedTitle: 'The ecosystem view could not load',
    failedText: 'Your current organization remains available. Try refreshing this view.',
    retry: 'Refresh',
    switching: 'Opening organization…',
    switchFailed: 'The organization could not be switched right now.',
    truncated: 'Showing the first 100 organizations with NestFinance active.',
  },
  ES: {
    eyebrow: 'Visión del ecosistema',
    title: 'MillionsNest Finance ahora',
    subtitle: 'Mira dónde hay trabajo financiero abierto antes de entrar en cada organización.',
    organizations: 'Organizaciones',
    entities: 'Entidades financieras',
    openWork: 'Movimientos abiertos',
    review: 'Para revisión',
    attentionOrganizations: 'Con atención',
    current: 'Actual',
    open: 'Abrir organización',
    noOpenWork: 'Sin movimientos abiertos',
    attention: 'Necesita atención',
    active: 'En curso',
    unavailable: 'No disponible',
    unavailableText: 'Algunos datos de esta organización no pudieron resumirse ahora.',
    failedTitle: 'No se pudo cargar la visión del ecosistema',
    failedText: 'Tu organización actual sigue disponible. Intenta actualizar esta visión.',
    retry: 'Actualizar',
    switching: 'Abriendo organización…',
    switchFailed: 'No fue posible cambiar de organización ahora.',
    truncated: 'Mostrando las primeras 100 organizaciones con NestFinance activo.',
  },
};

function statePresentation(organization: EcosystemOrganizationOverview, copy: Copy) {
  if (organization.state === 'attention') {
    return { label: copy.attention, icon: AlertTriangle, className: 'text-semantic-warning bg-semantic-warning/10' };
  }
  if (organization.state === 'active') {
    return { label: copy.active, icon: Rows3, className: 'text-accent-primary bg-accent-primary/10' };
  }
  if (organization.state === 'unavailable') {
    return { label: copy.unavailable, icon: AlertTriangle, className: 'text-text-muted bg-surface-secondary' };
  }
  return { label: copy.noOpenWork, icon: CheckCircle2, className: 'text-semantic-success bg-semantic-success/10' };
}

export function EcosystemOverviewPanel() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const {
    setActiveFinanceEntityId,
    refreshAccessibleFinanceEntities,
  } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COPY[language];

  const [overview, setOverview] = useState<EcosystemOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<string | null>(null);
  const [switchFailed, setSwitchFailed] = useState(false);

  const load = useCallback(async () => {
    if (!accessState.isGlobalAccess) return;
    setLoading(true);
    setFailed(false);
    try {
      setOverview(await loadEcosystemOverview());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accessState.isGlobalAccess]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = overview?.totals;

  const visibleOrganizations = useMemo(
    () => overview?.organizations || [],
    [overview?.organizations],
  );

  const openOrganization = async (organizationId: string) => {
    if (!overview || organizationId === overview.activeOrganizationId) return;

    setSwitchFailed(false);
    setSwitchingOrganizationId(organizationId);
    try {
      const result = await chooseCurrentSessionOrganization(organizationId);
      if (result.status !== 'ready') throw new Error('ORGANIZATION_SWITCH_NOT_READY');

      setActiveFinanceEntityId(null);
      await refreshAccessibleFinanceEntities();
      navigate(APP_ROUTES.finance, { replace: true });
    } catch {
      setSwitchFailed(true);
    } finally {
      setSwitchingOrganizationId(null);
    }
  };

  if (!accessState.isGlobalAccess) return null;

  return (
    <Surface variant="glass" radius="xl" className="overflow-hidden">
      <div className="border-b border-border-subtle p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">
              {copy.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-text-primary sm:text-2xl">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
              {copy.subtitle}
            </p>
          </div>
          <Button
            variant="ghost"
            leadingIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
            disabled={loading}
            onClick={() => void load()}
          >
            {copy.retry}
          </Button>
        </div>

        {failed ? (
          <div className="mt-5 rounded-2xl border border-semantic-warning/20 bg-semantic-warning/10 p-4">
            <p className="text-sm font-semibold text-text-primary">{copy.failedTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{copy.failedText}</p>
          </div>
        ) : null}

        {switchFailed ? (
          <div className="mt-4 rounded-xl border border-semantic-warning/20 bg-semantic-warning/10 px-4 py-3 text-xs font-medium text-text-secondary">
            {copy.switchFailed}
          </div>
        ) : null}

        {totals ? (
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: copy.organizations, value: totals.organizations, icon: Building2 },
              { label: copy.entities, value: totals.financeEntities, icon: Landmark },
              { label: copy.openWork, value: totals.openTransactions, icon: Rows3 },
              { label: copy.review, value: totals.readyForReview, icon: ShieldCheck },
              { label: copy.attentionOrganizations, value: totals.organizationsNeedingAttention, icon: AlertTriangle },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border-subtle bg-background-base/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-text-muted">{item.label}</span>
                  <item.icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                </div>
                <div className="nf-financial-number mt-3 text-2xl font-semibold tracking-tight text-text-primary">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : loading ? (
          <div className="mt-5 flex min-h-24 items-center justify-center text-sm text-text-secondary" aria-live="polite">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin text-accent-primary" aria-hidden="true" />
            {copy.retry}
          </div>
        ) : null}
      </div>

      {overview && !failed ? (
        <div className="p-3 sm:p-4">
          <div className="grid gap-2 lg:grid-cols-2">
            {visibleOrganizations.map((organization) => {
              const state = statePresentation(organization, copy);
              const StateIcon = state.icon;
              const isCurrent = organization.id === overview.activeOrganizationId;
              const isSwitching = switchingOrganizationId === organization.id;

              return (
                <div
                  key={organization.id}
                  className="rounded-2xl border border-border-subtle bg-surface-default p-4 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${state.className}`}>
                      <StateIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-text-primary">{organization.name}</h3>
                        {isCurrent ? (
                          <span className="rounded-md bg-accent-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-primary">
                            {copy.current}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs font-medium text-text-muted">{state.label}</p>

                      {organization.state === 'unavailable' ? (
                        <p className="mt-3 text-xs leading-relaxed text-text-muted">{copy.unavailableText}</p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
                          <span><strong className="nf-financial-number text-text-primary">{organization.financeEntities}</strong> {copy.entities.toLowerCase()}</span>
                          <span><strong className="nf-financial-number text-text-primary">{organization.openTransactions}</strong> {copy.openWork.toLowerCase()}</span>
                          <span><strong className="nf-financial-number text-text-primary">{organization.readyForReview}</strong> {copy.review.toLowerCase()}</span>
                        </div>
                      )}
                    </div>

                    {!isCurrent && organization.state !== 'unavailable' ? (
                      <button
                        type="button"
                        disabled={Boolean(switchingOrganizationId)}
                        onClick={() => void openOrganization(organization.id)}
                        className="nf-interactive flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-accent-primary hover:bg-accent-primary/10 disabled:opacity-50"
                      >
                        <span className="hidden sm:inline">{isSwitching ? copy.switching : copy.open}</span>
                        <ChevronRight className={`h-4 w-4 ${isSwitching ? 'animate-pulse' : ''}`} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {overview.truncated ? (
            <p className="px-2 pb-1 pt-4 text-xs text-text-muted">{copy.truncated}</p>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}
