import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NestFinanceLogo } from '@/src/components/brand/NestFinanceLogo';
import { EcosystemAccessBoundary } from '../boundaries/EcosystemAccessBoundary';
import { FinanceEntityProvider, useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { APP_ROUTES } from '../router/routes';
import { LayoutDashboard, Receipt, Wallet, Inbox, FileText, ShieldCheck, MoreHorizontal, Settings, Plus, Camera, Globe, ChevronsUpDown, ArrowRightLeft, ListChecks, Search, LogOut, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState, type ElementType } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { hasAnyEffectiveCapability, hasEffectiveCapability } from '@/src/lib/permissions';
import { getFinanceExperienceMode, type FinanceExperienceMode } from '@/src/lib/financeExperience';
import { buildFinanceNavigation } from '@/src/lib/financeNavigationModel';
import {
  chooseCurrentSessionOrganization,
  resolveCurrentSessionOrganizations,
  type DirectEntryOrganization,
} from '@/src/services/directEntryService';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { Button } from '@/src/components/foundation';
import { FinanceCommandPalette } from '@/src/components/finance/FinanceCommandPalette';
import type { FinancePaletteCommand } from '@/src/lib/financeCommandPaletteModel';
import { returnToMillionsNest, signOutNestFinanceAndReturnToHub } from '@/src/services/ecosystemExitService';

export type NavigationItem = {
  id: string;
  labelKey: 'nav_hoje' | 'nav_movimentacoes' | 'nav_cultos' | 'nav_capturas' | 'nav_revisar' | 'nav_conferir' | 'nav_reports' | 'nav_audit' | 'nav_config' | 'nav_mais';
  icon: ElementType;
  route: string;
  order: number;
  requiredAnyCapabilities?: readonly string[];
};

export const CANONICAL_NAVIGATION: NavigationItem[] = [
  { id: 'finance', labelKey: 'nav_hoje', icon: LayoutDashboard, route: APP_ROUTES.finance, order: 1 },
  { id: 'transactions', labelKey: 'nav_movimentacoes', icon: ArrowRightLeft, route: APP_ROUTES.transactions, order: 2, requiredAnyCapabilities: ['finance.view'] },
  { id: 'count', labelKey: 'nav_cultos', icon: Receipt, route: APP_ROUTES.count, order: 3, requiredAnyCapabilities: ['finance.view'] },
  { id: 'inbox', labelKey: 'nav_capturas', icon: Inbox, route: APP_ROUTES.inbox, order: 4, requiredAnyCapabilities: ['finance.view', 'finance.create_drafts', 'finance.review'] },
  { id: 'review', labelKey: 'nav_revisar', icon: ListChecks, route: APP_ROUTES.financeReview, order: 5, requiredAnyCapabilities: ['finance.review', 'finance.approve_for_posting'] },
  { id: 'balance', labelKey: 'nav_conferir', icon: Wallet, route: APP_ROUTES.balance, order: 6, requiredAnyCapabilities: ['finance.view'] },
  { id: 'reports', labelKey: 'nav_reports', icon: FileText, route: APP_ROUTES.reports, order: 7, requiredAnyCapabilities: ['finance.view'] },
  { id: 'audit', labelKey: 'nav_audit', icon: ShieldCheck, route: APP_ROUTES.audit, order: 8, requiredAnyCapabilities: ['finance.view'] },
  { id: 'settings', labelKey: 'nav_config', icon: Settings, route: APP_ROUTES.financeSettings, order: 9, requiredAnyCapabilities: ['finance.manage', 'organization.manage_entities'] },
];

const SHELL_COPY: Record<Language, {
  profile: string;
  language: string;
  selectLanguage: string;
  closeActions: string;
  capture: string;
  workspace: string;
  switchOrganization: string;
  switchOrganizationTitle: string;
  switchOrganizationText: string;
  switchOrganizationFailed: string;
  close: string;
  commandOpen: string;
  commandTitle: string;
  commandPlaceholder: string;
  commandEmpty: string;
  commandNavigation: string;
  commandActions: string;
  backToHub: string;
  signOut: string;
}> = {
  PT: {
    profile: 'Perfil',
    language: 'Idioma',
    selectLanguage: 'Selecionar idioma',
    closeActions: 'Fechar atalhos de registro',
    capture: 'Capturar comprovante',
    workspace: 'Experiência',
    switchOrganization: 'Trocar organização',
    switchOrganizationTitle: 'Escolher organização',
    switchOrganizationText: 'Você continuará no NestFinance. O acesso será validado novamente antes da troca.',
    switchOrganizationFailed: 'Não foi possível carregar suas organizações agora.',
    close: 'Fechar',
    commandOpen: 'Ir para…',
    commandTitle: 'Ir para ou agir',
    commandPlaceholder: 'Buscar área ou ação…',
    commandEmpty: 'Nenhum destino encontrado.',
    commandNavigation: 'Navegação',
    commandActions: 'Ações rápidas',
    backToHub: 'Voltar ao MillionsNest',
    signOut: 'Sair do NestFinance',
  },
  EN: {
    profile: 'Profile',
    language: 'Language',
    selectLanguage: 'Select language',
    closeActions: 'Close record shortcuts',
    capture: 'Capture receipt',
    workspace: 'Experience',
    switchOrganization: 'Switch organization',
    switchOrganizationTitle: 'Choose organization',
    switchOrganizationText: 'You will stay in NestFinance. Access is revalidated before switching.',
    switchOrganizationFailed: 'Your organizations could not be loaded right now.',
    close: 'Close',
    commandOpen: 'Go to…',
    commandTitle: 'Go to or act',
    commandPlaceholder: 'Search area or action…',
    commandEmpty: 'No destination found.',
    commandNavigation: 'Navigation',
    commandActions: 'Quick actions',
    backToHub: 'Back to MillionsNest',
    signOut: 'Sign out of NestFinance',
  },
  ES: {
    profile: 'Perfil',
    language: 'Idioma',
    selectLanguage: 'Seleccionar idioma',
    closeActions: 'Cerrar accesos de registro',
    capture: 'Capturar comprobante',
    workspace: 'Experiencia',
    switchOrganization: 'Cambiar organización',
    switchOrganizationTitle: 'Elegir organización',
    switchOrganizationText: 'Seguirás en NestFinance. El acceso se vuelve a validar antes del cambio.',
    switchOrganizationFailed: 'No fue posible cargar tus organizaciones ahora.',
    close: 'Cerrar',
    commandOpen: 'Ir a…',
    commandTitle: 'Ir o actuar',
    commandPlaceholder: 'Buscar área o acción…',
    commandEmpty: 'No se encontró ningún destino.',
    commandNavigation: 'Navegación',
    commandActions: 'Acciones rápidas',
    backToHub: 'Volver a MillionsNest',
    signOut: 'Salir de NestFinance',
  },
};


const EXPERIENCE_LABELS: Record<Language, Record<FinanceExperienceMode, string>> = {
  PT: {
    ecosystem: 'Visão do ecossistema',
    organization_admin: 'Administração da organização',
    review: 'Conferência e aprovação',
    operation: 'Operação financeira',
    read_only: 'Consulta',
  },
  EN: {
    ecosystem: 'Ecosystem view',
    organization_admin: 'Organization administration',
    review: 'Review and approval',
    operation: 'Finance operations',
    read_only: 'Read only',
  },
  ES: {
    ecosystem: 'Visión del ecosistema',
    organization_admin: 'Administración de la organización',
    review: 'Revisión y aprobación',
    operation: 'Operación financiera',
    read_only: 'Consulta',
  },
};

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'PT', label: 'PT' },
  { value: 'EN', label: 'EN' },
  { value: 'ES', label: 'ES' },
];

function getInitials(name: string) {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function LanguageSwitcher({ language, setLanguage, compact = false }: { language: Language; setLanguage: (language: Language) => void; compact?: boolean }) {
  const copy = SHELL_COPY[language];

  return (
    <label className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <span className={compact ? 'sr-only' : 'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted'}>
        {!compact ? <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
        {copy.language}
      </span>
      <span className="relative">
        {compact ? <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" /> : null}
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value as Language)}
          aria-label={copy.selectLanguage}
          className={`nf-interactive min-h-11 appearance-none rounded-xl border border-border-subtle bg-background-base text-xs font-bold text-text-secondary outline-none hover:border-border-strong hover:text-text-primary focus:border-accent-primary ${compact ? 'w-[4.5rem] pl-8 pr-2' : 'w-[4.25rem] px-3'}`}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function ShellLayoutInner() {
  const { accessState } = useAuth();
  const {
    activeFinanceEntityName,
    setActiveFinanceEntityId,
    refreshAccessibleFinanceEntities,
  } = useFinanceEntity();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const copy = SHELL_COPY[language];

  const orgName = accessState.organization?.name || t('shell_waiting');
  const profileName = accessState.profile?.displayName || copy.profile;
  const profilePhoto = accessState.profile?.photoURL;
  const experienceMode = getFinanceExperienceMode(accessState);

  const [fabOpen, setFabOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [organizationSwitcherOpen, setOrganizationSwitcherOpen] = useState(false);
  const [organizationSwitcherLoading, setOrganizationSwitcherLoading] = useState(false);
  const [organizationSwitcherError, setOrganizationSwitcherError] = useState(false);
  const [organizationOptions, setOrganizationOptions] = useState<DirectEntryOrganization[]>([]);
  const fabButtonRef = useRef<HTMLButtonElement>(null);
  const fabMenuId = 'nestfinance-global-capture-menu';

  useEffect(() => {
    setFabOpen(false);
    setCommandPaletteOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onCommandKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((current) => !current);
      }
    };

    document.addEventListener('keydown', onCommandKeyDown);
    return () => document.removeEventListener('keydown', onCommandKeyDown);
  }, []);

  useEffect(() => {
    if (!fabOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFabOpen(false);
        requestAnimationFrame(() => fabButtonRef.current?.focus());
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fabOpen]);

  const navigateFromFab = (direction: 'income' | 'expense' | 'transfer') => {
    setFabOpen(false);
    navigate(`${APP_ROUTES.transactionCreate}?direction=${direction}`);
  };

  const navigateCaptureFromFab = () => {
    setFabOpen(false);
    navigate(APP_ROUTES.universalCapture);
  };

  const openOrganizationSwitcher = async () => {
    setOrganizationSwitcherError(false);
    setOrganizationSwitcherLoading(true);
    try {
      const result = await resolveCurrentSessionOrganizations();
      if (result.status === 'choose_organization') {
        setOrganizationOptions(result.organizations);
        setOrganizationSwitcherOpen(true);
      } else if (result.status === 'ready') {
        if (result.organization.id !== accessState.organizationId) {
          setActiveFinanceEntityId(null);
          await refreshAccessibleFinanceEntities();
          navigate(APP_ROUTES.finance, { replace: true });
        }
      } else {
        setOrganizationSwitcherError(true);
        setOrganizationSwitcherOpen(true);
      }
    } catch {
      setOrganizationSwitcherError(true);
      setOrganizationSwitcherOpen(true);
    } finally {
      setOrganizationSwitcherLoading(false);
    }
  };

  const selectOrganization = async (organizationId: string) => {
    setOrganizationSwitcherError(false);
    setOrganizationSwitcherLoading(true);
    try {
      const result = await chooseCurrentSessionOrganization(organizationId);
      if (result.status !== 'ready') throw new Error('ORGANIZATION_SWITCH_NOT_READY');
      setActiveFinanceEntityId(null);
      await refreshAccessibleFinanceEntities();
      setOrganizationSwitcherOpen(false);
      navigate(APP_ROUTES.finance, { replace: true });
    } catch {
      setOrganizationSwitcherError(true);
    } finally {
      setOrganizationSwitcherLoading(false);
    }
  };

  const canViewFinance = hasEffectiveCapability(accessState, 'finance.view');
  const canCreate = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const canReview = hasAnyEffectiveCapability(accessState, ['finance.review', 'finance.approve_for_posting']);
  const canManage = hasAnyEffectiveCapability(accessState, ['finance.manage', 'organization.manage_entities']);
  const navigationProfile = buildFinanceNavigation(experienceMode, {
    canView: canViewFinance,
    canCreate,
    canReview,
    canManage,
  });
  const visibleNavigation = CANONICAL_NAVIGATION.filter(
    (item) => !item.requiredAnyCapabilities || hasAnyEffectiveCapability(accessState, item.requiredAnyCapabilities),
  );
  const primaryNavigation = navigationProfile.primary
    .map((id) => visibleNavigation.find((item) => item.id === id))
    .filter((item): item is NavigationItem => Boolean(item));
  const moreNavigation = navigationProfile.more
    .map((id) => visibleNavigation.find((item) => item.id === id))
    .filter((item): item is NavigationItem => Boolean(item));

  const navigationCommands: FinancePaletteCommand[] = [...primaryNavigation, ...moreNavigation].map((item) => ({
    id: `navigate:${item.id}`,
    label: t(item.labelKey),
    route: item.route,
    kind: 'navigation' as const,
  }));
  const actionCommands: FinancePaletteCommand[] = canCreate ? [
    { id: 'action:income', label: t('shortcut_income'), route: `${APP_ROUTES.transactionCreate}?direction=income`, kind: 'action' as const },
    { id: 'action:expense', label: t('shortcut_expense'), route: `${APP_ROUTES.transactionCreate}?direction=expense`, kind: 'action' as const },
    { id: 'action:transfer', label: t('shortcut_transfer'), route: `${APP_ROUTES.transactionCreate}?direction=transfer`, kind: 'action' as const },
    { id: 'action:capture', label: copy.capture, route: APP_ROUTES.universalCapture, kind: 'action' as const },
  ] : [];
  const commandPaletteCommands = [...navigationCommands, ...actionCommands];

  return (
    <div className="flex min-h-screen bg-background-base text-text-primary">
      <aside className="fixed z-10 hidden h-full w-64 flex-col border-r border-border-subtle bg-surface-default md:flex">
        <div className="flex h-16 items-center border-b border-border-subtle px-6">
          <NestFinanceLogo layout="horizontal" compact className="h-7 w-auto" />
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-4">
          <div className="mb-4 overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary px-3 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{t('shell_organization')}</p>
            <p className="truncate text-sm font-medium" title={orgName}>{orgName}</p>
            {activeFinanceEntityName ? (
              <div className="mt-2 flex items-center gap-1.5 border-t border-border-subtle/40 pt-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary" aria-hidden="true" />
                <p className="truncate text-xs font-medium text-accent-primary" title={activeFinanceEntityName}>
                  {activeFinanceEntityName}
                </p>
              </div>
            ) : null}
            {accessState.isGlobalAccess ? (
              <button
                type="button"
                onClick={openOrganizationSwitcher}
                disabled={organizationSwitcherLoading}
                className="nf-interactive mt-3 flex min-h-10 w-full items-center justify-between rounded-lg border border-border-subtle bg-background-base px-3 text-xs font-medium text-text-secondary hover:border-border-strong hover:text-text-primary disabled:opacity-60"
              >
                <span>{copy.switchOrganization}</span>
                <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="nf-interactive mb-4 flex min-h-11 w-full items-center gap-3 rounded-xl border border-border-subtle bg-background-base px-3 text-left text-sm font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{copy.commandOpen}</span>
            <kbd className="rounded-md border border-border-subtle bg-surface-secondary px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
              ⌘K
            </kbd>
          </button>

          <nav className="space-y-1" aria-label={t('shell_principal')}>
            <div className="mb-2">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{t('shell_principal')}</p>
              {primaryNavigation.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.route}
                  className={({ isActive }) =>
                    `nf-interactive flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${
                      isActive
                        ? 'bg-surface-elevated text-text-primary'
                        : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                    }`
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>

            {moreNavigation.length > 0 ? (
              <div>
                <p className="mb-2 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{t('shell_more')}</p>
                {moreNavigation.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.route}
                    className={({ isActive }) =>
                      `nf-interactive flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${
                        isActive
                          ? 'bg-surface-elevated text-text-primary'
                          : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t(item.labelKey)}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </nav>
        </div>

        <div className="border-t border-border-subtle bg-surface-default/50 p-4">
          <div className="flex items-center gap-3 overflow-hidden">
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={profileName}
                className="h-9 w-9 flex-shrink-0 rounded-full bg-surface-elevated object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-text-secondary" aria-hidden="true">
                {getInitials(profileName)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={profileName}>{profileName}</p>
              <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-text-muted">
                {copy.workspace}: {EXPERIENCE_LABELS[language][experienceMode]}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-border-subtle pt-3">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <div className="mt-3 grid gap-1">
              <button
                type="button"
                onClick={returnToMillionsNest}
                className="nf-interactive flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copy.backToHub}</span>
              </button>
              <button
                type="button"
                onClick={() => void signOutNestFinanceAndReturnToHub()}
                className="nf-interactive flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-text-muted hover:bg-surface-secondary hover:text-text-primary"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copy.signOut}</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-h-screen flex-1 flex-col pb-16 md:pl-64 md:pb-0">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border-subtle bg-surface-default/95 px-3 backdrop-blur-xl md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <NestFinanceLogo layout="horizontal" compact className="h-6 w-auto shrink-0" />
            {activeFinanceEntityName ? (
              <span className="max-w-[110px] truncate rounded-lg bg-accent-primary/10 px-2 py-1 text-[11px] font-semibold text-accent-primary">
                {activeFinanceEntityName}
              </span>
            ) : null}
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-2">
            {accessState.isGlobalAccess ? (
              <button
                type="button"
                onClick={openOrganizationSwitcher}
                disabled={organizationSwitcherLoading}
                aria-label={copy.switchOrganization}
                className="nf-interactive flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-background-base text-text-secondary disabled:opacity-60"
              >
                <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            <LanguageSwitcher language={language} setLanguage={setLanguage} compact />
            <div className="hidden max-w-[76px] truncate text-[10px] font-medium text-text-secondary min-[390px]:block" title={orgName}>
              {orgName}
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {canCreate &&
        !location.pathname.includes('/finance/transactions/new') &&
        !location.pathname.includes('/finance/transactions/edit') &&
        !location.pathname.match(/\/finance\/transactions\/[a-zA-Z0-9_-]+\/edit/) ? (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0)+4.5rem)] right-4 z-30 flex flex-col items-end gap-3 md:bottom-8 md:right-8">
          {fabOpen ? (
            <>
              <div className="fixed inset-0 z-40 bg-background-base/15 backdrop-blur-[1px]" onClick={() => setFabOpen(false)} aria-hidden="true" />
              <div
                id={fabMenuId}
                role="group"
                aria-label={t('action_register_title')}
                className="z-50 flex min-w-[14rem] flex-col gap-2 fade-in"
              >
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="justify-between shadow-lg"
                  trailingIcon={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-semantic-success/10 text-semantic-success"><Plus className="h-4 w-4" /></span>}
                  onClick={() => navigateFromFab('income')}
                >
                  {t('shortcut_income')}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="justify-between shadow-lg"
                  trailingIcon={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-semantic-danger/10 text-semantic-danger"><Plus className="h-4 w-4" /></span>}
                  onClick={() => navigateFromFab('expense')}
                >
                  {t('shortcut_expense')}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="justify-between shadow-lg"
                  trailingIcon={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary/10 text-accent-primary"><Plus className="h-4 w-4" /></span>}
                  onClick={() => navigateFromFab('transfer')}
                >
                  {t('shortcut_transfer')}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="justify-between shadow-lg"
                  trailingIcon={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary/10 text-accent-primary"><Camera className="h-4 w-4" /></span>}
                  onClick={navigateCaptureFromFab}
                >
                  {copy.capture}
                </Button>
              </div>
            </>
          ) : null}

          <button
            ref={fabButtonRef}
            type="button"
            onClick={() => setFabOpen((current) => !current)}
            className="nf-interactive press-fx z-50 flex h-14 w-14 items-center justify-center rounded-2xl border border-text-primary/90 bg-text-primary text-background-base shadow-[var(--nf-shadow-floating)] hover:bg-white"
            aria-label={fabOpen ? copy.closeActions : t('action_register_title')}
            aria-expanded={fabOpen}
            aria-controls={fabOpen ? fabMenuId : undefined}
          >
            <Plus className={`h-6 w-6 nf-interactive ${fabOpen ? 'rotate-45' : ''}`} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <nav className="fixed bottom-0 z-20 flex h-[calc(env(safe-area-inset-bottom,0)+3.5rem)] w-full items-center justify-around border-t border-border-subtle bg-surface-elevated/95 px-2 pb-[env(safe-area-inset-bottom,0)] backdrop-blur-xl md:hidden" aria-label={t('shell_principal')}>
        {primaryNavigation.map((item) => (
          <NavLink
            key={item.id}
            to={item.route}
            className={({ isActive }) =>
              `nf-interactive flex h-full min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-1 ${
                isActive ? 'font-semibold text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`
            }
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            <span className="w-full truncate px-1 text-center text-[10px] leading-none">{t(item.labelKey)}</span>
          </NavLink>
        ))}
        {moreNavigation.length > 0 ? (
          <NavLink
            to={APP_ROUTES.more}
            className={({ isActive }) =>
              `nf-interactive flex h-full min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-1 ${
                isActive ? 'font-semibold text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`
            }
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            <span className="w-full truncate px-1 text-center text-[10px] leading-none">{t('nav_mais')}</span>
          </NavLink>
        ) : null}
      </nav>

      <FinanceCommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commandPaletteCommands}
        copy={{
          title: copy.commandTitle,
          placeholder: copy.commandPlaceholder,
          empty: copy.commandEmpty,
          navigation: copy.commandNavigation,
          actions: copy.commandActions,
        }}
      />

      {organizationSwitcherOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-background-base/80 p-4 backdrop-blur-sm sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={copy.switchOrganizationTitle}
            className="w-full max-w-md overflow-hidden rounded-[24px] border border-border-subtle bg-surface-elevated shadow-2xl"
          >
            <div className="p-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">{copy.workspace}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">{copy.switchOrganizationTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{copy.switchOrganizationText}</p>
              </div>

              {organizationSwitcherError ? (
                <div className="mb-4 rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-3 text-sm text-semantic-danger">
                  {copy.switchOrganizationFailed}
                </div>
              ) : null}

              <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
                {organizationOptions.map((organization) => (
                  <button
                    key={organization.id}
                    type="button"
                    disabled={organizationSwitcherLoading}
                    onClick={() => selectOrganization(organization.id)}
                    className={`nf-interactive flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-sm font-medium disabled:opacity-60 ${
                      organization.id === accessState.organizationId
                        ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                        : 'border-border-subtle bg-background-base text-text-primary hover:border-border-strong'
                    }`}
                  >
                    <span className="truncate">{organization.name}</span>
                    {organization.id === accessState.organizationId ? (
                      <span className="ml-3 text-[10px] font-semibold uppercase tracking-wider">{language === 'PT' ? 'Atual' : language === 'EN' ? 'Current' : 'Actual'}</span>
                    ) : null}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setOrganizationSwitcherOpen(false)}
                disabled={organizationSwitcherLoading}
                className="nf-interactive mt-5 min-h-12 w-full rounded-xl border border-border-subtle bg-background-base text-sm font-medium text-text-primary hover:bg-surface-secondary disabled:opacity-60"
              >
                {copy.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ShellLayout() {
  return (
    <EcosystemAccessBoundary>
      <FinanceEntityProvider>
        <ShellLayoutInner />
      </FinanceEntityProvider>
    </EcosystemAccessBoundary>
  );
}
