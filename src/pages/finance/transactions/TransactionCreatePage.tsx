import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Landmark,
  Layers,
  AlertCircle,
  ShieldX,
  Wallet,
  Plus,
  Trash2,
  Split,
} from "lucide-react";
import { APP_ROUTES } from "@/src/app/router/routes";
import { useAuth } from "@/src/hooks/useAuth";
import { useFinanceEntity } from "@/src/contexts/FinanceEntityContext";
import { useTransactions } from "@/src/hooks/finance/useTransactions";
import { FinanceContextGuard } from "@/src/components/finance/FinanceContextGuard";
import { FinanceEntityContextBar } from "@/src/components/finance/FinanceEntityContextBar";
import { firebaseAuth } from "@/src/lib/firebase";
import { hasEffectiveCapability } from "@/src/lib/permissions";
import {
  FinanceSelect,
  FinanceSelectOption,
} from "@/src/components/finance/FinanceSelect";
import {
  getCompatibleAccounts,
  getCompatiblePaymentInstruments,
  validateSubmissionReadiness,
  getTransactionFieldRequirements,
} from "@/shared/finance/smartLogic";
import { PAYMENT_METHODS as ALL_PAYMENT_METHODS } from "@/shared/finance/paymentMethods";
import AccountRepairCard from "@/src/components/finance/AccountRepairCard";
import ContextHelp from "@/src/components/finance/ContextHelp";
import { TransactionEvidenceUpload } from "@/src/components/finance/TransactionEvidenceUpload";

export default function TransactionCreatePage() {
  const { accessState } = useAuth();

  if (
    accessState.status === "initializing" ||
    accessState.status === "authenticated_unresolved"
  ) {
    return null;
  }

  if (!hasEffectiveCapability(accessState, "finance.create_drafts")) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <ShieldX className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Acesso Negado
        </h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">
          Você não tem permissão para registrar movimentações.
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
  const isAccountIncomplete = (acc: any) => {
    if (acc.active === false) return true;
    if (acc.configurationStatus && acc.configurationStatus !== "complete") return true;
    if (!acc.type || !acc.nature) return true;
    return false;
  };

  const getAccountLabel = (acc: any) => {
    return isAccountIncomplete(acc) ? `${acc.name} (Pendente de Configuração)` : acc.name;
  };

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessState } = useAuth();
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { createDraft, createAndSubmit } = useTransactions();

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);

  // Form State
  const initialDirection = (searchParams.get('direction') as any) || "expense";
  const [direction, setDirection] = useState<
    "income" | "expense" | "transfer" | "liability_settlement"
  >(initialDirection);

  const [settlementType, setSettlementType] = useState<
    "credit_card_bill" | "reimbursement" | ""
  >("");
  const [liabilityAccountId, setLiabilityAccountId] = useState("");
  const [amountRaw, setAmountRaw] = useState("0"); // Value in cents as a string for raw typing
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [evidenceJustification, setEvidenceJustification] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // Single/split
  const [isSplit, setIsSplit] = useState(false);
  const [allocations, setAllocations] = useState<
    {
      id: string;
      categoryId: string;
      fundId: string;
      costCenterId: string;
      amountRaw: string | null;
    }[]
  >([{ id: "initial", categoryId: "", fundId: "", costCenterId: "", amountRaw: null }]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastReqId, setLastReqId] = useState<string | null>(null);
  const [repairedAccountIds, setRepairedAccountIds] = useState<string[]>([]);

  const epochRef = useRef(0);
  const idempotencyKeyRef = useRef<string | null>(null);
  const lastMaterialPayloadRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef<"draft" | "submit" | null>(null);

  useEffect(() => {
    let abortController = new AbortController();

    // Clear idempotency when entity changes
    idempotencyKeyRef.current = null;
    lastMaterialPayloadRef.current = null;

    if (activeFinanceEntityId) {
      loadCatalogs(abortController.signal, ++epochRef.current);
    }

    return () => {
      abortController.abort();
    };
  }, [activeFinanceEntityId]);

  const loadCatalogs = async (signal?: AbortSignal, currentEpoch?: number) => {
    setLoadingInitial(true);
    setInitialError(null);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error("Unauthenticated");
      const token = await user.getIdToken();

      const [accountsRes, fundsRes, categoriesRes] = await Promise.all([
        fetch("/api/finance/accounts/list", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
          signal,
        }),
        fetch("/api/finance/funds/list", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
          signal,
        }),
        fetch("/api/finance/categories/list", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
          signal,
        }),
      ]);

      if (signal?.aborted || currentEpoch !== epochRef.current) return;

      const accsData = await accountsRes.json().catch(() => ({}));
      const fundsData = await fundsRes.json().catch(() => ({}));
      const catsData = await categoriesRes.json().catch(() => ({}));

      const activeAccounts = (accsData.accounts || []).filter(
        (a: any) => a.active,
      );
      const activeFunds = (fundsData.funds || []).filter((f: any) => f.active);
      const activeCats = (catsData.categories || []).filter(
        (c: any) => c.active,
      );

      setAccounts(activeAccounts);
      setFunds(activeFunds);
      setCategories(activeCats);

      if (activeAccounts.length > 0) setAccountId(activeAccounts[0].id);
    } catch (err: any) {
      if (signal?.aborted || currentEpoch !== epochRef.current) return;
      setInitialError(err.message || "Erro ao carregar dados");
    } finally {
      if (!signal?.aborted && currentEpoch === epochRef.current) {
        setLoadingInitial(false);
      }
    }
  };

  // Auto clean categories when direction changes
  useEffect(() => {
    setAllocations((prev) =>
      prev.map((a) => {
        const cat = categories.find((c) => c.id === a.categoryId);
        if (cat && cat.kind !== direction) {
          return { ...a, categoryId: "" };
        }
        return a;
      }),
    );
  }, [direction, categories]);

  const handleDirectionChange = (
    newDir: "income" | "expense" | "transfer" | "liability_settlement",
  ) => {
    setDirection(newDir);
    setPaymentMethodWarning(null);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/\D/g, "");
    let parsed = parseInt(numericValue, 10);
    if (isNaN(parsed)) parsed = 0;
    setAmountRaw(parsed.toString());
  };

  const parseAmountToCents = (val: string | null) => {
    if (!val) return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatMoneyInput = (cents: string | null) => {
    if (!cents) return "0,00";
    let parsed = parseInt(cents, 10);
    if (isNaN(parsed)) parsed = 0;
    return (parsed / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const compatibleCategories = useMemo(() => {
    return categories.filter((c) => c.kind === direction);
  }, [categories, direction]);

  // New Smart Logic Computations
  const allPaymentMethodsList = ALL_PAYMENT_METHODS;

  const validPaymentMethodCodes = getCompatiblePaymentInstruments(
    undefined,
    direction,
  );

  const availablePaymentMethods = useMemo(() => {
    if (direction === "transfer") return [];
    return allPaymentMethodsList.filter((p) =>
      validPaymentMethodCodes.includes(p.code as any),
    );
  }, [direction, validPaymentMethodCodes]);

  const [paymentMethodWarning, setPaymentMethodWarning] = useState<
    string | null
  >(null);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId],
  );
  const selectedDestinationAccount = useMemo(
    () => accounts.find((a) => a.id === destinationAccountId),
    [accounts, destinationAccountId],
  );

  useEffect(() => {
    if (paymentMethod && availablePaymentMethods.length > 0) {
      if (!availablePaymentMethods.some((p) => p.code === paymentMethod)) {
        setPaymentMethod("");
        setPaymentMethodWarning(
          "A forma de pagamento anterior foi removida porque não é compatível com a operação atual.",
        );
      } else {
        setPaymentMethodWarning(null);
      }
    }
  }, [availablePaymentMethods, direction]);

  useEffect(() => {
    if (selectedAccount && paymentMethod) {
      const supported = selectedAccount.supportedPaymentInstruments || [];
      if (supported.length > 0 && !supported.includes(paymentMethod)) {
        setPaymentMethod("");
        setPaymentMethodWarning(
          `A forma de pagamento foi removida porque a conta "${selectedAccount.name}" não aceita o método selecionado.`,
        );
      }
    }
  }, [selectedAccount, paymentMethod]);

  const availableAccounts = useMemo(() => {
    return getCompatibleAccounts(paymentMethod, direction, accounts);
  }, [paymentMethod, direction, accounts]);

  useEffect(() => {
    if (accountId && !availableAccounts.some((a) => a.id === accountId)) {
      setAccountId("");
    } else if (availableAccounts.length === 1 && !accountId) {
      setAccountId(availableAccounts[0].id);
    }
  }, [availableAccounts, accountId]);

  const totalCents = parseAmountToCents(amountRaw);
  const allocatedCents = isSplit
    ? allocations.reduce(
        (sum, a) => sum + parseAmountToCents(a.amountRaw || "0"),
        0,
      )
    : totalCents;
  const targetDiff = totalCents - allocatedCents;

  const buildPayloadOrError = (skipErrors = false) => {
    // Basic validation
    if (!accountId) {
      if (!skipErrors) setSaveError("Selecione uma conta");
      if (!skipErrors) return null;
    }

    const originAcc = accounts.find((a) => a.id === accountId);
    if (originAcc && isAccountIncomplete(originAcc)) {
      if (!skipErrors) setSaveError(
        "A conta selecionada está incompleta. Por favor, conclua a configuração no painel de correção inline acima antes de salvar.",
      );
      if (!skipErrors) return null;
    }

    if (direction === "transfer") {
      if (!destinationAccountId) {
        if (!skipErrors) setSaveError("Selecione a conta de destino para a transferência");
        if (!skipErrors) return null;
      }
      if (accountId && accountId === destinationAccountId) {
        if (!skipErrors) setSaveError("A conta de destino não pode ser a mesma de origem");
        if (!skipErrors) return null;
      }
      const destAcc = accounts.find((a) => a.id === destinationAccountId);
      if (destAcc && isAccountIncomplete(destAcc)) {
        if (!skipErrors) setSaveError(
          "A conta de destino está incompleta. Por favor, conclua a configuração no painel de correção inline acima antes de salvar.",
        );
        if (!skipErrors) return null;
      }
    }

    if (direction === "liability_settlement") {
      if (!settlementType) {
        if (!skipErrors) setSaveError("Selecione o tipo de liquidação");
        if (!skipErrors) return null;
      }
      if (!liabilityAccountId) {
        if (!skipErrors) setSaveError("Selecione o passivo a liquidar");
        if (!skipErrors) return null;
      }
      const liabAcc = accounts.find((a) => a.id === liabilityAccountId);
      if (liabAcc && isAccountIncomplete(liabAcc)) {
        if (!skipErrors) setSaveError(
          "O passivo selecionado está incompleto. Por favor, conclua a configuração no painel de correção inline acima antes de salvar.",
        );
        if (!skipErrors) return null;
      }
    }

    if (totalCents <= 0 && !skipErrors) {
      setSaveError("O valor da movimentação deve ser maior que zero");
      return null;
    }

    // validate allocations
    const finalAllocs = [];
    if (direction !== "transfer" && direction !== "liability_settlement") {
      if (isSplit) {
        for (const a of allocations) {
          if (!a.categoryId && !skipErrors) {
            setSaveError("Selecione uma categoria para todos os rateios");
            return null;
          }
          const amt = parseAmountToCents(a.amountRaw || "0");
          if (amt <= 0 && !skipErrors) {
            setSaveError("O valor de cada rateio deve ser maior que zero");
            return null;
          }
          finalAllocs.push({
            categoryId: a.categoryId,
            fundId: a.fundId || undefined,
            costCenterId: a.costCenterId || undefined,
            amountCents: amt,
          });
        }
      } else {
        if (allocations[0].categoryId || skipErrors) {
          finalAllocs.push({
            categoryId: allocations[0].categoryId,
            fundId: allocations[0].fundId || undefined,
            costCenterId: allocations[0].costCenterId || undefined,
            amountCents: totalCents,
          });
        }
      }
    }

    return {
      direction,
      amountCents: totalCents,
      occurredAt: new Date(occurredAt + "T12:00:00Z").toISOString(),
      accountId,
      destinationAccountId:
        direction === "transfer" ? destinationAccountId : undefined,
      paymentMethod: paymentMethod || undefined,
      description: description || undefined,
      counterparty: counterparty || undefined,
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
      evidenceJustification: evidenceJustification || undefined,
      sourceContext: "manual",
      allocations:
        direction === "transfer" || direction === "liability_settlement"
          ? []
          : finalAllocs,
      settlementType:
        direction === "liability_settlement" ? settlementType : undefined,
      liabilityAccountId:
        direction === "liability_settlement" ? liabilityAccountId : undefined,
    };
  };

  const getOrUpdateIdempotencyKey = (
    operation: "draft" | "submit",
    materialPayloadString: string,
  ) => {
    if (
      materialPayloadString !== lastMaterialPayloadRef.current ||
      !idempotencyKeyRef.current
    ) {
      idempotencyKeyRef.current =
        "idkl_" +
        operation +
        "_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
      lastMaterialPayloadRef.current = materialPayloadString;
    }
    return idempotencyKeyRef.current;
  };

  const handleErrorContext = (err: any) => {
    let msg = err.message || "Erro ao salvar";
    if (msg.includes("FINANCE_ALLOCATION_TOTAL_MISMATCH"))
      msg =
        "A divisão precisa ser revisada. O rateio não corresponde ao valor total.";
    else if (msg.includes("FINANCE_ACCOUNT_MISMATCH"))
      msg = "Essa conta não pertence à igreja selecionada.";
    else if (msg.includes("FINANCE_CATEGORY_MISMATCH"))
      msg = "Essa categoria não pode ser usada nesta movimentação.";
    else if (msg.includes("FINANCE_FUND_MISMATCH"))
      msg = "Esse fundo não pertence à igreja selecionada.";
    else if (msg.includes("FINANCE_IDEMPOTENCY_CONFLICT"))
      msg = "Esta tentativa não pode ser repetida com informações diferentes.";
    else if (msg.includes("FINANCE_PAYMENT_METHOD_MISMATCH"))
      msg =
        "A forma de pagamento " +
        (paymentMethod === "pix" ? "Pix" : "") +
        " não é compatível com esta conta.";
    else if (msg.includes("permission") || msg.includes("FORBIDDEN"))
      msg = "Você não tem permissão para registrar esta movimentação.";
    else if (
      msg.includes("ROUTE_NOT_FOUND") ||
      msg.includes("Unexpected token")
    )
      msg = "O serviço financeiro está temporariamente indisponível.";
    else if (
      msg.includes("Failed to create transaction") ||
      msg.includes("Failed to create and submit")
    )
      msg = "Não foi possível salvar.";
    else if (
      msg.includes("Failed to fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg === "Erro ao salvar" ||
      err.name === "TypeError"
    ) {
      msg =
        "Não foi possível confirmar se a operação foi concluída. Tente novamente com segurança.";
    }

    const hasRepairedAcc =
      repairedAccountIds.includes(accountId) ||
      (direction === "transfer" &&
        repairedAccountIds.includes(destinationAccountId)) ||
      (direction === "liability_settlement" &&
        repairedAccountIds.includes(liabilityAccountId));

    if (hasRepairedAcc) {
      msg =
        "A conta foi corrigida. Revise os dados destacados para concluir a movimentação.";
    }

    setSaveError(msg);
    setSaving(false);
  };

  const attemptAutoRepairAndSubmit = async (
    mode: "draft" | "submit",
  ): Promise<boolean> => {
    // 1. Identify all selected accounts that need repair and are repairable canonically
    const accountsToRepair: any[] = [];
    const mainAcc = accounts.find((a) => a.id === accountId);
    if (mainAcc && isAccountIncomplete(mainAcc) && mainAcc.templateKey) {
      accountsToRepair.push(mainAcc);
    }
    if (direction === "transfer" && destinationAccountId) {
      const destAcc = accounts.find((a) => a.id === destinationAccountId);
      if (destAcc && isAccountIncomplete(destAcc) && destAcc.templateKey) {
        accountsToRepair.push(destAcc);
      }
    }
    if (direction === "liability_settlement" && liabilityAccountId) {
      const liabAcc = accounts.find((a) => a.id === liabilityAccountId);
      if (liabAcc && isAccountIncomplete(liabAcc) && liabAcc.templateKey) {
        accountsToRepair.push(liabAcc);
      }
    }

    if (accountsToRepair.length > 0) {
      setSaving(true);
      setSaveError(null);

      try {
        const user = firebaseAuth.currentUser;
        if (!user) throw new Error("Não autenticado");
        const token = await user.getIdToken();

        const repairedResults: any[] = [];
        for (const accToRep of accountsToRepair) {
          const reqId =
            "req_rep_" +
            Math.random().toString(36).substring(2, 10) +
            Date.now().toString(36);
          const accountRepairIdempotencyKey =
            "idk_rep_" +
            Math.random().toString(36).substring(2, 10) +
            Date.now().toString(36);

          const repRes = await fetch(
            "/api/finance-gateway?operation=accounts-repair-canonical",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                accountId: accToRep.id,
                requestId: reqId,
                idempotencyKey: accountRepairIdempotencyKey,
              }),
            },
          );

          if (!repRes.ok) {
            const errData = await repRes.json().catch(() => ({}));
            throw new Error(
              errData.message ||
                errData.error ||
                `Falha ao reparar conta ${accToRep.name}`,
            );
          }

          const repData = await repRes.json();
          const repairedAcc = repData.results?.[0]?.account;
          if (repairedAcc) {
            repairedResults.push({ id: accToRep.id, repairedAcc });
          }
        }

        // Update catalog in-memory
        setAccounts((prev) => {
          let updated = [...prev];
          for (const rep of repairedResults) {
            updated = updated.map((a) =>
              a.id === rep.id ? { ...a, ...rep.repairedAcc } : a,
            );
          }
          return updated;
        });

        // Add to repairedAccountIds
        setRepairedAccountIds((prev) => [
          ...prev,
          ...repairedResults.map((r) => r.id),
        ]);

        // Retry submission
        setTimeout(() => {
          if (mode === "draft") {
            handleSaveDraftWithRetryFlag(true);
          } else {
            handleCreateAndSubmitWithRetryFlag(true);
          }
        }, 50);

        return true;
      } catch (err: any) {
        setSaveError(err.message || "Falha no reparo automático da conta.");
        setSaving(false);
        return true;
      }
    }

    // Check if there are incomplete custom accounts that can't be canonically repaired
    let hasCustomIncomplete = false;
    if (mainAcc && isAccountIncomplete(mainAcc) && !mainAcc.templateKey) {
      hasCustomIncomplete = true;
    }
    if (direction === "transfer" && destinationAccountId) {
      const destAcc = accounts.find((a) => a.id === destinationAccountId);
      if (destAcc && isAccountIncomplete(destAcc) && !destAcc.templateKey) {
        hasCustomIncomplete = true;
      }
    }
    if (direction === "liability_settlement" && liabilityAccountId) {
      const liabAcc = accounts.find((a) => a.id === liabilityAccountId);
      if (liabAcc && isAccountIncomplete(liabAcc) && !liabAcc.templateKey) {
        hasCustomIncomplete = true;
      }
    }

    if (hasCustomIncomplete) {
      pendingSubmitRef.current = mode;
      setSaveError(
        "Por favor, conclua a configuração personalizada da conta usando o painel inline acima para prosseguir.",
      );
      return true;
    }

    return false;
  };

  const handleSaveDraft = () => {
    handleSaveDraftWithRetryFlag(false);
  };

  const handleSaveDraftWithRetryFlag = async (isRetry: boolean) => {
    if (saving && !isRetry) return; // double click prevention
    setSaveError(null);

    // If it's not a retry, see if we can auto-repair
    if (!isRetry) {
      const handled = await attemptAutoRepairAndSubmit("draft");
      if (handled) return;
    }

    const payload = buildPayloadOrError();
    if (!payload && saveError) return;
    if (!payload) return;

    const materialPayloadArray: any[] = [
      activeFinanceEntityId,
      direction,
      totalCents,
      occurredAt,
      accountId,
      paymentMethod,
      description,
      payload.allocations
        .map((a) => `${a.categoryId}|${a.fundId || ""}|${a.amountCents}`)
        .sort(),
    ];
    const materialPayloadString = JSON.stringify(materialPayloadArray);
    const idempotencyKey = getOrUpdateIdempotencyKey(
      "draft",
      materialPayloadString,
    );

    setSaving(true);
    const currentEpochOnSave = epochRef.current;

    try {
      const reqId =
        "req_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
      setLastReqId(reqId);

      const res = await createDraft(payload, idempotencyKey, reqId);

      if (epochRef.current !== currentEpochOnSave) return; // drop if entity changed

      idempotencyKeyRef.current = null;
      lastMaterialPayloadRef.current = null;
      setLastReqId(null);
      pendingSubmitRef.current = null;

      navigate(
        APP_ROUTES.transactionDetail.replace(
          ":transactionId",
          res.transactionId,
        ),
        { replace: true },
      );
    } catch (err: any) {
      if (epochRef.current !== currentEpochOnSave) return;
      handleErrorContext(err);
    }
  };

  const handleCreateAndSubmit = () => {
    handleCreateAndSubmitWithRetryFlag(false);
  };

  const handleCreateAndSubmitWithRetryFlag = async (isRetry: boolean) => {
    if (saving && !isRetry) return; // double click prevention
    setSaveError(null);

    // If it's not a retry, see if we can auto-repair
    if (!isRetry) {
      const handled = await attemptAutoRepairAndSubmit("submit");
      if (handled) return;
    }

    const payload = buildPayloadOrError();
    if (!payload && saveError) return;
    if (!payload) return;

    if (direction !== "transfer") {
      if (!paymentMethod) {
        setSaveError(
          "Para registrar, informe a forma de pagamento e a categoria.",
        );
        return;
      }
      if (payload.allocations.length === 0) {
        setSaveError("Para registrar, informe a categoria.");
        return;
      }

      const calculatedAllocated = payload.allocations.reduce(
        (sum, a) => sum + a.amountCents,
        0,
      );
      if (totalCents !== calculatedAllocated) {
        setSaveError(
          "A soma dos rateios deve ser exatamente igual ao valor total para registrar.",
        );
        return;
      }
    }

    const materialPayloadArray: any[] = [
      activeFinanceEntityId,
      direction,
      totalCents,
      occurredAt,
      accountId,
      paymentMethod,
      description,
      payload.allocations
        .map((a) => `${a.categoryId}|${a.fundId || ""}|${a.amountCents}`)
        .sort(),
    ];
    const materialPayloadString = JSON.stringify(materialPayloadArray);
    const idempotencyKey = getOrUpdateIdempotencyKey(
      "submit",
      materialPayloadString,
    );

    setSaving(true);
    const currentEpochOnSave = epochRef.current;

    try {
      const reqId =
        "req_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
      setLastReqId(reqId);

      const res = await createAndSubmit(payload, idempotencyKey, reqId);

      if (epochRef.current !== currentEpochOnSave) return;

      idempotencyKeyRef.current = null;
      lastMaterialPayloadRef.current = null;
      setLastReqId(null);
      pendingSubmitRef.current = null;

      navigate(
        APP_ROUTES.transactionDetail.replace(
          ":transactionId",
          res.transactionId,
        ),
        { replace: true },
      );
    } catch (err: any) {
      if (epochRef.current !== currentEpochOnSave) return;
      handleErrorContext(err);
    }
  };

  const addAllocation = () => {
    setAllocations((prev) => [
      ...prev,
      { id: "alloc_" + Date.now(), categoryId: "", fundId: "", costCenterId: "", amountRaw: "0" },
    ]);
  };

  const removeAllocation = (index: number) => {
    setAllocations((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const updateAllocation = (index: number, field: string, value: string) => {
    setAllocations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const updateAllocationAmount = (index: number, rawInput: string) => {
    const numericValue = rawInput.replace(/\D/g, "");
    let parsed = parseInt(numericValue, 10);
    if (isNaN(parsed)) parsed = 0;
    updateAllocation(index, "amountRaw", parsed.toString());
  };

  if (initialError) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Erro ao carregar
        </h3>
        <button
          onClick={() => loadCatalogs(undefined, epochRef.current)}
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
        >
          Tentar novamente
        </button>
      </main>
    );
  }

  const handleBeforeSwitch = () => {
    const hasModifications = amountRaw !== "0" || description !== "";
    if (hasModifications) {
      const confirmDiscard = window.confirm(
        "Você tem alterações não salvas. Deseja sair e trocar de igreja? O rascunho atual será descartado.",
      );
      if (!confirmDiscard) return false;
    }
    // Clean states properly before leaving
    idempotencyKeyRef.current = null;
    lastMaterialPayloadRef.current = null;
    setAmountRaw("0");
    setDescription("");
    setIsSplit(false);
    setAllocations([
      { id: "initial", categoryId: "", fundId: "", costCenterId: "", amountRaw: null },
    ]);
    return true;
  };

  const txForValidation = useMemo(() => {
     return buildPayloadOrError(true) || {}; // true to skip amount error for checking
  }, [direction, amountRaw, occurredAt, accountId, paymentMethod, description, counterparty, evidenceIds, evidenceJustification, isSplit, allocations, destinationAccountId, settlementType, liabilityAccountId, totalCents]);

  const readiness = useMemo(() => {
     return validateSubmissionReadiness(txForValidation);
  }, [txForValidation]);

  const getReqText = (field: string) => {
     const req = readiness.requirements.find(r => r.field === field);
     if (!req) return null;
     if (req.requirement === 'required') return <span className="text-amber-600 font-normal ml-1">(Obrigatório)</span>;
     if (req.requirement === 'optional') return <span className="text-text-muted font-normal ml-1">(Opcional)</span>;
     return null;
  };

  const getReqTextForEvidence = () => {
     const reqE = readiness.requirements.find(r => r.field === 'evidence');
     if (reqE && reqE.requirement === 'required') return <span className="text-amber-600 font-normal ml-1">(Obrigatório ou justificar)</span>;
     return <span className="text-text-muted font-normal ml-1">(Opcional)</span>;
  };

  return (
    <div className="flex flex-col font-sans -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
      <FinanceEntityContextBar
        areaName="Nova movimentação"
        onBeforeSwitch={handleBeforeSwitch}
      />
      <header className="shrink-0 max-w-2xl w-full mx-auto px-4 py-4 sm:px-6 flex items-center gap-4">
        <button
          onClick={() => navigate(APP_ROUTES.transactions)}
          className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-surface-elevated text-text-secondary transition-colors -ml-4"
          aria-label="Voltar para listagem de movimentações"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            Nova movimentação
          </h1>
        </div>
      </header>

      <div className="px-4 py-4 sm:px-6">
        <div className="max-w-xl mx-auto flex flex-col gap-6 pb-[calc(10rem+env(safe-area-inset-bottom))]">
          {loadingInitial && (
            <div className="flex flex-col gap-6 w-full animate-pulse">
              <div className="h-12 bg-surface-secondary rounded-xl w-full"></div>
              <div className="h-24 bg-surface-secondary rounded-2xl w-full"></div>
              <div className="h-20 bg-surface-elevated border border-border-subtle rounded-2xl"></div>
            </div>
          )}

          {!loadingInitial && (
            <>
              {saveError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl flex flex-col gap-3 text-sm items-start">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p>{saveError}</p>
                  </div>
                  {lastReqId && (
                    <div className="flex items-center gap-2 mt-1 ml-8 text-rose-500/80 text-xs">
                      <span>Código de suporte: {lastReqId}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(lastReqId)}
                        className="underline hover:text-rose-500 transition-colors"
                        title="Copiar código"
                      >
                        Copiar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Bloco 1: O que aconteceu */}
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-medium text-text-muted px-1 uppercase tracking-wider">
                  O que aconteceu?
                </h3>
                <div className="flex flex-col gap-2 p-1 bg-surface-elevated border border-border-subtle rounded-xl max-w-sm w-full">
                  <div className="flex w-full">
                    <button
                      onClick={() => handleDirectionChange("income")}
                      className={`flex-1 h-12 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${direction === "income" ? "bg-teal-500/10 text-teal-500" : "text-text-muted hover:text-text-primary"}`}
                    >
                      Entrada
                    </button>
                    <button
                      onClick={() => handleDirectionChange("expense")}
                      className={`flex-1 h-12 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${direction === "expense" ? "bg-rose-500/10 text-rose-500" : "text-text-muted hover:text-text-primary"}`}
                    >
                      Saída
                    </button>
                    <button
                      onClick={() => handleDirectionChange("transfer")}
                      className={`flex-1 h-12 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${direction === "transfer" ? "bg-amber-500/10 text-amber-500" : "text-text-muted hover:text-text-primary"}`}
                    >
                      Transferência
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      handleDirectionChange("liability_settlement")
                    }
                    className={`w-full h-10 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${direction === "liability_settlement" ? "bg-blue-500/10 text-blue-500" : "text-text-muted hover:text-text-primary"}`}
                  >
                    Outras Operações (Liquidação)
                  </button>
                </div>

                <div className="flex flex-col items-center gap-2 py-4">
                  <p className="text-sm font-medium text-text-secondary">
                    Valor total
                  </p>
                  <div className="relative group flex items-center justify-center">
                    <span
                      className={`text-4xl font-semibold mr-1 transition-colors ${direction === "income" ? "text-teal-500" : direction === "transfer" ? "text-amber-500" : direction === "liability_settlement" ? "text-blue-500" : "text-rose-500"}`}
                    >
                      R$
                    </span>
                    <input
                      inputMode="numeric"
                      value={formatMoneyInput(amountRaw)}
                      onChange={handleAmountChange}
                      className={`w-full max-w-[200px] bg-transparent text-5xl lg:text-6xl text-center font-semibold tracking-tight outline-none caret-text-primary transition-colors ${direction === "income" ? "text-teal-500" : direction === "transfer" ? "text-amber-500" : direction === "liability_settlement" ? "text-blue-500" : "text-rose-500"} placeholder-text-muted/30 focus:border-b-2 border-b border-transparent focus:border-border-subtle pb-1`}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 w-full sm:max-w-sm">
                  <label className="text-sm font-medium text-text-primary">
                    Data
                  </label>
                  <input
                    type="date"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="w-full h-14 bg-surface-elevated border border-border-subtle text-text-primary rounded-xl px-4 outline-none focus:border-accent-primary transition-colors text-base"
                  />
                </div>
              </div>

              {/* Bloco 2: Como aconteceu */}
              <div className="flex flex-col gap-4 mt-8">
                <h3 className="text-sm font-medium text-text-muted px-1 uppercase tracking-wider">
                  Como a igreja{" "}
                  {direction === "income"
                    ? "recebeu"
                    : direction === "transfer"
                      ? "transferiu"
                      : direction === "liability_settlement"
                        ? "liquidou"
                        : "pagou"}?
                </h3>

                {(direction === "income" || direction === "expense") && (
                  <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                    <label className="text-sm font-medium text-text-primary flex items-center gap-1">
                      {direction === "income"
                        ? "Forma de recebimento"
                        : "Forma de pagamento"}
                      <ContextHelp topic="payment_method" />
                    </label>
                    <FinanceSelect
                      value={paymentMethod}
                      onChange={(val) => setPaymentMethod(val)}
                      options={availablePaymentMethods.map((m) => ({
                        value: m.code,
                        label: m.label,
                      }))}
                      placeholder="Selecione..."
                      allowClear
                      className="h-14 bg-surface-elevated border border-border-subtle rounded-xl text-base"
                    />
                    {paymentMethodWarning && (
                      <div className="text-amber-500 text-xs mt-1 px-1">
                        {paymentMethodWarning}
                      </div>
                    )}
                  </div>
                )}

                {direction === "liability_settlement" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-text-primary flex items-center gap-1">
                        Tipo de Liquidação
                        <ContextHelp topic="liability_settlement" />
                      </label>
                      <FinanceSelect
                        value={settlementType}
                        onChange={(val) => setSettlementType(val as any)}
                        options={[
                          {
                            value: "credit_card_bill",
                            label: "Pagar Fatura de Cartão",
                          },
                          {
                            value: "reimbursement",
                            label: "Reembolsar uma Pessoa",
                          },
                        ]}
                        placeholder="Selecione..."
                        className="h-14 bg-surface-elevated border border-border-subtle rounded-xl text-base"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-text-primary">
                        Passivo a liquidar
                      </label>
                      <FinanceSelect
                        value={liabilityAccountId}
                        onChange={(val) => setLiabilityAccountId(val)}
                        options={accounts
                          .filter((a) => a.nature === "liability")
                          .map((a) => ({
                            value: a.id,
                            label: getAccountLabel(a),
                          }))}
                        placeholder="Selecione o passivo..."
                        className="h-14 bg-surface-elevated border border-border-subtle rounded-xl text-base"
                      />
                      {accounts.find((a) => a.id === liabilityAccountId) && (
                        <AccountRepairCard
                          account={accounts.find(
                            (a) => a.id === liabilityAccountId,
                          )}
                          financeEntityId={activeFinanceEntityId || ""}
                          onRepaired={(repairedAcc) => {
                            setAccounts((prev) =>
                              prev.map((a) =>
                                a.id === repairedAcc.id ? repairedAcc : a,
                              ),
                            );
                            setRepairedAccountIds((prev) => [
                              ...prev,
                              repairedAcc.id,
                            ]);
                            if (pendingSubmitRef.current === "draft") {
                              pendingSubmitRef.current = null;
                              setTimeout(() => handleSaveDraftWithRetryFlag(true), 50);
                            } else if (pendingSubmitRef.current === "submit") {
                              pendingSubmitRef.current = null;
                              setTimeout(() => handleCreateAndSubmitWithRetryFlag(true), 50);
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                    <label className="text-sm font-medium text-text-primary flex items-center gap-1">
                      {direction === "transfer"
                        ? "Da conta de origem (saiu daqui)"
                        : direction === "liability_settlement"
                          ? "Conta de origem (que pagou)"
                          : "Conta"}
                      <ContextHelp topic="account" />
                    </label>
                    {availableAccounts.length > 0 ? (
                      <>
                        <FinanceSelect
                          value={accountId}
                          onChange={(val) => setAccountId(val)}
                          options={availableAccounts.map((a) => ({
                            value: a.id,
                            label: getAccountLabel(a),
                          }))}
                          placeholder="Selecione uma conta..."
                          className="h-14 bg-surface-elevated border border-border-subtle rounded-xl text-base"
                        />
                        {accounts.find((a) => a.id === accountId)?.type === "cash" && (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-medium flex items-center gap-2 mt-2 rounded-xl">
                            <span>Esta é uma conta de Caixa Físico (Dinheiro vivo)</span>
                            <ContextHelp topic="cash_account" />
                          </div>
                        )}
                        {accounts.find((a) => a.id === accountId) && (
                          <AccountRepairCard
                            account={accounts.find((a) => a.id === accountId)}
                            financeEntityId={activeFinanceEntityId || ""}
                            onRepaired={(repairedAcc) => {
                              setAccounts((prev) =>
                                prev.map((a) =>
                                  a.id === repairedAcc.id ? repairedAcc : a,
                                ),
                              );
                              setRepairedAccountIds((prev) => [
                                ...prev,
                                repairedAcc.id,
                              ]);
                              if (pendingSubmitRef.current === "draft") {
                                pendingSubmitRef.current = null;
                                setTimeout(() => handleSaveDraftWithRetryFlag(true), 50);
                              } else if (pendingSubmitRef.current === "submit") {
                                pendingSubmitRef.current = null;
                                setTimeout(() => handleCreateAndSubmitWithRetryFlag(true), 50);
                              }
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <div className="h-14 border border-border-subtle border-dashed rounded-xl px-4 flex items-center text-sm text-amber-500 bg-surface-elevated">
                        Nenhuma conta compatível
                      </div>
                    )}
                  </div>

                  {direction === "transfer" && (
                    <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                      <label className="text-sm font-medium text-text-primary flex items-center gap-1">
                        Para a conta (entrou aqui)
                        <ContextHelp topic="account" />
                      </label>
                      {accounts.length > 0 ? (
                        <>
                          <FinanceSelect
                            value={destinationAccountId}
                            onChange={(val) => setDestinationAccountId(val)}
                            options={accounts
                              .filter((a) => a.id !== accountId)
                              .map((a) => ({
                                value: a.id,
                                label: getAccountLabel(a),
                              }))}
                            placeholder="Selecione o destino..."
                            className="h-14 bg-surface-elevated border border-border-subtle rounded-xl text-base"
                          />
                          {accounts.find(
                            (a) => a.id === destinationAccountId,
                          ) && (
                            <AccountRepairCard
                              account={accounts.find(
                                (a) => a.id === destinationAccountId,
                              )}
                              financeEntityId={activeFinanceEntityId || ""}
                              onRepaired={(repairedAcc) => {
                                setAccounts((prev) =>
                                  prev.map((a) =>
                                    a.id === repairedAcc.id ? repairedAcc : a,
                                  ),
                                );
                                setRepairedAccountIds((prev) => [
                                  ...prev,
                                  repairedAcc.id,
                                ]);
                                if (pendingSubmitRef.current === "draft") {
                                  pendingSubmitRef.current = null;
                                  setTimeout(() => handleSaveDraftWithRetryFlag(true), 50);
                                } else if (pendingSubmitRef.current === "submit") {
                                  pendingSubmitRef.current = null;
                                  setTimeout(() => handleCreateAndSubmitWithRetryFlag(true), 50);
                                }
                              }}
                            />
                          )}
                        </>
                      ) : (
                        <div className="h-14 border border-border-subtle border-dashed rounded-xl px-4 flex items-center text-sm text-amber-500 bg-surface-elevated">
                          Nenhuma conta
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                  <label className="text-sm font-medium text-text-primary flex items-center">
                    Descrição {getReqText('description')}
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      direction === "income"
                        ? "Ex: Dízimo do mês, oferta..."
                        : direction === "transfer"
                          ? "Ex: Dinheiro passado para a caixinha..."
                          : "Ex: Conta de energia, manutenção..."
                    }
                    maxLength={300}
                    className="w-full h-14 bg-surface-elevated border border-border-subtle text-text-primary rounded-xl px-4 outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors text-base placeholder-text-muted/50"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10 mt-2">
                  <button type="button" onClick={() => setShowDetails(!showDetails)} className="text-sm text-accent-primary font-medium flex items-center gap-1 w-fit">
                     {showDetails ? "Ocultar detalhes" : "Mais detalhes (Favorecido, Evidências)"}
                  </button>
                </div>
                
                {showDetails && (
                   <div className="flex flex-col gap-4 mt-2 p-5 bg-surface-secondary/30 rounded-2xl border border-border-subtle/50">
                     <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                       <label className="text-sm font-medium text-text-primary flex items-center">
                         {direction === "income" ? "De quem veio?" : direction === "expense" ? "Quem recebeu ou foi pago?" : "Favorecido/Origem"} {getReqText('counterparty')}
                       </label>
                       <input
                         type="text"
                         value={counterparty}
                         onChange={(e) => setCounterparty(e.target.value)}
                         placeholder="Pessoa, fornecedor, ministério..."
                         maxLength={100}
                         className="w-full h-14 bg-surface-elevated border border-border-subtle text-text-primary rounded-xl px-4 outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors text-base placeholder-text-muted/50"
                       />
                     </div>
                     <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10 mt-4">
                       <label className="text-sm font-medium text-text-primary flex items-center">
                         Comprovantes {getReqTextForEvidence()}
                       </label>
                       <TransactionEvidenceUpload 
                         organizationId={accessState.organizationId || ""}
                         financeEntityId={activeFinanceEntityId || ""}
                         evidenceIds={evidenceIds}
                         onChange={setEvidenceIds}
                       />
                     </div>

                     <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10 mt-4">
                       <label className="text-sm font-medium text-text-primary flex items-center">
                         Justificativa de ausência de comprovante
                       </label>
                       <textarea
                         value={evidenceJustification}
                         onChange={(e) => setEvidenceJustification(e.target.value)}
                         placeholder="Explique por que não existe comprovante..."
                         maxLength={300}
                         className="w-full min-h-[80px] py-3 bg-surface-elevated border border-border-subtle text-text-primary rounded-xl px-4 outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors text-base placeholder-text-muted/50 resize-y"
                       />
                     </div>
                   </div>
                )}
              </div>

              {direction !== "transfer" && (
                <div className="flex flex-col gap-4 mt-8">
                  {/* Bloco 3: Como classificar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-text-muted px-1 uppercase tracking-wider">
                      Como deseja separar esse valor?
                    </h3>
                    {totalCents > 0 ? (
                      <button
                        onClick={() => setIsSplit(!isSplit)}
                        className="h-12 text-sm text-text-primary hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary transition-colors flex items-center justify-center sm:justify-start gap-2 bg-surface-elevated px-4 rounded-xl border border-border-subtle"
                      >
                        <Split className="w-4 h-4" />
                        {isSplit ? "Não dividir" : "Dividir em mais categorias"}
                      </button>
                    ) : (
                      <div className="flex flex-col items-start sm:items-end">
                        <button
                          disabled
                          aria-disabled="true"
                          className="h-12 text-sm text-text-muted bg-surface-base px-4 rounded-xl border border-border-subtle flex items-center gap-2 cursor-not-allowed"
                        >
                          <Split className="w-4 h-4" />
                          Dividir em mais categorias
                        </button>
                        <span className="text-xs text-text-muted mt-1 px-1">
                          Informe o valor total antes de dividir
                        </span>
                      </div>
                    )}
                  </div>

                  {isSplit && totalCents > 0 && targetDiff !== 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-3 rounded-xl flex justify-between text-sm items-center">
                      <span>
                        {targetDiff > 0 ? `Ainda faltam:` : `Passou do valor:`}
                      </span>
                      <span className="font-semibold px-2 bg-amber-500/20 rounded py-0.5">
                        R$ {formatMoneyInput(Math.abs(targetDiff).toString())}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {allocations.map((alloc, i) => (
                      <div
                        key={alloc.id}
                        className="bg-surface-elevated border border-border-subtle rounded-2xl p-5 flex flex-col gap-4"
                      >
                        {isSplit && (
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <label className="text-sm font-medium text-text-primary mb-1 block">
                                Valor
                              </label>
                              <div className="flex items-center gap-2">
                                <span className="text-text-secondary text-base font-medium">
                                  R$
                                </span>
                                <input
                                  inputMode="numeric"
                                  value={formatMoneyInput(alloc.amountRaw)}
                                  onChange={(e) =>
                                    updateAllocationAmount(i, e.target.value)
                                  }
                                  className="w-full h-14 bg-surface-base border border-border-subtle text-text-primary rounded-xl px-4 outline-none focus:border-accent-primary transition-colors text-base font-medium"
                                  placeholder="0,00"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => removeAllocation(i)}
                              disabled={allocations.length <= 1}
                              className="w-14 h-14 mt-6 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-rose-500/10 text-text-muted hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                              title="Remover"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                            <label className="text-sm font-medium text-text-primary flex items-center gap-1">
                              Categoria
                              <ContextHelp topic="category" />
                            </label>
                            {compatibleCategories.length > 0 ? (
                              <FinanceSelect
                                value={alloc.categoryId}
                                onChange={(val) =>
                                  updateAllocation(i, "categoryId", val)
                                }
                                options={compatibleCategories.map((c) => ({
                                  value: c.id,
                                  label: c.name,
                                }))}
                                placeholder="Selecione uma categoria..."
                                className="h-14 bg-surface-base border border-border-subtle rounded-xl text-base"
                              />
                            ) : (
                              <div className="h-14 border border-border-subtle border-dashed rounded-xl px-4 flex items-center justify-center text-sm text-amber-500 bg-surface-base">
                                Nenhuma categoria compatível
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                            <label className="text-sm font-medium text-text-primary flex items-center gap-1">
                              Fundo (opcional)
                              <ContextHelp topic="fund" />
                            </label>
                            {funds.length > 0 ? (
                              <FinanceSelect
                                value={alloc.fundId}
                                onChange={(val) =>
                                  updateAllocation(i, "fundId", val)
                                }
                                options={funds.map((f) => ({
                                  value: f.id,
                                  label: f.name,
                                }))}
                                placeholder="Nenhum fundo"
                                allowClear
                                className="h-14 bg-surface-base border border-border-subtle rounded-xl text-base"
                              />
                            ) : (
                              <div className="h-14 bg-surface-base border border-border-subtle rounded-xl px-4 flex items-center text-sm text-text-muted">
                                Nenhum fundo ativo
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-sm flex items-center gap-2">
                          <label className="text-text-muted font-medium w-32 shrink-0">Centro de Custo</label>
                          <input
                            type="text"
                            value={alloc.costCenterId || ""}
                            onChange={(e) => updateAllocation(i, "costCenterId", e.target.value)}
                            placeholder="Ex: Sede, Filial, Ministério..."
                            className="flex-1 h-10 bg-surface-base border border-border-subtle rounded-lg px-3 text-text-primary outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors text-sm placeholder-text-muted/50"
                          />
                        </div>
                      </div>
                    ))}

                    {isSplit && (
                      <button
                        onClick={addAllocation}
                        className="w-full flex items-center justify-center gap-2 h-14 border border-border-subtle border-dashed rounded-2xl text-text-primary hover:bg-surface-elevated transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                      >
                        <Plus className="w-5 h-5" />
                        Adicionar outra categoria
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-8 sm:mt-12">
                <div className="max-w-xl mx-auto flex flex-col gap-3">
                  <div className="p-4 bg-surface-elevated rounded-2xl border border-border-subtle -mt-2">
                    <p className="text-sm font-medium text-text-primary">
                      {direction === "income"
                        ? "Entrada"
                        : direction === "transfer"
                          ? "Transferência"
                          : direction === "liability_settlement"
                            ? "Liquidação"
                            : "Saída"}{" "}
                      de {formatMoneyInput(totalCents.toString())}
                    </p>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                      {direction === "transfer" ? (
                        <>
                          Origem:{" "}
                          {selectedAccount?.name || (
                            <span className="text-amber-500">Pendente</span>
                          )}
                          <br />
                          Destino:{" "}
                          {selectedDestinationAccount?.name || (
                            <span className="text-amber-500">Pendente</span>
                          )}
                          <br />
                        </>
                      ) : direction === "liability_settlement" ? (
                        <>
                          Conta Pagadora:{" "}
                          {selectedAccount?.name || (
                            <span className="text-amber-500">Pendente</span>
                          )}
                          <br />
                          Liquidação:{" "}
                          {settlementType === "credit_card_bill" ? (
                            "Fatura"
                          ) : settlementType === "reimbursement" ? (
                            "Reembolso"
                          ) : (
                            <span className="text-amber-500">Pendente</span>
                          )}
                          <br />
                        </>
                      ) : (
                        <>
                          Conta:{" "}
                          {selectedAccount?.name || (
                            <span className="text-amber-500">Pendente</span>
                          )}
                          <br />
                          Forma:{" "}
                          {paymentMethod ? (
                            allPaymentMethodsList.find(
                              (p) => p.code === paymentMethod,
                            )?.label
                          ) : (
                            <span className="text-amber-500">Pendente</span>
                          )}
                          <br />
                          Categoria:{" "}
                          {isSplit ? (
                            `${allocations.length} selecionadas`
                          ) : allocations[0].categoryId ? (
                            categories.find(
                              (c) => c.id === allocations[0].categoryId,
                            )?.name
                          ) : (
                            <span className="text-amber-500">Pendente</span>
                          )}
                          <br />
                        </>
                      )}
                      Igreja: {activeFinanceEntityName || activeFinanceEntityId}
                    </p>
                  </div>

                  <div className="sticky bottom-0 bg-surface-base/95 backdrop-blur-md border-t border-border-subtle p-4 pb-[calc(1rem+env(safe-area-inset-bottom,16px))] -mx-4 mt-8 sm:-mx-6 lg:-mx-8 md:static md:bg-transparent md:border-t-0 md:p-0 md:backdrop-blur-none md:mt-4 z-20 flex flex-col gap-3">
                    {hasEffectiveCapability(
                      accessState,
                      "finance.submit_for_review",
                    ) ? (
                      <>
                      {!readiness.ready && (
                        <div className="bg-surface-elevated border border-border-subtle rounded-2xl p-4 flex flex-col gap-3 mb-2 shadow-sm">
                          <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Faltam {readiness.findings.length} informações para enviar à revisão</span>
                          </div>
                          <div className="flex flex-col gap-2">
                            {readiness.findings.map((f, i) => (
                               <button key={i} onClick={() => {
                                 setShowDetails(true);
                                 window.scrollTo({ top: 0, behavior: 'smooth' });
                               }} className="text-left text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center justify-between group">
                                 <span>{f.message}</span>
                                 <span className="text-xs px-2 py-1 bg-surface-base rounded opacity-0 group-hover:opacity-100 transition-opacity">Preencher</span>
                               </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={handleCreateAndSubmit}
                        disabled={saving || !readiness.ready}
                        className="w-full h-14 flex items-center justify-center gap-2 bg-text-primary text-surface-base rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base text-base"
                      >
                        {saving ? (
                          <>
                            <div className="w-5 h-5 border-2 border-background-base/30 border-t-background-base rounded-full animate-spin" />
                            <span>Enviando...</span>
                          </>
                        ) : (
                          "Enviar para revisão"
                        )}
                      </button>
                      </>
                    ) : null}

                    <button
                      onClick={handleSaveDraft}
                      disabled={saving}
                      className={`w-full h-14 flex items-center justify-center gap-2 rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base text-sm ${hasEffectiveCapability(accessState, "finance.submit_for_review") ? "bg-transparent text-text-secondary hover:bg-surface-elevated" : "bg-surface-elevated text-text-primary hover:bg-surface-secondary border border-border-subtle"}`}
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        "Salvar como rascunho"
                      )}
                    </button>
                  </div>

                  <div className="mt-4 p-3.5 bg-surface-base rounded-2xl border border-border-subtle flex flex-col gap-2">
                    <span className="text-xs text-text-muted font-medium block">Entenda o fluxo do sistema:</span>
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2 items-start">
                        <div className="mt-0.5"><ContextHelp topic="draft" /></div>
                        <div className="text-xs text-text-secondary">
                          <strong className="block text-text-primary mb-0.5">Rascunho</strong>
                          Você pode salvar e continuar depois. Não altera o saldo.
                        </div>
                      </div>
                      <div className="flex gap-2 items-start">
                        <div className="mt-0.5"><ContextHelp topic="review" /></div>
                        <div className="text-xs text-text-secondary">
                          <strong className="block text-text-primary mb-0.5">Em revisão</strong>
                          Um responsável confere os dados. Ainda não altera o saldo.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
