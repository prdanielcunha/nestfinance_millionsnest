import { createBrowserRouter, Navigate, RouteObject } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { APP_ROUTES } from './routes';
import { RootLayout } from '../layouts/RootLayout';
import { ShellLayout } from '../layouts/ShellLayout';
import { RouteErrorBoundary } from '../boundaries/RouteErrorBoundary';
import { OrganizationalAccessBoundary } from '../boundaries/OrganizationalAccessBoundary';
import { FinanceCapabilityBoundary } from '../boundaries/FinanceCapabilityBoundary';
import HandoffPage from '@/src/pages/auth/HandoffPage';
import LoginPage from '@/src/pages/auth/LoginPage';

// Lazy loaded pages to keep initial bundle small
const FinancePage = lazy(() => import('@/src/pages/finance/FinancePage'));
const SetupPage = lazy(() => import('@/src/pages/finance/SetupPage'));
const FinanceSettingsPage = lazy(() => import('@/src/pages/finance/settings/FinanceSettingsPage'));
const FinanceAccountsPage = lazy(() => import('@/src/pages/finance/settings/FinanceAccountsPage'));
const FinanceEntitiesPage = lazy(() => import('@/src/pages/finance/settings/FinanceEntitiesPage'));
const FinanceFundsPage = lazy(() => import('@/src/pages/finance/settings/FinanceFundsPage'));
const FinanceCategoriesPage = lazy(() => import('@/src/pages/finance/settings/FinanceCategoriesPage'));
const CountPage = lazy(() => import('@/src/pages/finance/count/CountHubPage'));
const CountSessionPage = lazy(() => import('@/src/pages/finance/count/CountSessionPage'));
const CountPaperFormsPage = lazy(() => import('@/src/pages/finance/count/CountPaperFormsPage'));
const CountPaperFormPage = lazy(() => import('@/src/pages/finance/count/CountPaperFormPage'));
const CountCapturePage = lazy(() => import('@/src/pages/finance/count/CountCapturePage'));
const CountFreeFormCapturePage = lazy(() => import('@/src/pages/finance/count/CountFreeFormCapturePage'));
const CountCaptureReviewPage = lazy(() => import('@/src/pages/finance/count/CountCaptureReviewPage'));
const UniversalCapturePage = lazy(() => import('@/src/pages/finance/capture/UniversalCapturePage'));
const BalancePage = lazy(() => import('@/src/pages/finance/BalancePage'));
const InboxPage = lazy(() => import('@/src/pages/finance/InboxPage'));
const UniversalEvidenceDetailPage = lazy(() => import('@/src/pages/finance/inbox/UniversalEvidenceDetailPage'));
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


const VIEW_FINANCE = ['finance.view'] as const;
const CREATE_FINANCE = ['finance.create_drafts'] as const;
const REVIEW_FINANCE = ['finance.review', 'finance.approve_for_posting'] as const;
const INBOX_FINANCE = ['finance.view', 'finance.create_drafts', 'finance.review'] as const;
const MANAGE_FINANCE = ['finance.manage', 'organization.manage_entities'] as const;

function withFinanceAccess(element: ReactNode, anyOf: readonly string[]) {
  return <FinanceCapabilityBoundary anyOf={anyOf}>{element}</FinanceCapabilityBoundary>;
}

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
        path: APP_ROUTES.login,
        element: <LoginPage />,
      },
      {
        element: <ShellLayout />,
        children: [
          { path: APP_ROUTES.finance, element: <Suspense fallback={<PageFallback />}><FinancePage /></Suspense> },
          { path: APP_ROUTES.transactions, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><TransactionsListPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.transactionCreate, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><TransactionCreatePage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.transactionDetail, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><TransactionDetailOverviewPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.transactionDetailLegacy, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><TransactionAdvancedDetailPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.transactionEdit, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><TransactionEditGuidedPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.transactionEditLegacy, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><TransactionEditLegacyPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.financeReview, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><ReviewPage /></Suspense>, REVIEW_FINANCE) },
          { path: APP_ROUTES.transactionReviewDetail, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><TransactionReviewDetailPage /></Suspense>, REVIEW_FINANCE) },
          { path: APP_ROUTES.financeSetup, element: <Suspense fallback={<PageFallback />}><SetupPage /></Suspense> },
          { path: APP_ROUTES.financeSettings, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><FinanceSettingsPage /></Suspense>, MANAGE_FINANCE) },
          { path: APP_ROUTES.financeSettingsAccounts, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><FinanceAccountsPage /></Suspense>, MANAGE_FINANCE) },
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
          { path: APP_ROUTES.financeSettingsFunds, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><FinanceFundsPage /></Suspense>, MANAGE_FINANCE) },
          { path: APP_ROUTES.financeSettingsCategories, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><FinanceCategoriesPage /></Suspense>, MANAGE_FINANCE) },
          { path: APP_ROUTES.count, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countSession, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountSessionPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countPaperForms, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountPaperFormsPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countPaperForm, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountPaperFormPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countCapture, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountCapturePage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.countFreeFormCapture, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountFreeFormCapturePage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.countCaptureReview, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountCaptureReviewPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.universalCapture, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><UniversalCapturePage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.balance, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><BalancePage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.inbox, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><InboxPage /></Suspense>, INBOX_FINANCE) },
          { path: APP_ROUTES.inboxEvidenceDetail, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><UniversalEvidenceDetailPage /></Suspense>, INBOX_FINANCE) },
          { path: APP_ROUTES.reports, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><ReportsPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.audit, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><AuditPage /></Suspense>, VIEW_FINANCE) },
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
