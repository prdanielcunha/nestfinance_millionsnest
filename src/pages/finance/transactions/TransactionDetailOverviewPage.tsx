import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Landmark,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldX,
  Wallet,
  Wrench,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { validateSubmissionReadiness } from '@/shared/finance/smartLogic';
import { formatReviewDate, formatReviewMoney } from './transactionReviewModel';
import { TRANSACTION_DETAIL_OVERVIEW_COPY } from './transactionDetailOverviewCopy';

type LoadState = 'loading' | 'ready' | 'error';
type ActionState = 'submit' | null;

function makeRequestToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export default function TransactionDetailOverviewPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = TRANSACTION_DETAIL_OVERVIEW_COPY[language];

  if (
    accessState.status === 'initializing' ||
    accessState.status === 'authenticated_unresolved'
  ) {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.view')) {
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
      <TransactionDetailOverviewContent />
    </FinanceContextGuard>
  );
}

function TransactionDetailOverviewContent() {
  const navigate = useNavigate();
  const { transactionId } = useParams<{ transactionId: string }>();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = TRANSACTION_DETAIL_OVERVIEW_COPY[language];
  const { getTransactionDetail, submitForReview } = useTransactions();

  const [data, setData] = useState<any>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [supportCode, setSupportCode] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [actionError, setActionError] = useState(false);

  const submitIdempotencyKeyRef = useRef<string | null>(null);
  const epochRef = useRef(0);

  const loadData = async (signal?: AbortSignal, currentEpoch?: number) => {
    if (!transactionId || !activeFinanceEntityId) return;

    setLoadState('loading');
    setSupportCode(null);
    setActionError(false);

    try {
      const response = await getTransactionDetail(transactionId);
      if (
        signal?.aborted ||
        (currentEpoch !== undefined && currentEpoch !== epochRef.current)
      ) {
        return;
      }
      setData(response);
      setLoadState('ready');
    } catch (error: any) {
      if (
        signal?.aborted ||
        (currentEpoch !== undefined && currentEpoch !== epochRef.current)
      ) {
        return;
      }
      const requestId = error?.details?.requestId || error?.requestId;
      setSupportCode(typeof requestId === 'string' ? requestId : null);
      setLoadState('error');
    }
  };

  useEffect(() => {
    const abortController = new AbortController();
    const currentEpoch = ++epochRef.current;

    setData(null);
    setLoadState('loading');
    setSupportCode(null);
    setActionState(null);
    setActionError(false);
    submitIdempotencyKeyRef.current = null;

    if (activeFinanceEntityId && transactionId) {
      void loadData(abortController.signal, currentEpoch);
    }

    return () => abortController.abort();
    // The request must restart whenever the selected entity or transaction changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFinanceEntityId, transactionId]);

  if (loadState === 'loading') {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.pageTitle} />
        <div
          className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:px-8"
          aria-busy="true"
          aria-label={copy.loading}
        >
          <Surface variant="elevated" radius="xl" className="min-h-80 animate-pulse p-6">
            <div className="h-5 w-32 rounded bg-surface-secondary" />
            <div className="mt-5 h-12 w-52 rounded bg-surface-secondary" />
            <div className="mt-8 h-44 rounded-2xl bg-surface-secondary" />
          </Surface>
          <Surface variant="elevated" radius="xl" className="h-64 animate-pulse p-6">
            <div className="h-5 w-28 rounded bg-surface-secondary" />
            <div className="mt-5 h-12 rounded bg-surface-secondary" />
            <div className="mt-3 h-12 rounded bg-surface-secondary" />
          </Surface>
        </div>
      </div>
    );
  }

  if (loadState === 'error' || !data?.transaction) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.pageTitle} />
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <Surface variant="elevated" radius="xl" role="alert" className="w-full max-w-md p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-text-primary">{copy.errorTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.errorBody}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button fullWidth onClick={() => void loadData(undefined, epochRef.current)}>
                {copy.retry}
              </Button>
              <Button variant="secondary" fullWidth onClick={() => navigate(APP_ROUTES.transactions)}>
                {copy.backToList}
              </Button>
            </div>
            {supportCode ? (
              <p className="mt-5 break-all font-mono text-xs text-text-muted">
                {copy.supportCode}: {supportCode}
              </p>
            ) : null}
          </Surface>
        </div>
      </div>
    );
  }

  const transaction = data.transaction;
  const allocations = Array.isArray(data.allocations) ? data.allocations : [];
  const direction = transaction.transactionKind || transaction.direction || 'expense';
  const amountCents = Number(transaction.amountCents || 0);
  const allocationTotal = allocations.reduce(
    (total: number, allocation: any) => total + Number(allocation.amountCents || 0),
    0,
  );
  const allocationMismatch = allocations.length > 0 && allocationTotal !== amountCents;
  const evidenceCount = Array.isArray(transaction.evidenceIds) ? transaction.evidenceIds.length : 0;
  const canEditDraft = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const canReview = hasEffectiveCapability(accessState, 'finance.review');
  const returnedMarker = Boolean(
    transaction.returnedToDraftAt ||
      transaction.returnReasonCode ||
      transaction.returnReasonText ||
      transaction.returnedToDraftReason ||
      transaction.returnedToDraftComment,
  );
  const statusKey =
    transaction.status === 'draft' && returnedMarker
      ? 'returned'
      : transaction.status || 'unknown';

  const draftReadiness =
    transaction.status === 'draft'
      ? validateSubmissionReadiness({
          direction: transaction.direction,
          amountCents: transaction.amountCents,
          occurredAt: transaction.occurredAt,
          accountId: transaction.accountId,
          destinationAccountId: transaction.destinationAccountId,
          paymentMethod: transaction.paymentMethod,
          description: transaction.description,
          counterparty: transaction.counterparty,
          evidenceIds: transaction.evidenceIds || [],
          evidenceJustification: transaction.evidenceJustification,
          allocations: allocations.map((allocation: any) => ({
            categoryId: allocation.categoryId,
            fundId: allocation.fundId,
            costCenterId: allocation.costCenterId,
            amountCents: allocation.amountCents,
          })),
          settlementType: transaction.settlementType,
          liabilityAccountId: transaction.liabilityAccountId,
        })
      : null;

  const primaryAccount = transaction.accountSnapshot?.name || transaction.accountName;
  const destinationAccount = transaction.destinationAccountSnapshot?.name;
  const liabilityAccount = transaction.liabilityAccountSnapshot?.name;
  const accountRows = (() => {
    if (direction === 'transfer') {
      return [
        { label: copy.fromAccount, value: primaryAccount || copy.noAccount },
        { label: copy.toAccount, value: destinationAccount || copy.noAccount },
      ];
    }
    if (direction === 'liability_settlement') {
      return [
        { label: copy.fromAccount, value: primaryAccount || copy.noAccount },
        { label: copy.toAccount, value: liabilityAccount || copy.noAccount },
      ];
    }
    return [{ label: copy.account, value: primaryAccount || copy.noAccount }];
  })();

  const handleSubmitForReview = async () => {
    if (
      actionState ||
      !canEditDraft ||
      transaction.status !== 'draft' ||
      !draftReadiness?.ready
    ) {
      return;
    }

    setActionState('submit');
    setActionError(false);
    const actionEpoch = epochRef.current;

    if (!submitIdempotencyKeyRef.current) {
      submitIdempotencyKeyRef.current = makeRequestToken('idsm');
    }

    try {
      const response = await submitForReview(
        transaction.id,
        transaction.version,
        submitIdempotencyKeyRef.current,
        makeRequestToken('req'),
      );
      if (actionEpoch !== epochRef.current) return;
      submitIdempotencyKeyRef.current = null;
      setData((current: any) => ({
        ...current,
        transaction: {
          ...current.transaction,
          status: 'ready_for_review',
          version: response.version || current.transaction.version + 1,
        },
      }));
    } catch {
      if (actionEpoch !== epochRef.current) return;
      setActionError(true);
    } finally {
      if (actionEpoch === epochRef.current) setActionState(null);
    }
  };

  const routeFor = (template: string) => template.replace(':transactionId', transaction.id);
  const directionLabel = copy.directions[direction] || copy.type;
  const statusLabel = copy.statuses[statusKey] || copy.statuses.unknown;
  const paymentMethodLabel = transaction.paymentMethod
    ? copy.paymentMethods[transaction.paymentMethod] || transaction.paymentMethod
    : copy.notInformed;
  const returnedNote =
    transaction.returnedToDraftComment ||
    transaction.returnReasonText ||
    transaction.returnedToDraftReason ||
    '';

  const actionPresentation = (() => {
    if (statusKey === 'returned') {
      return {
        title: copy.returnedTitle,
        body: copy.returnedBody,
        noBalance: true,
      };
    }
    if (transaction.status === 'draft') {
      return {
        title: draftReadiness?.ready ? copy.draftReadyTitle : copy.draftIncompleteTitle,
        body: draftReadiness?.ready ? copy.draftReadyBody : copy.draftIncompleteBody,
        noBalance: true,
      };
    }
    if (transaction.status === 'ready_for_review') {
      return {
        title: copy.awaitingReviewTitle,
        body: copy.awaitingReviewBody,
        noBalance: true,
      };
    }
    if (transaction.status === 'approved_for_posting') {
      return {
        title: copy.approvedTitle,
        body: copy.approvedBody,
        noBalance: true,
      };
    }
    if (transaction.status === 'posted') {
      return { title: copy.postedTitle, body: copy.postedBody, noBalance: false };
    }
    if (transaction.status === 'reversed') {
      return { title: copy.reversedTitle, body: copy.reversedBody, noBalance: false };
    }
    return { title: copy.historicalTitle, body: copy.historicalBody, noBalance: false };
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.pageTitle} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <header className="mb-6 flex items-start gap-3">
            <Button
              variant="ghost"
              className="!min-h-12 !w-12 !px-0"
              aria-label={copy.backToList}
              onClick={() => navigate(APP_ROUTES.transactions)}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0 pt-1">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-accent-primary" aria-hidden="true" />
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.pageTitle}</h1>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.pageSubtitle}</p>
            </div>
          </header>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
            <div className="flex min-w-0 flex-col gap-5">
              <Surface variant="elevated" radius="xl" className="overflow-hidden p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 text-xs font-semibold text-text-secondary">
                        {directionLabel}
                      </span>
                      <span className="rounded-full border border-accent-primary/20 bg-accent-primary/10 px-3 py-1 text-xs font-semibold text-accent-primary">
                        {statusLabel}
                      </span>
                    </div>
                    <p className="mt-4 text-3xl font-semibold tracking-tight text-text-primary tabular-nums sm:text-4xl">
                      {formatReviewMoney(amountCents, language, transaction.currency || 'BRL')}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.date}</p>
                    <p className="mt-1 text-sm font-medium text-text-primary">
                      {formatReviewDate(transaction.occurredAt, language) || copy.notInformed}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 border-t border-border-subtle pt-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.description}</p>
                    <p className={`mt-1 text-sm leading-relaxed ${transaction.description ? 'text-text-primary' : 'italic text-text-muted'}`}>
                      {transaction.description || copy.noDescription}
                    </p>
                  </div>
                  {accountRows.map((row) => (
                    <div key={row.label}>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{row.label}</p>
                      <p className="mt-1 flex items-center gap-2 text-sm font-medium text-text-primary">
                        <Landmark className="h-4 w-4 text-text-muted" aria-hidden="true" />
                        {row.value}
                      </p>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.paymentMethod}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-medium text-text-primary">
                      <Wallet className="h-4 w-4 text-text-muted" aria-hidden="true" />
                      {paymentMethodLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.counterparty}</p>
                    <p className="mt-1 text-sm font-medium text-text-primary">
                      {transaction.counterparty || copy.notInformed}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.evidence}</p>
                    <p className="mt-1 text-sm font-medium text-text-primary">{copy.evidenceCount(evidenceCount)}</p>
                  </div>
                </div>

                {returnedNote ? (
                  <div className="mt-5 rounded-2xl border border-semantic-warning/20 bg-semantic-warning/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-semantic-warning">{copy.returnedNote}</p>
                    <p className="mt-2 text-sm leading-relaxed text-text-primary">{returnedNote}</p>
                  </div>
                ) : null}
              </Surface>

              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">{copy.classification}</h2>
                    <p className="mt-1 text-sm text-text-muted">{copy.allocationCount(allocations.length)}</p>
                  </div>
                  {allocationMismatch ? (
                    <span className="rounded-full border border-semantic-warning/20 bg-semantic-warning/10 px-3 py-1 text-xs font-semibold text-semantic-warning">
                      {formatReviewMoney(allocationTotal, language, transaction.currency || 'BRL')}
                    </span>
                  ) : null}
                </div>

                {allocationMismatch ? (
                  <div className="mt-4 flex gap-3 rounded-2xl border border-semantic-warning/20 bg-semantic-warning/10 p-4 text-sm text-text-primary">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" aria-hidden="true" />
                    <p>{copy.allocationMismatch}</p>
                  </div>
                ) : null}

                <div className="mt-4 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-secondary/30">
                  {allocations.length === 0 ? (
                    <div className="p-4 text-sm text-text-muted">{copy.notInformed}</div>
                  ) : (
                    allocations.map((allocation: any, index: number) => (
                      <div key={allocation.id || `${index}`} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8rem] sm:items-center">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.category}</p>
                          <p className="mt-1 text-sm font-medium text-text-primary">{allocation.categorySnapshot?.name || allocation.categoryName || copy.notInformed}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.fund}</p>
                          <p className="mt-1 text-sm font-medium text-text-primary">{allocation.fundSnapshot?.name || allocation.fundName || copy.notInformed}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.costCenter}</p>
                          <p className="mt-1 text-sm font-medium text-text-primary">{allocation.costCenterSnapshot?.name || allocation.costCenterName || copy.notInformed}</p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums text-text-primary sm:text-right">
                          {formatReviewMoney(Number(allocation.amountCents || 0), language, transaction.currency || 'BRL')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Surface>
            </div>

            <aside className="lg:sticky lg:top-4">
              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent-primary/20 bg-accent-primary/10 text-accent-primary">
                    {transaction.status === 'posted' || transaction.status === 'reversed' ? (
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    ) : transaction.status === 'approved_for_posting' ? (
                      <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="h-5 w-5" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">{actionPresentation.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{actionPresentation.body}</p>
                  </div>
                </div>

                {actionPresentation.noBalance ? (
                  <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-secondary p-4 text-sm leading-relaxed text-text-secondary">
                    {copy.noBalanceChange}
                  </div>
                ) : null}

                {actionError ? (
                  <div className="mt-4 flex gap-3 rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 p-4 text-sm text-text-primary" role="alert">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
                    <p>{copy.actionError}</p>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-col gap-3">
                  {transaction.status === 'draft' && canEditDraft ? (
                    <>
                      {draftReadiness?.ready ? (
                        <Button
                          fullWidth
                          disabled={actionState !== null}
                          onClick={() => void handleSubmitForReview()}
                        >
                          <Send className="h-4 w-4" aria-hidden="true" />
                          {actionState === 'submit' ? copy.submitting : copy.submitForReview}
                        </Button>
                      ) : null}
                      <Button
                        variant={draftReadiness?.ready ? 'secondary' : 'primary'}
                        fullWidth
                        onClick={() => navigate(routeFor(APP_ROUTES.transactionEdit))}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        {copy.editDraft}
                      </Button>
                    </>
                  ) : null}

                  {transaction.status === 'ready_for_review' && canReview ? (
                    <Button fullWidth onClick={() => navigate(routeFor(APP_ROUTES.transactionReviewDetail))}>
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {copy.openReview}
                    </Button>
                  ) : null}

                  {transaction.status === 'approved_for_posting' && canReview ? (
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => navigate(routeFor(APP_ROUTES.transactionDetailLegacy))}
                    >
                      <Wrench className="h-4 w-4" aria-hidden="true" />
                      {copy.advancedVerification}
                    </Button>
                  ) : null}

                  <Button variant="ghost" fullWidth onClick={() => navigate(APP_ROUTES.transactions)}>
                    {copy.backToList}
                  </Button>
                </div>
              </Surface>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
