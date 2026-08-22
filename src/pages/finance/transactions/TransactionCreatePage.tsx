import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Plus, ShieldX, Split, Trash2 } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import AccountRepairCard from '@/src/components/finance/AccountRepairCard';
import ContextHelp from '@/src/components/finance/ContextHelp';
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
import { PAYMENT_METHODS as ALL_PAYMENT_METHODS } from '@/shared/finance/paymentMethods';
import {
  getCompatibleAccounts,
  getCompatiblePaymentInstruments,
  validateSubmissionReadiness,
} from '@/shared/finance/smartLogic';
import {
  PAYMENT_METHOD_LABELS,
  TRANSACTION_CREATE_COPY,
} from './transactionCreateCopy';
import {
  buildTransactionCreateMaterialFingerprint,
  formatTransactionCurrency,
  formatTransactionInputAmount,
  normalizeTransactionCreateDirection,
  type TransactionCreateDirection,
} from './transactionCreateModel';

type AllocationState = {
  id: string;
  categoryId: string;
  fundId: string;
  costCenterId: string;
  amountRaw: string | null;
};

const INITIAL_ALLOCATION: AllocationState = {
  id: 'initial',
  categoryId: '',
  fundId: '',
  costCenterId: '',
  amountRaw: null,
};

export default function TransactionCreatePage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = TRANSACTION_CREATE_COPY[language];

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
      <TransactionCreateContent />
    </FinanceContextGuard>
  );
}

function TransactionCreateContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessState } = useAuth();
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { createDraft, createAndSubmit } = useTransactions();
  const { language } = useLanguage();
  const copy = TRANSACTION_CREATE_COPY[language];

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);

  const initialDirection = normalizeTransactionCreateDirection(
    searchParams.get('direction'),
  );
  const [direction, setDirection] =
    useState<TransactionCreateDirection>(initialDirection);
  const [settlementType, setSettlementType] = useState<
    'credit_card_bill' | 'reimbursement' | ''
  >('');
  const [liabilityAccountId, setLiabilityAccountId] = useState('');
  const [amountRaw, setAmountRaw] = useState('0');
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().split('T')[0],
  );
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
  const [allocations, setAllocations] = useState<AllocationState[]>([
    INITIAL_ALLOCATION,
  ]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastReqId, setLastReqId] = useState<string | null>(null);
  const [repairedAccountIds, setRepairedAccountIds] = useState<string[]>([]);
  const [paymentMethodWarning, setPaymentMethodWarning] = useState<string | null>(
    null,
  );

  const epochRef = useRef(0);
  const idempotencyKeyRef = useRef<string | null>(null);
  const lastMaterialPayloadRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef<'draft' | 'submit' | null>(null);

  const isAccountIncomplete = (account: any) => {
    if (account.active === false) return true;
    if (
      account.configurationStatus &&
      account.configurationStatus !== 'complete'
    ) {
      return true;
    }
    return !account.type || !account.nature;
  };

  const getAccountLabel = (account: any) =>
    isAccountIncomplete(account)
      ? `${account.name} (${copy.accountPending})`
      : account.name;

  const parseAmountToCents = (value: string | null) => {
    if (!value) return 0;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const totalCents = parseAmountToCents(amountRaw);

  const loadCatalogs = async (signal?: AbortSignal, currentEpoch?: number) => {
    setLoadingInitial(true);
    setInitialError(false);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('UNAUTHENTICATED');
      const token = await user.getIdToken();

      const [accountsRes, fundsRes, categoriesRes] = await Promise.all([
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

      if (signal?.aborted || currentEpoch !== epochRef.current) return;
      if (!accountsRes.ok || !fundsRes.ok || !categoriesRes.ok) {
        throw new Error('CATALOG_LOAD_FAILED');
      }

      const accsData = await accountsRes.json().catch(() => ({}));
      const fundsData = await fundsRes.json().catch(() => ({}));
      const catsData = await categoriesRes.json().catch(() => ({}));

      const activeAccounts = (accsData.accounts || []).filter(
        (account: any) => account.active,
      );
      const activeFunds = (fundsData.funds || []).filter(
        (fund: any) => fund.active,
      );
      const activeCategories = (catsData.categories || []).filter(
        (category: any) => category.active,
      );

      setAccounts(activeAccounts);
      setFunds(activeFunds);
      setCategories(activeCategories);

      if (activeAccounts.length > 0) {
        setAccountId((current) => current || activeAccounts[0].id);
      }
    } catch {
      if (signal?.aborted || currentEpoch !== epochRef.current) return;
      setInitialError(true);
    } finally {
      if (!signal?.aborted && currentEpoch === epochRef.current) {
        setLoadingInitial(false);
      }
    }
  };

  useEffect(() => {
    const abortController = new AbortController();
    idempotencyKeyRef.current = null;
    lastMaterialPayloadRef.current = null;
    setSaveError(null);
    setLastReqId(null);

    if (activeFinanceEntityId) {
      void loadCatalogs(abortController.signal, ++epochRef.current);
    }

    return () => abortController.abort();
    // loadCatalogs intentionally follows active entity changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFinanceEntityId]);

  useEffect(() => {
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
  }, [categories, direction]);

  const handleDirectionChange = (nextDirection: TransactionCreateDirection) => {
    setDirection(nextDirection);
    setPaymentMethodWarning(null);
    setSaveError(null);
    setShowClassification(false);
    setShowDetails(false);
    setSettlementType('');
    setLiabilityAccountId('');
    setDestinationAccountId('');
    if (nextDirection === 'transfer') setPaymentMethod('');
  };

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const numericValue = event.target.value.replace(/\D/g, '');
    const parsed = Number.parseInt(numericValue, 10);
    setAmountRaw((Number.isNaN(parsed) ? 0 : parsed).toString());
  };

  const compatibleCategories = useMemo(
    () => categories.filter((category) => category.kind === direction),
    [categories, direction],
  );

  const validPaymentMethodCodes = getCompatiblePaymentInstruments(
    undefined,
    direction,
  );

  const availablePaymentMethods = useMemo(() => {
    if (direction === 'transfer') return [];
    return ALL_PAYMENT_METHODS.filter((method) =>
      validPaymentMethodCodes.includes(method.code),
    );
  }, [direction, validPaymentMethodCodes]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accounts, accountId],
  );
  const selectedDestinationAccount = useMemo(
    () => accounts.find((account) => account.id === destinationAccountId),
    [accounts, destinationAccountId],
  );

  useEffect(() => {
    if (!paymentMethod || direction === 'transfer') return;
    if (!availablePaymentMethods.some((method) => method.code === paymentMethod)) {
      setPaymentMethod('');
      setPaymentMethodWarning(copy.paymentRemoved);
    }
  }, [availablePaymentMethods, copy.paymentRemoved, direction, paymentMethod]);

  useEffect(() => {
    if (!selectedAccount || !paymentMethod) return;
    const supported = selectedAccount.supportedPaymentInstruments || [];
    if (supported.length > 0 && !supported.includes(paymentMethod)) {
      setPaymentMethod('');
      setPaymentMethodWarning(copy.paymentUnsupported(selectedAccount.name));
    }
  }, [copy, paymentMethod, selectedAccount]);

  const availableAccounts = useMemo(
    () => getCompatibleAccounts(paymentMethod, direction, accounts),
    [accounts, direction, paymentMethod],
  );

  useEffect(() => {
    if (accountId && !availableAccounts.some((account) => account.id === accountId)) {
      setAccountId('');
    } else if (availableAccounts.length === 1 && !accountId) {
      setAccountId(availableAccounts[0].id);
    }
  }, [accountId, availableAccounts]);

  const allocatedCents = isSplit
    ? allocations.reduce(
        (sum, allocation) =>
          sum + parseAmountToCents(allocation.amountRaw || '0'),
        0,
      )
    : totalCents;
  const targetDiff = totalCents - allocatedCents;

  const buildPayloadOrError = (skipErrors = false) => {
    const fail = (message: string) => {
      if (!skipErrors) setSaveError(message);
      return null;
    };

    if (!accountId && !skipErrors) return fail(copy.errorSelectAccount);

    const originAccount = accounts.find((account) => account.id === accountId);
    if (originAccount && isAccountIncomplete(originAccount) && !skipErrors) {
      return fail(copy.errorIncompleteAccount);
    }

    if (direction === 'transfer') {
      if (!destinationAccountId && !skipErrors) {
        return fail(copy.errorSelectDestination);
      }
      if (accountId && accountId === destinationAccountId && !skipErrors) {
        return fail(copy.errorSameAccounts);
      }
      const destinationAccount = accounts.find(
        (account) => account.id === destinationAccountId,
      );
      if (
        destinationAccount &&
        isAccountIncomplete(destinationAccount) &&
        !skipErrors
      ) {
        return fail(copy.errorIncompleteDestination);
      }
    }

    if (direction === 'liability_settlement') {
      if (!settlementType && !skipErrors) return fail(copy.errorSettlementType);
      if (!liabilityAccountId && !skipErrors) {
        return fail(copy.errorLiabilityAccount);
      }
      const liabilityAccount = accounts.find(
        (account) => account.id === liabilityAccountId,
      );
      if (
        liabilityAccount &&
        isAccountIncomplete(liabilityAccount) &&
        !skipErrors
      ) {
        return fail(copy.errorIncompleteLiability);
      }
    }

    if (totalCents <= 0 && !skipErrors) return fail(copy.errorPositiveAmount);

    const finalAllocations: Array<{
      categoryId: string;
      fundId?: string;
      costCenterId?: string;
      amountCents: number;
    }> = [];

    if (direction !== 'transfer' && direction !== 'liability_settlement') {
      if (isSplit) {
        for (const allocation of allocations) {
          if (!allocation.categoryId && !skipErrors) {
            return fail(copy.errorAllocationCategory);
          }
          const allocationAmount = parseAmountToCents(
            allocation.amountRaw || '0',
          );
          if (allocationAmount <= 0 && !skipErrors) {
            return fail(copy.errorAllocationAmount);
          }
          finalAllocations.push({
            categoryId: allocation.categoryId,
            fundId: allocation.fundId || undefined,
            costCenterId: allocation.costCenterId || undefined,
            amountCents: allocationAmount,
          });
        }
      } else if (allocations[0].categoryId || skipErrors) {
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
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
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

  const txForValidation = useMemo(() => {
    const payload = buildPayloadOrError(true) || {};
    return {
      ...payload,
      sourceAccountId: accountId,
    };
    // buildPayloadOrError only reads the listed form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accountId,
    allocations,
    amountRaw,
    counterparty,
    description,
    destinationAccountId,
    direction,
    evidenceIds,
    evidenceJustification,
    isSplit,
    liabilityAccountId,
    occurredAt,
    paymentMethod,
    settlementType,
    totalCents,
  ]);

  const readiness = useMemo(
    () => validateSubmissionReadiness(txForValidation),
    [txForValidation],
  );

  const basicFlowReady =
    totalCents > 0 &&
    Boolean(occurredAt) &&
    Boolean(accountId) &&
    (direction === 'transfer' ? Boolean(destinationAccountId) : Boolean(paymentMethod)) &&
    (direction === 'liability_settlement'
      ? Boolean(settlementType && liabilityAccountId)
      : true);

  useEffect(() => {
    if (
      basicFlowReady &&
      (direction === 'income' || direction === 'expense')
    ) {
      setShowClassification(true);
    }
  }, [basicFlowReady, direction]);

  const detailsRequired = readiness.requirements.some(
    (requirement) =>
      (requirement.field === 'counterparty' || requirement.field === 'evidence') &&
      requirement.requirement === 'required',
  );

  useEffect(() => {
    if (basicFlowReady && description.trim() && detailsRequired) {
      setShowDetails(true);
    }
  }, [basicFlowReady, description, detailsRequired]);

  const requirementBadge = (field: string) => {
    const requirement = readiness.requirements.find((item) => item.field === field);
    if (!requirement) return null;
    if (requirement.requirement === 'required') {
      return (
        <span className="ml-1 text-xs font-medium text-semantic-warning">
          ({copy.required})
        </span>
      );
    }
    if (requirement.requirement === 'optional') {
      return (
        <span className="ml-1 text-xs font-normal text-text-muted">
          ({copy.optional})
        </span>
      );
    }
    return null;
  };

  const evidenceRequirementBadge = () => {
    const requirement = readiness.requirements.find(
      (item) => item.field === 'evidence',
    );
    return (
      <span
        className={`ml-1 text-xs ${
          requirement?.requirement === 'required'
            ? 'font-medium text-semantic-warning'
            : 'font-normal text-text-muted'
        }`}
      >
        ({
          requirement?.requirement === 'required'
            ? copy.requiredOrJustify
            : copy.optional
        })
      </span>
    );
  };

  const getOrUpdateIdempotencyKey = (
    operation: 'draft' | 'submit',
    materialPayloadString: string,
  ) => {
    if (
      materialPayloadString !== lastMaterialPayloadRef.current ||
      !idempotencyKeyRef.current
    ) {
      idempotencyKeyRef.current = `idkl_${operation}_${Math.random()
        .toString(36)
        .substring(2, 10)}${Date.now().toString(36)}`;
      lastMaterialPayloadRef.current = materialPayloadString;
    }
    return idempotencyKeyRef.current;
  };

  const handleErrorContext = (error: any) => {
    const raw = String(error?.message || '');
    let message = copy.errorSave;

    if (raw.includes('FINANCE_ALLOCATION_TOTAL_MISMATCH')) {
      message = copy.errorAllocationMismatch;
    } else if (raw.includes('FINANCE_ACCOUNT_MISMATCH')) {
      message = copy.errorAccountMismatch;
    } else if (raw.includes('FINANCE_CATEGORY_MISMATCH')) {
      message = copy.errorCategoryMismatch;
    } else if (raw.includes('FINANCE_FUND_MISMATCH')) {
      message = copy.errorFundMismatch;
    } else if (raw.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      message = copy.errorIdempotency;
    } else if (raw.includes('FINANCE_PAYMENT_METHOD_MISMATCH')) {
      message = copy.errorPaymentMismatch;
    } else if (raw.includes('permission') || raw.includes('FORBIDDEN')) {
      message = copy.errorForbidden;
    } else if (
      raw.includes('ROUTE_NOT_FOUND') ||
      raw.includes('Unexpected token') ||
      raw.includes('Failed to create transaction') ||
      raw.includes('Failed to create and submit')
    ) {
      message = copy.errorServiceUnavailable;
    } else if (
      raw.includes('Failed to fetch') ||
      raw.toLowerCase().includes('network') ||
      raw.toLowerCase().includes('timeout') ||
      error?.name === 'TypeError'
    ) {
      message = copy.errorUncertain;
    }

    const hasRepairedAccount =
      repairedAccountIds.includes(accountId) ||
      (direction === 'transfer' &&
        repairedAccountIds.includes(destinationAccountId)) ||
      (direction === 'liability_settlement' &&
        repairedAccountIds.includes(liabilityAccountId));

    if (hasRepairedAccount) message = copy.accountRepaired;

    setSaveError(message);
    setSaving(false);
  };

  const attemptAutoRepairAndSubmit = async (
    mode: 'draft' | 'submit',
  ): Promise<boolean> => {
    const accountsToRepair: any[] = [];
    const mainAccount = accounts.find((account) => account.id === accountId);

    if (
      mainAccount &&
      isAccountIncomplete(mainAccount) &&
      mainAccount.templateKey
    ) {
      accountsToRepair.push(mainAccount);
    }

    if (direction === 'transfer' && destinationAccountId) {
      const destinationAccount = accounts.find(
        (account) => account.id === destinationAccountId,
      );
      if (
        destinationAccount &&
        isAccountIncomplete(destinationAccount) &&
        destinationAccount.templateKey
      ) {
        accountsToRepair.push(destinationAccount);
      }
    }

    if (direction === 'liability_settlement' && liabilityAccountId) {
      const liabilityAccount = accounts.find(
        (account) => account.id === liabilityAccountId,
      );
      if (
        liabilityAccount &&
        isAccountIncomplete(liabilityAccount) &&
        liabilityAccount.templateKey
      ) {
        accountsToRepair.push(liabilityAccount);
      }
    }

    if (accountsToRepair.length > 0) {
      setSaving(true);
      setSaveError(null);

      try {
        const user = firebaseAuth.currentUser;
        if (!user) throw new Error('UNAUTHENTICATED');
        const token = await user.getIdToken();
        const repairedResults: any[] = [];

        for (const accountToRepair of accountsToRepair) {
          const requestId = `req_rep_${Math.random()
            .toString(36)
            .substring(2, 10)}${Date.now().toString(36)}`;
          const idempotencyKey = `idk_rep_${Math.random()
            .toString(36)
            .substring(2, 10)}${Date.now().toString(36)}`;

          const response = await fetch(
            '/api/finance-gateway?operation=accounts-repair-canonical',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                accountId: accountToRepair.id,
                requestId,
                idempotencyKey,
              }),
            },
          );

          if (!response.ok) throw new Error('ACCOUNT_REPAIR_FAILED');
          const data = await response.json().catch(() => ({}));
          const repairedAccount = data.results?.[0]?.account;
          if (repairedAccount) {
            repairedResults.push({
              id: accountToRepair.id,
              repairedAccount,
            });
          }
        }

        setAccounts((current) => {
          let updated = [...current];
          repairedResults.forEach((result) => {
            updated = updated.map((account) =>
              account.id === result.id
                ? { ...account, ...result.repairedAccount }
                : account,
            );
          });
          return updated;
        });
        setRepairedAccountIds((current) => [
          ...current,
          ...repairedResults.map((result) => result.id),
        ]);

        setTimeout(() => {
          if (mode === 'draft') {
            void handleSaveDraftWithRetryFlag(true);
          } else {
            void handleCreateAndSubmitWithRetryFlag(true);
          }
        }, 50);
        return true;
      } catch {
        setSaveError(copy.repairFailed);
        setSaving(false);
        return true;
      }
    }

    const selectedAccounts = [
      mainAccount,
      direction === 'transfer'
        ? accounts.find((account) => account.id === destinationAccountId)
        : null,
      direction === 'liability_settlement'
        ? accounts.find((account) => account.id === liabilityAccountId)
        : null,
    ].filter(Boolean);

    if (
      selectedAccounts.some(
        (account: any) =>
          isAccountIncomplete(account) && !account.templateKey,
      )
    ) {
      pendingSubmitRef.current = mode;
      setSaveError(copy.customAccountNeedsSetup);
      return true;
    }

    return false;
  };

  const handleSaveDraft = () => void handleSaveDraftWithRetryFlag(false);

  const handleSaveDraftWithRetryFlag = async (isRetry: boolean) => {
    if (saving && !isRetry) return;
    setSaveError(null);

    if (!isRetry && (await attemptAutoRepairAndSubmit('draft'))) return;

    const payload = buildPayloadOrError();
    if (!payload) return;

    const materialPayloadString = buildTransactionCreateMaterialFingerprint(
      payload,
    );
    const idempotencyKey = getOrUpdateIdempotencyKey(
      'draft',
      materialPayloadString,
    );

    setSaving(true);
    const currentEpochOnSave = epochRef.current;

    try {
      const requestId = `req_${Math.random()
        .toString(36)
        .substring(2, 10)}${Date.now().toString(36)}`;
      setLastReqId(requestId);
      const response = await createDraft(payload, idempotencyKey, requestId);

      if (epochRef.current !== currentEpochOnSave) return;
      idempotencyKeyRef.current = null;
      lastMaterialPayloadRef.current = null;
      setLastReqId(null);
      pendingSubmitRef.current = null;

      navigate(
        APP_ROUTES.transactionDetail.replace(
          ':transactionId',
          response.transactionId,
        ),
        { replace: true },
      );
    } catch (error: any) {
      if (epochRef.current !== currentEpochOnSave) return;
      handleErrorContext(error);
    }
  };

  const handleCreateAndSubmit = () =>
    void handleCreateAndSubmitWithRetryFlag(false);

  const handleCreateAndSubmitWithRetryFlag = async (isRetry: boolean) => {
    if (saving && !isRetry) return;
    setSaveError(null);

    if (!isRetry && (await attemptAutoRepairAndSubmit('submit'))) return;

    const payload = buildPayloadOrError();
    if (!payload) return;

    if (direction !== 'transfer') {
      if (!paymentMethod) {
        setSaveError(copy.errorPaymentAndCategory);
        return;
      }
      if (
        direction !== 'liability_settlement' &&
        payload.allocations.length === 0
      ) {
        setSaveError(copy.errorCategory);
        setShowClassification(true);
        return;
      }
      if (direction !== 'liability_settlement') {
        const calculatedAllocated = payload.allocations.reduce(
          (sum: number, allocation: any) => sum + allocation.amountCents,
          0,
        );
        if (totalCents !== calculatedAllocated) {
          setSaveError(copy.errorAllocationTotal);
          setShowClassification(true);
          return;
        }
      }
    }

    if (!readiness.ready) {
      revealMissingFields();
      return;
    }

    const materialPayloadString = buildTransactionCreateMaterialFingerprint(
      payload,
    );
    const idempotencyKey = getOrUpdateIdempotencyKey(
      'submit',
      materialPayloadString,
    );

    setSaving(true);
    const currentEpochOnSave = epochRef.current;

    try {
      const requestId = `req_${Math.random()
        .toString(36)
        .substring(2, 10)}${Date.now().toString(36)}`;
      setLastReqId(requestId);
      const response = await createAndSubmit(
        payload,
        idempotencyKey,
        requestId,
      );

      if (epochRef.current !== currentEpochOnSave) return;
      idempotencyKeyRef.current = null;
      lastMaterialPayloadRef.current = null;
      setLastReqId(null);
      pendingSubmitRef.current = null;

      navigate(
        APP_ROUTES.transactionDetail.replace(
          ':transactionId',
          response.transactionId,
        ),
        { replace: true },
      );
    } catch (error: any) {
      if (epochRef.current !== currentEpochOnSave) return;
      handleErrorContext(error);
    }
  };

  const addAllocation = () => {
    setAllocations((current) => [
      ...current,
      {
        id: `alloc_${Date.now()}`,
        categoryId: '',
        fundId: '',
        costCenterId: '',
        amountRaw: '0',
      },
    ]);
  };

  const removeAllocation = (index: number) => {
    setAllocations((current) => {
      if (current.length <= 1) return current;
      const next = [...current];
      next.splice(index, 1);
      return next;
    });
  };

  const updateAllocation = (index: number, field: string, value: string) => {
    setAllocations((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const updateAllocationAmount = (index: number, rawInput: string) => {
    const numericValue = rawInput.replace(/\D/g, '');
    const parsed = Number.parseInt(numericValue, 10);
    updateAllocation(index, 'amountRaw', (Number.isNaN(parsed) ? 0 : parsed).toString());
  };

  const handleBeforeSwitch = () => {
    const hasModifications =
      amountRaw !== '0' ||
      description !== '' ||
      counterparty !== '' ||
      evidenceIds.length > 0;

    if (hasModifications && !window.confirm(copy.unsavedConfirm)) return false;

    idempotencyKeyRef.current = null;
    lastMaterialPayloadRef.current = null;
    setAmountRaw('0');
    setDescription('');
    setCounterparty('');
    setEvidenceIds([]);
    setEvidenceJustification('');
    setIsSplit(false);
    setAllocations([INITIAL_ALLOCATION]);
    return true;
  };

  const revealMissingFields = () => {
    const fields = new Set(
      readiness.findings.map((finding: any) => String(finding.field || '')),
    );
    if (
      fields.has('category') ||
      fields.has('amount') ||
      (direction !== 'transfer' && direction !== 'liability_settlement')
    ) {
      setShowClassification(true);
    }
    if (fields.has('counterparty') || fields.has('evidence')) {
      setShowDetails(true);
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const onAccountRepaired = (repairedAccount: any) => {
    setAccounts((current) =>
      current.map((account) =>
        account.id === repairedAccount.id ? repairedAccount : account,
      ),
    );
    setRepairedAccountIds((current) => [
      ...new Set([...current, repairedAccount.id]),
    ]);

    if (pendingSubmitRef.current === 'draft') {
      pendingSubmitRef.current = null;
      setTimeout(() => void handleSaveDraftWithRetryFlag(true), 50);
    } else if (pendingSubmitRef.current === 'submit') {
      pendingSubmitRef.current = null;
      setTimeout(() => void handleCreateAndSubmitWithRetryFlag(true), 50);
    }
  };

  const paymentOptions = availablePaymentMethods.map((method) => ({
    value: method.code,
    label: PAYMENT_METHOD_LABELS[language][method.code] || method.label,
  }));

  const directionTone: Record<TransactionCreateDirection, string> = {
    income: 'border-semantic-success/25 bg-semantic-success/10 text-semantic-success',
    expense: 'border-semantic-danger/25 bg-semantic-danger/10 text-semantic-danger',
    transfer: 'border-semantic-warning/25 bg-semantic-warning/10 text-semantic-warning',
    liability_settlement:
      'border-accent-primary/25 bg-accent-primary/10 text-accent-primary',
  };

  if (initialError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center border-t border-border-subtle bg-surface-base p-8 text-center">
        <AlertCircle className="mb-4 h-10 w-10 text-semantic-warning" />
        <h1 className="mb-2 text-lg font-semibold text-text-primary">
          {copy.loadErrorTitle}
        </h1>
        <p className="mb-6 max-w-sm text-sm leading-relaxed text-text-muted">
          {copy.loadErrorBody}
        </p>
        <Button onClick={() => void loadCatalogs(undefined, epochRef.current)}>
          {copy.retry}
        </Button>
      </main>
    );
  }

  const summaryDirection = copy.directions[direction];
  const summaryCategory = isSplit
    ? `${allocations.length} ${copy.selectedPlural}`
    : categories.find((category) => category.id === allocations[0]?.categoryId)
        ?.name || copy.pending;
  const selectedPaymentLabel = paymentMethod
    ? PAYMENT_METHOD_LABELS[language][paymentMethod] ||
      ALL_PAYMENT_METHODS.find((method) => method.code === paymentMethod)?.label ||
      copy.pending
    : copy.pending;

  return (
    <div className="-mx-4 -mt-4 flex flex-col font-sans sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
      <FinanceEntityContextBar
        areaName={copy.pageTitle}
        onBeforeSwitch={handleBeforeSwitch}
      />

      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
        <Button
          variant="ghost"
          className="!min-h-12 !w-12 !px-0"
          aria-label={copy.back}
          onClick={() => navigate(APP_ROUTES.transactions)}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            {copy.pageTitle}
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {copy.directions[direction]}
          </p>
        </div>
      </header>

      <div className="px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {loadingInitial ? (
            <div className="flex animate-pulse flex-col gap-5" aria-busy="true">
              <div className="h-28 rounded-3xl bg-surface-secondary" />
              <div className="h-40 rounded-3xl border border-border-subtle bg-surface-elevated" />
              <div className="h-32 rounded-3xl border border-border-subtle bg-surface-elevated" />
            </div>
          ) : (
            <>
              {saveError ? (
                <Surface
                  variant="secondary"
                  radius="lg"
                  role="alert"
                  className="border-semantic-danger/25 bg-semantic-danger/10 p-4"
                >
                  <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-text-primary">
                        {saveError}
                      </p>
                      {lastReqId ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                          <span>
                            {copy.supportCode}: <span className="font-mono">{lastReqId}</span>
                          </span>
                          <button
                            type="button"
                            className="min-h-11 rounded-lg px-3 font-medium text-accent-primary hover:bg-accent-primary/10"
                            onClick={() =>
                              navigator.clipboard.writeText(lastReqId)
                            }
                          >
                            {copy.copyCode}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Surface>
              ) : null}

              <section aria-labelledby="transaction-what-heading">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                    1
                  </p>
                  <h2
                    id="transaction-what-heading"
                    className="mt-1 text-lg font-semibold text-text-primary"
                  >
                    {copy.whatHappened}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      'income',
                      'expense',
                      'transfer',
                      'liability_settlement',
                    ] as TransactionCreateDirection[]
                  ).map((item) => {
                    const selected = direction === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleDirectionChange(item)}
                        className={`min-h-14 rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
                          selected
                            ? directionTone[item]
                            : 'border-border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                        }`}
                      >
                        {copy.directions[item]}
                      </button>
                    );
                  })}
                </div>

                <Surface variant="elevated" radius="xl" className="mt-4 p-5 sm:p-6">
                  <div className="grid gap-5 sm:grid-cols-[1fr_14rem] sm:items-end">
                    <div>
                      <label
                        htmlFor="transaction-amount"
                        className="text-sm font-medium text-text-secondary"
                      >
                        {copy.amount}
                      </label>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-xl font-semibold text-text-muted">
                          R$
                        </span>
                        <input
                          id="transaction-amount"
                          inputMode="numeric"
                          value={formatTransactionInputAmount(amountRaw, language)}
                          onChange={handleAmountChange}
                          className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-tight text-text-primary outline-none placeholder:text-text-muted/40 sm:text-5xl"
                          placeholder={formatTransactionInputAmount(0, language)}
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="transaction-date"
                        className="text-sm font-medium text-text-primary"
                      >
                        {copy.date}
                      </label>
                      <input
                        id="transaction-date"
                        type="date"
                        value={occurredAt}
                        onChange={(event) => setOccurredAt(event.target.value)}
                        className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary"
                      />
                    </div>
                  </div>
                </Surface>
              </section>

              <section aria-labelledby="transaction-how-heading">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                    2
                  </p>
                  <h2
                    id="transaction-how-heading"
                    className="mt-1 text-lg font-semibold text-text-primary"
                  >
                    {copy.howQuestion[direction]}
                  </h2>
                </div>

                <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {direction !== 'transfer' ? (
                      <div className="sm:col-span-2">
                        <label className="mb-2 flex items-center gap-1 text-sm font-medium text-text-primary">
                          {direction === 'income'
                            ? copy.paymentMethodIncome
                            : copy.paymentMethodExpense}
                          <ContextHelp topic="payment_method" />
                        </label>
                        <FinanceSelect
                          value={paymentMethod}
                          onChange={setPaymentMethod}
                          options={paymentOptions}
                          placeholder={copy.select}
                          allowClear
                          className="min-h-14"
                        />
                        {paymentMethodWarning ? (
                          <p className="mt-2 text-xs leading-relaxed text-semantic-warning">
                            {paymentMethodWarning}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {direction === 'liability_settlement' ? (
                      <>
                        <div>
                          <label className="mb-2 flex items-center gap-1 text-sm font-medium text-text-primary">
                            {copy.settlementType}
                            <ContextHelp topic="liability_settlement" />
                          </label>
                          <FinanceSelect
                            value={settlementType}
                            onChange={(value) =>
                              setSettlementType(
                                value as
                                  | 'credit_card_bill'
                                  | 'reimbursement'
                                  | '',
                              )
                            }
                            options={[
                              {
                                value: 'credit_card_bill',
                                label: copy.settlementCreditCard,
                              },
                              {
                                value: 'reimbursement',
                                label: copy.settlementReimbursement,
                              },
                            ]}
                            placeholder={copy.select}
                            className="min-h-14"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-text-primary">
                            {copy.liabilityAccount}
                          </label>
                          <FinanceSelect
                            value={liabilityAccountId}
                            onChange={setLiabilityAccountId}
                            options={accounts
                              .filter((account) => account.nature === 'liability')
                              .map((account) => ({
                                value: account.id,
                                label: getAccountLabel(account),
                              }))}
                            placeholder={copy.selectLiability}
                            className="min-h-14"
                          />
                          {accounts.find(
                            (account) => account.id === liabilityAccountId,
                          ) ? (
                            <AccountRepairCard
                              account={accounts.find(
                                (account) => account.id === liabilityAccountId,
                              )}
                              financeEntityId={activeFinanceEntityId || ''}
                              onRepaired={onAccountRepaired}
                            />
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    <div>
                      <label className="mb-2 flex items-center gap-1 text-sm font-medium text-text-primary">
                        {direction === 'transfer'
                          ? copy.sourceAccount
                          : direction === 'liability_settlement'
                            ? copy.payingAccount
                            : copy.account}
                        <ContextHelp topic="account" />
                      </label>
                      {availableAccounts.length > 0 ? (
                        <FinanceSelect
                          value={accountId}
                          onChange={setAccountId}
                          options={availableAccounts.map((account) => ({
                            value: account.id,
                            label: getAccountLabel(account),
                          }))}
                          placeholder={copy.selectAccount}
                          className="min-h-14"
                        />
                      ) : (
                        <div className="flex min-h-14 items-center rounded-xl border border-dashed border-border-subtle bg-surface-base px-4 text-sm text-semantic-warning">
                          {copy.noCompatibleAccount}
                        </div>
                      )}
                      {selectedAccount?.type === 'cash' ? (
                        <div className="mt-2 flex items-center gap-2 rounded-xl border border-semantic-warning/20 bg-semantic-warning/10 p-3 text-xs text-text-secondary">
                          <span>{copy.physicalCash}</span>
                          <ContextHelp topic="cash_account" />
                        </div>
                      ) : null}
                      {selectedAccount ? (
                        <AccountRepairCard
                          account={selectedAccount}
                          financeEntityId={activeFinanceEntityId || ''}
                          onRepaired={onAccountRepaired}
                        />
                      ) : null}
                    </div>

                    {direction === 'transfer' ? (
                      <div>
                        <label className="mb-2 flex items-center gap-1 text-sm font-medium text-text-primary">
                          {copy.destinationAccount}
                          <ContextHelp topic="account" />
                        </label>
                        {accounts.length > 0 ? (
                          <FinanceSelect
                            value={destinationAccountId}
                            onChange={setDestinationAccountId}
                            options={accounts
                              .filter((account) => account.id !== accountId)
                              .map((account) => ({
                                value: account.id,
                                label: getAccountLabel(account),
                              }))}
                            placeholder={copy.selectDestination}
                            className="min-h-14"
                          />
                        ) : (
                          <div className="flex min-h-14 items-center rounded-xl border border-dashed border-border-subtle bg-surface-base px-4 text-sm text-semantic-warning">
                            {copy.noAccount}
                          </div>
                        )}
                        {selectedDestinationAccount ? (
                          <AccountRepairCard
                            account={selectedDestinationAccount}
                            financeEntityId={activeFinanceEntityId || ''}
                            onRepaired={onAccountRepaired}
                          />
                        ) : null}
                      </div>
                    ) : null}

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="transaction-description"
                        className="text-sm font-medium text-text-primary"
                      >
                        {copy.description}
                        {requirementBadge('description')}
                      </label>
                      <input
                        id="transaction-description"
                        type="text"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder={copy.descriptionPlaceholder[direction]}
                        maxLength={300}
                        className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                      />
                    </div>
                  </div>
                </Surface>
              </section>

              {direction !== 'transfer' && direction !== 'liability_settlement' ? (
                <section aria-labelledby="transaction-classification-heading">
                  <Surface variant="secondary" radius="xl" className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2
                          id="transaction-classification-heading"
                          className="text-base font-semibold text-text-primary"
                        >
                          {copy.classificationTitle}
                        </h2>
                        <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-muted">
                          {copy.classificationHint}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => setShowClassification((current) => !current)}
                      >
                        {showClassification
                          ? copy.hideClassification
                          : copy.showClassification}
                      </Button>
                    </div>

                    {showClassification ? (
                      <div className="mt-5 border-t border-border-subtle pt-5">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <Button
                            variant="ghost"
                            leadingIcon={<Split className="h-4 w-4" />}
                            disabled={totalCents <= 0}
                            onClick={() => setIsSplit((current) => !current)}
                          >
                            {isSplit ? copy.unsplit : copy.split}
                          </Button>
                          {totalCents <= 0 ? (
                            <span className="text-xs text-text-muted">
                              {copy.splitNeedsAmount}
                            </span>
                          ) : null}
                        </div>

                        {isSplit && totalCents > 0 && targetDiff !== 0 ? (
                          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-semantic-warning/20 bg-semantic-warning/10 p-3 text-sm text-text-primary">
                            <span>
                              {targetDiff > 0 ? copy.remaining : copy.exceeded}
                            </span>
                            <span className="font-semibold tabular-nums">
                              {formatTransactionCurrency(
                                Math.abs(targetDiff),
                                language,
                              )}
                            </span>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-3">
                          {allocations.map((allocation, index) => (
                            <Surface
                              key={allocation.id}
                              variant="default"
                              radius="lg"
                              className="p-4 sm:p-5"
                            >
                              {isSplit ? (
                                <div className="mb-4 flex items-end gap-3">
                                  <div className="min-w-0 flex-1">
                                    <label className="text-sm font-medium text-text-primary">
                                      {copy.allocationAmount}
                                    </label>
                                    <div className="mt-2 flex min-h-12 items-center rounded-xl border border-border-subtle bg-surface-base px-3">
                                      <span className="mr-2 text-sm text-text-muted">R$</span>
                                      <input
                                        inputMode="numeric"
                                        value={formatTransactionInputAmount(
                                          allocation.amountRaw,
                                          language,
                                        )}
                                        onChange={(event) =>
                                          updateAllocationAmount(
                                            index,
                                            event.target.value,
                                          )
                                        }
                                        className="min-w-0 flex-1 bg-transparent text-base font-semibold text-text-primary outline-none"
                                      />
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    className="!min-h-12 !w-12 !px-0 text-semantic-danger"
                                    disabled={allocations.length <= 1}
                                    aria-label={copy.removeAllocation}
                                    onClick={() => removeAllocation(index)}
                                  >
                                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                                  </Button>
                                </div>
                              ) : null}

                              <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                  <label className="mb-2 flex items-center gap-1 text-sm font-medium text-text-primary">
                                    {copy.category}
                                    <ContextHelp topic="category" />
                                  </label>
                                  {compatibleCategories.length > 0 ? (
                                    <FinanceSelect
                                      value={allocation.categoryId}
                                      onChange={(value) =>
                                        updateAllocation(index, 'categoryId', value)
                                      }
                                      options={compatibleCategories.map(
                                        (category) => ({
                                          value: category.id,
                                          label: category.name,
                                        }),
                                      )}
                                      placeholder={copy.selectCategory}
                                      className="min-h-14"
                                    />
                                  ) : (
                                    <div className="flex min-h-14 items-center rounded-xl border border-dashed border-border-subtle bg-surface-base px-4 text-sm text-semantic-warning">
                                      {copy.noCompatibleCategory}
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <label className="mb-2 flex items-center gap-1 text-sm font-medium text-text-primary">
                                    {copy.fund}
                                    <ContextHelp topic="fund" />
                                  </label>
                                  {funds.length > 0 ? (
                                    <FinanceSelect
                                      value={allocation.fundId}
                                      onChange={(value) =>
                                        updateAllocation(index, 'fundId', value)
                                      }
                                      options={funds.map((fund) => ({
                                        value: fund.id,
                                        label: fund.name,
                                      }))}
                                      placeholder={copy.noFund}
                                      allowClear
                                      className="min-h-14"
                                    />
                                  ) : (
                                    <div className="flex min-h-14 items-center rounded-xl border border-border-subtle bg-surface-base px-4 text-sm text-text-muted">
                                      {copy.noActiveFund}
                                    </div>
                                  )}
                                </div>

                                <div className="sm:col-span-2">
                                  <label className="mb-2 flex items-center gap-1 text-sm font-medium text-text-primary">
                                    {copy.costCenter}
                                    <ContextHelp topic="cost_center" />
                                  </label>
                                  <input
                                    type="text"
                                    value={allocation.costCenterId}
                                    onChange={(event) =>
                                      updateAllocation(
                                        index,
                                        'costCenterId',
                                        event.target.value,
                                      )
                                    }
                                    placeholder={copy.costCenterPlaceholder}
                                    className="min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                                  />
                                </div>
                              </div>
                            </Surface>
                          ))}

                          {isSplit ? (
                            <Button
                              variant="secondary"
                              leadingIcon={<Plus className="h-4 w-4" />}
                              fullWidth
                              onClick={addAllocation}
                            >
                              {copy.addAllocation}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </Surface>
                </section>
              ) : null}

              <section aria-labelledby="transaction-details-heading">
                <Surface variant="secondary" radius="xl" className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2
                        id="transaction-details-heading"
                        className="text-base font-semibold text-text-primary"
                      >
                        {showDetails ? copy.hideDetails : copy.showDetails}
                      </h2>
                      <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-muted">
                        {copy.detailsHint}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setShowDetails((current) => !current)}
                    >
                      {showDetails ? copy.hideDetails : copy.showDetails}
                    </Button>
                  </div>

                  {showDetails ? (
                    <div className="mt-5 grid gap-5 border-t border-border-subtle pt-5">
                      {direction !== 'transfer' ? (
                        <div>
                          <label
                            htmlFor="transaction-counterparty"
                            className="text-sm font-medium text-text-primary"
                          >
                            {copy.counterparty[direction]}
                            {requirementBadge('counterparty')}
                          </label>
                          <input
                            id="transaction-counterparty"
                            type="text"
                            value={counterparty}
                            onChange={(event) => setCounterparty(event.target.value)}
                            placeholder={copy.counterpartyPlaceholder}
                            maxLength={100}
                            className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                          />
                        </div>
                      ) : null}

                      <div>
                        <label className="text-sm font-medium text-text-primary">
                          {copy.evidence}
                          {evidenceRequirementBadge()}
                        </label>
                        <div className="mt-2">
                          <TransactionEvidenceUpload
                            organizationId={accessState.organizationId || ''}
                            financeEntityId={activeFinanceEntityId || ''}
                            evidenceIds={evidenceIds}
                            onChange={setEvidenceIds}
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="transaction-evidence-justification"
                          className="text-sm font-medium text-text-primary"
                        >
                          {copy.evidenceJustification}
                        </label>
                        <textarea
                          id="transaction-evidence-justification"
                          value={evidenceJustification}
                          onChange={(event) =>
                            setEvidenceJustification(event.target.value)
                          }
                          placeholder={copy.evidenceJustificationPlaceholder}
                          maxLength={300}
                          className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border-subtle bg-surface-base px-4 py-3 text-base text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                        />
                      </div>
                    </div>
                  ) : null}
                </Surface>
              </section>

              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <h2 className="text-base font-semibold text-text-primary">
                  {copy.summaryTitle}
                </h2>
                <div className="mt-4 flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {summaryDirection}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {copy.summaryChurch}: {activeFinanceEntityName || activeFinanceEntityId}
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-semibold tabular-nums text-text-primary">
                    {formatTransactionCurrency(totalCents, language)}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {direction === 'transfer' ? (
                    <>
                      <SummaryRow
                        label={copy.summaryOrigin}
                        value={selectedAccount?.name || copy.pending}
                      />
                      <SummaryRow
                        label={copy.summaryDestination}
                        value={selectedDestinationAccount?.name || copy.pending}
                      />
                    </>
                  ) : direction === 'liability_settlement' ? (
                    <>
                      <SummaryRow
                        label={copy.summaryAccount}
                        value={selectedAccount?.name || copy.pending}
                      />
                      <SummaryRow
                        label={copy.summarySettlement}
                        value={
                          settlementType === 'credit_card_bill'
                            ? copy.invoice
                            : settlementType === 'reimbursement'
                              ? copy.reimbursement
                              : copy.pending
                        }
                      />
                      <SummaryRow
                        label={copy.summaryMethod}
                        value={selectedPaymentLabel}
                      />
                    </>
                  ) : (
                    <>
                      <SummaryRow
                        label={copy.summaryAccount}
                        value={selectedAccount?.name || copy.pending}
                      />
                      <SummaryRow
                        label={copy.summaryMethod}
                        value={selectedPaymentLabel}
                      />
                      <SummaryRow
                        label={copy.summaryCategory}
                        value={summaryCategory}
                      />
                    </>
                  )}
                </dl>
              </Surface>

              <div className="sticky bottom-0 z-20 -mx-4 border-t border-border-subtle bg-surface-base/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,16px))] backdrop-blur-md sm:-mx-6 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
                  {hasEffectiveCapability(
                    accessState,
                    'finance.submit_for_review',
                  ) && !readiness.ready ? (
                    <Surface
                      variant="secondary"
                      radius="lg"
                      className="border-semantic-warning/20 bg-semantic-warning/10 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text-primary">
                            {copy.reviewMissing.replace(
                              '{count}',
                              String(readiness.findings.length),
                            )}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-text-muted">
                            {copy.reviewMissingHint}
                          </p>
                          <Button
                            variant="ghost"
                            className="mt-2"
                            onClick={revealMissingFields}
                          >
                            {copy.revealMissing}
                          </Button>
                        </div>
                      </div>
                    </Surface>
                  ) : null}

                  {hasEffectiveCapability(
                    accessState,
                    'finance.submit_for_review',
                  ) ? (
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      disabled={saving || !readiness.ready}
                      onClick={handleCreateAndSubmit}
                    >
                      {saving ? copy.sending : copy.sendForReview}
                    </Button>
                  ) : null}

                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    disabled={saving}
                    onClick={handleSaveDraft}
                  >
                    {saving ? copy.saving : copy.saveDraft}
                  </Button>
                </div>
              </div>

              <Surface variant="secondary" radius="lg" className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {copy.flowTitle}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="flex gap-2">
                    <ContextHelp topic="draft" />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {copy.draftTitle}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
                        {copy.draftBody}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <ContextHelp topic="review" />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {copy.reviewTitle}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
                        {copy.reviewBody}
                      </p>
                    </div>
                  </div>
                </div>
              </Surface>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-surface-base px-3 py-2.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-text-primary">{value}</dd>
    </div>
  );
}
