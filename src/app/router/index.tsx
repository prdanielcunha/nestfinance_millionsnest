import { createBrowserRouter, Navigate, RouteObject } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { APP_ROUTES } from './routes';
import { RootLayout } from '../layouts/RootLayout';
import { ShellLayout } from '../layouts/ShellLayout';
import { RouteErrorBoundary } from '../boundaries/RouteErrorBoundary';
import { OrganizationalAccessBoundary } from '../boundaries/OrganizationalAccessBoundary';
import { FinanceCapabilityBoundary } from '../boundaries/FinanceCapabilityBoundary';
import { FinanceTreasuryAreaBoundary } from '../boundaries/FinanceTreasuryAreaBoundary';
import HandoffPage from '@/src/pages/auth/HandoffPage';
import LoginPage from '@/src/pages/auth/LoginPage';

// Lazy loaded pages to keep initial bundle small
const FinancePage = lazy(() => import('@/src/pages/finance/FinancePage'));
const TreasuryHubPage = lazy(() => import('@/src/pages/finance/TreasuryHubPage'));
const PayablesPage = lazy(() => import('@/src/pages/finance/PayablesPage'));
const AccountantWorkspacePage = lazy(() => import('@/src/pages/finance/AccountantWorkspacePage'));
const SetupPage = lazy(() => import('@/src/pages/finance/SetupPage'));
const FinanceSettingsPage = lazy(() => import('@/src/pages/finance/settings/FinanceSettingsPage'));
const FinanceAccountsPage = lazy(() => import('@/src/pages/finance/settings/FinanceAccountsPage'));
const FinanceEntitiesPage = lazy(() => import('@/src/pages/finance/settings/FinanceEntitiesPage'));
const FinanceFundsPage = lazy(() => import('@/src/pages/finance/settings/FinanceFundsPage'));
const FinanceCategoriesPage = lazy(() => import('@/src/pages/finance/settings/FinanceCategoriesPage'));
const CountVerificationPolicyPage = lazy(() => import('@/src/pages/finance/settings/CountVerificationPolicyPage'));
const CountPage = lazy(() => import('@/src/pages/finance/count/CountHubPage'));
const CountSessionPage = lazy(() => import('@/src/pages/finance/count/CountSessionPage'));
const CountJoinPage = lazy(() => import('@/src/pages/finance/count/CountJoinPage'));
const CountVerificationV3Page = lazy(() => import('@/src/pages/finance/count/CountVerificationV3Page'));
const CountVerificationDraftsPage = lazy(() => import('@/src/pages/finance/count/CountVerificationDraftsPage'));
const CountProposalPage = lazy(() => import('@/src/pages/finance/count/CountProposalPage'));
const CountTrainingPage = lazy(() => import('@/src/pages/finance/count/CountTrainingPage'));
const CountVoiceQuickPage = lazy(() => import('@/src/pages/finance/count/CountVoiceQuickPage'));
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
const COUNT_V3_READ = ['finance.count.view', 'finance.count.execute', 'finance.review'] as const;
const REVIEW_FINANCE = ['finance.review', 'finance.approve_for_posting'] as const;
const INBOX_FINANCE = ['finance.view', 'finance.create_drafts', 'finance.review'] as const;
const MANAGE_FINANCE = ['finance.manage', 'organization.manage_entities'] as const;

function withFinanceAccess(element: ReactNode, anyOf: readonly string[]) {
  return <FinanceCapabilityBoundary anyOf={anyOf}>{element}</FinanceCapabilityBoundary>;
}
function withTreasuryAccess(element: ReactNode, anyOf: readonly string[]) {
  return withFinanceAccess(<FinanceTreasuryAreaBoundary>{element}</FinanceTreasuryAreaBoundary>, anyOf);
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
          { path: APP_ROUTES.treasury, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><TreasuryHubPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.payables, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><PayablesPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.accountant, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><AccountantWorkspacePage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.transactions, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><TransactionsListPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.transactionCreate, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><TransactionCreatePage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.transactionDetail, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><TransactionDetailOverviewPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.transactionDetailLegacy, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><TransactionAdvancedDetailPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.transactionEdit, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><TransactionEditGuidedPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.transactionEditLegacy, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><TransactionEditLegacyPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.financeReview, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><ReviewPage /></Suspense>, REVIEW_FINANCE) },
          { path: APP_ROUTES.transactionReviewDetail, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><TransactionReviewDetailPage /></Suspense>, REVIEW_FINANCE) },
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
          { path: APP_ROUTES.financeSettingsCountPolicy, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountVerificationPolicyPage /></Suspense>, ['finance.manage']) },
          { path: APP_ROUTES.count, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countJoin, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountJoinPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.countVerificationV3, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountVerificationV3Page /></Suspense>, COUNT_V3_READ) },
          { path: APP_ROUTES.countVerificationV3Session, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountVerificationV3Page /></Suspense>, COUNT_V3_READ) },
          { path: APP_ROUTES.countVerificationV3Drafts, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountVerificationDraftsPage /></Suspense>, ['finance.review']) },
          { path: APP_ROUTES.countProposal, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountProposalPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.countTraining, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountTrainingPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countVoice, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountVoiceQuickPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.countSession, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountSessionPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countPaperForms, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountPaperFormsPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countPaperForm, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountPaperFormPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.countCapture, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountCapturePage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.countFreeFormCapture, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountFreeFormCapturePage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.countCaptureReview, element: withFinanceAccess(<Suspense fallback={<PageFallback />}><CountCaptureReviewPage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.universalCapture, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><UniversalCapturePage /></Suspense>, CREATE_FINANCE) },
          { path: APP_ROUTES.balance, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><BalancePage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.inbox, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><InboxPage /></Suspense>, INBOX_FINANCE) },
          { path: APP_ROUTES.inboxEvidenceDetail, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><UniversalEvidenceDetailPage /></Suspense>, INBOX_FINANCE) },
          { path: APP_ROUTES.reports, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><ReportsPage /></Suspense>, VIEW_FINANCE) },
          { path: APP_ROUTES.audit, element: withTreasuryAccess(<Suspense fallback={<PageFallback />}><AuditPage /></Suspense>, VIEW_FINANCE) },
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
