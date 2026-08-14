import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Clock3,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { FirestoreIndexRemediationCard } from '@/src/components/finance/FirestoreIndexRemediationCard';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { TRANSACTION_REVIEW_COPY } from './transactionReviewCopy';
import {
  formatReviewDate,
  formatReviewMoney,
  normalizeReviewDirection,
  normalizeReviewOrder,
  type ReviewDirectionFilter,
  type ReviewOrder,
} from './transactionReviewModel';

type ReviewErrorKind = 'index' | 'generic' | null;

const DIRECTION_FILTERS: ReviewDirectionFilter[] = [
  'all',
  'income',
  'expense',
  'transfer',
  'liability_settlement',
];

const ORDER_FILTERS: ReviewOrder[] = ['oldest', 'newest'];

export default function ReviewPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = TRANSACTION_REVIEW_COPY[language];

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
          {copy.accessDeniedTitle}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-text-muted">
          {copy.accessDeniedBody}
        </p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <ReviewContent />
    </FinanceContextGuard>
  );
}

function ReviewContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { listTransactions } = useTransactions();
  const { language } = useLanguage();
  const copy = TRANSACTION_REVIEW_COPY[language];

  const directionFilter = normalizeReviewDirection(searchParams.get('direction'));
  const orderFilter = normalizeReviewOrder(searchParams.get('order'));

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorKind, setErrorKind] = useState<ReviewErrorKind>(null);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const epochRef = useRef(0);

  const loadData = async (
    cursor?: string,
    signal?: AbortSignal,
    currentEpoch?: number,
  ) => {
    if (!cursor) setLoading(true);
    else setLoadingMore(true);
    setErrorKind(null);
    setErrorDetails(null);

    try {
      const filters: Record<string, string> = {
        status: 'ready_for_review',
        order: orderFilter,
      };
      if (directionFilter !== 'all') filters.direction = directionFilter;

      const response = await listTransactions(filters, cursor, 25);

      if (
        signal?.aborted ||
        (currentEpoch !== undefined && currentEpoch !== epochRef.current)
      ) {
        return;
      }

      setItems((current) =>
        cursor ? [...current, ...response.items] : response.items,
      );
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (error: any) {
      if (
        signal?.aborted ||
        (currentEpoch !== undefined && currentEpoch !== epochRef.current)
      ) {
        return;
      }

      const details = error?.details || null;
      const rawMessage = String(error?.message || '');
      const isIndexError =
        details?.errorCode === 'FINANCE_REVIEW_INDEX_REQUIRED' ||
        details?.remediation?.type === 'CREATE_FIRESTORE_INDEX' ||
        rawMessage.includes('requires an index');

      setErrorKind(isIndexError ? 'index' : 'generic');
      setErrorDetails(details);
    } finally {
      if (
        signal?.aborted ||
        (currentEpoch !== undefined && currentEpoch !== epochRef.current)
      ) {
        return;
      }
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const abortController = new AbortController();
    setItems([]);
    setNextCursor(undefined);
    setHasMore(true);

    if (activeFinanceEntityId) {
      void loadData(
        undefined,
        abortController.signal,
        ++epochRef.current,
      );
    }

    return () => abortController.abort();
    // The request is intentionally restarted by these canonical queue dimensions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFinanceEntityId, directionFilter, orderFilter]);

  const updateDirection = (value: ReviewDirectionFilter) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('direction');
    else next.set('direction', value);
    next.delete('cursor');
    setSearchParams(next);
  };

  const updateOrder = (value: ReviewOrder) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'oldest') next.delete('order');
    else next.set('order', value);
    next.delete('cursor');
    setSearchParams(next);
  };

  const loadMore = () => {
    if (!loadingMore && hasMore && nextCursor) {
      void loadData(nextCursor, undefined, epochRef.current);
    }
  };

  const openReview = (transactionId: string) => {
    const route = APP_ROUTES.transactionDetail.replace(
      ':transactionId',
      transactionId,
    );
    navigate(`${route}?reviewMode=true`);
  };

  const transactionType = (transactionKind: string) => {
    if (transactionKind === 'income') return copy.directions.income;
    if (transactionKind === 'expense') return copy.directions.expense;
    if (transactionKind === 'transfer') return copy.directions.transfer;
    if (transactionKind === 'liability_settlement') {
      return copy.directions.liability_settlement;
    }
    return copy.directions.all;
  };

  if (errorKind === 'index' && items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.pageTitle} />
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-6">
          <div className="w-full max-w-md">
            <FirestoreIndexRemediationCard
              remediation={errorDetails?.remediation}
              requestId={errorDetails?.requestId}
              onRetry={() =>
                void loadData(undefined, undefined, epochRef.current)
              }
            />
          </div>
        </div>
      </div>
    );
  }

  if (errorKind === 'generic' && items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.pageTitle} />
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-6">
          <Surface
            variant="elevated"
            radius="xl"
            role="alert"
            className="w-full max-w-md p-6 text-center"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-text-primary">
              {copy.errorTitle}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {copy.errorBody}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button
                fullWidth
                onClick={() =>
                  void loadData(undefined, undefined, epochRef.current)
                }
              >
                {copy.retry}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate(APP_ROUTES.finance)}
              >
                {copy.backToFinance}
              </Button>
            </div>
            {errorDetails?.requestId ? (
              <p className="mt-5 break-all font-mono text-xs text-text-muted">
                {copy.supportCode}: {errorDetails.requestId}
              </p>
            ) : null}
          </Surface>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.pageTitle} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                variant="ghost"
                className="!min-h-12 !w-12 !px-0"
                aria-label={copy.back}
                onClick={() => navigate(APP_ROUTES.finance)}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
              <div className="min-w-0 pt-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className="h-5 w-5 text-accent-primary"
                    aria-hidden="true"
                  />
                  <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                    {copy.pageTitle}
                  </h1>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
                  {copy.pageSubtitle}
                </p>
              </div>
            </div>

            <div
              className="flex rounded-xl border border-border-subtle bg-surface-elevated p-1"
              aria-label={copy.filtersLabel}
            >
              {ORDER_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={orderFilter === value}
                  onClick={() => updateOrder(value)}
                  className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-semibold transition-colors sm:flex-none ${
                    orderFilter === value
                      ? 'bg-surface-secondary text-text-primary'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {copy.orders[value]}
                </button>
              ))}
            </div>
          </header>

          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            aria-label={copy.filtersLabel}
          >
            {DIRECTION_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={directionFilter === value}
                onClick={() => updateDirection(value)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
                  directionFilter === value
                    ? 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary'
                    : 'border-border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                }`}
              >
                {copy.directions[value]}
              </button>
            ))}
          </div>

          {loading && items.length === 0 ? (
            <div className="grid gap-3" aria-busy="true" aria-label={copy.loading}>
              {[0, 1, 2].map((item) => (
                <Surface
                  key={item}
                  variant="elevated"
                  radius="lg"
                  className="animate-pulse p-5"
                >
                  <div className="h-4 w-24 rounded bg-surface-secondary" />
                  <div className="mt-4 h-6 w-2/3 rounded bg-surface-secondary" />
                  <div className="mt-5 h-4 w-full rounded bg-surface-secondary" />
                </Surface>
              ))}
            </div>
          ) : items.length === 0 ? (
            <Surface variant="elevated" radius="xl" className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border-subtle bg-surface-secondary text-text-muted">
                <Clock3 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-text-primary">
                {copy.emptyTitle}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
                {copy.emptyBody}
              </p>
            </Surface>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="hidden grid-cols-[8rem_8rem_minmax(12rem,1fr)_12rem_9rem_7rem] gap-4 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted md:grid">
                <span>{copy.date}</span>
                <span>{copy.type}</span>
                <span>{copy.description}</span>
                <span>{copy.account}</span>
                <span className="text-right">{copy.amount}</span>
                <span className="text-right">{copy.review}</span>
              </div>

              {items.map((transaction) => {
                const date =
                  formatReviewDate(transaction.occurredAt, language) || '—';
                const accountName =
                  transaction.accountSnapshot?.name || copy.noAccount;
                const description = transaction.description || copy.noDescription;
                const warningCount = Number(transaction.warningCount || 0);

                return (
                  <button
                    key={transaction.id}
                    type="button"
                    onClick={() => openReview(transaction.id)}
                    className="group w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                  >
                    <Surface
                      variant="elevated"
                      radius="lg"
                      className="p-4 transition-colors group-hover:bg-surface-secondary/70 sm:p-5"
                    >
                      <div className="grid gap-3 md:grid-cols-[8rem_8rem_minmax(12rem,1fr)_12rem_9rem_7rem] md:items-center md:gap-4">
                        <div className="flex items-center justify-between gap-3 md:block">
                          <span className="text-xs font-medium text-text-muted md:text-sm md:text-text-secondary">
                            {date}
                          </span>
                          <span className="inline-flex rounded-full border border-semantic-warning/20 bg-semantic-warning/10 px-2.5 py-1 text-[11px] font-semibold text-semantic-warning md:hidden">
                            {copy.awaitingReview}
                          </span>
                        </div>

                        <span className="text-sm font-semibold text-text-primary">
                          {transactionType(transaction.transactionKind)}
                        </span>

                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-medium ${
                              transaction.description
                                ? 'text-text-primary'
                                : 'italic text-text-muted'
                            }`}
                          >
                            {description}
                          </p>
                          {warningCount > 0 ? (
                            <p className="mt-1 text-xs text-semantic-warning">
                              {copy.warnings(warningCount)}
                            </p>
                          ) : null}
                        </div>

                        <span className="truncate text-sm text-text-secondary">
                          {accountName}
                        </span>

                        <span className="text-base font-semibold tabular-nums text-text-primary md:text-right">
                          {formatReviewMoney(
                            Number(transaction.amountCents || 0),
                            language,
                            transaction.currency || 'BRL',
                          )}
                        </span>

                        <span className="flex min-h-11 items-center justify-end gap-1 text-sm font-semibold text-accent-primary">
                          {copy.review}
                          <ChevronRight
                            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </span>
                      </div>
                    </Surface>
                  </button>
                );
              })}
            </div>
          )}

          {items.length > 0 ? (
            <div className="flex flex-col items-center gap-3 pt-2">
              {hasMore && nextCursor ? (
                <Button
                  variant="secondary"
                  disabled={loadingMore}
                  onClick={loadMore}
                >
                  {loadingMore ? copy.loadingMore : copy.loadMore}
                </Button>
              ) : (
                <p className="text-xs text-text-muted">{copy.endOfQueue}</p>
              )}
            </div>
          ) : null}

          {errorKind === 'generic' && items.length > 0 ? (
            <Surface
              variant="secondary"
              radius="lg"
              role="status"
              className="border-semantic-warning/20 bg-semantic-warning/10 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-text-primary">{copy.errorBody}</p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void loadData(undefined, undefined, epochRef.current)
                  }
                >
                  {copy.retry}
                </Button>
              </div>
            </Surface>
          ) : null}
        </div>
      </div>
    </div>
  );
}
