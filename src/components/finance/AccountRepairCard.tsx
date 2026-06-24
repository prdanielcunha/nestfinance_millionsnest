import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  Wrench,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Settings,
  X,
  RefreshCw
} from "lucide-react";
import { firebaseAuth } from "@/src/lib/firebase";
import { createPortal } from "react-dom";

interface Props {
  account: {
    id: string;
    name: string;
    templateKey?: string | null;
    type?: string;
    nature?: string;
    configurationStatus?: string;
    institutionName?: string | null;
    accountLast4?: string | null;
  };
  financeEntityId: string;
  onRepaired: (repairedAccount: any) => void;
}

export default function AccountRepairCard({
  account,
  financeEntityId,
  onRepaired,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Guided Custom Account configuration states
  const [showConfigWizard, setShowConfigWizard] = useState(false);
  const [representation, setRepresentation] = useState<string>("");

  const isIncomplete =
    account.configurationStatus !== "complete" ||
    !account.type ||
    !account.nature;

  const CANONICAL_TEMPLATES: Record<
    string,
    { type: string; nature: string; typeLabel: string; natureLabel: string }
  > = {
    "church.account.cash": {
      type: "cash",
      nature: "asset",
      typeLabel: "Caixa (Físico)",
      natureLabel: "Ativo",
    },
    "church.account.checking": {
      type: "bank_checking",
      nature: "asset",
      typeLabel: "Conta Corrente",
      natureLabel: "Ativo",
    },
    "church.account.savings": {
      type: "bank_savings",
      nature: "asset",
      typeLabel: "Poupança",
      natureLabel: "Ativo",
    },
    "church.account.digital_wallet": {
      type: "payment_account",
      nature: "asset",
      typeLabel: "Carteira Digital",
      natureLabel: "Ativo",
    },
  };

  const isCanonical =
    !!account.templateKey && !!CANONICAL_TEMPLATES[account.templateKey];
  const suggested = account.templateKey
    ? CANONICAL_TEMPLATES[account.templateKey]
    : null;

  // Auto-repair effect for canonical accounts
  useEffect(() => {
    if (isIncomplete && isCanonical && suggested && !loading && !success && !error) {
      handleRepair();
    }
  }, [isIncomplete, isCanonical, suggested]);

  if (!isIncomplete) return null;

  // Handler for canonical/standard auto repairs
  const handleRepair = async () => {
    if (loading) return;
    try {
      setLoading(true);
      setError(null);

      const user = firebaseAuth.currentUser;
      if (!user) throw new Error("Não autenticado");
      const token = await user.getIdToken();

      const res = await fetch(
        "/api/finance-gateway?operation=accounts-repair-canonical",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            financeEntityId,
            accountId: account.id,
            requestId:
              "req_rep_" +
              Math.random().toString(36).substring(2, 10) +
              Date.now().toString(36),
            idempotencyKey:
              "idk_rep_" +
              Math.random().toString(36).substring(2, 10) +
              Date.now().toString(36),
          }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.message || errData.error || "Erro ao preparar conta",
        );
      }

      const data = await res.json();
      const repairResult = data.results?.[0];

      if (
        repairResult &&
        (repairResult.status === "repaired" ||
          repairResult.status === "already_complete") &&
        suggested
      ) {
        setSuccess(true);
        setTimeout(() => {
          onRepaired({
            ...account,
            type: suggested.type,
            nature: suggested.nature,
            configurationStatus: "complete",
          });
        }, 1200);
      } else {
        throw new Error("Falha ao preparar conta");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao processar");
    } finally {
      setLoading(false);
    }
  };

  // Handler for custom/other account guide submission
  const handleSaveCustomConfig = async () => {
    if (loading) return;
    try {
      setLoading(true);
      setError(null);

      if (!representation) {
        throw new Error("Por favor, selecione o que esta conta representa.");
      }

      let targetType = "";
      let targetNature = "";

      if (representation === "cash") {
        targetType = "cash";
        targetNature = "asset";
      } else if (representation === "bank_checking") {
        targetType = "bank_checking";
        targetNature = "asset";
      } else if (representation === "payment_account") {
        targetType = "payment_account";
        targetNature = "asset";
      } else if (representation === "credit_card") {
        targetType = "credit_card";
        targetNature = "liability";
      } else if (representation === "reimbursement_payable") {
        targetType = "reimbursement_payable";
        targetNature = "liability";
      } else if (representation === "card_receivable") {
        targetType = "card_receivable";
        targetNature = "receivable";
      } else if (representation === "other") {
        targetType = "other";
        targetNature = "asset";
      }

      const user = firebaseAuth.currentUser;
      if (!user) throw new Error("Não autenticado");
      const token = await user.getIdToken();

      let purposeCode = "";
      if (representation === "cash") {
        purposeCode = "physical_cash";
      } else if (representation === "bank_checking") {
        purposeCode = "bank_account";
      } else if (representation === "payment_account") {
        purposeCode = "digital_payment_account";
      } else if (representation === "credit_card") {
        purposeCode = "church_credit_card";
      } else if (representation === "reimbursement_payable") {
        purposeCode = "reimbursement_payable";
      } else if (representation === "card_receivable") {
        purposeCode = "card_receivable";
      } else if (representation === "other") {
        purposeCode = "other_asset";
      }

      const accountConfigurationIdempotencyKey =
        "idk_conf_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
      const reqId =
        "req_conf_" +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);

      const res = await fetch(
        "/api/finance-gateway?operation=accounts-configure-custom",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountId: account.id,
            purposeCode,
            requestId: reqId,
            idempotencyKey: accountConfigurationIdempotencyKey,
          }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.message ||
            errData.error ||
            "Erro ao salvar configuração da conta.",
        );
      }

      const data = await res.json();
      const configResult = data.results?.[0]?.account;

      if (!configResult) {
        throw new Error(
          "Falha ao receber a confirmação de configuração da conta.",
        );
      }

      setSuccess(true);
      setTimeout(() => {
        setShowConfigWizard(false);
        onRepaired({
          ...account,
          ...configResult,
        });
      }, 800);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar configuração");
    } finally {
      setLoading(false);
    }
  };

  const renderWizardModal = () => {
    if (!showConfigWizard) return null;

    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
        <div className="absolute inset-0 bg-background-base/80 backdrop-blur-sm" onClick={() => !loading && setShowConfigWizard(false)} />
        <div className="relative w-full max-w-lg bg-surface-elevated rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] border border-border-subtle animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
            <div>
              <h3 className="text-lg font-medium text-text-primary">Configurar {account.name}</h3>
              <p className="text-sm text-text-muted mt-0.5">Responda apenas o que esta conta representa para a igreja.</p>
            </div>
            <button 
              onClick={() => !loading && setShowConfigWizard(false)}
              className="p-2 -mr-2 text-text-muted hover:text-text-primary rounded-full hover:bg-surface-secondary transition-colors"
              disabled={loading}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="font-medium text-text-primary text-base">
                  O que esta conta representa?
                </label>
                <div className="flex flex-col gap-2">
                  {[
                    { val: "cash", label: "Dinheiro guardado fisicamente" },
                    { val: "bank_checking", label: "Conta bancária" },
                    { val: "payment_account", label: "Conta Pix ou carteira digital" },
                    { val: "credit_card", label: "Cartão de crédito da igreja" },
                    { val: "reimbursement_payable", label: "Valor que a igreja precisa reembolsar" },
                    { val: "card_receivable", label: "Valor que a igreja tem para receber" },
                    { val: "other", label: "Outra conta" }
                  ].map(opt => (
                     <label 
                       key={opt.val} 
                       className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${representation === opt.val ? 'border-accent-primary bg-accent-primary/10' : 'border-border-subtle bg-surface-base hover:bg-surface-secondary'}`}
                     >
                       <input 
                         type="radio" 
                         name="representation" 
                         value={opt.val} 
                         checked={representation === opt.val}
                         onChange={(e) => {
                           setRepresentation(e.target.value);
                         }}
                         className="w-4 h-4 text-accent-primary border-border-subtle focus:ring-accent-primary focus:ring-offset-surface-elevated shrink-0" 
                       />
                       <span className="text-base font-medium text-text-primary">{opt.label}</span>
                     </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-5 border-t border-border-subtle shrink-0 bg-surface-elevated">
            {error && <p className="text-red-500 font-medium mb-3 text-sm">{error}</p>}
            {success ? (
              <div className="flex items-center gap-2 text-green-500 font-medium bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>Conta configurada com sucesso!</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSaveCustomConfig}
                disabled={loading || !representation}
                className="w-full h-12 inline-flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/90 text-white rounded-xl font-medium transition-colors disabled:opacity-50 text-base"
              >
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                {loading ? "Salvando..." : "Salvar e Concluir"}
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (isCanonical) {
    return (
      <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center gap-3 text-blue-500">
        {success ? (
           <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" />
        ) : error ? (
           <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
        ) : (
           <RefreshCw className="w-5 h-5 flex-shrink-0 animate-spin" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">
             {success ? `${account.name} pronto para usar.` : error ? `Falha ao preparar ${account.name}.` : `Estamos preparando o ${account.name} para uso...`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col gap-3">
        <div className="flex items-start gap-3 text-amber-600">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-primary">
                {account.name} precisa de um ajuste rápido
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Diga apenas o que esta conta representa para a igreja.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConfigWizard(true)}
              className="inline-flex items-center justify-center h-8 px-4 bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-semibold transition-colors shrink-0"
            >
              Resolver agora
            </button>
          </div>
        </div>
      </div>
      {renderWizardModal()}
    </>
  );
}

