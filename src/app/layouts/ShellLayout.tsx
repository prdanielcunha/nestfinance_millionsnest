import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NestFinanceLogo } from '@/src/components/brand/NestFinanceLogo';
import { EcosystemAccessBoundary } from '../boundaries/EcosystemAccessBoundary';
import { FinanceEntityProvider, useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { APP_ROUTES } from '../router/routes';
import { LayoutDashboard, Receipt, Wallet, Inbox, FileText, ShieldCheck, MoreHorizontal, Settings, Plus, Camera, Globe, ChevronsUpDown, ArrowRightLeft, ListChecks, Search, LogOut, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState, type ElementType } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { hasAnyEffectiveCapability, hasEffectiveCapability } from '@/src/lib/permissions';
import { getFinanceExperienceMode, getFinanceInterfaceRole, type FinanceExperienceMode, type FinanceInterfaceRole } from '@/src/lib/financeExperience';
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
import { countService, type CountSessionListItem } from '@/src/services/countService';
import { subscribeFinanceDataChanges } from '@/src/services/financeFreshness';

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
  actionsTitle: string;
  startCount: string;
  continueCount: string;
  countDescription: string;
  continueCountDescription: string;
  incomeDescription: string;
  expenseDescription: string;
  transferDescription: string;
  captureDescription: string;
  seeAllActions: string;
  contextTitle: string;
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
  skipToContent: string;
}> = {
  PT: {
    profile: 'Perfil',
    language: 'Idioma',
    selectLanguage: 'Selecionar idioma',
    closeActions: 'Fechar atalhos de registro',
    capture: 'Capturar comprovante',
    actionsTitle: 'O que você quer fazer?',
    startCount: 'Iniciar contagem',
    continueCount: 'Continuar contagem',
    countDescription: 'Registrar dízimos e ofertas com a jornada guiada e conferência segura.',
    continueCountDescription: 'Retomar a contagem aberta sem criar outra sessão.',
    incomeDescription: 'Registrar um valor que entrou, com comprovante opcional.',
    expenseDescription: 'Registrar um pagamento ou outra saída.',
    transferDescription: 'Mover valor entre contas sem tratar como receita ou despesa.',
    captureDescription: 'Enviar foto, print, PDF ou arquivo para o NestFinance interpretar.',
    seeAllActions: 'Ver todas as ações',
    contextTitle: 'Contexto atual',
    workspace: 'Perfil de uso',
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
    skipToContent: 'Pular para o conteúdo',
  },
  EN: {
    profile: 'Profile',
    language: 'Language',
    selectLanguage: 'Select language',
    closeActions: 'Close record shortcuts',
    capture: 'Capture receipt',
    actionsTitle: 'What do you want to do?',
    startCount: 'Start count',
    continueCount: 'Continue count',
    countDescription: 'Record tithes and offerings with the guided, safely reviewed flow.',
    continueCountDescription: 'Resume the open count without creating another session.',
    incomeDescription: 'Record money received, with an optional receipt.',
    expenseDescription: 'Record a payment or other outgoing amount.',
    transferDescription: 'Move money between accounts without treating it as income or expense.',
    captureDescription: 'Send a photo, screenshot, PDF, or file for NestFinance to interpret.',
    seeAllActions: 'See all actions',
    contextTitle: 'Current context',
    workspace: 'Usage profile',
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
    skipToContent: 'Skip to content',
  },
  ES: {
    profile: 'Perfil',
    language: 'Idioma',
    selectLanguage: 'Seleccionar idioma',
    closeActions: 'Cerrar accesos de registro',
    capture: 'Capturar comprobante',
    actionsTitle: '¿Qué quieres hacer?',
    startCount: 'Iniciar conteo',
    continueCount: 'Continuar conteo',
    countDescription: 'Registra diezmos y ofrendas con un flujo guiado y revisión segura.',
    continueCountDescription: 'Retoma el conteo abierto sin crear otra sesión.',
    incomeDescription: 'Registra un valor recibido, con comprobante opcional.',
    expenseDescription: 'Registra un pago u otro egreso.',
    transferDescription: 'Mueve valor entre cuentas sin tratarlo como ingreso o egreso.',
    captureDescription: 'Envía foto, captura, PDF o archivo para que NestFinance lo interprete.',
    seeAllActions: 'Ver todas las acciones',
    contextTitle: 'Contexto actual',
    workspace: 'Perfil de uso',
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
    skipToContent: 'Saltar al contenido',
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

const INTERFACE_ROLE_LABELS: Record<Language, Record<FinanceInterfaceRole, string>> = {
  PT: {
    volunteer: 'Voluntário',
    treasurer: 'Tesoureiro',
    administrator: 'Administrador',
    accountant: 'Contador',
  },
  EN: {
    volunteer: 'Volunteer',
    treasurer: 'Treasurer',
    administrator: 'Administrator',
    accountant: 'Accountant',
  },
  ES: {
    volunteer: 'Voluntario',
    treasurer: 'Tesorero',
    administrator: 'Administrador',
    accountant: 'Contador',
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
      <span className={compact ? 'sr-only' : 'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted'}>
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
    activeFinanceEntityId,
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
  const interfaceRole = getFinanceInterfaceRole(accessState);
  const canViewFinance = hasEffectiveCapability(accessState, 'finance.view');
  const canCreate = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const canReview = hasAnyEffectiveCapability(accessState, ['finance.review', 'finance.approve_for_posting']);
  const canManage = hasAnyEffectiveCapability(accessState, ['finance.manage', 'organization.manage_entities']);
  const canCount = canViewFinance && canCreate;
  const organizationId = accessState.organizationId || accessState.organization?.id || '';

  const [fabOpen, setFabOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [organizationSwitcherOpen, setOrganizationSwitcherOpen] = useState(false);
  const [organizationSwitcherLoading, setOrganizationSwitcherLoading] = useState(false);
  const [organizationSwitcherError, setOrganizationSwitcherError] = useState(false);
  const [organizationOptions, setOrganizationOptions] = useState<DirectEntryOrganization[]>([]);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [resumableCount, setResumableCount] = useState<CountSessionListItem | null>(null);
  const fabButtonRef = useRef<HTMLButtonElement>(null);
  const fabMenuRef = useRef<HTMLDivElement>(null);
  const fabMenuId = 'nestfinance-global-capture-menu';

  useEffect(() => {
    setFabOpen(false);
    setCommandPaletteOpen(false);
    setMobileContextOpen(false);
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

    requestAnimationFrame(() => {
      fabMenuRef.current?.querySelector<HTMLElement>('button')?.focus();
    });

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

  useEffect(() => {
    let cancelled = false;

    const refreshOpenCount = async () => {
      if (!canCount || !organizationId || !activeFinanceEntityId) {
        if (!cancelled) setResumableCount(null);
        return;
      }

      try {
        const result = await countService.list(organizationId, activeFinanceEntityId);
        if (cancelled) return;
        const activeStatuses = new Set(['counting_a', 'counting_b', 'divergent', 'recounting']);
        setResumableCount(result.items.find((item) => activeStatuses.has(item.status)) || null);
      } catch {
        if (!cancelled) setResumableCount(null);
      }
    };

    void refreshOpenCount();
    const unsubscribe = subscribeFinanceDataChanges((detail) => {
      if (
        detail.area === 'count' &&
        detail.organizationId === organizationId &&
        detail.financeEntityId === activeFinanceEntityId
      ) {
        void refreshOpenCount();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeFinanceEntityId, canCount, organizationId]);

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
  const countRoute = resumableCount
    ? APP_ROUTES.countSession.replace(':sessionId', resumableCount.id)
    : APP_ROUTES.count;
  const countLabel = resumableCount ? copy.continueCount : copy.startCount;
  const countDescription = resumableCount
    ? `${copy.continueCountDescription} ${resumableCount.serviceLabel}`
    : copy.countDescription;

  const actionCommands: FinancePaletteCommand[] = canCreate ? [
    ...(canCount ? [{ id: 'action:count', label: countLabel, route: countRoute, kind: 'action' as const }] : []),
    { id: 'action:income', label: t('shortcut_income'), route: `${APP_ROUTES.transactionCreate}?direction=income`, kind: 'action' as const },
    { id: 'action:expense', label: t('shortcut_expense'), route: `${APP_ROUTES.transactionCreate}?direction=expense`, kind: 'action' as const },
    { id: 'action:transfer', label: t('shortcut_transfer'), route: `${APP_ROUTES.transactionCreate}?direction=transfer`, kind: 'action' as const },
    { id: 'action:capture', label: copy.capture, route: APP_ROUTES.universalCapture, kind: 'action' as const },
  ] : [];
  const commandPaletteCommands = [...navigationCommands, ...actionCommands];

  const allFabActions = canCreate ? [
    ...(canCount ? [{
      id: 'count',
      label: countLabel,
      description: countDescription,
      route: countRoute,
      icon: Receipt,
      iconClass: 'bg-accent-primary/10 text-accent-primary',
    }] : []),
    {
      id: 'income',
      label: t('shortcut_income'),
      description: copy.incomeDescription,
      route: `${APP_ROUTES.transactionCreate}?direction=income`,
      icon: ArrowRightLeft,
      iconClass: 'bg-semantic-success/10 text-semantic-success',
    },
    {
      id: 'expense',
      label: t('shortcut_expense'),
      description: copy.expenseDescription,
      route: `${APP_ROUTES.transactionCreate}?direction=expense`,
      icon: ArrowRightLeft,
      iconClass: 'bg-semantic-danger/10 text-semantic-danger',
    },
    {
      id: 'capture',
      label: copy.capture,
      description: copy.captureDescription,
      route: APP_ROUTES.universalCapture,
      icon: Camera,
      iconClass: 'bg-accent-primary/10 text-accent-primary',
    },
    {
      id: 'transfer',
      label: t('shortcut_transfer'),
      description: copy.transferDescription,
      route: `${APP_ROUTES.transactionCreate}?direction=transfer`,
      icon: ArrowRightLeft,
      iconClass: 'bg-surface-secondary text-text-secondary',
    },
  ] : [];

  const preferredFabOrder = interfaceRole === 'volunteer' || interfaceRole === 'treasurer'
    ? ['count', 'income', 'expense', 'capture', 'transfer']
    : ['income', 'expense', 'count', 'capture', 'transfer'];
  const orderedFabActions = preferredFabOrder
    .map((id) => allFabActions.find((action) => action.id === id))
    .filter((action): action is NonNullable<typeof action> => Boolean(action));
  const primaryFabActions = orderedFabActions.slice(0, 4);

  return (
    <div className="flex min-h-screen bg-background-base text-text-primary">
      <a href="#nestfinance-main-content" className="nf-skip-link">{copy.skipToContent}</a>
      <aside className="fixed z-10 hidden h-full w-64 flex-col border-r border-border-subtle bg-surface-default md:flex">
        <div className="flex h-16 items-center border-b border-border-subtle px-6">
          <NestFinanceLogo layout="horizontal" compact className="h-7 w-auto" />
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-4">
          <div className="mb-4 overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary px-3 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{t('shell_organization')}</p>
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
                className="nf-interactive mt-3 flex min-h-11 w-full items-center justify-between rounded-lg border border-border-subtle bg-background-base px-3 text-xs font-medium text-text-secondary hover:border-border-strong hover:text-text-primary disabled:opacity-60"
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
            <kbd className="rounded-md border border-border-subtle bg-surface-secondary px-1.5 py-0.5 text-xs font-semibold text-text-muted">
              ⌘K
            </kbd>
          </button>

          <nav className="space-y-1" aria-label={t('shell_principal')}>
            <div className="mb-2">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{t('shell_principal')}</p>
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
                <p className="mb-2 mt-4 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{t('shell_more')}</p>
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
              <p className="mt-0.5 truncate text-xs font-medium uppercase tracking-wider text-text-muted">
                {copy.workspace}: {INTERFACE_ROLE_LABELS[language][interfaceRole]}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-border-subtle pt-3">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <div className="mt-3 grid gap-1">
              <button
                type="button"
                onClick={returnToMillionsNest}
                className="nf-interactive flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copy.backToHub}</span>
              </button>
              <button
                type="button"
                onClick={() => void signOutNestFinanceAndReturnToHub()}
                className="nf-interactive flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-text-muted hover:bg-surface-secondary hover:text-text-primary"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copy.signOut}</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main id="nestfinance-main-content" tabIndex={-1} className="flex min-h-screen flex-1 flex-col pb-16 md:pl-64 md:pb-0">
        <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b border-border-subtle bg-surface-default/95 px-3 py-2 backdrop-blur-xl md:hidden">
          <NestFinanceLogo layout="symbol" className="h-8 w-8 shrink-0" priority />
          <button
            type="button"
            onClick={() => setMobileContextOpen(true)}
            className="nf-interactive flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl px-3 text-left hover:bg-surface-secondary"
            aria-label={copy.contextTitle}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text-primary">
                {activeFinanceEntityName || orgName}
              </span>
              <span className="mt-0.5 block truncate text-xs text-text-muted">
                {activeFinanceEntityName ? orgName : EXPERIENCE_LABELS[language][experienceMode]}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          </button>
        </header>

        <div className="nf-operational mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
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
              <div
                className="fixed inset-0 z-40 bg-background-base/55 backdrop-blur-[2px]"
                onClick={() => {
                  setFabOpen(false);
                  requestAnimationFrame(() => fabButtonRef.current?.focus());
                }}
                aria-hidden="true"
              />
              <div
                ref={fabMenuRef}
                id={fabMenuId}
                role="dialog"
                aria-modal="true"
                aria-label={copy.actionsTitle}
                className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0)+7.75rem)] z-50 max-h-[min(70vh,34rem)] overflow-y-auto rounded-3xl border border-border-subtle bg-surface-elevated p-4 shadow-[var(--nf-shadow-floating)] md:static md:w-[23rem] md:rounded-2xl"
              >
                <div className="mb-3 px-1">
                  <p className="text-base font-semibold text-text-primary">{copy.actionsTitle}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    {activeFinanceEntityName || orgName}
                  </p>
                </div>
                <div className="grid gap-2">
                  {primaryFabActions.map((action) => {
                    const ActionIcon = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => {
                          setFabOpen(false);
                          navigate(action.route);
                        }}
                        className="nf-interactive flex min-h-[4.75rem] w-full items-center gap-3 rounded-2xl border border-transparent bg-background-base/55 px-4 py-3 text-left hover:border-border-strong hover:bg-surface-secondary"
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.iconClass}`}>
                          <ActionIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold text-text-primary">{action.label}</span>
                          <span className="mt-0.5 block text-sm leading-snug text-text-muted">{action.description}</span>
                        </span>
                      </button>
                    );
                  })}
                  {orderedFabActions.length > primaryFabActions.length ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFabOpen(false);
                        setCommandPaletteOpen(true);
                      }}
                      className="nf-interactive min-h-12 rounded-xl px-3 text-sm font-semibold text-accent-primary hover:bg-accent-primary/10"
                    >
                      {copy.seeAllActions}
                    </button>
                  ) : null}
                </div>
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
            <span className="w-full truncate px-1 text-center text-xs leading-none">{t(item.labelKey)}</span>
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
            <span className="w-full truncate px-1 text-center text-xs leading-none">{t('nav_mais')}</span>
          </NavLink>
        ) : null}
      </nav>

      {mobileContextOpen ? (
        <div
          className="fixed inset-0 z-[85] flex items-end bg-background-base/70 p-3 backdrop-blur-sm md:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMobileContextOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={copy.contextTitle}
            className="w-full rounded-3xl border border-border-subtle bg-surface-elevated p-5 pb-[calc(env(safe-area-inset-bottom,0)+1.25rem)] shadow-[var(--nf-shadow-floating)]"
          >
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-primary">{copy.contextTitle}</p>
              <p className="mt-2 break-words text-lg font-semibold text-text-primary">{activeFinanceEntityName || orgName}</p>
              {activeFinanceEntityName ? (
                <p className="mt-1 break-words text-sm text-text-secondary">{orgName}</p>
              ) : null}
              <p className="mt-2 text-sm text-text-muted">
                {copy.workspace}: {INTERFACE_ROLE_LABELS[language][interfaceRole]}
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl bg-background-base/60 p-3">
                <LanguageSwitcher language={language} setLanguage={setLanguage} />
              </div>
              {accessState.isGlobalAccess ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileContextOpen(false);
                    void openOrganizationSwitcher();
                  }}
                  disabled={organizationSwitcherLoading}
                  className="nf-interactive flex min-h-12 items-center justify-between rounded-2xl bg-background-base/60 px-4 text-sm font-semibold text-text-primary disabled:opacity-60"
                >
                  <span>{copy.switchOrganization}</span>
                  <ChevronsUpDown className="h-4 w-4 text-text-muted" aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={returnToMillionsNest}
                className="nf-interactive flex min-h-12 items-center gap-3 rounded-2xl bg-background-base/60 px-4 text-left text-sm font-semibold text-text-secondary"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {copy.backToHub}
              </button>
              <button
                type="button"
                onClick={() => void signOutNestFinanceAndReturnToHub()}
                className="nf-interactive flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left text-sm font-semibold text-text-muted hover:bg-background-base/60"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {copy.signOut}
              </button>
              <button
                type="button"
                onClick={() => setMobileContextOpen(false)}
                className="nf-interactive min-h-12 rounded-2xl border border-border-subtle text-sm font-semibold text-text-primary"
              >
                {copy.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                      <span className="ml-3 text-xs font-semibold uppercase tracking-wider">{language === 'PT' ? 'Atual' : language === 'EN' ? 'Current' : 'Actual'}</span>
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
