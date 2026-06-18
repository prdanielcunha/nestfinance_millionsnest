import { createBrowserRouter, Navigate, RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { APP_ROUTES } from './routes';
import { RootLayout } from '../layouts/RootLayout';
import { ShellLayout } from '../layouts/ShellLayout';
import { RouteErrorBoundary } from '../boundaries/RouteErrorBoundary';
import HandoffPage from '@/src/pages/auth/HandoffPage';

// Lazy loaded pages to keep initial bundle small
const FinancePage = lazy(() => import('@/src/pages/finance/FinancePage'));
const SetupPage = lazy(() => import('@/src/pages/finance/SetupPage'));
const FinanceSettingsPage = lazy(() => import('@/src/pages/finance/settings/FinanceSettingsPage'));
const FinanceAccountsPage = lazy(() => import('@/src/pages/finance/settings/FinanceAccountsPage'));
const FinanceFundsPage = lazy(() => import('@/src/pages/finance/settings/FinanceFundsPage'));
const FinanceCategoriesPage = lazy(() => import('@/src/pages/finance/settings/FinanceCategoriesPage'));
const CountPage = lazy(() => import('@/src/pages/finance/CountPage'));
const BalancePage = lazy(() => import('@/src/pages/finance/BalancePage'));
const InboxPage = lazy(() => import('@/src/pages/finance/InboxPage'));
const ReportsPage = lazy(() => import('@/src/pages/finance/ReportsPage'));
const AuditPage = lazy(() => import('@/src/pages/finance/AuditPage'));
const MorePage = lazy(() => import('@/src/pages/finance/MorePage'));

const PageFallback = () => (
  <div className="flex h-[50vh] items-center justify-center fade-in">
    <div className="w-8 h-8 border-4 border-surface-elevated border-t-accent-primary rounded-full animate-spin" />
  </div>
);

const routes: RouteObject[] = [
  {
    path: APP_ROUTES.root,
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        // Ao carregar a raiz, o AuthBoundary irá detectar se está deslogado e mostrar a tela dele.
        // Mas se estiver autenticado, na ShellLayout o EcosystemAccessBoundary vai bloquear o acesso por enquanto.
        element: <Navigate to={APP_ROUTES.finance} replace />,
      },
      {
        path: APP_ROUTES.handoff,
        element: <HandoffPage />,
      },
      {
        element: <ShellLayout />,
        children: [
          {
            path: APP_ROUTES.finance,
            element: <Suspense fallback={<PageFallback />}><FinancePage /></Suspense>,
          },
          {
            path: APP_ROUTES.financeSetup,
            element: <Suspense fallback={<PageFallback />}><SetupPage /></Suspense>,
          },
          {
            path: APP_ROUTES.financeSettings,
            element: <Suspense fallback={<PageFallback />}><FinanceSettingsPage /></Suspense>,
          },
          {
            path: APP_ROUTES.financeSettingsAccounts,
            element: <Suspense fallback={<PageFallback />}><FinanceAccountsPage /></Suspense>,
          },
          {
            path: APP_ROUTES.financeSettingsFunds,
            element: <Suspense fallback={<PageFallback />}><FinanceFundsPage /></Suspense>,
          },
          {
            path: APP_ROUTES.financeSettingsCategories,
            element: <Suspense fallback={<PageFallback />}><FinanceCategoriesPage /></Suspense>,
          },
          {
            path: APP_ROUTES.count,
            element: <Suspense fallback={<PageFallback />}><CountPage /></Suspense>,
          },
          {
            path: APP_ROUTES.balance,
            element: <Suspense fallback={<PageFallback />}><BalancePage /></Suspense>,
          },
          {
            path: APP_ROUTES.inbox,
            element: <Suspense fallback={<PageFallback />}><InboxPage /></Suspense>,
          },
          {
            path: APP_ROUTES.reports,
            element: <Suspense fallback={<PageFallback />}><ReportsPage /></Suspense>,
          },
          {
            path: APP_ROUTES.audit,
            element: <Suspense fallback={<PageFallback />}><AuditPage /></Suspense>,
          },
          {
            path: APP_ROUTES.more,
            element: <Suspense fallback={<PageFallback />}><MorePage /></Suspense>,
          },
        ]
      }
    ]
  }
];

if (import.meta.env.DEV) {
  // Apenas dinamicamente injetado em DEV garantindo que não vaza pra prd
  const FoundationPreviewPage = lazy(() => import('@/src/pages/dev/FoundationPreviewPage'));
  
  routes[0]?.children?.push({
    element: <ShellLayout />,
    children: [
      {
        path: APP_ROUTES.preview,
        element: <Suspense fallback={<PageFallback />}><FoundationPreviewPage /></Suspense>,
      }
    ]
  });
}

export const router = createBrowserRouter(routes);
