import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  ShieldX,
  Split,
  Trash2,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import AccountRepairCard from '@/src/components/finance/AccountRepairCard';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { FinanceSelect } from '@/src/components/finance/FinanceSelect';
import { TransactionEvidenceUpload } from '@/src/components/finance/TransactionEvidenceUpload';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import { useAuth } from '@/src/hooks/useAuth';
import { firebaseAuth } from '@/src/lib/firebase';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import {
  getCompatibleAccounts,
  getCompatiblePaymentInstruments,
  validateSubmissionReadiness,
} from '@/shared/finance/smartLogic';
import { PAYMENT_METHODS as ALL_PAYMENT_METHODS } from '@/shared/finance/paymentMethods';
import {
  PAYMENT_METHOD_LABELS,
  TRANSACTION_CREATE_COPY,
} from './transactionCreateCopy';
import {
  buildTransactionCreateMaterialFingerprint,
  formatTransactionInputAmount,
  type TransactionCreateDirection,
} from './transactionCreateModel';
import { TRANSACTION_EDIT_COPY } from './transactionEditCopy';

type LoadState = 'loading' | 'ready' | 'error' | 'immutable';
type SaveNotice = 'saved' | 'no_changes' | 'review_sent' | null;
type AllocationDraft = {
  id: string;
  categoryId: string;
  fundId: string;
  costCenterId: string;
  amountRaw: string | null;
};

type RetryAttempt = {
  identity: string;
  key: string;
};

type PendingSubmitAttempt = {
  fingerprint: string;
  version: number;
  key: string;
};

function makeToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function parseCents(value: string | null | undefined) {
  const parsed = Number.parseInt(String(value || '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isIncompleteAccount(account: any) {
  return Boolean(
    account &&
      (account.configurationStatus !== 'complete' ||
        !account.type ||
        !account.nature),
  );
}

function extractSupportCode(error: any): string | null {
  const candidates = [
    error?.details?.requestId,
    error?.requestId,
    error?.details?.details?.requestId,
  ];
  const value = candidates.find((item) => typeof item === 'string' && item.length > 0);
  return typeof value === 'string' ? value : null;
}

function collectErrorCode(error: any): string {
  return [
    error?.details?.errorCode,
    error?.details?.error,
    error?.details?.code,
    error?.message,
  ]
    .filter((value) => typeof value === 'string')
    .join(' ');
}

export default function TransactionEditGuidedPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const editCopy = TRANSACTION_EDIT_COPY[language];

  if (
    accessState.status === 'initializing' ||
    accessState.status === 'authenticated_unresolved'
  ) {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.create_drafts')) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center border-t border-border-subtle bg-surface-base p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
          <ShieldX className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-text-primary">
          {editCopy.accessDeniedTitle}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-text-muted">
          {editCopy.accessDeniedBody}
        </p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <TransactionEditGuidedContent />
    </FinanceContextGuard>
  );
}

function TransactionEditGuidedContent() {
  const navigate = useNavigate();
  const { transactionId } = useParams<{ transactionId: string }>();
  const { accessState } = useAuth();
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = TRANSACTION_CREATE_COPY[language];
  const editCopy = TRANSACTION_EDIT_COPY[language];
  const paymentLabels = PAYMENT_METHOD_LABELS[language];
  const { getTransactionDetail, updateDraft, submitForReview } = useTransactions();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);

  const [direction, setDirection] = useState<TransactionCreateDirection>('expense');
  const [settlementType, setSettlementType] = useState<'credit_card_bill' | 'reimbursement' | ''>('');
  const [liabilityAccountId, setLiabilityAccountId] = useState('');
  const [amountRaw, setAmountRaw] = useState('0');
  const [occurredAt, setOccurredAt] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [description, setDescription] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [evidenceJustification, setEvidenceJustification] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showClassification, setShowClassification] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [allocations, setAllocations] = useState<AllocationDraft[]>([
    {
      id: 'initial',
      categoryId: '',
      fundId: '',
      costCenterId: '',
      amountRaw: null,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<SaveNotice>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [supportCode, setSupportCode] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [paymentWarning, setPaymentWarning] = useState<string | null>(null);

  const epochRef = useRef(0);
  const baselineFingerprintRef = useRef<string | null>(null);
  const draftAttemptRef = useRef<RetryAttempt | null>(null);
  const pendingSubmitRef = useRef<PendingSubmitAttempt | null>(null);

  const resetRetryState = () => {
    draftAttemptRef.current = null;
    pendingSubmitRef.current = null;
  };

  const accountLabel = (account: any) =>
    isIncompleteAccount(account)
      ? `${account.name} (${copy.accountPending})`
      : account.name;

  const applySafeError = (error: any, fallback = editCopy.uncertainError) => {
    const code = collectErrorCode(error);
    setSupportCode(extractSupportCode(error));

    if (code.includes('FINANCE_VERSION_CONFLICT')) {
      setConflict(true);
      setSaveError(null);
      return;
    }
    if (code.includes('FINANCE_ALLOCATION_TOTAL_MISMATCH')) {
      setSaveError(copy.errorAllocationMismatch);
    } else if (code.includes('FINANCE_ACCOUNT_MISMATCH')) {
      setSaveError(copy.errorAccountMismatch);
    } else if (code.includes('FINANCE_CATEGORY_MISMATCH')) {
      setSaveError(copy.errorCategoryMismatch);
    } else if (code.includes('FINANCE_FUND_MISMATCH')) {
      setSaveError(copy.errorFundMismatch);
    } else if (code.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      setSaveError(copy.errorIdempotency);
    } else if (code.includes('FINANCE_PAYMENT_METHOD_MISMATCH')) {
      setSaveError(copy.errorPaymentMismatch);
    } else if (code.includes('FORBIDDEN') || code.includes('permission')) {
      setSaveError(copy.errorForbidden);
    } else if (code.includes('FINANCE_INVALID_STATE_TRANSITION')) {
      setLoadState('immutable');
      setSaveError(null);
    } else if (
      code.includes('503') ||
      code.includes('SERVICE_UNAVAILABLE') ||
      code.includes('timeout')
    ) {
      setSaveError(copy.errorServiceUnavailable);
    } else {
      setSaveError(fallback);
    }
  };

  const loadDataAndCatalogs = async (
    signal?: AbortSignal,
    currentEpoch?: number,
  ) => {
    if (!activeFinanceEntityId || !transactionId) return;

    setLoadState('loading');
    setSaveError(null);
    setSupportCode(null);
    setConflict(false);
    setNotice(null);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('UNAUTHENTICATED');
      const token = await user.getIdToken();

      const [detail, accountsResponse, fundsResponse, categoriesResponse] =
        await Promise.all([
          getTransactionDetail(transactionId),
          fetch('/api/finance/accounts/list', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
            signal,
          }),
          fetch('/api/finance/funds/list', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
            signal,
          }),
          fetch('/api/finance/categories/list', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
            signal,
          }),
        ]);

      if (
        signal?.aborted ||
        (currentEpoch !== undefined && currentEpoch !== epochRef.current)
      ) {
        return;
      }

      if (!accountsResponse.ok || !fundsResponse.ok || !categoriesResponse.ok) {
        throw new Error('CATALOG_LOAD_FAILED');
      }

      if (detail.transaction.status !== 'draft') {
        setLoadState('immutable');
        return;
      }

      const [accountsData, fundsData, categoriesData] = await Promise.all([
        accountsResponse.json().catch(() => ({})),
        fundsResponse.json().catch(() => ({})),
        categoriesResponse.json().catch(() => ({})),
      ]);

      const transaction = detail.transaction as any;
      const transactionAllocations = Array.isArray(detail.allocations)
        ? detail.allocations
        : [];
      const activeAccounts = (accountsData.accounts || []).filter(
        (account: any) => account.active,
      );
      const activeFunds = (fundsData.funds || []).filter((fund: any) => fund.active);
      const activeCategories = (categoriesData.categories || []).filter(
        (category: any) => category.active,
      );

      const injectAccount = (id: string | undefined, snapshot: any, fallback: string) => {
        if (!id || activeAccounts.some((item: any) => item.id === id)) return;
        activeAccounts.push({
          id,
          name: snapshot?.name || fallback,
          active: false,
          type: snapshot?.type,
          nature: snapshot?.nature,
          configurationStatus: snapshot?.configurationStatus || 'complete',
          supportedPaymentInstruments: snapshot?.supportedPaymentInstruments || [],
        });
      };

      injectAccount(
        transaction.accountId,
        transaction.accountSnapshot,
        transaction.accountName || copy.noAccount,
      );
      injectAccount(
        transaction.destinationAccountId,
        transaction.destinationAccountSnapshot,
        copy.destinationAccount,
      );
      injectAccount(
        transaction.liabilityAccountId,
        transaction.liabilityAccountSnapshot,
        copy.liabilityAccount,
      );

      for (const allocation of transactionAllocations) {
        if (
          allocation.categoryId &&
          !activeCategories.some((item: any) => item.id === allocation.categoryId)
        ) {
          activeCategories.push({
            id: allocation.categoryId,
            name:
              allocation.categorySnapshot?.name ||
              allocation.categoryName ||
              copy.category,
            active: false,
            kind: transaction.direction,
          });
        }
        if (
          allocation.fundId &&
          !activeFunds.some((item: any) => item.id === allocation.fundId)
        ) {
          activeFunds.push({
            id: allocation.fundId,
            name:
              allocation.fundSnapshot?.name || allocation.fundName || copy.fund,
            active: false,
          });
        }
      }

      setAccounts(activeAccounts);
      setFunds(activeFunds);
      setCategories(activeCategories);
      setExpectedVersion(Number(transaction.version));
      setDirection(transaction.direction as TransactionCreateDirection);
      setSettlementType(transaction.settlementType || '');
      setLiabilityAccountId(transaction.liabilityAccountId || '');
      setAmountRaw(String(transaction.amountCents || 0));
      setOccurredAt(
        transaction.occurredAt
          ? String(transaction.occurredAt).slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      );
      setAccountId(transaction.accountId || '');
      setDestinationAccountId(transaction.destinationAccountId || '');
      setPaymentMethod(transaction.paymentMethod || '');
      setDescription(transaction.description || '');
      setCounterparty(transaction.counterparty || '');
      setEvidenceIds(transaction.evidenceIds || []);
      setEvidenceJustification(transaction.evidenceJustification || '');
      setShowDetails(
        Boolean(
          transaction.counterparty ||
            transaction.description ||
            transaction.evidenceJustification ||
            transaction.evidenceIds?.length,
        ),
      );
      setShowClassification(transactionAllocations.length > 0);

      if (
        transactionAllocations.length > 1 ||
        (transactionAllocations.length === 1 &&
          Number(transactionAllocations[0].amountCents || 0) !==
            Number(transaction.amountCents || 0))
      ) {
        setIsSplit(true);
        setAllocations(
          transactionAllocations.map((allocation: any, index: number) => ({
            id: allocation.id || `alloc_${index}`,
            categoryId: allocation.categoryId || '',
            fundId: allocation.fundId || '',
            costCenterId: allocation.costCenterId || '',
            amountRaw: String(allocation.amountCents || 0),
          })),
        );
      } else if (transactionAllocations.length === 1) {
        setIsSplit(false);
        setAllocations([
          {
            id: transactionAllocations[0].id || 'alloc_initial',
            categoryId: transactionAllocations[0].categoryId || '',
            fundId: transactionAllocations[0].fundId || '',
            costCenterId: transactionAllocations[0].costCenterId || '',
            amountRaw: null,
          },
        ]);
      } else {
        setIsSplit(false);
        setAllocations([
          {
            id: 'alloc_initial',
            categoryId: '',
            fundId: '',
            costCenterId: '',
            amountRaw: null,
          },
        ]);
      }

      resetRetryState();
      setLoadState('ready');

      const initialPayload = {
        direction: transaction.direction,
        amountCents: Number(transaction.amountCents || 0),
        occurredAt: transaction.occurredAt,
        accountId: transaction.accountId || '',
        destinationAccountId: transaction.destinationAccountId || '',
        paymentMethod: transaction.paymentMethod || '',
        description: transaction.description || '',
        counterparty: transaction.counterparty || '',
        evidenceIds: transaction.evidenceIds || [],
        evidenceJustification: transaction.evidenceJustification || '',
        settlementType: transaction.settlementType || '',
        liabilityAccountId: transaction.liabilityAccountId || '',
        allocations: transactionAllocations.map((allocation: any) => ({
          categoryId: allocation.categoryId || '',
          fundId: allocation.fundId || '',
          costCenterId: allocation.costCenterId || '',
          amountCents: Number(allocation.amountCents || 0),
        })),
      };
      baselineFingerprintRef.current =
        buildTransactionCreateMaterialFingerprint(initialPayload);
    } catch (error: any) {
      if (
        signal?.aborted ||
        (currentEpoch !== undefined && currentEpoch !== epochRef.current)
      ) {
        return;
      }
      setSupportCode(extractSupportCode(error));
      setLoadState('error');
    }
  };

  useEffect(() => {
    const abortController = new AbortController();
    const epoch = ++epochRef.current;
    resetRetryState();
    void loadDataAndCatalogs(abortController.signal, epoch);
    return () => abortController.abort();
    // Entity and transaction define the canonical edit context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFinanceEntityId, transactionId]);

  const totalCents = parseCents(amountRaw);
  const compatibleCategories = useMemo(
    () => categories.filter((category) => category.kind === direction),
    [categories, direction],
  );

  const validPaymentMethods = getCompatiblePaymentInstruments(undefined, direction);
  const availablePaymentMethods = useMemo(() => {
    if (direction === 'transfer') return [];
    return ALL_PAYMENT_METHODS.filter((method) =>
      validPaymentMethods.includes(method.code as any),
    );
  }, [direction, validPaymentMethods]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accounts, accountId],
  );
  const selectedDestination = useMemo(
    () => accounts.find((account) => account.id === destinationAccountId),
    [accounts, destinationAccountId],
  );
  const selectedLiability = useMemo(
    () => accounts.find((account) => account.id === liabilityAccountId),
    [accounts, liabilityAccountId],
  );

  const availableAccounts = useMemo(
    () =>
      getCompatibleAccounts(
        paymentMethod,
        direction,
        accounts.filter(
          (account) =>
            account.active ||
            account.id === accountId ||
            account.id === destinationAccountId ||
            account.id === liabilityAccountId,
        ),
      ),
    [
      paymentMethod,
      direction,
      accounts,
      accountId,
      destinationAccountId,
      liabilityAccountId,
    ],
  );

  useEffect(() => {
    if (!paymentMethod || direction === 'transfer') return;
    if (!availablePaymentMethods.some((method) => method.code === paymentMethod)) {
      setPaymentMethod('');
      setPaymentWarning(copy.paymentRemoved);
    }
  }, [availablePaymentMethods, direction, paymentMethod, copy.paymentRemoved]);

  useEffect(() => {
    if (!selectedAccount || !paymentMethod) return;
    const supported = selectedAccount.supportedPaymentInstruments || [];
    if (supported.length > 0 && !supported.includes(paymentMethod)) {
      setPaymentMethod('');
      setPaymentWarning(copy.paymentUnsupported(selectedAccount.name));
    }
  }, [selectedAccount, paymentMethod, copy]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    setAllocations((current) =>
      current.map((allocation) => {
        const category = categories.find(
          (item) => item.id === allocation.categoryId,
        );
        return category && category.kind !== direction
          ? { ...allocation, categoryId: '' }
          : allocation;
      }),
    );
  }, [direction, categories, loadState]);

  const allocatedCents = isSplit
    ? allocations.reduce(
        (total, allocation) => total + parseCents(allocation.amountRaw),
        0,
      )
    : totalCents;
  const allocationDifference = totalCents - allocatedCents;

  const buildPayload = (showErrors = true) => {
    const fail = (message: string) => {
      if (showErrors) setSaveError(message);
      return null;
    };

    if (!accountId) return fail(copy.errorSelectAccount);
    if (isIncompleteAccount(selectedAccount)) return fail(copy.errorIncompleteAccount);

    if (direction === 'transfer') {
      if (!destinationAccountId) return fail(copy.errorSelectDestination);
      if (destinationAccountId === accountId) return fail(copy.errorSameAccounts);
      if (isIncompleteAccount(selectedDestination)) {
        return fail(copy.errorIncompleteDestination);
      }
    }

    if (direction === 'liability_settlement') {
      if (!settlementType) return fail(copy.errorSettlementType);
      if (!liabilityAccountId) return fail(copy.errorLiabilityAccount);
      if (isIncompleteAccount(selectedLiability)) {
        return fail(copy.errorIncompleteLiability);
      }
    }

    if (totalCents <= 0) return fail(copy.errorPositiveAmount);

    const finalAllocations: Array<{
      categoryId: string;
      fundId?: string;
      costCenterId?: string;
      amountCents: number;
    }> = [];

    if (direction !== 'transfer' && direction !== 'liability_settlement') {
      if (isSplit) {
        for (const allocation of allocations) {
          if (!allocation.categoryId) return fail(copy.errorAllocationCategory);
          const amountCents = parseCents(allocation.amountRaw);
          if (amountCents <= 0) return fail(copy.errorAllocationAmount);
          finalAllocations.push({
            categoryId: allocation.categoryId,
            fundId: allocation.fundId || undefined,
            costCenterId: allocation.costCenterId || undefined,
            amountCents,
          });
        }
      } else if (allocations[0]?.categoryId) {
        finalAllocations.push({
          categoryId: allocations[0].categoryId,
          fundId: allocations[0].fundId || undefined,
          costCenterId: allocations[0].costCenterId || undefined,
          amountCents: totalCents,
        });
      }
    }

    return {
      direction,
      amountCents: totalCents,
      occurredAt: new Date(`${occurredAt}T12:00:00Z`).toISOString(),
      accountId,
      destinationAccountId:
        direction === 'transfer' ? destinationAccountId : undefined,
      paymentMethod: direction === 'transfer' ? undefined : paymentMethod || undefined,
      description: description || undefined,
      counterparty: counterparty || undefined,
      evidenceIds,
      evidenceJustification: evidenceJustification || undefined,
      sourceContext: 'manual',
      allocations:
        direction === 'transfer' || direction === 'liability_settlement'
          ? []
          : finalAllocations,
      settlementType:
        direction === 'liability_settlement' ? settlementType : undefined,
      liabilityAccountId:
        direction === 'liability_settlement' ? liabilityAccountId : undefined,
    };
  };

  const validationPayload = useMemo(
    () => buildPayload(false) || {},
    // This is intentionally derived from every material edit dimension.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      direction,
      amountRaw,
      occurredAt,
      accountId,
      destinationAccountId,
      paymentMethod,
      description,
      counterparty,
      evidenceIds,
      evidenceJustification,
      allocations,
      isSplit,
      settlementType,
      liabilityAccountId,
      accounts,
    ],
  );
  const readiness = useMemo(
    () => validateSubmissionReadiness(validationPayload),
    [validationPayload],
  );
  const materialFingerprint = useMemo(
    () => buildTransactionCreateMaterialFingerprint(validationPayload),
    [validationPayload],
  );
  const isDirty =
    baselineFingerprintRef.current !== null &&
    materialFingerprint !== baselineFingerprintRef.current;

  const saveDraftCore = async (payload: any) => {
    if (!transactionId || !activeFinanceEntityId || expectedVersion === null) {
      return null;
    }

    const fingerprint = buildTransactionCreateMaterialFingerprint(payload);
    const identity = `${activeFinanceEntityId}|${transactionId}|${expectedVersion}|${fingerprint}`;
    if (!draftAttemptRef.current || draftAttemptRef.current.identity !== identity) {
      draftAttemptRef.current = { identity, key: makeToken('idup_draft') };
    }

    const actionEpoch = epochRef.current;
    const requestId = makeToken('req');
    setSupportCode(requestId);

    try {
      const response = await updateDraft(
        transactionId,
        expectedVersion,
        payload,
        draftAttemptRef.current.key,
        requestId,
      );
      if (actionEpoch !== epochRef.current) return null;

      draftAttemptRef.current = null;
      const nextVersion = Number(response.version ?? expectedVersion);
      setExpectedVersion(nextVersion);
      setSupportCode(null);
      baselineFingerprintRef.current = fingerprint;
      setNotice(response.changed === false ? 'no_changes' : 'saved');
      return { version: nextVersion, fingerprint };
    } catch (error: any) {
      if (actionEpoch !== epochRef.current) return null;
      applySafeError(error);
      return null;
    }
  };

  const handleSaveDraft = async () => {
    if (saving || submitting) return;
    setSaveError(null);
    setSupportCode(null);
    setNotice(null);
    setConflict(false);
    const payload = buildPayload(true);
    if (!payload) return;

    setSaving(true);
    try {
      await saveDraftCore(payload);
    } finally {
      setSaving(false);
    }
  };

  const submitSavedVersion = async (
    version: number,
    fingerprint: string,
  ) => {
    if (!transactionId) return false;

    if (
      !pendingSubmitRef.current ||
      pendingSubmitRef.current.version !== version ||
      pendingSubmitRef.current.fingerprint !== fingerprint
    ) {
      pendingSubmitRef.current = {
        version,
        fingerprint,
        key: makeToken('idsm'),
      };
    }

    const attempt = pendingSubmitRef.current;
    const actionEpoch = epochRef.current;
    const requestId = makeToken('req');
    setSupportCode(requestId);

    try {
      await submitForReview(
        transactionId,
        attempt.version,
        attempt.key,
        requestId,
      );
      if (actionEpoch !== epochRef.current) return false;
      pendingSubmitRef.current = null;
      setSupportCode(null);
      setNotice('review_sent');
      navigate(
        APP_ROUTES.transactionDetail.replace(':transactionId', transactionId),
        { replace: true },
      );
      return true;
    } catch (error: any) {
      if (actionEpoch !== epochRef.current) return false;
      applySafeError(error);
      return false;
    }
  };

  const handleSaveAndSubmit = async () => {
    if (saving || submitting || !hasEffectiveCapability(accessState, 'finance.submit_for_review')) {
      return;
    }

    setSaveError(null);
    setSupportCode(null);
    setNotice(null);
    setConflict(false);

    const payload = buildPayload(true);
    if (!payload) return;
    const nextReadiness = validateSubmissionReadiness(payload);
    if (!nextReadiness.ready) {
      setShowDetails(true);
      if (direction !== 'transfer' && direction !== 'liability_settlement') {
        setShowClassification(true);
      }
      setSaveError(
        copy.reviewMissing.replace('{count}', String(nextReadiness.findings.length)),
      );
      return;
    }

    const fingerprint = buildTransactionCreateMaterialFingerprint(payload);
    setSubmitting(true);
    setSaving(true);

    try {
      if (
        pendingSubmitRef.current &&
        pendingSubmitRef.current.fingerprint === fingerprint &&
        pendingSubmitRef.current.version === expectedVersion
      ) {
        await submitSavedVersion(
          pendingSubmitRef.current.version,
          pendingSubmitRef.current.fingerprint,
        );
        return;
      }

      const saved = await saveDraftCore(payload);
      if (!saved) return;
      await submitSavedVersion(saved.version, saved.fingerprint);
    } finally {
      setSubmitting(false);
      setSaving(false);
    }
  };

  const handleBeforeSwitch = () => {
    if (!isDirty) return true;
    return window.confirm(copy.unsavedConfirm);
  };

  const handleBack = () => {
    if (!handleBeforeSwitch()) return;
    navigate(
      APP_ROUTES.transactionDetail.replace(':transactionId', transactionId || ''),
    );
  };

  const updateAllocation = (
    index: number,
    field: keyof AllocationDraft,
    value: string,
  ) => {
    setAllocations((current) =>
      current.map((allocation, currentIndex) =>
        currentIndex === index ? { ...allocation, [field]: value } : allocation,
      ),
    );
    setNotice(null);
  };

  const addAllocation = () => {
    setAllocations((current) => [
      ...current,
      {
        id: makeToken('alloc'),
        categoryId: '',
        fundId: '',
        costCenterId: '',
        amountRaw: '0',
      },
    ]);
    setNotice(null);
  };

  const removeAllocation = (index: number) => {
    setAllocations((current) =>
      current.length <= 1
        ? current
        : current.filter((_, currentIndex) => currentIndex !== index),
    );
    setNotice(null);
  };

  const onAccountRepaired = (repairedAccount: any) => {
    setAccounts((current) =>
      current.map((account) =>
        account.id === repairedAccount.id
          ? { ...account, ...repairedAccount }
          : account,
      ),
    );
    setSaveError(null);
  };

  if (loadState === 'loading') {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={editCopy.pageTitle} />
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label={editCopy.loading}>
          <Surface variant="elevated" radius="xl" className="animate-pulse p-6">
            <div className="h-6 w-40 rounded bg-surface-secondary" />
            <div className="mt-6 h-16 rounded-2xl bg-surface-secondary" />
            <div className="mt-4 h-32 rounded-2xl bg-surface-secondary" />
            <div className="mt-4 h-56 rounded-2xl bg-surface-secondary" />
          </Surface>
        </div>
      </div>
    );
  }

  if (loadState === 'immutable') {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={editCopy.pageTitle} />
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <Surface variant="elevated" radius="xl" className="w-full max-w-md p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-text-primary">{editCopy.immutableTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{editCopy.immutableBody}</p>
            <Button className="mt-6" fullWidth onClick={() => navigate(APP_ROUTES.transactionDetail.replace(':transactionId', transactionId || ''))}>
              {editCopy.viewDetail}
            </Button>
          </Surface>
        </div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={editCopy.pageTitle} />
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <Surface variant="elevated" radius="xl" role="alert" className="w-full max-w-md p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-text-primary">{editCopy.loadErrorTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{editCopy.loadErrorBody}</p>
            <Button className="mt-6" fullWidth onClick={() => void loadDataAndCatalogs(undefined, epochRef.current)}>
              {editCopy.retry}
            </Button>
            {supportCode ? (
              <p className="mt-5 break-all font-mono text-xs text-text-muted">
                {editCopy.supportCode}: {supportCode}
              </p>
            ) : null}
          </Surface>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-28 md:pb-8">
      <FinanceEntityContextBar
        areaName={editCopy.pageTitle}
        onBeforeSwitch={handleBeforeSwitch}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <header className="flex items-start gap-3">
            <Button
              variant="ghost"
              className="!min-h-12 !w-12 !px-0"
              aria-label={editCopy.back}
              onClick={handleBack}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0 pt-1">
              <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{editCopy.pageTitle}</h1>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">{editCopy.pageSubtitle}</p>
            </div>
          </header>

          {conflict ? (
            <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-warning/20 bg-semantic-warning/10 p-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-text-primary">{editCopy.conflictTitle}</p>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">{editCopy.conflictBody}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" fullWidth onClick={() => void loadDataAndCatalogs(undefined, ++epochRef.current)}>
                  {editCopy.reloadLatest}
                </Button>
                <Button variant="ghost" fullWidth onClick={handleBack}>
                  {editCopy.discardChanges}
                </Button>
              </div>
            </Surface>
          ) : null}

          {saveError && !conflict ? (
            <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-danger/20 bg-semantic-danger/10 p-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-text-primary">{saveError}</p>
              </div>
              {supportCode ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-8 text-xs text-text-muted">
                  <span className="font-mono">{editCopy.supportCode}: {supportCode}</span>
                  <button
                    type="button"
                    className="font-semibold text-accent-primary"
                    onClick={() => void navigator.clipboard?.writeText(supportCode)}
                  >
                    {editCopy.copyCode}
                  </button>
                </div>
              ) : null}
            </Surface>
          ) : null}

          {notice ? (
            <Surface variant="secondary" radius="lg" role="status" className="border-semantic-success/20 bg-semantic-success/10 p-4">
              <div className="flex gap-3 text-sm text-text-primary">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-semantic-success" aria-hidden="true" />
                <p>
                  {notice === 'saved'
                    ? editCopy.saved
                    : notice === 'no_changes'
                      ? editCopy.noChanges
                      : editCopy.reviewSuccess}
                </p>
              </div>
            </Surface>
          ) : null}

          <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.whatHappened}</h2>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['income', 'expense', 'transfer', 'liability_settlement'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={direction === value}
                  onClick={() => {
                    setDirection(value);
                    setPaymentWarning(null);
                    setNotice(null);
                  }}
                  className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
                    direction === value
                      ? 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary'
                      : 'border-border-subtle bg-surface-secondary/40 text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                  }`}
                >
                  {copy.directions[value]}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end">
              <label className="block">
                <span className="text-sm font-medium text-text-primary">{copy.amount}</span>
                <div className="mt-2 flex min-h-16 items-center rounded-2xl border border-border-subtle bg-surface-base px-4 focus-within:border-accent-primary">
                  <span className="mr-2 text-lg font-semibold text-text-muted">R$</span>
                  <input
                    inputMode="numeric"
                    value={formatTransactionInputAmount(amountRaw, language)}
                    onChange={(event) => {
                      const next = event.target.value.replace(/\D/g, '');
                      setAmountRaw(String(Number.parseInt(next || '0', 10) || 0));
                      setNotice(null);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight text-text-primary outline-none tabular-nums sm:text-4xl"
                    aria-label={copy.amount}
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-text-primary">{copy.date}</span>
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(event) => {
                    setOccurredAt(event.target.value);
                    setNotice(null);
                  }}
                  className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary"
                />
              </label>
            </div>
          </Surface>

          <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.howQuestion[direction]}</h2>
            <div className="mt-4 grid gap-4">
              {direction !== 'transfer' ? (
                <label className="block">
                  <span className="text-sm font-medium text-text-primary">
                    {direction === 'income' ? copy.paymentMethodIncome : copy.paymentMethodExpense}
                  </span>
                  <FinanceSelect
                    value={paymentMethod}
                    onChange={(value) => {
                      setPaymentMethod(value);
                      setPaymentWarning(null);
                      setNotice(null);
                    }}
                    options={availablePaymentMethods.map((method) => ({
                      value: method.code,
                      label: paymentLabels[method.code] || method.label,
                    }))}
                    placeholder={copy.select}
                    allowClear
                    className="mt-2 h-14 rounded-xl border border-border-subtle bg-surface-base text-base"
                  />
                  {paymentWarning ? (
                    <p className="mt-2 text-xs leading-relaxed text-semantic-warning">{paymentWarning}</p>
                  ) : null}
                </label>
              ) : null}

              {direction === 'liability_settlement' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-text-primary">{copy.settlementType}</span>
                    <FinanceSelect
                      value={settlementType}
                      onChange={(value) => {
                        setSettlementType(value as typeof settlementType);
                        setNotice(null);
                      }}
                      options={[
                        { value: 'credit_card_bill', label: copy.settlementCreditCard },
                        { value: 'reimbursement', label: copy.settlementReimbursement },
                      ]}
                      placeholder={copy.select}
                      className="mt-2 h-14 rounded-xl border border-border-subtle bg-surface-base text-base"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-text-primary">{copy.liabilityAccount}</span>
                    <FinanceSelect
                      value={liabilityAccountId}
                      onChange={(value) => {
                        setLiabilityAccountId(value);
                        setNotice(null);
                      }}
                      options={accounts
                        .filter((account) => account.nature === 'liability' || account.id === liabilityAccountId)
                        .map((account) => ({ value: account.id, label: accountLabel(account) }))}
                      placeholder={copy.selectLiability}
                      className="mt-2 h-14 rounded-xl border border-border-subtle bg-surface-base text-base"
                    />
                    {selectedLiability ? (
                      <AccountRepairCard
                        account={selectedLiability}
                        financeEntityId={activeFinanceEntityId || ''}
                        onRepaired={onAccountRepaired}
                      />
                    ) : null}
                  </label>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-text-primary">
                    {direction === 'transfer'
                      ? copy.sourceAccount
                      : direction === 'liability_settlement'
                        ? copy.payingAccount
                        : copy.account}
                  </span>
                  <FinanceSelect
                    value={accountId}
                    onChange={(value) => {
                      setAccountId(value);
                      setNotice(null);
                    }}
                    options={availableAccounts.map((account) => ({
                      value: account.id,
                      label: accountLabel(account),
                    }))}
                    placeholder={copy.selectAccount}
                    className="mt-2 h-14 rounded-xl border border-border-subtle bg-surface-base text-base"
                  />
                  {selectedAccount ? (
                    <AccountRepairCard
                      account={selectedAccount}
                      financeEntityId={activeFinanceEntityId || ''}
                      onRepaired={onAccountRepaired}
                    />
                  ) : null}
                </label>

                {direction === 'transfer' ? (
                  <label className="block">
                    <span className="text-sm font-medium text-text-primary">{copy.destinationAccount}</span>
                    <FinanceSelect
                      value={destinationAccountId}
                      onChange={(value) => {
                        setDestinationAccountId(value);
                        setNotice(null);
                      }}
                      options={accounts
                        .filter((account) => account.id !== accountId)
                        .map((account) => ({ value: account.id, label: accountLabel(account) }))}
                      placeholder={copy.selectDestination}
                      className="mt-2 h-14 rounded-xl border border-border-subtle bg-surface-base text-base"
                    />
                    {selectedDestination ? (
                      <AccountRepairCard
                        account={selectedDestination}
                        financeEntityId={activeFinanceEntityId || ''}
                        onRepaired={onAccountRepaired}
                      />
                    ) : null}
                  </label>
                ) : null}
              </div>

              <label className="block">
                <span className="text-sm font-medium text-text-primary">{copy.description}</span>
                <input
                  type="text"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setNotice(null);
                  }}
                  maxLength={300}
                  placeholder={copy.descriptionPlaceholder[direction]}
                  className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                />
              </label>
            </div>
          </Surface>

          <Surface variant="elevated" radius="xl" className="overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetails((current) => !current)}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6"
              aria-expanded={showDetails}
            >
              <div>
                <p className="font-semibold text-text-primary">
                  {showDetails ? copy.hideDetails : copy.showDetails}
                </p>
                <p className="mt-1 text-sm text-text-muted">{copy.detailsHint}</p>
              </div>
              {showDetails ? (
                <ChevronUp className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
              )}
            </button>

            {showDetails ? (
              <div className="grid gap-5 border-t border-border-subtle p-5 sm:p-6">
                <label className="block">
                  <span className="text-sm font-medium text-text-primary">{copy.counterparty[direction]}</span>
                  <input
                    type="text"
                    value={counterparty}
                    onChange={(event) => {
                      setCounterparty(event.target.value);
                      setNotice(null);
                    }}
                    maxLength={100}
                    placeholder={copy.counterpartyPlaceholder}
                    className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                  />
                </label>

                <div>
                  <p className="text-sm font-medium text-text-primary">{copy.evidence}</p>
                  <div className="mt-2">
                    <TransactionEvidenceUpload
                      organizationId={accessState.organizationId || ''}
                      financeEntityId={activeFinanceEntityId || ''}
                      evidenceIds={evidenceIds}
                      onChange={(ids) => {
                        setEvidenceIds(ids);
                        setNotice(null);
                      }}
                    />
                  </div>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-text-primary">{copy.evidenceJustification}</span>
                  <textarea
                    value={evidenceJustification}
                    onChange={(event) => {
                      setEvidenceJustification(event.target.value);
                      setNotice(null);
                    }}
                    maxLength={300}
                    placeholder={copy.evidenceJustificationPlaceholder}
                    className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border-subtle bg-surface-base px-4 py-3 text-base text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                  />
                </label>
              </div>
            ) : null}
          </Surface>

          {direction !== 'transfer' && direction !== 'liability_settlement' ? (
            <Surface variant="elevated" radius="xl" className="overflow-hidden">
              <button
                type="button"
                onClick={() => setShowClassification((current) => !current)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6"
                aria-expanded={showClassification}
              >
                <div>
                  <p className="font-semibold text-text-primary">{copy.classificationTitle}</p>
                  <p className="mt-1 text-sm text-text-muted">{copy.classificationHint}</p>
                </div>
                {showClassification ? (
                  <ChevronUp className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
                )}
              </button>

              {showClassification ? (
                <div className="border-t border-border-subtle p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsSplit((current) => !current);
                        setNotice(null);
                      }}
                      disabled={totalCents <= 0}
                    >
                      <Split className="h-4 w-4" aria-hidden="true" />
                      {isSplit ? copy.unsplit : copy.split}
                    </Button>
                    {isSplit && allocationDifference !== 0 ? (
                      <p className="text-sm font-semibold text-semantic-warning tabular-nums">
                        {allocationDifference > 0 ? copy.remaining : copy.exceeded}:{' '}
                        R$ {formatTransactionInputAmount(Math.abs(allocationDifference), language)}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    {allocations.map((allocation, index) => (
                      <Surface key={allocation.id} variant="secondary" radius="lg" className="p-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {isSplit ? (
                            <label className="block sm:col-span-2">
                              <span className="text-sm font-medium text-text-primary">{copy.allocationAmount}</span>
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex min-h-14 flex-1 items-center rounded-xl border border-border-subtle bg-surface-base px-4">
                                  <span className="mr-2 text-sm font-semibold text-text-muted">R$</span>
                                  <input
                                    inputMode="numeric"
                                    value={formatTransactionInputAmount(allocation.amountRaw, language)}
                                    onChange={(event) =>
                                      updateAllocation(
                                        index,
                                        'amountRaw',
                                        String(Number.parseInt(event.target.value.replace(/\D/g, '') || '0', 10) || 0),
                                      )
                                    }
                                    className="min-w-0 flex-1 bg-transparent text-xl font-semibold tabular-nums text-text-primary outline-none"
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  className="!min-h-14 !w-14 !px-0"
                                  aria-label={copy.removeAllocation}
                                  onClick={() => removeAllocation(index)}
                                  disabled={allocations.length <= 1}
                                >
                                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                                </Button>
                              </div>
                            </label>
                          ) : null}

                          <label className="block">
                            <span className="text-sm font-medium text-text-primary">{copy.category}</span>
                            <FinanceSelect
                              value={allocation.categoryId}
                              onChange={(value) => updateAllocation(index, 'categoryId', value)}
                              options={compatibleCategories.map((category) => ({
                                value: category.id,
                                label: category.name,
                              }))}
                              placeholder={copy.selectCategory}
                              className="mt-2 h-14 rounded-xl border border-border-subtle bg-surface-base text-base"
                            />
                          </label>

                          <label className="block">
                            <span className="text-sm font-medium text-text-primary">{copy.fund}</span>
                            <FinanceSelect
                              value={allocation.fundId}
                              onChange={(value) => updateAllocation(index, 'fundId', value)}
                              options={funds.map((fund) => ({ value: fund.id, label: fund.name }))}
                              placeholder={copy.noFund}
                              allowClear
                              className="mt-2 h-14 rounded-xl border border-border-subtle bg-surface-base text-base"
                            />
                          </label>

                          <label className="block sm:col-span-2">
                            <span className="text-sm font-medium text-text-primary">{copy.costCenter}</span>
                            <input
                              type="text"
                              value={allocation.costCenterId}
                              onChange={(event) => updateAllocation(index, 'costCenterId', event.target.value)}
                              placeholder={copy.costCenterPlaceholder}
                              className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-sm text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                            />
                          </label>
                        </div>
                      </Surface>
                    ))}
                  </div>

                  {isSplit ? (
                    <Button variant="secondary" className="mt-3" fullWidth onClick={addAllocation}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {copy.addAllocation}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Surface>
          ) : null}

          <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              {!readiness.ready ? (
                <div className="rounded-2xl border border-semantic-warning/20 bg-semantic-warning/10 p-4">
                  <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {copy.reviewMissing.replace('{count}', String(readiness.findings.length))}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.reviewMissingHint}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={saving || submitting || conflict}
                  onClick={() => void handleSaveDraft()}
                >
                  {saving && !submitting ? copy.saving : copy.saveDraft}
                </Button>

                {hasEffectiveCapability(accessState, 'finance.submit_for_review') ? (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={saving || submitting || conflict || !readiness.ready}
                    onClick={() => void handleSaveAndSubmit()}
                  >
                    {submitting ? copy.sending : copy.sendForReview}
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-2 text-xs leading-relaxed text-text-muted sm:grid-cols-2">
                <p>{editCopy.draftSavedNoBalance}</p>
                <p>{editCopy.reviewSentNoBalance}</p>
              </div>

              {activeFinanceEntityName ? (
                <p className="border-t border-border-subtle pt-3 text-xs text-text-muted">
                  {copy.summaryChurch}: <span className="font-medium text-text-secondary">{activeFinanceEntityName}</span>
                </p>
              ) : null}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
