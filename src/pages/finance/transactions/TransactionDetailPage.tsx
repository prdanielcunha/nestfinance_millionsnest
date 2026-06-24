import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Landmark,
  Layers,
  AlertCircle,
  ShieldX,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { APP_ROUTES } from "@/src/app/router/routes";
import { useAuth } from "@/src/hooks/useAuth";
import { useFinanceEntity } from "@/src/contexts/FinanceEntityContext";
import { useTransactions } from "@/src/hooks/finance/useTransactions";
import { FinanceContextGuard } from "@/src/components/finance/FinanceContextGuard";
import { FinanceEntityContextBar } from "@/src/components/finance/FinanceEntityContextBar";
import { hasEffectiveCapability } from "@/src/lib/permissions";

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
      if (
        isReviewMode &&
        (data.transaction.status === "ready_for_review" ||
          data.transaction.status === "approved_for_posting")
      ) {
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

      idempotencyKeyRef.current = null;
      setData((prev: any) => ({
        ...prev,
        transaction: {
          ...prev.transaction,
          status: "draft",
          version: res.version || prev.transaction.version + 1,
        },
      }));
      if (!isReviewMode) {
        navigate(
          APP_ROUTES.transactionEdit.replace(
            ":transactionId",
            data.transaction.id,
          ),
        );
      } else {
        navigate(APP_ROUTES.financeReview);
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

  const loadData = async (signal?: AbortSignal, currentEpoch?: number) => {
    setLoading(true);
    setError(null);

    try {
      const res = await getTransactionDetail(transactionId!);

      if (
        signal?.aborted ||
        (currentEpoch && currentEpoch !== epochRef.current)
      )
        return;

      setData(res);
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
      approved_for_posting: "Aprovado para Posting",
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
              const tx = data.transaction;
              const allocs = data.allocations || [];
              const sumAllocations = allocs.reduce(
                (acc: number, item: any) => acc + (item.amountCents || 0),
                0,
              );
              const isBalanced = sumAllocations === tx.amountCents;

              return (
                <>
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
                      <div>
                        <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                          Descrição
                        </p>
                        <p className="text-sm text-text-primary">
                          {tx.description || "Sem descrição"}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tx.transactionKind === "transfer" ? (
                          <>
                            <div>
                              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                                Conta de Origem
                              </p>
                              <p className="text-sm text-text-primary flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-text-muted" />
                                {tx.accountSnapshot?.name ||
                                  tx.accountName ||
                                  "Conta de origem desconhecida"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                                Conta de Destino
                              </p>
                              <p className="text-sm text-text-primary flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-text-muted" />
                                {tx.destinationAccountSnapshot?.name ||
                                  "Conta de destino desconhecida"}
                              </p>
                            </div>
                          </>
                        ) : tx.transactionKind === "liability_settlement" ? (
                          <>
                            <div>
                              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                                Conta de Origem (Pagamento)
                              </p>
                              <p className="text-sm text-text-primary flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-text-muted" />
                                {tx.accountSnapshot?.name ||
                                  tx.accountName ||
                                  "Conta desconhecida"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                                Passivo Liquidado
                              </p>
                              <p className="text-sm text-text-primary flex items-center gap-2">
                                <Layers className="w-4 h-4 text-text-muted" />
                                {tx.liabilityAccountSnapshot?.name ||
                                  "Passivo desconhecido"}
                              </p>
                            </div>
                            {tx.settlementType && (
                              <div className="col-span-1 md:col-span-2">
                                <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                                  Tipo de Acerto
                                </p>
                                <p className="text-sm text-text-primary font-medium">
                                  {translateSettlementType(tx.settlementType)}
                                </p>
                              </div>
                            )}
                          </>
                        ) : (
                          <div>
                            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                              Conta Principal
                            </p>
                            <p className="text-sm text-text-primary flex items-center gap-2">
                              <Landmark className="w-4 h-4 text-text-muted" />
                              {tx.accountSnapshot?.name ||
                                tx.accountName ||
                                "Conta desconhecida"}
                            </p>
                          </div>
                        )}

                        {tx.method && (
                          <div>
                            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                              Forma de pagamento
                            </p>
                            <p className="text-sm text-text-primary flex items-center gap-2">
                              <Wallet className="w-4 h-4 text-text-muted" />
                              {translateMethod(tx.method)}
                            </p>
                          </div>
                        )}
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
                          className="p-4 flex items-center justify-between gap-4"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-text-primary truncate">
                              {alloc.categorySnapshot?.name ||
                                alloc.categoryName ||
                                "Categoria desconhecida"}
                            </span>
                            {(alloc.fundSnapshot?.name || alloc.fundName) && (
                              <span className="text-xs text-text-muted truncate mt-0.5">
                                Fundo:{" "}
                                {alloc.fundSnapshot?.name || alloc.fundName}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-text-primary shrink-0">
                            {formatMoney(alloc.amountCents)}
                          </span>
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
                        Conferência Automática
                      </h3>

                      {/* Accounting Effect */}
                      <div className="bg-surface-elevated border border-border-subtle rounded-2xl p-5 flex flex-col gap-2">
                        <p className="text-xs text-text-muted uppercase tracking-wider font-semibold">
                          Efeito financeiro previsto
                        </p>
                        <p className="text-sm text-text-primary font-medium">
                          {data.accountingEffect ||
                            "Nenhum efeito contabilizado"}
                        </p>
                      </div>

                      {/* Checklist Blockers & Warnings */}
                      {data.reviewReadiness.blockers?.length > 0 && (
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex flex-col gap-2 text-sm text-rose-500">
                          <div className="flex items-center gap-2 font-medium">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span>Pendências impeditivas</span>
                          </div>
                          <ul className="list-disc list-inside ml-2">
                            {data.reviewReadiness.blockers.map(
                              (b: any, i: number) => (
                                <li key={i}>{b.details}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}

                      {data.reviewReadiness.warnings?.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col gap-2 text-sm text-amber-600">
                          <div className="flex items-center gap-2 font-medium">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span>Avisos (Requer atenção)</span>
                          </div>
                          <ul className="list-disc list-inside ml-2">
                            {data.reviewReadiness.warnings.map(
                              (w: any, i: number) => (
                                <li key={i}>{w.details}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}

                      {data.reviewReadiness.ready &&
                        data.reviewReadiness.warnings?.length === 0 && (
                          <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4 flex gap-3 text-teal-600 items-start">
                            <ShieldCheck className="w-5 h-5 shrink-0" />
                            <p className="text-sm font-medium">
                              Tudo certo! Nenhuma pendência encontrada nesta
                              movimentação.
                            </p>
                          </div>
                        )}
                    </div>
                  )}

                  {/* Revision History Log */}
                  {(tx.createdBy || tx.returnedToDraftBy || tx.approvedBy) && (
                    <div className="flex flex-col gap-3 mt-4">
                      <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                        Histórico da Movimentação
                      </h3>
                      <div className="bg-surface-elevated border border-border-subtle rounded-2xl p-5 flex flex-col gap-4 text-sm text-text-secondary">
                        {tx.createdBy && (
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-text-muted mt-1.5" />
                            <div>
                              <p className="font-medium text-text-primary">
                                Registrado
                              </p>
                              <p className="text-xs text-text-muted">
                                Por{" "}
                                {tx.creatorName ||
                                  tx.createdByAlias ||
                                  "equipe"}{" "}
                                em{" "}
                                {tx.occurredAt
                                  ? new Date(tx.occurredAt).toLocaleDateString(
                                      "pt-BR",
                                    )
                                  : "-"}
                              </p>
                            </div>
                          </div>
                        )}

                        {tx.returnedToDraftBy && (
                          <div className="flex items-start gap-3 border-t border-border-subtle pt-3">
                            <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5" />
                            <div>
                              <p className="font-medium text-text-primary">
                                Devolvido para Correção
                              </p>
                              <p className="text-xs text-text-muted">
                                Por {tx.returnedByName || "revisor"} em{" "}
                                {tx.returnedToDraftAt
                                  ? new Date(
                                      tx.returnedToDraftAt,
                                    ).toLocaleDateString("pt-BR")
                                  : "-"}
                              </p>
                              <div className="bg-rose-500/5 border border-rose-500/10 rounded-lg p-2.5 mt-1.5 text-xs text-rose-700">
                                <span className="font-semibold">Motivo:</span>{" "}
                                {tx.returnedToDraftReason ===
                                "missing_attachment"
                                  ? "Falta de comprovante"
                                  : tx.returnedToDraftReason ===
                                      "invalid_amount"
                                    ? "Valor incorreto"
                                    : tx.returnedToDraftReason ===
                                        "invalid_category"
                                      ? "Categoria/Rateio incorreto"
                                      : tx.returnedToDraftReason ===
                                          "invalid_account"
                                        ? "Conta bancária/caixa incorreta"
                                        : tx.returnedToDraftReason ===
                                            "need_correction"
                                          ? "Outra correção necessária"
                                          : tx.returnedToDraftReason || "Outro"}
                                {tx.returnedToDraftComment && (
                                  <p className="mt-1">
                                    <span className="font-semibold">
                                      Ajuste:
                                    </span>{" "}
                                    {tx.returnedToDraftComment}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {tx.approvedBy && (
                          <div className="flex items-start gap-3 border-t border-border-subtle pt-3">
                            <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5" />
                            <div>
                              <p className="font-medium text-text-primary">
                                Aprovado para Posting
                              </p>
                              <p className="text-xs text-text-muted">
                                Por{" "}
                                {tx.approvedWithName ||
                                  tx.approvedBy ||
                                  "revisor"}{" "}
                                em{" "}
                                {tx.approvedAt
                                  ? new Date(tx.approvedAt).toLocaleDateString(
                                      "pt-BR",
                                    )
                                  : "-"}
                              </p>
                              {tx.approvalComment && (
                                <p className="bg-teal-500/5 border border-teal-500/10 rounded-lg p-2.5 mt-1.5 text-xs text-teal-700 italic">
                                  "{tx.approvalComment}"
                                </p>
                              )}
                              {tx.approvalSourceHash && (
                                <p className="text-[10px] font-mono text-text-muted mt-2 truncate max-w-[280px]">
                                  Hash: {tx.approvalSourceHash} (v
                                  {tx.approvedVersion})
                                </p>
                              )}
                            </div>
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

                        {showReturnForm ? (
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
                        ) : (
                          <>
                            {tx.status === "ready_for_review" && (
                              <button
                                onClick={handleApprove}
                                disabled={
                                  approving ||
                                  (data.reviewReadiness &&
                                    !data.reviewReadiness.ready)
                                }
                                className="w-full h-14 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
                              >
                                {approving ? (
                                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  "Aprovar Movimentação"
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => setShowReturnForm(true)}
                              disabled={approving}
                              className="w-full h-14 flex items-center justify-center gap-2 bg-surface-elevated border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-2xl font-medium transition-colors disabled:opacity-50 text-base"
                            >
                              {tx.status === "approved_for_posting"
                                ? "Invalidar aprovação e devolver para rascunho"
                                : "Devolver para correção"}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                  {!isReviewMode &&
                    hasEffectiveCapability(
                      accessState,
                      "finance.create_drafts",
                    ) && (
                      <div className="pt-4 border-t border-border-subtle mt-4 flex flex-col gap-3">
                        {tx.status === "draft" && (
                          <>
                            {(!isBalanced ||
                              !tx.accountId ||
                              !tx.method ||
                              !tx.amountCents ||
                              allocs.length === 0 ||
                              allocs.some((a: any) => !a.categoryId)) && (
                              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-4 rounded-xl flex flex-col gap-2 text-sm">
                                <div className="flex items-center gap-2 font-medium">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  <span>Ainda falta revisar</span>
                                </div>
                                <ul className="list-disc list-inside ml-2">
                                  {!tx.amountCents && (
                                    <li>Informe o valor da movimentação</li>
                                  )}
                                  {!tx.accountId && <li>Escolha uma conta</li>}
                                  {!tx.method && (
                                    <li>
                                      Informe a forma de pagamento/recebimento
                                    </li>
                                  )}
                                  {(allocs.length === 0 || !isBalanced) && (
                                    <li>
                                      A divisão ainda não fecha o valor total.
                                    </li>
                                  )}
                                  {allocs.length > 0 &&
                                    allocs.some((a: any) => !a.categoryId) && (
                                      <li>
                                        Escolha uma categoria para todos os
                                        rateios
                                      </li>
                                    )}
                                </ul>
                              </div>
                            )}

                            {isBalanced &&
                              tx.accountId &&
                              tx.method &&
                              tx.amountCents > 0 &&
                              allocs.length > 0 &&
                              !allocs.some((a: any) => !a.categoryId) && (
                                <button
                                  onClick={() => setSubmitModalOpen(true)}
                                  className="w-full h-14 flex items-center justify-center gap-2 bg-text-primary text-surface-base hover:bg-text-primary/90 rounded-2xl font-medium transition-colors text-base"
                                >
                                  Concluir movimentação
                                </button>
                              )}

                            <button
                              onClick={() =>
                                navigate(
                                  APP_ROUTES.transactionEdit.replace(
                                    ":transactionId",
                                    tx.id,
                                  ),
                                )
                              }
                              className="w-full h-14 flex items-center justify-center gap-2 bg-surface-elevated border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-2xl font-medium transition-colors text-base"
                            >
                              Editar rascunho
                            </button>
                          </>
                        )}
                        {tx.status === "ready_for_review" && (
                          <button
                            onClick={() => handleReturnToDraft()}
                            disabled={returningToDraft}
                            className="w-full h-14 flex items-center justify-center gap-2 bg-surface-elevated border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base"
                          >
                            {returningToDraft ? (
                              <div className="w-5 h-5 border-2 border-text-primary/30 border-t-text-primary rounded-full animate-spin" />
                            ) : (
                              "Editar novamente"
                            )}
                          </button>
                        )}
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
