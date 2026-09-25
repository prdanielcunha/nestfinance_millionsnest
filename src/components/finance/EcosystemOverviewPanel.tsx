import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Rows3,
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
import { subscribeFinanceDataChanges } from '@/src/services/financeFreshness';

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
  attentionFirst: string;
  allClear: string;
  updated: string;
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
    attentionFirst: 'Organizações que precisam de atenção',
    allClear: 'Nenhuma organização exige ação agora.',
    updated: 'Atualizado',
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
    attentionFirst: 'Organizations that need attention',
    allClear: 'No organization needs action right now.',
    updated: 'Updated',
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
    attentionFirst: 'Organizaciones que necesitan atención',
    allClear: 'Ninguna organización requiere acción ahora.',
    updated: 'Actualizado',
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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!accessState.isGlobalAccess) return;
    setLoading(true);
    setFailed(false);
    try {
      setOverview(await loadEcosystemOverview());
      setLastUpdatedAt(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accessState.isGlobalAccess, accessState.organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!accessState.isGlobalAccess) return;

    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === 'hidden' || !navigator.onLine) return;
      refreshing = true;
      try {
        await load();
      } finally {
        refreshing = false;
      }
    };

    const unsubscribe = subscribeFinanceDataChanges(() => void refresh());
    const onFocus = () => void refresh();
    const onOnline = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [accessState.isGlobalAccess, load]);

  const totals = overview?.totals;

  const visibleOrganizations = useMemo(() => {
    const priority: Record<EcosystemOrganizationOverview['state'], number> = {
      attention: 0,
      active: 1,
      clear: 2,
      unavailable: 3,
    };
    return [...(overview?.organizations || [])].sort((first, second) => {
      const stateDifference = priority[first.state] - priority[second.state];
      if (stateDifference !== 0) return stateDifference;
      if (first.id === overview?.activeOrganizationId) return -1;
      if (second.id === overview?.activeOrganizationId) return 1;
      return first.name.localeCompare(second.name);
    });
  }, [overview?.activeOrganizationId, overview?.organizations]);

  const attentionCount = visibleOrganizations.filter((organization) => organization.state === 'attention').length;
  const updatedLabel = lastUpdatedAt
    ? new Intl.DateTimeFormat(language === 'PT' ? 'pt-BR' : language === 'ES' ? 'es-ES' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(lastUpdatedAt)
    : null;

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
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <Button
              variant="ghost"
              leadingIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
              disabled={loading}
              onClick={() => void load()}
            >
              {copy.retry}
            </Button>
            {updatedLabel ? (
              <p className="px-2 text-sm text-text-muted" aria-live="polite">
                {copy.updated} {updatedLabel}
              </p>
            ) : null}
          </div>
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
          <div className="mt-5 rounded-2xl bg-background-base/55 px-4 py-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              {attentionCount > 0 ? (
                <span className="inline-flex items-center gap-2 font-semibold text-semantic-warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span className="nf-financial-number">{attentionCount}</span>
                  {copy.attentionOrganizations.toLowerCase()}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 font-medium text-semantic-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {copy.allClear}
                </span>
              )}
              <span className="text-text-secondary">
                <strong className="nf-financial-number text-text-primary">{totals.organizations}</strong> {copy.organizations.toLowerCase()}
              </span>
              <span className="text-text-secondary">
                <strong className="nf-financial-number text-text-primary">{totals.financeEntities}</strong> {copy.entities.toLowerCase()}
              </span>
              {(totals.openTransactions > 0 || totals.readyForReview > 0) ? (
                <>
                  <span className="text-text-secondary">
                    <strong className="nf-financial-number text-text-primary">{totals.openTransactions}</strong> {copy.openWork.toLowerCase()}
                  </span>
                  <span className="text-text-secondary">
                    <strong className="nf-financial-number text-text-primary">{totals.readyForReview}</strong> {copy.review.toLowerCase()}
                  </span>
                </>
              ) : null}
            </div>
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
          <div className="mb-3 px-1">
            <h3 className="text-sm font-semibold text-text-primary">{copy.attentionFirst}</h3>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {visibleOrganizations.map((organization) => {
              const state = statePresentation(organization, copy);
              const StateIcon = state.icon;
              const isCurrent = organization.id === overview.activeOrganizationId;
              const isSwitching = switchingOrganizationId === organization.id;

              return (
                <div
                  key={organization.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    organization.state === 'attention'
                      ? 'border-semantic-warning/25 bg-semantic-warning/5'
                      : isCurrent
                        ? 'border-accent-primary/20 bg-accent-primary/[0.04]'
                        : 'border-transparent bg-background-base/40 hover:border-border-subtle hover:bg-surface-default'
                  }`}
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
