import { Outlet, NavLink } from 'react-router-dom';
import { EcosystemAccessBoundary } from '../boundaries/EcosystemAccessBoundary';
import { APP_ROUTES } from '../router/routes';
import { LayoutDashboard, Receipt, Wallet, Inbox, FileText, ShieldCheck, MoreHorizontal } from 'lucide-react';
import { config } from '@/src/config/env';
import { useAuth } from '@/src/hooks/useAuth';

const MAIN_NAV = [
  { to: APP_ROUTES.finance, icon: LayoutDashboard, label: 'Finance' },
  { to: APP_ROUTES.count, icon: Receipt, label: 'Count' },
  { to: APP_ROUTES.balance, icon: Wallet, label: 'Balance' },
  { to: APP_ROUTES.inbox, icon: Inbox, label: 'Inbox' },
];

const DESKTOP_ONLY_NAV = [
  { to: APP_ROUTES.reports, icon: FileText, label: 'Reports' },
  { to: APP_ROUTES.audit, icon: ShieldCheck, label: 'Audit' },
];

function getInitials(name: string) {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function ShellLayout() {
  const { accessState } = useAuth();
  
  const orgName = accessState.organization?.name || 'Aguardando conexão';
  const profileName = accessState.profile?.displayName || 'Perfil';
  const profilePhoto = accessState.profile?.photoURL;
  
  return (
    <EcosystemAccessBoundary>
      <div className="flex min-h-screen bg-background-base text-text-primary">
        
        {/* Sidebar Desktop */}
        <aside className="hidden md:flex flex-col w-64 bg-surface-default border-r border-border-subtle fixed h-full z-10">
          <div className="h-16 flex items-center px-6 border-b border-border-subtle">
            <span className="font-semibold">{config.appName}</span>
          </div>
          <div className="p-4 flex-1 overflow-y-auto space-y-1">
            <div className="mb-4 px-3 py-3 bg-surface-secondary rounded-lg border border-border-subtle overflow-hidden">
              <p className="text-xs text-text-muted mb-1 uppercase tracking-wider font-semibold">Organização</p>
              <p className="text-sm font-medium truncate" title={orgName}>{orgName}</p>
            </div>
            
            <nav className="space-y-1">
              {[...MAIN_NAV, ...DESKTOP_ONLY_NAV].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-surface-elevated text-text-primary' 
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          
          <div className="p-4 border-t border-border-subtle">
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
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 md:pl-64 flex flex-col min-h-screen pb-16 md:pb-0">
          {/* Topbar Mobile */}
          <header className="md:hidden h-14 flex items-center justify-between px-4 bg-surface-default border-b border-border-subtle sticky top-0 z-10">
            <span className="font-semibold text-sm">{config.appName}</span>
            <div className="text-xs text-text-secondary font-medium truncate max-w-[150px]">
              {orgName}
            </div>
          </header>
          
          <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>

        {/* Bottom Nav Mobile */}
        <nav className="md:hidden fixed bottom-0 w-full h-[env(safe-area-inset-bottom,0)+3.5rem] bg-surface-elevated border-t border-border-subtle flex items-center justify-around px-2 z-20 pb-[env(safe-area-inset-bottom,0)]">
          {MAIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
                  isActive ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </NavLink>
          ))}
          <NavLink
            to={APP_ROUTES.more}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
                isActive ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`
            }
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Mais</span>
          </NavLink>
        </nav>
      </div>
    </EcosystemAccessBoundary>
  );
}
