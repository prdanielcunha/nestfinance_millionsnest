import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Landmark,
  Layers,
  AlertCircle,
  AlertTriangle,
  ShieldX,
  Wallet,
  ShieldCheck,
  Lock,
  FileClock,
  User,
  RefreshCw,
  CheckCircle2,
  PenSquare,
} from "lucide-react";
import { APP_ROUTES } from "@/src/app/router/routes";
import { useAuth } from "@/src/hooks/useAuth";
import { useFinanceEntity } from "@/src/contexts/FinanceEntityContext";
import { useTransactions } from "@/src/hooks/finance/useTransactions";
import { FinanceContextGuard } from "@/src/components/finance/FinanceContextGuard";
import { FinanceEntityContextBar } from "@/src/components/finance/FinanceEntityContextBar";
import { hasEffectiveCapability } from "@/src/lib/permissions";
import { TransactionActionPanel, TransactionNextStep } from "@/src/components/finance/TransactionActionPanel";

const formatBRLCents = (cents: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100).replace(/\u00A0/g, ' '); // ensure normal space
};

export default function TransactionDetailPage() {
  const { accessState } = useAuth();

  if (
    accessState.status === "initializing" ||
    accessState.status === "authenticated_unresolved"
  ) {
    return null;
  }

  if (!hasEffectiveCapability(accessState, "finance.view")) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <ShieldX className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Acesso Negado
        </h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">
          Você não tem permissão para visualizar estas movimentações.
        </p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <TransactionDetailContent />
    </FinanceContextGuard>
  );
}

function TransactionDetailContent() {
  const navigate = useNavigate();
  const { transactionId } = useParams<{ transactionId: string }>();
  const { activeFinanceEntityId } = useFinanceEntity();
  const {
    getTransactionDetail,
    updateDraft,
    submitForReview,
    returnToDraft,
    approveForPosting,
    invalidateApproval,
    getPostingPlanPreview
  } = useTransactions();
  const { accessState } = useAuth();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const isReviewMode = searchParams.get("reviewMode") === "true";

  const [returningToDraft, setReturningToDraft] = useState(false);
  const [approving, setApproving] = useState(false);
  const [returnReason, setReturnReason] = useState("need_correction");
  const [returnComment, setReturnComment] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const submitIdempotencyKeyRef = useRef<string | null>(null);

  const epochRef = useRef(0);

  useEffect(() => {
    let abortController = new AbortController();
    setData(null);
    idempotencyKeyRef.current = null;
    submitIdempotencyKeyRef.current = null;
    setSubmitModalOpen(false);
    setSubmitting(false);
    setSubmitError(null);

    if (activeFinanceEntityId && transactionId) {
      loadData(abortController.signal, ++epochRef.current);
    }

    return () => {
      abortController.abort();
    };
  }, [activeFinanceEntityId, transactionId]);

  const handleSubmitForReview = async () => {
    if (submitting || !data?.transaction) return;

    setSubmitError(null);
    setSubmitting(true);

    if (!submitIdempotencyKeyRef.current) {
      submitIdempotencyKeyRef.current =
        "idsm_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
    }

    try {
      const currentVersion = data.transaction.version;
      const reqId =
        "req_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);

      const res = await submitForReview(
        data.transaction.id,
        currentVersion,
        submitIdempotencyKeyRef.current,
        reqId,
      );

      submitIdempotencyKeyRef.current = null;
      setSubmitModalOpen(false);
      setData((prev: any) => ({
        ...prev,
        transaction: {
          ...prev.transaction,
          status: "ready_for_review",
          version: res.version,
        },
      }));
    } catch (err: any) {
      let msg = err.message || "Erro ao enviar para revisão";
      if (msg.includes("FINANCE_VERSION_CONFLICT")) {
        msg = "Esta movimentação foi alterada em outro lugar.";
      } else if (msg.includes("FINANCE_ALLOCATION_TOTAL_MISMATCH")) {
        msg =
          "A divisão não fecha o valor total. Edite o rascunho antes de enviar.";
      } else if (msg.includes("FINANCE_INVALID_STATE_TRANSITION")) {
        msg = "Esta movimentação não está mais disponível para envio.";
      } else if (msg.includes("FINANCE_ACCOUNT_MISMATCH")) {
        msg = "A conta selecionada não é mais válida para esta igreja.";
      } else if (msg.includes("FINANCE_CATEGORY_MISMATCH")) {
        msg = "Uma das categorias não é mais válida para esta movimentação.";
      } else if (msg.includes("FINANCE_FUND_MISMATCH")) {
        msg = "Um dos fundos não é mais válido para esta igreja.";
      } else if (msg.includes("FINANCE_IDEMPOTENCY_CONFLICT")) {
        msg =
          "Esta tentativa não pode ser repetida com informações diferentes.";
      } else if (msg.includes("permission") || msg.includes("FORBIDDEN")) {
        msg =
          "Você não tem permissão para enviar esta movimentação para revisão.";
      } else {
        msg =
          "Não foi possível confirmar se a movimentação foi enviada. Tente novamente com segurança.";
      }
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnToDraft = async () => {
    if (returningToDraft || !data?.transaction) return;
    setReturningToDraft(true);
    setError(null);
    setActionError(null);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        "idre_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
    }

    try {
      const currentVersion = data.transaction.version;
      const reqId =
        "req_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);

      let res;
      if (data.transaction.status === "approved_for_posting") {
        res = await invalidateApproval(
          data.transaction.id,
          currentVersion,
          data.transaction.approvalSourceHash || "",
          returnReason,
          returnComment,
          idempotencyKeyRef.current,
          reqId,
        );
      } else if (data.transaction.status === "ready_for_review") {
        if (returnReason) {
           res = await returnToDraft(
             data.transaction.id,
             currentVersion,
             returnReason,
             returnComment,
             idempotencyKeyRef.current,
             reqId,
           );
        } else {
           const payload = { intent: "return_to_draft" };
           res = await updateDraft(
             data.transaction.id,
             currentVersion,
             payload,
             idempotencyKeyRef.current,
             reqId,
           );
        }
      } else {
        const payload = { intent: "return_to_draft" };
        res = await updateDraft(
          data.transaction.id,
          currentVersion,
          payload,
          idempotencyKeyRef.current,
          reqId,
        );
      }

      idempotencyKeyRef.current = null;
      setData((prev: any) => ({
        ...prev,
        transaction: {
          ...prev.transaction,
          status: "draft",
          version: res.version || prev.transaction.version + 1,
          returnReasonCode: returnReason,
          returnReasonText: returnComment,
        },
      }));
      setShowReturnForm(false);
      setReturnSuccess(true);
      if (!isReviewMode) {
        navigate(
          APP_ROUTES.transactionEdit.replace(
            ":transactionId",
            data.transaction.id,
          ),
        );
      }
    } catch (err: any) {
      if (isReviewMode)
        setActionError(err.message || "Erro ao reabrir movimentação");
      else setError(err.message || "Erro ao reabrir movimentação");
    } finally {
      setReturningToDraft(false);
    }
  };

  const handleApprove = async () => {
    if (approving || !data?.transaction) return;
    setApproving(true);
    setActionError(null);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        "idap_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
    }

    try {
      const currentVersion = data.transaction.version;
      const reqId =
        "req_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);

      await approveForPosting(
        data.transaction.id,
        currentVersion,
        undefined,
        idempotencyKeyRef.current,
        reqId,
      );

      idempotencyKeyRef.current = null;
      navigate(APP_ROUTES.financeReview);
    } catch (err: any) {
      setActionError(err.message || "Erro ao aprovar movimentação");
    } finally {
      setApproving(false);
    }
  };

  const [postingPlanPreview, setPostingPlanPreview] = useState<any>(null);
  const [humanExplanation, setHumanExplanation] = useState<string[]>([]);
  const [sealStatus, setSealStatus] = useState<string | null>(null);
  const [loadingPostingPlan, setLoadingPostingPlan] = useState(false);

  const loadData = async (signal?: AbortSignal, currentEpoch?: number) => {
    setLoading(true);
    setError(null);
    setSealStatus(null);
    setPostingPlanPreview(null);
    setHumanExplanation([]);

    try {
      const res = await getTransactionDetail(transactionId!);

      if (
        signal?.aborted ||
        (currentEpoch && currentEpoch !== epochRef.current)
      )
        return;

      setData(res);

      if (res?.transaction?.status === 'approved_for_posting') {
         setLoadingPostingPlan(true);
         try {
            const planRes = await getPostingPlanPreview(res.transaction.id);
            setPostingPlanPreview(planRes.plan);
            setHumanExplanation(planRes.humanExplanation || []);
            setSealStatus(planRes.sealStatus);
         } catch (e: any) {
            console.error("Failed to load posting plan preview", e);
            setSealStatus('network_error');
         } finally {
            setLoadingPostingPlan(false);
         }
      }

    } catch (err: any) {
      if (
        signal?.aborted ||
        (currentEpoch && currentEpoch !== epochRef.current)
      )
        return;

      if (err.message.includes("permission")) {
        setError("FORBIDDEN");
      } else if (err.message.includes("financeEntityId is required")) {
        setError("FINANCE_ENTITY_REQUIRED");
      } else if (err.message.includes("mismatch")) {
        setError("FINANCE_ENTITY_MISMATCH");
      } else {
        setError(err.message || "Erro desconhecido");
      }
    } finally {
      if (
        signal?.aborted ||
        (currentEpoch && currentEpoch !== epochRef.current)
      )
        return;
      setLoading(false);
    }
  };

  const translateStatus = (st: string) => {
    const dict: Record<string, string> = {
      draft: "Rascunho",
      ready_for_review: "Pronto para revisão",
      approved_for_posting: "Aprovado para Lançamento (Não Registrado)",
      posted: "Registrado",
      reversed: "Revertido",
    };
    return dict[st] || st;
  };

  const translateDirection = (dir: string) => {
    if (dir === "income") return "Entrada";
    if (dir === "expense") return "Saída";
    if (dir === "transfer") return "Transferência";
    if (dir === "liability_settlement") return "Acerto/Repasse";
    return dir;
  };

  const translateSettlementType = (type: string) => {
    const dict: Record<string, string> = {
      full_amortization: "Amortização Total",
      partial_amortization: "Amortização Parcial",
      interest_only: "Apenas Juros",
      refinancing: "Refinanciamento",
    };
    return dict[type] || type;
  };

  const translateMethod = (method: string) => {
    const dict: Record<string, string> = {
      cash: "Dinheiro",
      pix: "Pix",
      bank_transfer: "Transferência Bancária",
      credit_card: "Cartão de Crédito",
      debit_card: "Cartão de Débito",
      check: "Cheque",
    };
    return dict[method] || method;
  };

  const formatMoney = (cents: number, dir?: string) => {
    const str = (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    if (dir === "expense") return "-" + str;
    if (dir === "income") return "+" + str;
    return str;
  };

  if (error === "FORBIDDEN") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <ShieldX className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Acesso Negado
        </h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">
          Você não tem permissão para visualizar estas movimentações.
        </p>
      </main>
    );
  }

  if (error === "FINANCE_ENTITY_REQUIRED") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-surface-secondary rounded-2xl flex items-center justify-center mb-6 text-text-muted border border-border-subtle">
          <Landmark className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Selecione uma igreja para continuar.
        </h3>
      </main>
    );
  }

  if (error === "FINANCE_ENTITY_MISMATCH") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Movimentação inválida
        </h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">
          Esta movimentação não pertence à igreja selecionada.
        </p>
        <button
          onClick={() => navigate(APP_ROUTES.transactions)}
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
        >
          Voltar para listagem
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-surface-base font-sans">
      <FinanceEntityContextBar areaName="Detalhes" />
      <header className="shrink-0 max-w-2xl w-full mx-auto p-4 flex items-center gap-4 border-b border-border-subtle">
        <button
          onClick={() => navigate(APP_ROUTES.transactions)}
          className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-surface-elevated text-text-secondary transition-colors -ml-4"
          aria-label="Voltar para listagem de movimentações"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            Detalhes
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-6 pb-[env(safe-area-inset-bottom)]">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
              <p className="text-sm text-red-500 mb-4">
                Não foi possível carregar as movimentações.
              </p>
              <button
                onClick={() => loadData(undefined, epochRef.current)}
                className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-6 w-full animate-pulse">
              <div className="h-6 bg-surface-secondary rounded w-1/3 mx-auto"></div>
              <div className="h-10 bg-surface-secondary rounded w-1/2 mx-auto"></div>
              <div className="h-64 bg-surface-elevated border border-border-subtle rounded-2xl"></div>
            </div>
          )}

          {!loading &&
            !error &&
            data &&
            (() => {
              if (returnSuccess) {
                 return (
                    <div className="bg-surface-elevated border border-border-subtle rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-4">
                      <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center text-rose-500 mb-2">
                        <AlertCircle className="w-8 h-8" />
                      </div>
                      <h2 className="text-xl font-bold text-text-primary">Movimentação devolvida para correção</h2>
                      <p className="text-sm text-text-secondary max-w-sm">
                        Ela está agora em Rascunhos e correções. Nenhum lançamento contábil foi realizado.
                      </p>
                      
                      <div className="bg-surface-secondary border border-border-subtle rounded-xl p-4 mt-2 mb-4 w-full text-left">
                         <span className="text-xs text-text-muted font-bold uppercase tracking-wider block mb-1">Motivo informado:</span>
                         <p className="text-sm text-text-primary">{returnComment || 'Nenhum comentário adicional'}</p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 w-full">
                         <button
                           onClick={() => navigate(APP_ROUTES.transactionEdit.replace(':transactionId', data.transaction.id))}
                           className="flex-1 h-12 flex items-center justify-center bg-accent-primary hover:bg-accent-hover text-white rounded-xl font-medium transition-colors text-sm"
                         >
                           Abrir para corrigir
                         </button>
                         <button
                           onClick={() => navigate(APP_ROUTES.financeReview)}
                           className="flex-1 h-12 flex items-center justify-center bg-surface-base border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-xl font-medium transition-colors text-sm"
                         >
                           Voltar à Central de Revisões
                         </button>
                      </div>
                    </div>
                 );
              }

              const tx = data.transaction;
              const allocs = data.allocations || [];
              const sumAllocations = allocs.reduce(
                (acc: number, item: any) => acc + (item.amountCents || 0),
                0,
              );
              const isBalanced = sumAllocations === tx.amountCents;

              let nextStep: TransactionNextStep | null = null;
              
              if (tx.status === "draft") {
                const pendingFindings = [];
                if (!tx.amountCents) pendingFindings.push({ code: 'val', severity: 'blocking', message: 'Informe o valor da movimentação' });
                if (!tx.accountId) pendingFindings.push({ code: 'acc', severity: 'blocking', message: 'Escolha uma conta' });
                if (!tx.paymentMethod) pendingFindings.push({ code: 'pay', severity: 'blocking', message: 'Informe a forma de pagamento' });
                if (allocs.length === 0 || !isBalanced) pendingFindings.push({ code: 'bal', severity: 'blocking', message: 'A divisão ainda não fecha o valor total' });
                if (allocs.some((a: any) => !a.categoryId)) pendingFindings.push({ code: 'cat', severity: 'blocking', message: 'Escolha uma categoria para todos os rateios' });
                
                if (pendingFindings.length > 0) {
                  nextStep = {
                    status: 'draft_incomplete',
                    title: 'Movimentação salva',
                    message: 'Ela ainda não alterou o saldo. Faltam informações antes de enviar para revisão.',
                    affectsBalance: false,
                    pendingFindings: pendingFindings as any,
                    primaryAction: {
                      label: 'Completar pendências',
                      icon: <PenSquare className="w-4 h-4" />,
                      action: () => navigate(APP_ROUTES.transactionEdit.replace(':transactionId', tx.id)),
                    },
                    secondaryActions: [
                      { label: 'Voltar para Finance', action: () => navigate(APP_ROUTES.finance) },
                      { label: 'Registrar outra', action: () => navigate(APP_ROUTES.transactionCreate) }
                    ]
                  };
                } else {
                  nextStep = {
                    status: 'draft_complete',
                    title: 'Movimentação salva',
                    message: 'Ela ainda não alterou o saldo e está pronta para ser enviada para revisão.',
                    affectsBalance: false,
                    pendingFindings: [],
                    primaryAction: {
                      label: 'Enviar para revisão',
                      action: () => setSubmitModalOpen(true),
                    },
                    secondaryActions: [
                      { label: 'Editar rascunho', action: () => navigate(APP_ROUTES.transactionEdit.replace(':transactionId', tx.id)), primary: true },
                      { label: 'Voltar para Finance', action: () => navigate(APP_ROUTES.finance) }
                    ]
                  };
                }
              } else if (tx.status === "ready_for_review") {
                 nextStep = {
                   status: 'ready_for_review',
                   title: 'Enviada para revisão',
                   message: 'Ela ainda não alterou o saldo.',
                   affectsBalance: false,
                   pendingFindings: [],
                   primaryAction: hasEffectiveCapability(accessState, "finance.review") ? {
                     label: approving ? 'Aprovando...' : 'Aprovar para lançamento',
                     disabled: approving || (data.reviewReadiness && !data.reviewReadiness.ready),
                     action: handleApprove
                   } : undefined,
                   secondaryActions: [
                     { label: 'Voltar para Finance', action: () => navigate(APP_ROUTES.finance) },
                     { label: 'Registrar outra', action: () => navigate(APP_ROUTES.transactionCreate) }
                   ]
                 };
                 if (isReviewMode && hasEffectiveCapability(accessState, "finance.review")) {
                    nextStep.secondaryActions.unshift({
                       label: 'Devolver para correção',
                       action: () => setShowReturnForm(true),
                       primary: true
                    });
                 }
              } else if (tx.status === "approved_for_posting") {
                 if (sealStatus && sealStatus !== 'verified') {
                   nextStep = {
                     status: 'approval_stale',
                     title: 'Aprovação inválida',
                     message: 'Os dados mudaram desde a última aprovação.',
                     affectsBalance: false,
                     pendingFindings: [],
                     primaryAction: {
                       label: 'Corrigir e reenviar',
                       disabled: returningToDraft,
                       action: () => {
                         setReturnReason('need_correction');
                         setReturnComment('Aprovação invalidada pois os dados mudaram. Revisão e correção necessárias.');
                         handleReturnToDraft();
                       }
                     },
                     secondaryActions: [
                       { label: 'Voltar para Finance', action: () => navigate(APP_ROUTES.finance) }
                     ]
                   };
                 } else {
                   nextStep = {
                     status: 'approved_for_posting',
                     title: 'Aprovada para lançamento',
                     message: 'Ela ainda não foi lançada e não alterou o saldo.',
                     affectsBalance: false,
                     pendingFindings: [],
                     secondaryActions: [
                       { label: 'Voltar para Finance', action: () => navigate(APP_ROUTES.finance) },
                       { label: 'Registrar outra', action: () => navigate(APP_ROUTES.transactionCreate) }
                     ]
                   };
                 }
              }

              return (
                <>
                  {nextStep && <TransactionActionPanel nextStep={nextStep} />}

                  <div className="text-center flex flex-col items-center gap-2">
                    <span className="text-sm font-medium text-text-secondary">
                      {translateDirection(tx.direction)} •{" "}
                      {translateStatus(tx.status)}
                    </span>
                    <h2
                      className={`text-4xl lg:text-5xl font-semibold tracking-tight ${tx.direction === "income" ? "text-teal-500" : "text-text-primary"}`}
                    >
                      {formatMoney(tx.amountCents, tx.direction)}
                    </h2>
                    <p className="text-text-secondary">
                      {tx.occurredAt &&
                      !isNaN(new Date(tx.occurredAt).getTime())
                        ? new Date(tx.occurredAt).toLocaleDateString("pt-BR", {
                            dateStyle: "long",
                          })
                        : "Data de atualização indisponível"}
                    </p>
                  </div>

                  <div className="bg-surface-elevated border border-border-subtle rounded-2xl overflow-hidden mt-2">
                    <div className="p-5 flex flex-col gap-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="col-span-full md:col-span-2">
                          <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                            Descrição
                          </p>
                          <p className="text-sm text-text-primary">
                            {tx.description || <span className="text-text-muted italic">Sem descrição</span>}
                          </p>
                        </div>
                        {tx.counterparty && (
                          <div className="col-span-full md:col-span-1">
                            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                              Favorecido / Origem
                            </p>
                            <p className="text-sm text-text-primary">
                              {tx.counterparty}
                            </p>
                          </div>
                        )}
                        {tx.evidenceJustification && (
                          <div className="col-span-full">
                            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                              Justificativa de ausência de comprovante
                            </p>
                            <p className="text-sm text-text-primary">
                              {tx.evidenceJustification}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-border-subtle pt-4">
                        {tx.transactionKind === "transfer" ? (
                          <>
                            <div>
                              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Conta de Origem</p>
                              <p className="text-sm text-text-primary flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-text-muted" />
                                {tx.accountSnapshot?.name || tx.accountName || <span className="text-text-muted italic">Não informado</span>}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Conta de Destino</p>
                              <p className="text-sm text-text-primary flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-text-muted" />
                                {tx.destinationAccountSnapshot?.name || <span className="text-text-muted italic">Não informado</span>}
                              </p>
                            </div>
                          </>
                        ) : tx.transactionKind === "liability_settlement" ? (
                          <>
                            <div>
                              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Conta de Origem</p>
                              <p className="text-sm text-text-primary flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-text-muted" />
                                {tx.accountSnapshot?.name || tx.accountName || <span className="text-text-muted italic">Não informado</span>}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Passivo Liquidado</p>
                              <p className="text-sm text-text-primary flex items-center gap-2">
                                <Layers className="w-4 h-4 text-text-muted" />
                                {tx.liabilityAccountSnapshot?.name || <span className="text-text-muted italic">Não informado</span>}
                              </p>
                            </div>
                            {tx.settlementType && (
                              <div>
                                <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Tipo de Acerto</p>
                                <p className="text-sm text-text-primary font-medium">{translateSettlementType(tx.settlementType)}</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <div>
                            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Conta</p>
                            <p className="text-sm text-text-primary flex items-center gap-2">
                              <Landmark className="w-4 h-4 text-text-muted" />
                              {tx.accountSnapshot?.name || tx.accountName || <span className="text-text-muted italic">Não informado</span>}
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Forma</p>
                          <p className="text-sm text-text-primary flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-text-muted" />
                            {tx.paymentMethod ? translateMethod(tx.paymentMethod) : <span className="text-text-muted italic">Não informado</span>}
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Favorecido/Origem</p>
                          <p className="text-sm text-text-primary flex items-center gap-2">
                            <User className="w-4 h-4 text-text-muted" />
                            {tx.counterparty || <span className="text-text-muted italic">Não informado</span>}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Evidências</p>
                          <p className="text-sm text-text-primary flex items-center gap-2">
                            <FileClock className="w-4 h-4 text-text-muted" />
                            {tx.evidenceIds?.length > 0 ? `${tx.evidenceIds.length} anexo(s)` : <span className="text-text-muted italic">Nenhuma evidência</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                      {allocs.length === 1
                        ? "Classificação do valor"
                        : "Como o valor foi classificado"}
                    </h3>

                    {!isBalanced && (
                      <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex gap-3 text-rose-500 items-start">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">
                          Os rateios divergem do total. Total da movimentação:{" "}
                          {formatMoney(tx.amountCents)}, Rateado:{" "}
                          {formatMoney(sumAllocations)}.
                        </p>
                      </div>
                    )}

                    <div className="bg-surface-elevated border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle">
                      {allocs.length === 0 && (
                        <div className="p-4 text-sm text-text-muted text-center">
                          Nenhum rateio cadastrado.
                        </div>
                      )}
                      {allocs.map((alloc: any) => (
                        <div
                          key={alloc.id}
                          className="p-4 flex flex-col gap-3"
                        >
                          <div className="flex justify-between items-start">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 flex-1 pr-4">
                              <div>
                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-0.5">Categoria</span>
                                <span className="text-sm font-medium text-text-primary">
                                  {alloc.categorySnapshot?.name || alloc.categoryName || <span className="text-text-muted italic font-normal">Não informado</span>}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-0.5">Fundo</span>
                                <span className="text-sm text-text-primary">
                                  {alloc.fundSnapshot?.name || alloc.fundName || <span className="text-text-muted italic">Não informado</span>}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-0.5">Centro de custo</span>
                                <span className="text-sm text-text-primary">
                                  {alloc.costCenterId ? (alloc.costCenterSnapshot?.name || alloc.costCenterName || alloc.costCenterId) : <span className="text-text-muted italic">Não se aplica</span>}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-0.5">Competência</span>
                                <span className="text-sm text-text-primary">
                                  {alloc.competenceDate ? new Date(alloc.competenceDate).toLocaleDateString("pt-BR", { month: 'short', year: 'numeric' }) : <span className="text-text-muted italic">Não informada</span>}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-medium text-text-primary shrink-0">
                              {formatMoney(alloc.amountCents)}
                            </span>
                          </div>
                        </div>
                      ))}
                      {allocs.length > 0 && isBalanced && (
                        <div className="bg-surface-secondary/50 p-3 flex items-center justify-between border-t border-border-subtle text-xs font-medium text-text-secondary px-4">
                          <span>Total dividido</span>
                          <span>{formatMoney(sumAllocations)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Automatic Checklist & Accounting Effect */}
                  {isReviewMode && data.reviewReadiness && (
                    <div className="flex flex-col gap-3">
                      <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                        Resultado da Conferência
                      </h3>

                      {/* Accounting Effect */}
                      <div className="bg-surface-elevated border border-border-subtle rounded-2xl p-5 flex flex-col gap-2">
                        <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
                          Efeito financeiro previsto
                        </p>
                        <p className="text-sm text-text-primary font-medium">
                          {data.accountingEffect || "Nenhum efeito contabilizado"}
                        </p>
                      </div>

                      {data.reviewReadiness && (data.reviewReadiness.blockers?.length > 0 || data.reviewReadiness.warnings?.length > 0) ? (
                        <div className="flex flex-col gap-2">
                          {data.reviewReadiness.blockers?.map((b: any, i: number) => (
                            <div key={`blocker-${i}`} className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 items-start">
                              <div className="bg-rose-100 p-1.5 rounded-lg text-rose-600 mt-0.5 shrink-0">
                                <AlertCircle className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-bold text-rose-800 uppercase tracking-wide">Bloqueio</h4>
                                  <span className="text-[10px] font-mono text-rose-600/70 bg-rose-100 px-1.5 py-0.5 rounded truncate">{b.code}</span>
                                </div>
                                <p className="text-sm text-rose-700 leading-relaxed font-medium">{b.details}</p>
                              </div>
                            </div>
                          ))}
                          
                          {data.reviewReadiness.warnings?.map((w: any, i: number) => (
                            <div key={`warning-${i}`} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
                              <div className="bg-amber-100 p-1.5 rounded-lg text-amber-600 mt-0.5 shrink-0">
                                <AlertTriangle className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-bold text-amber-800 uppercase tracking-wide">Aviso</h4>
                                  <span className="text-[10px] font-mono text-amber-600/70 bg-amber-100 px-1.5 py-0.5 rounded truncate">{w.code}</span>
                                </div>
                                <p className="text-sm text-amber-700 leading-relaxed font-medium">{w.details}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : data.reviewReadiness?.ready ? (
                        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex gap-3 items-start">
                          <div className="bg-teal-100 p-1.5 rounded-lg text-teal-600 mt-0.5 shrink-0">
                            <ShieldCheck className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-teal-800 mb-1">Pronto para aprovação</h4>
                            <p className="text-sm text-teal-700 leading-relaxed">Nenhuma pendência ou aviso encontrado nesta movimentação.</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Posting Plan Preview */}
                  {tx.status === "approved_for_posting" && (
                    <div className="flex flex-col gap-3 mt-4">
                      <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider flex items-center justify-between">
                        <span>Prévia do Lançamento Contábil</span>
                        <span className="bg-amber-500/10 text-amber-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-amber-500/20">Somente prévia</span>
                      </h3>
                      <div className="bg-surface-elevated border border-border-subtle rounded-2xl p-5 flex flex-col gap-4 text-sm">
                        {loadingPostingPlan ? (
                          <div className="flex items-center gap-2 text-text-muted">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Calculando plano contábil e verificando selo de aprovação...</span>
                          </div>
                        ) : sealStatus === 'seal_missing' ? (
                           <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex flex-col gap-2 text-sm text-rose-500">
                             <div className="flex items-center gap-2 font-medium">
                               <AlertCircle className="w-5 h-5 shrink-0" />
                               <span>Selo de aprovação ausente</span>
                             </div>
                             <p>Esta aprovação foi criada antes da validação final do plano contábil.<br/>Revise e aprove novamente para continuar.</p>
                           </div>
                        ) : sealStatus === 'transaction_stale' ? (
                           <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex flex-col gap-2 text-sm text-rose-500">
                             <div className="flex items-center gap-2 font-medium">
                               <AlertCircle className="w-5 h-5 shrink-0" />
                               <span>A movimentação mudou depois da aprovação.</span>
                             </div>
                             <p>Revise e aprove novamente.</p>
                           </div>
                        ) : sealStatus === 'references_changed' ? (
                           <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col gap-2 text-sm text-amber-600">
                             <div className="flex items-center gap-2 font-medium">
                               <AlertCircle className="w-5 h-5 shrink-0" />
                               <span>Configuração contábil alterada</span>
                             </div>
                             <p>A configuração contábil mudou depois da aprovação. Revise e aprove novamente antes de lançar.</p>
                           </div>
                        ) : sealStatus === 'plan_mismatch' ? (
                           <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex flex-col gap-2 text-sm text-rose-500">
                             <div className="flex items-center gap-2 font-medium">
                               <AlertCircle className="w-5 h-5 shrink-0" />
                               <span>Plano contábil diverge do aprovado</span>
                             </div>
                             <p>Houve uma mudança nos dados que impede o lançamento seguro. Revise e aprove novamente.</p>
                           </div>
                        ) : sealStatus === 'network_error' ? (
                           <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex flex-col gap-2 text-sm text-rose-500">
                             <div className="flex items-center gap-2 font-medium">
                               <AlertCircle className="w-5 h-5 shrink-0" />
                               <span>Erro ao carregar prévia</span>
                             </div>
                             <p>Não foi possível comunicar-se com o motor contábil.</p>
                           </div>
                        ) : sealStatus === 'verified' && postingPlanPreview ? (
                          <>
                            <div className="flex items-center gap-2 text-teal-600 bg-teal-500/10 px-3 py-2 rounded-lg border border-teal-500/20 text-xs font-medium w-max mb-2">
                               <CheckCircle2 className="w-4 h-4" />
                               Plano contábil conferido com a aprovação
                            </div>

                            {postingPlanPreview.blockers && postingPlanPreview.blockers.length > 0 && (
                              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex flex-col gap-2 text-sm text-rose-500">
                                 <div className="flex items-center gap-2 font-medium">
                                   <AlertCircle className="w-5 h-5 shrink-0" />
                                   <span>Pendências impeditivas detectadas</span>
                                 </div>
                                 <ul className="list-disc list-inside ml-2">
                                   {postingPlanPreview.blockers.map((b: any, i: number) => (
                                     <li key={i}>{b.code} - {b.details}</li>
                                   ))}
                                 </ul>
                              </div>
                            )}

                            {postingPlanPreview.journalEntry && (
                              <>
                                {humanExplanation.length > 0 && (
                                   <div className="flex flex-col gap-2 bg-surface-base p-4 rounded-xl border border-border-subtle">
                                      <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">Tradução Contábil</span>
                                      <ul className="list-disc list-inside text-text-secondary space-y-1">
                                        {humanExplanation.map((line, idx) => (
                                          <li key={idx}>{line}</li>
                                        ))}
                                      </ul>
                                   </div>
                                )}

                                {postingPlanPreview.accountEffects && postingPlanPreview.accountEffects.length > 0 && (
                                  <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                                    <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Contas Financeiras Afetadas</span>
                                    {postingPlanPreview.accountEffects.map((eff: any, i: number) => {
                                      let label = "";
                                      let colorClass = "text-text-primary";
                                      if (eff.reason === 'income_received' || eff.reason === 'transfer_in') {
                                        label = "Entrada na conta";
                                        colorClass = "text-teal-500";
                                      } else if (eff.reason === 'expense_paid' || eff.reason === 'transfer_out') {
                                        label = "Saída da conta";
                                        colorClass = "text-rose-500";
                                      } else if (eff.reason === 'liability_created') {
                                        label = "Obrigação criada";
                                        colorClass = "text-amber-500";
                                      } else if (eff.reason === 'liability_settled') {
                                        label = "Obrigação reduzida";
                                        colorClass = "text-teal-500";
                                      } else {
                                        label = eff.effect === 'increase' ? "Aumenta" : "Diminui";
                                        colorClass = eff.effect === 'increase' ? "text-teal-500" : "text-rose-500";
                                      }
                                      
                                      return (
                                        <div key={i} className="flex justify-between items-center bg-surface-base border border-border-subtle p-3 rounded-lg">
                                          <div className="flex flex-col">
                                            <span className="text-text-primary font-medium">{eff.financeAccountId}</span>
                                            <span className={`text-[10px] uppercase font-bold tracking-wider ${colorClass}`}>{label}</span>
                                          </div>
                                          <span className="font-medium whitespace-nowrap">
                                            {formatBRLCents(eff.amountCents)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {postingPlanPreview.fundEffects && postingPlanPreview.fundEffects.length > 0 && (
                                  <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                                    <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Fundos Afetados</span>
                                    {postingPlanPreview.fundEffects.map((eff: any, i: number) => {
                                      let label = "";
                                      if (eff.effect === 'increase') label = "Aumento no fundo";
                                      else if (eff.effect === 'decrease') label = "Redução no fundo";
                                      
                                      return (
                                        <div key={i} className="flex justify-between items-center bg-surface-base border border-border-subtle p-3 rounded-lg">
                                          <div className="flex flex-col">
                                            <span className="text-text-primary font-medium">{eff.fundId || "Não informado"}</span>
                                            {label && <span className="text-[10px] text-text-muted uppercase">{label}</span>}
                                          </div>
                                          <span className="font-medium whitespace-nowrap">
                                            {formatBRLCents(eff.amountCents)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                <details className="text-[11px] group mt-2">
                                  <summary className="cursor-pointer text-text-muted hover:text-text-primary transition-colors inline-flex items-center select-none font-medium mb-3">
                                    Ver linhas contábeis
                                  </summary>
                                  <div className="overflow-x-auto bg-surface-secondary rounded-lg border border-border-subtle">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="border-b border-border-subtle text-text-muted text-[10px] uppercase tracking-wider">
                                          <th className="p-3 font-medium">Conta Contábil</th>
                                          <th className="p-3 font-medium">Fundo</th>
                                          <th className="p-3 font-medium">C. Custo</th>
                                          <th className="p-3 font-medium text-right">Débito</th>
                                          <th className="p-3 font-medium text-right">Crédito</th>
                                        </tr>
                                      </thead>
                                      <tbody className="text-xs">
                                        {postingPlanPreview.journalEntry.lines.map((line: any, idx: number) => (
                                          <tr key={idx} className="border-b border-border-subtle/50 last:border-0">
                                            <td className="p-3 text-text-primary font-mono">{line.ledgerAccountId}</td>
                                            <td className="p-3 text-text-muted">{line.fundId || '-'}</td>
                                            <td className="p-3 text-text-muted">{line.costCenterId || '-'}</td>
                                            <td className="p-3 text-right text-text-primary whitespace-nowrap">{line.debitCents > 0 ? formatBRLCents(line.debitCents) : '-'}</td>
                                            <td className="p-3 text-right text-text-primary whitespace-nowrap">{line.creditCents > 0 ? formatBRLCents(line.creditCents) : '-'}</td>
                                          </tr>
                                        ))}
                                        <tr className="bg-surface-elevated font-medium">
                                          <td colSpan={3} className="p-3 text-right text-text-muted">
                                            <div className="flex items-center justify-end gap-2">
                                              {postingPlanPreview.journalEntry.totalDebitCents === postingPlanPreview.journalEntry.totalCreditCents && (
                                                 <span className="text-[10px] text-teal-600 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20 uppercase">Balanceado</span>
                                              )}
                                              Total
                                            </div>
                                          </td>
                                          <td className="p-3 text-right text-text-primary whitespace-nowrap">{formatBRLCents(postingPlanPreview.journalEntry.totalDebitCents)}</td>
                                          <td className="p-3 text-right text-text-primary whitespace-nowrap">{formatBRLCents(postingPlanPreview.journalEntry.totalCreditCents)}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
                              </>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Revision History Log */}
                  {data.events && data.events.length > 0 && (
                    <div className="flex flex-col gap-3 mt-4">
                      <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                        Histórico Imutável da Movimentação
                      </h3>
                      <div className="bg-surface-elevated border border-border-subtle rounded-2xl p-5 flex flex-col gap-5 text-sm text-text-secondary">
                        {data.events.map((evt: any, idx: number) => {
                          const dateStr = evt.createdAt ? new Date(evt.createdAt).toLocaleDateString("pt-BR") : "-";
                          const timeStr = evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "";

                          let title = "";
                          let details = "";
                          let dotColor = "bg-text-muted";
                          let extraContent = null;

                          switch (evt.eventType) {
                            case 'draft_created':
                              title = "Rascunho Criado";
                              details = `Iniciou a movimentação como rascunho (versão ${evt.versionAfter || 1})`;
                              dotColor = "bg-zinc-400";
                              break;
                            case 'draft_updated':
                              title = "Rascunho Atualizado";
                              details = `Atualizou os dados do rascunho (v${evt.versionBefore} → v${evt.versionAfter})`;
                              dotColor = "bg-blue-400";
                              break;
                            case 'submitted_for_review':
                              title = "Enviado para Revisão";
                              details = `Concluiu os dados e enviou para revisão (v${evt.versionBefore} → v${evt.versionAfter})`;
                              dotColor = "bg-amber-400";
                              break;
                            case 'resubmitted_for_review':
                              title = "Reenviado para Revisão";
                              details = `Reenviou para revisão após realizar correções (v${evt.versionBefore} → v${evt.versionAfter})`;
                              dotColor = "bg-amber-500";
                              break;
                            case 'returned_to_draft':
                              title = "Devolvido para Correção";
                              details = `Movimentação devolvida para o rascunho (v${evt.versionBefore} → v${evt.versionAfter})`;
                              dotColor = "bg-rose-500";
                              
                              const reasonLabels: Record<string, string> = {
                                missing_attachment: "Falta de comprovante",
                                invalid_amount: "Valor incorreto",
                                invalid_category: "Categoria/Rateio incorreto",
                                invalid_account: "Conta bancária/caixa incorreta",
                                need_correction: "Outra correção necessária",
                                other: "Outro"
                              };
                              const reasonLabel = reasonLabels[evt.reasonCode] || evt.reasonCode || "Outro";
                              extraContent = (
                                <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-3 mt-2 text-xs text-rose-700">
                                  <div className="font-semibold mb-1">Motivo: {reasonLabel}</div>
                                  {evt.comment && <div className="text-rose-600 font-normal">"{evt.comment}"</div>}
                                </div>
                              );
                              break;
                            case 'approved_for_posting':
                              title = "Aprovado para Lançamento";
                              details = `Revisor aprovou a movimentação e gerou selo criptográfico (v${evt.versionBefore} → v${evt.versionAfter})`;
                              dotColor = "bg-teal-500";
                              extraContent = (
                                <div className="mt-2 flex flex-col gap-1.5">
                                  {evt.comment && (
                                    <div className="bg-teal-500/5 border border-teal-500/10 rounded-lg p-3 text-xs text-teal-700 italic">
                                      "{evt.comment}"
                                    </div>
                                  )}
                                  {evt.sourceHash && (
                                    <div className="mt-1">
                                      <div className="flex items-center gap-1.5 text-xs font-medium text-teal-600 mb-1">
                                        <ShieldCheck className="w-4 h-4" />
                                        Integridade da aprovação verificada
                                      </div>
                                      <details className="text-[11px] group">
                                        <summary className="cursor-pointer text-text-muted hover:text-text-primary transition-colors inline-flex items-center select-none font-medium">
                                          Ver detalhes de auditoria
                                        </summary>
                                        <div className="mt-2 bg-surface-secondary border border-border-subtle rounded-lg p-3 space-y-2">
                                          <div className="flex items-center justify-between gap-4">
                                            <span className="text-text-muted">Versão aprovada:</span>
                                            <span className="font-medium text-text-primary">{evt.versionAfter}</span>
                                          </div>
                                          <div className="flex flex-col gap-1 pt-1 border-t border-border-subtle">
                                            <span className="text-text-muted">Identificador de integridade:</span>
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono text-text-primary break-all">{evt.sourceHash.substring(0, 8)}...</span>
                                              {(hasEffectiveCapability(accessState, "system.audit") || hasEffectiveCapability(accessState, "system.diagnostics")) && (
                                                <button 
                                                  onClick={() => navigator.clipboard.writeText(evt.sourceHash)}
                                                  className="shrink-0 text-accent-primary hover:text-accent-secondary"
                                                  title="Copiar identificador completo"
                                                >
                                                  Copiar
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          <p className="text-[10px] text-text-muted leading-relaxed pt-1">
                                            <strong className="font-semibold">Nota de Auditoria:</strong> Este identificador é um digest SHA-256 determinístico do estado material da movimentação no momento da aprovação. Ele permite verificar matematicamente que o conteúdo atual corresponde exatamente ao conteúdo que foi aprovado. Ele não é, isoladamente, uma assinatura digital assimétrica, certificado de infraestrutura, prova criptográfica de identidade humana, nem substitui a auditoria do registro de quem aprovou (actor).
                                          </p>
                                        </div>
                                      </details>
                                    </div>
                                  )}
                                </div>
                              );
                              break;
                            case 'approval_invalidated':
                              title = "Aprovação Invalidada";
                              details = `Aprovação de Posting cancelada. Registro retornado para rascunho (v${evt.versionBefore} → v${evt.versionAfter})`;
                              dotColor = "bg-red-600";

                              const invalidationReasons: Record<string, string> = {
                                missing_attachment: "Falta de comprovante",
                                invalid_amount: "Valor incorreto",
                                invalid_category: "Categoria/Rateio incorreto",
                                invalid_account: "Conta bancária/caixa incorreta",
                                need_correction: "Outra correção necessária",
                                other: "Outro"
                              };
                              const invReasonLabel = invalidationReasons[evt.reasonCode] || evt.reasonCode || "Outro";
                              extraContent = (
                                <div className="mt-2 flex flex-col gap-1.5">
                                  <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 text-xs text-red-700">
                                    <div className="font-semibold mb-1">Motivo: {invReasonLabel}</div>
                                    {evt.comment && <div className="text-red-600 font-normal">"{evt.comment}"</div>}
                                  </div>
                                  {evt.sourceHash && (
                                    <div className="mt-1">
                                      <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 mb-1">
                                        <ShieldX className="w-4 h-4" />
                                        Esta aprovação foi invalidada
                                      </div>
                                      <details className="text-[11px] group">
                                        <summary className="cursor-pointer text-text-muted hover:text-text-primary transition-colors inline-flex items-center select-none font-medium">
                                          Ver detalhes da invalidação
                                        </summary>
                                        <div className="mt-2 bg-surface-secondary border border-border-subtle rounded-lg p-3 space-y-2 opacity-80">
                                          <div className="flex items-center justify-between gap-4">
                                            <span className="text-text-muted">Versão alvo da invalidação:</span>
                                            <span className="font-medium text-text-primary">{evt.versionBefore}</span>
                                          </div>
                                          <div className="flex flex-col gap-1 pt-1 border-t border-border-subtle">
                                            <span className="text-text-muted">Identificador de integridade invalidado:</span>
                                            <span className="font-mono text-text-primary break-all">{evt.sourceHash.substring(0, 8)}...</span>
                                          </div>
                                        </div>
                                      </details>
                                    </div>
                                  )}
                                </div>
                              );
                              break;
                            default:
                              title = evt.eventType;
                              details = `Evento registrado (${evt.versionBefore ? `v${evt.versionBefore}` : ''} → v${evt.versionAfter || ''})`;
                          }

                          return (
                            <div key={evt.id || idx} className={`flex items-start gap-3.5 ${idx > 0 ? "border-t border-border-subtle pt-4" : ""}`}>
                              <div className="flex flex-col items-center">
                                <div className={`w-3 h-3 rounded-full ${dotColor} mt-1.5 shrink-0 shadow-sm`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <p className="font-semibold text-text-primary text-sm tracking-tight">{title}</p>
                                  <span className="text-[10px] text-text-muted font-mono shrink-0 bg-surface-secondary px-1.5 py-0.5 rounded border border-border-subtle">
                                    {dateStr} {timeStr}
                                  </span>
                                </div>
                                <p className="text-xs text-text-muted leading-relaxed">
                                  Por <span className="font-medium text-text-secondary">{evt.actorDisplayNameSnapshot || "Usuário da equipe"}</span>
                                </p>
                                <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{details}</p>
                                {extraContent}
                              </div>
                            </div>
                          );
                        })}
                        {data.events.length === 20 && (
                          <div className="pt-4 border-t border-border-subtle mt-1 text-center">
                            <button className="text-xs font-medium text-accent-primary hover:text-accent-secondary transition-colors px-3 py-1.5 rounded-lg hover:bg-accent-primary/5">
                              Ver histórico completo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isReviewMode &&
                    (tx.status === "ready_for_review" ||
                      tx.status === "approved_for_posting") &&
                    hasEffectiveCapability(accessState, "finance.review") && (
                      <div className="pt-4 border-t border-border-subtle mt-4 flex flex-col gap-3">
                        {actionError && (
                          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl flex items-center gap-3 text-sm">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <p>{actionError}</p>
                          </div>
                        )}

                        {showReturnForm && (
                          <div className="bg-surface-elevated border border-border-subtle rounded-2xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                            <h4 className="text-sm font-semibold text-text-primary">
                              {tx.status === "approved_for_posting"
                                ? "Invalidar aprovação e devolver"
                                : "Devolver para correção"}
                            </h4>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs font-medium text-text-secondary">
                                Motivo da devolução
                              </label>
                              <select
                                value={returnReason}
                                onChange={(e) =>
                                  setReturnReason(e.target.value)
                                }
                                className="h-10 px-3 bg-surface-base border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                              >
                                <option value="missing_attachment">
                                  Falta de comprovante
                                </option>
                                <option value="invalid_amount">
                                  Valor incorreto
                                </option>
                                <option value="invalid_category">
                                  Categoria/Rateio incorreto
                                </option>
                                <option value="invalid_account">
                                  Conta bancária/caixa incorreta
                                </option>
                                <option value="need_correction">
                                  Outra correção necessária
                                </option>
                                <option value="other">Outro</option>
                              </select>
                            </div>
                            {(returnReason === "other" ||
                              returnReason === "need_correction") && (
                              <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-text-secondary">
                                  Comentário (obrigatório)
                                </label>
                                <textarea
                                  value={returnComment}
                                  onChange={(e) =>
                                    setReturnComment(e.target.value)
                                  }
                                  placeholder="Detalhe o que precisa ser ajustado..."
                                  className="p-3 bg-surface-base border border-border-subtle rounded-lg text-sm text-text-primary resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                                />
                              </div>
                            )}
                            <div className="flex gap-3 pt-2">
                              <button
                                onClick={() => setShowReturnForm(false)}
                                disabled={returningToDraft}
                                className="flex-1 h-10 flex items-center justify-center bg-surface-base border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={handleReturnToDraft}
                                disabled={
                                  returningToDraft ||
                                  ((returnReason === "other" ||
                                    returnReason === "need_correction") &&
                                    !returnComment.trim())
                                }
                                className="flex-1 h-10 flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
                              >
                                {returningToDraft
                                  ? "Devolvendo..."
                                  : tx.status === "approved_for_posting"
                                    ? "Invalidar e Devolver"
                                    : "Devolver"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  {!isReviewMode &&
                    hasEffectiveCapability(
                      accessState,
                      "finance.create_drafts",
                    ) && (
                      <div className="pt-4 border-t border-border-subtle mt-4 flex flex-col gap-3">
                        {/* the Next Step panel handles draft completion buttons now */}
                      </div>
                    )}

                  {submitModalOpen && tx.status === "draft" && (
                    <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="submit-dialog-title"
                        aria-describedby="submit-dialog-desc"
                        className="bg-surface-elevated w-full max-w-sm rounded-[24px] border border-border-subtle shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300"
                      >
                        <div className="p-6 flex flex-col gap-4">
                          <h3
                            id="submit-dialog-title"
                            className="text-xl font-semibold text-text-primary"
                          >
                            Concluir movimentação?
                          </h3>
                          <p
                            id="submit-dialog-desc"
                            className="text-sm text-text-muted"
                          >
                            A movimentação ficará pronta para conferência. Ela
                            ainda não será contabilizada e não alterará os
                            saldos.
                          </p>

                          <div className="bg-surface-base border border-border-subtle rounded-xl p-4 flex flex-col gap-2 text-sm mt-2">
                            <div className="flex justify-between">
                              <span className="text-text-muted">Tipo</span>
                              <span className="font-medium text-text-primary">
                                {tx.direction === "income"
                                  ? "Entrada"
                                  : "Saída"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-muted">Valor</span>
                              <span className="font-medium text-text-primary font-mono">
                                {formatMoney(tx.amountCents)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-muted">Data</span>
                              <span className="font-medium text-text-primary">
                                {new Date(tx.occurredAt).toLocaleDateString(
                                  "pt-BR",
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-muted">Conta</span>
                              <span className="font-medium text-text-primary truncate max-w-[140px]">
                                {tx.accountName || "Conta selecionada"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-muted">Rateios</span>
                              <span className="font-medium text-text-primary">
                                {allocs.length}{" "}
                                {allocs.length > 1 ? "itens" : "item"}
                              </span>
                            </div>
                          </div>

                          {submitError && (
                            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl flex flex-col gap-3 text-sm items-start mt-2">
                              <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p>{submitError}</p>
                              </div>
                              {submitError.includes(
                                "alterada em outro lugar",
                              ) && (
                                <button
                                  onClick={() =>
                                    loadData(undefined, epochRef.current)
                                  }
                                  className="bg-surface-base border border-rose-500/30 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-colors w-full mt-1"
                                >
                                  Ver versão mais recente
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex flex-col gap-3 mt-4">
                            <button
                              onClick={handleSubmitForReview}
                              disabled={submitting}
                              className="w-full h-14 flex items-center justify-center bg-text-primary text-surface-base hover:bg-text-primary/90 rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated"
                            >
                              {submitting ? (
                                <div className="w-5 h-5 border-2 border-surface-base/30 border-t-surface-base rounded-full animate-spin" />
                              ) : submitError ? (
                                "Tentar novamente"
                              ) : (
                                "Concluir movimentação"
                              )}
                            </button>
                            <button
                              onClick={() => setSubmitModalOpen(false)}
                              disabled={submitting}
                              className="w-full h-14 flex items-center justify-center bg-surface-base border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-2xl font-medium transition-colors text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
        </div>
      </div>
    </main>
  );
}
