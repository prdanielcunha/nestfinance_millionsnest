import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NestFinanceLogo } from '@/src/components/brand/NestFinanceLogo';
import { EcosystemAccessBoundary } from '../boundaries/EcosystemAccessBoundary';
import { FinanceEntityProvider, useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { APP_ROUTES } from '../router/routes';
import { LayoutDashboard, Receipt, Wallet, Inbox, FileText, ShieldCheck, MoreHorizontal, Settings, Plus, Globe } from 'lucide-react';
import { useState, useEffect, ElementType } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { useLanguage } from '@/src/contexts/LanguageContext';

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

function getInitials(name: string) {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function ShellLayoutInner() {
  const { accessState } = useAuth();
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  
  const orgName = accessState.organization?.name || t('shell_waiting');
  const profileName = accessState.profile?.displayName || 'Perfil';
  const profilePhoto = accessState.profile?.photoURL;
  
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background-base text-text-primary">
      
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-surface-default border-r border-border-subtle fixed h-full z-10">
        <div className="h-16 flex items-center px-6 border-b border-border-subtle">
          <NestFinanceLogo layout="horizontal" compact={true} className="h-7 w-auto" />
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-1">
          <div className="mb-4 px-3 py-3 bg-surface-secondary rounded-lg border border-border-subtle overflow-hidden">
            <p className="text-[10px] text-text-muted mb-1 uppercase tracking-wider font-semibold">{t('shell_organization')}</p>
            <p className="text-sm font-medium truncate" title={orgName}>{orgName}</p>
            {activeFinanceEntityName && (
              <div className="mt-2 pt-2 border-t border-border-subtle/40 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse shrink-0" />
                <p className="text-xs text-accent-primary font-medium truncate" title={activeFinanceEntityName}>
                  {activeFinanceEntityName}
                </p>
              </div>
            )}
          </div>
          
          <nav className="space-y-1">
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-3">{t('shell_principal')}</p>
              {CANONICAL_NAVIGATION.filter(i => i.group === 'primary').map((item) => (
                <NavLink
                  key={item.id}
                  to={item.route}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-surface-elevated text-text-primary' 
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>

            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-3 mt-4">{t('shell_more')}</p>
              {CANONICAL_NAVIGATION.filter(i => i.group === 'more').map((item) => (
                <NavLink
                  key={item.id}
                  to={item.route}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-surface-elevated text-text-primary' 
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
        
        <div className="p-4 border-t border-border-subtle bg-surface-default/50">
          <div className="flex items-center gap-3 overflow-hidden">
            {profilePhoto ? (
              <img src={profilePhoto} alt={profileName} className="w-8 h-8 rounded-full bg-surface-elevated object-cover flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-semibold flex-shrink-0 text-text-secondary">
                {getInitials(profileName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={profileName}>{profileName}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border-subtle">
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] text-text-muted font-semibold flex items-center gap-1.5 uppercase tracking-wider">
                <Globe className="w-3.5 h-3.5 text-text-muted shrink-0" />
                Idioma
              </span>
              <div className="flex gap-1 bg-background-base p-0.5 rounded-lg border border-border-subtle shrink-0">
                {(['PT', 'EN', 'ES'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors ${
                      language === lang
                        ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* Topbar Mobile */}
        <header className="md:hidden h-14 flex items-center justify-between px-4 bg-surface-default border-b border-border-subtle sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <NestFinanceLogo layout="horizontal" compact={true} className="h-6 w-auto" />
            {activeFinanceEntityName && (
              <span className="text-[11px] text-accent-primary font-semibold bg-accent-primary/10 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                {activeFinanceEntityName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 bg-background-base p-0.5 rounded-lg border border-border-subtle shrink-0">
              {(['PT', 'EN', 'ES'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-1 py-0.5 text-[9px] font-bold rounded transition-colors ${
                    language === lang
                      ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-text-secondary font-medium truncate max-w-[80px]">
              {orgName}
            </div>
          </div>
        </header>
        
        <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Global Capture Action (FAB) */}
      {hasEffectiveCapability(accessState, "finance.create_drafts") && !location.pathname.includes('/finance/transactions/new') && !location.pathname.includes('/finance/transactions/edit') && !location.pathname.match(/\/finance\/transactions\/[a-zA-Z0-9_-]+\/edit/) && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0)+4.5rem)] right-4 md:bottom-8 md:right-8 z-30 flex flex-col items-end gap-3">
          {fabOpen && (
             <>
               <div className="fixed inset-0 bg-transparent z-40" onClick={() => setFabOpen(false)}></div>
               <div className="flex flex-col gap-2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
                  <button onClick={() => { setFabOpen(false); navigate(APP_ROUTES.transactionCreate + '?direction=income'); }} className="bg-surface-elevated text-text-primary px-4 py-3 rounded-2xl shadow-lg border border-border-subtle hover:bg-surface-secondary text-sm font-medium flex items-center justify-end gap-3">
                     <span>{t('shortcut_income')}</span>
                     <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                     </div>
                  </button>
                  <button onClick={() => { setFabOpen(false); navigate(APP_ROUTES.transactionCreate + '?direction=expense'); }} className="bg-surface-elevated text-text-primary px-4 py-3 rounded-2xl shadow-lg border border-border-subtle hover:bg-surface-secondary text-sm font-medium flex items-center justify-end gap-3">
                     <span>{t('shortcut_expense')}</span>
                     <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                     </div>
                  </button>
                  <button onClick={() => { setFabOpen(false); navigate(APP_ROUTES.transactionCreate + '?direction=transfer'); }} className="bg-surface-elevated text-text-primary px-4 py-3 rounded-2xl shadow-lg border border-border-subtle hover:bg-surface-secondary text-sm font-medium flex items-center justify-end gap-3">
                     <span>{t('shortcut_transfer')}</span>
                     <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                     </div>
                  </button>
               </div>
             </>
          )}
          <button
            onClick={() => setFabOpen(!fabOpen)}
            className="h-14 w-14 bg-text-primary text-surface-base hover:bg-text-primary/90 rounded-2xl flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 z-50"
            aria-label={t('action_register_title')}
          >
            <Plus className={`w-6 h-6 transition-transform duration-200 ${fabOpen ? 'rotate-45' : ''}`} />
          </button>
        </div>
      )}

      {/* Bottom Nav Mobile */}
      <nav className="md:hidden fixed bottom-0 w-full h-[calc(env(safe-area-inset-bottom,0)+3.5rem)] bg-surface-elevated border-t border-border-subtle flex items-center justify-around px-2 z-20 pb-[env(safe-area-inset-bottom,0)]">
        {CANONICAL_NAVIGATION.filter(i => i.group === 'primary').map((item) => (
          <NavLink
            key={item.id}
            to={item.route}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
                isActive ? 'text-text-primary font-semibold' : 'text-text-muted hover:text-text-secondary'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] leading-none truncate w-full text-center px-1">{t(item.labelKey)}</span>
          </NavLink>
        ))}
        <NavLink
          to={APP_ROUTES.more}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
              isActive ? 'text-text-primary font-semibold' : 'text-text-muted hover:text-text-secondary'
            }`
          }
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] leading-none truncate w-full text-center px-1">{t('nav_mais')}</span>
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
