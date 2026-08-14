import { ShieldX } from 'lucide-react';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import LegacyTransactionDetailPage from './TransactionDetailPage';
import { TRANSACTION_DETAIL_OVERVIEW_COPY } from './transactionDetailOverviewCopy';

export default function TransactionAdvancedDetailPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = TRANSACTION_DETAIL_OVERVIEW_COPY[language];

  if (
    accessState.status === 'initializing' ||
    accessState.status === 'authenticated_unresolved'
  ) {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.review')) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center border-t border-border-subtle bg-surface-base p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
          <ShieldX className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-text-primary">
          {copy.advancedDeniedTitle}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-text-muted">
          {copy.advancedDeniedBody}
        </p>
      </main>
    );
  }

  return <LegacyTransactionDetailPage />;
}
