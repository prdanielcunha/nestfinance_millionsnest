import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NestFinanceLogo } from '@/src/components/brand/NestFinanceLogo';
import { EcosystemAccessBoundary } from '../boundaries/EcosystemAccessBoundary';
import { FinanceEntityProvider, useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { APP_ROUTES } from '../router/routes';
import { LayoutDashboard, Receipt, Wallet, Inbox, FileText, ShieldCheck, MoreHorizontal, Settings, Plus, Camera, Globe } from 'lucide-react';
import { useEffect, useRef, useState, type ElementType } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { Button } from '@/src/components/foundation';

export type NavigationItem = {
  id: string;
  labelKey: 'nav_hoje' | 'nav_cultos' | 'nav_capturas' | 'nav_conferir' | 'nav_reports' | 'nav_audit' | 'nav_config' | 'nav_mais';
  icon: ElementType;
  route: string;
  order: number;
  group: 'primary' | 'more';
  requiredCapability?: string;
};

export const CANONICAL_NAVIGATION: NavigationItem[] = [
  { id: 'finance', labelKey: 'nav_hoje', icon: LayoutDashboard, route: APP_ROUTES.finance, order: 1, group: 'primary' },
  { id: 'count', labelKey: 'nav_cultos', icon: Receipt, route: APP_ROUTES.count, order: 2, group: 'primary' },
  { id: 'inbox', labelKey: 'nav_capturas', icon: Inbox, route: APP_ROUTES.inbox, order: 3, group: 'primary' },
  { id: 'balance', labelKey: 'nav_conferir', icon: Wallet, route: APP_ROUTES.balance, order: 4, group: 'primary' },
  { id: 'reports', labelKey: 'nav_reports', icon: FileText, route: APP_ROUTES.reports, order: 5, group: 'more' },
  { id: 'audit', labelKey: 'nav_audit', icon: ShieldCheck, route: APP_ROUTES.audit, order: 6, group: 'more' },
  { id: 'settings', labelKey: 'nav_config', icon: Settings, route: APP_ROUTES.financeSettings, order: 7, group: 'more' },
];

const SHELL_COPY: Record<Language, { profile: string; language: string; selectLanguage: string; closeActions: string; capture: string }> = {
  PT: {
    profile: 'Perfil',
    language: 'Idioma',
    selectLanguage: 'Selecionar idioma',
    closeActions: 'Fechar atalhos de registro',
    capture: 'Capturar comprovante',
  },
  EN: {
    profile: 'Profile',
    language: 'Language',
    selectLanguage: 'Select language',
    closeActions: 'Close record shortcuts',
    capture: 'Capture receipt',
  },
  ES: {
    profile: 'Perfil',
    language: 'Idioma',
    selectLanguage: 'Seleccionar idioma',
    closeActions: 'Cerrar accesos de registro',
    capture: 'Capturar comprobante',
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
  const { activeFinanceEntityName } = useFinanceEntity();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const copy = SHELL_COPY[language];

  const orgName = accessState.organization?.name || t('shell_waiting');
  const profileName = accessState.profile?.displayName || copy.profile;
  const profilePhoto = accessState.profile?.photoURL;

  const [fabOpen, setFabOpen] = useState(false);
  const fabButtonRef = useRef<HTMLButtonElement>(null);
  const fabMenuId = 'nestfinance-global-capture-menu';

  useEffect(() => {
    setFabOpen(false);
  }, [location.pathname]);

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

  const primaryNavigation = CANONICAL_NAVIGATION.filter((item) => item.group === 'primary');
  const moreNavigation = CANONICAL_NAVIGATION.filter((item) => item.group === 'more');

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
          </div>

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
            </div>
          </div>

          <div className="mt-4 border-t border-border-subtle pt-3">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
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

      {hasEffectiveCapability(accessState, 'finance.create_drafts') &&
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
      </nav>
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
