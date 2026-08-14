import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Landmark,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Wallet,
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
import { formatReviewDate, formatReviewMoney } from './transactionReviewModel';
import {
  TRANSACTION_REVIEW_DETAIL_COPY,
  type ReviewReturnReason,
} from './transactionReviewDetailCopy';

type LoadState = 'loading' | 'ready' | 'error' | 'state_changed';
type ActionState = 'approve' | 'return' | null;

function makeRequestToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export default function TransactionReviewDetailPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = TRANSACTION_REVIEW_DETAIL_COPY[language];

  if (
    accessState.status === 'initializing' ||
    accessState.status === 'authenticated_unresolved'
  ) {
    return null;
  }

  const canView = hasEffectiveCapability(accessState, 'finance.view');
  const canReview = hasEffectiveCapability(accessState, 'finance.review');

  if (!canView || !canReview) {
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
      <TransactionReviewDetailContent />
    </FinanceContextGuard>
  );
}

function TransactionReviewDetailContent() {
  const navigate = useNavigate();
  const { transactionId } = useParams<{ transactionId: string }>();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = TRANSACTION_REVIEW_DETAIL_COPY[language];
  const { getTransactionDetail, returnToDraft, approveForPosting } = useTransactions();

  const [data, setData] = useState<any>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [supportCode, setSupportCode] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [actionError, setActionError] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState<ReviewReturnReason>('need_correction');
  const [returnComment, setReturnComment] = useState('');

  const approveIdempotencyKeyRef = useRef<string | null>(null);
  const returnIdempotencyKeyRef = useRef<string | null>(null);
  const epochRef = useRef(0);

  const backToQueue = () => navigate(APP_ROUTES.financeReview);

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

      if (response?.transaction?.status !== 'ready_for_review') {
        setData(null);
        setLoadState('state_changed');
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
    setShowApproveConfirm(false);
    setShowReturnForm(false);
    setActionState(null);
    setActionError(false);
    setReturnReason('need_correction');
    setReturnComment('');
    approveIdempotencyKeyRef.current = null;
    returnIdempotencyKeyRef.current = null;

    if (activeFinanceEntityId && transactionId) {
      void loadData(abortController.signal, currentEpoch);
    }

    return () => abortController.abort();
    // The request must restart whenever the entity or transaction identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFinanceEntityId, transactionId]);

  const handleApprove = async () => {
    if (actionState || !data?.transaction) return;
    if (data.transaction.status !== 'ready_for_review') {
      setLoadState('state_changed');
      return;
    }

    setActionState('approve');
    setActionError(false);
    const actionEpoch = epochRef.current;

    if (!approveIdempotencyKeyRef.current) {
      approveIdempotencyKeyRef.current = makeRequestToken('idap');
    }

    try {
      await approveForPosting(
        data.transaction.id,
        data.transaction.version,
        undefined,
        approveIdempotencyKeyRef.current,
        makeRequestToken('req'),
      );

      if (actionEpoch !== epochRef.current) return;
      approveIdempotencyKeyRef.current = null;
      navigate(APP_ROUTES.financeReview, { replace: true });
    } catch {
      if (actionEpoch !== epochRef.current) return;
      setActionError(true);
    } finally {
      if (actionEpoch === epochRef.current) setActionState(null);
    }
  };

  const handleReturn = async () => {
    if (actionState || !data?.transaction) return;
    if (data.transaction.status !== 'ready_for_review') {
      setLoadState('state_changed');
      return;
    }

    setActionState('return');
    setActionError(false);
    const actionEpoch = epochRef.current;

    if (!returnIdempotencyKeyRef.current) {
      returnIdempotencyKeyRef.current = makeRequestToken('idre');
    }

    try {
      await returnToDraft(
        data.transaction.id,
        data.transaction.version,
        returnReason,
        returnComment.trim() || undefined,
        returnIdempotencyKeyRef.current,
        makeRequestToken('req'),
      );

      if (actionEpoch !== epochRef.current) return;
      returnIdempotencyKeyRef.current = null;
      navigate(APP_ROUTES.financeReview, { replace: true });
    } catch {
      if (actionEpoch !== epochRef.current) return;
      setActionError(true);
    } finally {
      if (actionEpoch === epochRef.current) setActionState(null);
    }
  };

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

  if (loadState === 'error') {
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
              <Button variant="secondary" fullWidth onClick={backToQueue}>
                {copy.backToQueue}
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

  if (loadState === 'state_changed' || !data?.transaction) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.pageTitle} />
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <Surface variant="elevated" radius="xl" className="w-full max-w-md p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border-subtle bg-surface-secondary text-text-secondary">
              <RotateCcw className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-text-primary">{copy.stateChangedTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.stateChangedBody}</p>
            <Button className="mt-6" onClick={backToQueue}>{copy.backToQueue}</Button>
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
  const reviewBlocked = Boolean(data.reviewReadiness && !data.reviewReadiness.ready);
  const approvalDisabled = reviewBlocked || allocationMismatch || actionState !== null;
  const primaryAccount = transaction.accountSnapshot?.name || transaction.accountName;
  const destinationAccount = transaction.destinationAccountSnapshot?.name;
  const liabilityAccount = transaction.liabilityAccountSnapshot?.name;
  const evidenceCount = Array.isArray(transaction.evidenceIds) ? transaction.evidenceIds.length : 0;

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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.pageTitle} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <header className="mb-6 flex items-start gap-3">
            <Button
              variant="ghost"
              className="!min-h-12 !w-12 !px-0"
              aria-label={copy.backToQueue}
              onClick={backToQueue}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0 pt-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent-primary" aria-hidden="true" />
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
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                      {copy.directions[direction] || copy.type}
                    </p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary tabular-nums sm:text-4xl">
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

                <div className="mt-6 border-t border-border-subtle pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.description}</p>
                  <p className={`mt-2 text-base leading-relaxed ${transaction.description ? 'text-text-primary' : 'italic text-text-muted'}`}>
                    {transaction.description || copy.noDescription}
                  </p>
                </div>
              </Surface>

              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  {accountRows.map((row) => (
                    <div key={row.label}>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{row.label}</p>
                      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                        <Landmark className="h-4 w-4 text-text-muted" aria-hidden="true" />
                        {row.value}
                      </p>
                    </div>
                  ))}

                  {direction !== 'transfer' ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.paymentMethod}</p>
                      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                        <Wallet className="h-4 w-4 text-text-muted" aria-hidden="true" />
                        {copy.paymentMethods[transaction.paymentMethod] || transaction.paymentMethod || copy.notInformed}
                      </p>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.counterparty}</p>
                    <p className="mt-2 text-sm font-medium text-text-primary">{transaction.counterparty || copy.notInformed}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.evidence}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                      <FileCheck2 className="h-4 w-4 text-text-muted" aria-hidden="true" />
                      {copy.evidenceCount(evidenceCount)}
                    </p>
                  </div>
                </div>
              </Surface>

              <Surface variant="elevated" radius="xl" className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">{copy.classification}</h2>
                    <p className="mt-1 text-xs text-text-muted">{copy.allocationCount(allocations.length)}</p>
                  </div>
                  {allocations.length > 0 ? (
                    <span className="text-sm font-semibold tabular-nums text-text-secondary">
                      {formatReviewMoney(allocationTotal, language, transaction.currency || 'BRL')}
                    </span>
                  ) : null}
                </div>

                {allocationMismatch ? (
                  <div className="border-b border-semantic-warning/20 bg-semantic-warning/10 px-5 py-4 text-sm text-text-primary sm:px-6">
                    {copy.allocationMismatch}
                  </div>
                ) : null}

                {allocations.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-text-muted sm:px-6">{copy.notInformed}</div>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {allocations.map((allocation: any, index: number) => (
                      <div key={allocation.id || `${allocation.categoryId || 'allocation'}-${index}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center sm:px-6">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.category}</span>
                            <p className="mt-1 text-sm text-text-primary">{allocation.categorySnapshot?.name || allocation.categoryName || copy.notInformed}</p>
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.fund}</span>
                            <p className="mt-1 text-sm text-text-primary">{allocation.fundSnapshot?.name || allocation.fundName || copy.notInformed}</p>
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.costCenter}</span>
                            <p className="mt-1 text-sm text-text-primary">{allocation.costCenterSnapshot?.name || allocation.costCenterName || copy.notInformed}</p>
                          </div>
                        </div>
                        <p className="text-base font-semibold tabular-nums text-text-primary sm:text-right">
                          {formatReviewMoney(Number(allocation.amountCents || 0), language, transaction.currency || 'BRL')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Surface>
            </div>

            <aside className="lg:sticky lg:top-5">
              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-accent-primary" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-text-primary">{copy.decisionTitle}</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{copy.decisionBody}</p>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.noBalanceChange}</p>

                {reviewBlocked ? (
                  <div className="mt-5 rounded-2xl border border-semantic-warning/20 bg-semantic-warning/10 p-4" role="status">
                    <p className="text-sm font-semibold text-text-primary">{copy.warningsTitle}</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.warningsBody}</p>
                  </div>
                ) : null}

                {actionError ? (
                  <div className="mt-5 rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 p-4 text-sm text-text-primary" role="alert">
                    {copy.actionError}
                  </div>
                ) : null}

                {!showApproveConfirm && !showReturnForm ? (
                  <div className="mt-6 grid gap-3">
                    <Button
                      fullWidth
                      disabled={approvalDisabled}
                      onClick={() => {
                        setActionError(false);
                        setShowApproveConfirm(true);
                      }}
                    >
                      {copy.approveButton}
                    </Button>
                    <Button
                      variant="secondary"
                      fullWidth
                      disabled={actionState !== null}
                      onClick={() => {
                        setActionError(false);
                        setShowReturnForm(true);
                      }}
                    >
                      {copy.returnButton}
                    </Button>
                  </div>
                ) : null}

                {showApproveConfirm ? (
                  <div className="mt-6 rounded-2xl border border-border-subtle bg-surface-secondary p-4">
                    <h3 className="text-sm font-semibold text-text-primary">{copy.approveConfirmTitle}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.approveConfirmBody}</p>
                    <div className="mt-4 grid gap-2">
                      <Button fullWidth disabled={approvalDisabled} onClick={() => void handleApprove()}>
                        {actionState === 'approve' ? copy.approving : copy.confirmApprove}
                      </Button>
                      <Button
                        variant="ghost"
                        fullWidth
                        disabled={actionState !== null}
                        onClick={() => setShowApproveConfirm(false)}
                      >
                        {copy.cancel}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {showReturnForm ? (
                  <div className="mt-6 rounded-2xl border border-border-subtle bg-surface-secondary p-4">
                    <h3 className="text-sm font-semibold text-text-primary">{copy.returnTitle}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.returnBody}</p>

                    <label className="mt-4 block text-xs font-semibold text-text-secondary" htmlFor="review-return-reason">
                      {copy.reasonLabel}
                    </label>
                    <select
                      id="review-return-reason"
                      value={returnReason}
                      disabled={actionState !== null}
                      onChange={(event) => setReturnReason(event.target.value as ReviewReturnReason)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-primary outline-none focus:border-accent-primary"
                    >
                      {(Object.keys(copy.reasons) as ReviewReturnReason[]).map((reason) => (
                        <option key={reason} value={reason}>{copy.reasons[reason]}</option>
                      ))}
                    </select>

                    <label className="mt-4 block text-xs font-semibold text-text-secondary" htmlFor="review-return-comment">
                      {copy.commentLabel}
                    </label>
                    <textarea
                      id="review-return-comment"
                      rows={4}
                      value={returnComment}
                      disabled={actionState !== null}
                      onChange={(event) => setReturnComment(event.target.value)}
                      placeholder={copy.commentPlaceholder}
                      className="mt-2 w-full resize-none rounded-xl border border-border-subtle bg-surface-base px-3 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent-primary"
                    />

                    <div className="mt-4 grid gap-2">
                      <Button variant="danger" fullWidth disabled={actionState !== null} onClick={() => void handleReturn()}>
                        {actionState === 'return' ? copy.returning : copy.confirmReturn}
                      </Button>
                      <Button
                        variant="ghost"
                        fullWidth
                        disabled={actionState !== null}
                        onClick={() => setShowReturnForm(false)}
                      >
                        {copy.cancel}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Surface>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
