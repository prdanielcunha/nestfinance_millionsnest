import { createBrowserRouter, Navigate, RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { APP_ROUTES } from './routes';
import { RootLayout } from '../layouts/RootLayout';
import { ShellLayout } from '../layouts/ShellLayout';
import { RouteErrorBoundary } from '../boundaries/RouteErrorBoundary';
import { OrganizationalAccessBoundary } from '../boundaries/OrganizationalAccessBoundary';
import HandoffPage from '@/src/pages/auth/HandoffPage';

// Lazy loaded pages to keep initial bundle small
const FinancePage = lazy(() => import('@/src/pages/finance/FinancePage'));
const SetupPage = lazy(() => import('@/src/pages/finance/SetupPage'));
const FinanceSettingsPage = lazy(() => import('@/src/pages/finance/settings/FinanceSettingsPage'));
const FinanceAccountsPage = lazy(() => import('@/src/pages/finance/settings/FinanceAccountsPage'));
const FinanceEntitiesPage = lazy(() => import('@/src/pages/finance/settings/FinanceEntitiesPage'));
const FinanceFundsPage = lazy(() => import('@/src/pages/finance/settings/FinanceFundsPage'));
const FinanceCategoriesPage = lazy(() => import('@/src/pages/finance/settings/FinanceCategoriesPage'));
const CountPage = lazy(() => import('@/src/pages/finance/CountPage'));
const CountSessionPage = lazy(() => import('@/src/pages/finance/count/CountSessionPage'));
const BalancePage = lazy(() => import('@/src/pages/finance/BalancePage'));
const InboxPage = lazy(() => import('@/src/pages/finance/InboxPage'));
const ReportsPage = lazy(() => import('@/src/pages/finance/ReportsPage'));
const AuditPage = lazy(() => import('@/src/pages/finance/AuditPage'));
const MorePage = lazy(() => import('@/src/pages/finance/MorePage'));
const TransactionsListPage = lazy(() => import('@/src/pages/finance/transactions/TransactionsListPage'));
const TransactionCreatePage = lazy(() => import('@/src/pages/finance/transactions/TransactionCreatePage'));
const TransactionDetailOverviewPage = lazy(() => import('@/src/pages/finance/transactions/TransactionDetailOverviewPage'));
const TransactionAdvancedDetailPage = lazy(() => import('@/src/pages/finance/transactions/TransactionAdvancedDetailPage'));
const TransactionEditGuidedPage = lazy(() => import('@/src/pages/finance/transactions/TransactionEditGuidedPage'));
const TransactionEditLegacyPage = lazy(() => import('@/src/pages/finance/transactions/TransactionEditPage'));
const ReviewPage = lazy(() => import('@/src/pages/finance/transactions/ReviewPage'));
const TransactionReviewDetailPage = lazy(() => import('@/src/pages/finance/transactions/TransactionReviewDetailPage'));

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
        element: <Navigate to={APP_ROUTES.finance} replace />,
      },
      {
        path: APP_ROUTES.handoff,
        element: <HandoffPage />,
      },
      {
        element: <ShellLayout />,
        children: [
          { path: APP_ROUTES.finance, element: <Suspense fallback={<PageFallback />}><FinancePage /></Suspense> },
          { path: APP_ROUTES.transactions, element: <Suspense fallback={<PageFallback />}><TransactionsListPage /></Suspense> },
          { path: APP_ROUTES.transactionCreate, element: <Suspense fallback={<PageFallback />}><TransactionCreatePage /></Suspense> },
          { path: APP_ROUTES.transactionDetail, element: <Suspense fallback={<PageFallback />}><TransactionDetailOverviewPage /></Suspense> },
          { path: APP_ROUTES.transactionDetailLegacy, element: <Suspense fallback={<PageFallback />}><TransactionAdvancedDetailPage /></Suspense> },
          { path: APP_ROUTES.transactionEdit, element: <Suspense fallback={<PageFallback />}><TransactionEditGuidedPage /></Suspense> },
          { path: APP_ROUTES.transactionEditLegacy, element: <Suspense fallback={<PageFallback />}><TransactionEditLegacyPage /></Suspense> },
          { path: APP_ROUTES.financeReview, element: <Suspense fallback={<PageFallback />}><ReviewPage /></Suspense> },
          { path: APP_ROUTES.transactionReviewDetail, element: <Suspense fallback={<PageFallback />}><TransactionReviewDetailPage /></Suspense> },
          { path: APP_ROUTES.financeSetup, element: <Suspense fallback={<PageFallback />}><SetupPage /></Suspense> },
          { path: APP_ROUTES.financeSettings, element: <Suspense fallback={<PageFallback />}><FinanceSettingsPage /></Suspense> },
          { path: APP_ROUTES.financeSettingsAccounts, element: <Suspense fallback={<PageFallback />}><FinanceAccountsPage /></Suspense> },
          {
            path: APP_ROUTES.financeSettingsEntities,
            element: (
              <Suspense fallback={<PageFallback />}>
                <OrganizationalAccessBoundary>
                  <FinanceEntitiesPage />
                </OrganizationalAccessBoundary>
              </Suspense>
            ),
          },
          { path: APP_ROUTES.financeSettingsFunds, element: <Suspense fallback={<PageFallback />}><FinanceFundsPage /></Suspense> },
          { path: APP_ROUTES.financeSettingsCategories, element: <Suspense fallback={<PageFallback />}><FinanceCategoriesPage /></Suspense> },
          { path: APP_ROUTES.count, element: <Suspense fallback={<PageFallback />}><CountPage /></Suspense> },
          { path: APP_ROUTES.countSession, element: <Suspense fallback={<PageFallback />}><CountSessionPage /></Suspense> },
          { path: APP_ROUTES.balance, element: <Suspense fallback={<PageFallback />}><BalancePage /></Suspense> },
          { path: APP_ROUTES.inbox, element: <Suspense fallback={<PageFallback />}><InboxPage /></Suspense> },
          { path: APP_ROUTES.reports, element: <Suspense fallback={<PageFallback />}><ReportsPage /></Suspense> },
          { path: APP_ROUTES.audit, element: <Suspense fallback={<PageFallback />}><AuditPage /></Suspense> },
          { path: APP_ROUTES.more, element: <Suspense fallback={<PageFallback />}><MorePage /></Suspense> },
        ],
      },
    ],
  },
];

if (import.meta.env.DEV) {
  const FoundationPreviewPage = lazy(() => import('@/src/pages/dev/FoundationPreviewPage'));
  routes[0]?.children?.push({
    element: <ShellLayout />,
    children: [
      {
        path: APP_ROUTES.preview,
        element: <Suspense fallback={<PageFallback />}><FoundationPreviewPage /></Suspense>,
      },
    ],
  });
}

export const router = createBrowserRouter(routes);
