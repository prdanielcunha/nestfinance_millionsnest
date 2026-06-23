import React, { useState } from "react";
import {
  AlertCircle,
  Wrench,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";
import { firebaseAuth } from "@/src/lib/firebase";

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
  const [otherNature, setOtherNature] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced technical states
  const [advPurpose, setAdvPurpose] = useState<string>(
    "Controle operacional de saldos para a conta personalizada.",
  );
  const [advInstruments, setAdvInstruments] = useState<string[]>([
    "pix",
    "cash",
    "transfer",
  ]);
  const [advBehavior, setAdvBehavior] = useState<string>("immediate");

  const isIncomplete =
    account.configurationStatus !== "complete" ||
    !account.type ||
    !account.nature;

  if (!isIncomplete) return null;

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
          errData.message || errData.error || "Erro ao reparar conta",
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
        }, 800);
      } else {
        throw new Error("Falha ao aplicar reparo automático");
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
        if (!otherNature) {
          throw new Error(
            "Por favor, defina o que este outro valor representa.",
          );
        }
        targetNature = otherNature;
      }

      // Determine default operational characteristics for backend compliance
      let purpose = advPurpose;
      let instruments = advInstruments;
      let behavior = advBehavior;

      if (!showAdvanced) {
        purpose = `Finalidade operacional e controle da conta customizada: ${account.name}`;
        instruments = ["pix", "cash", "transfer", "slip", "card"];

        if (targetNature === "clearing") {
          behavior = "clearing";
        } else if (targetNature === "asset") {
          behavior = "immediate";
        } else if (targetNature === "liability") {
          behavior = "restricted";
        } else {
          behavior = "delayed";
        }
      }

      // Strict validation checks
      if (targetType === "other") {
        if (!purpose || purpose.trim().length < 5) {
          throw new Error(
            "A finalidade operacional precisa ter no mínimo 5 caracteres.",
          );
        }
        if (instruments.length === 0) {
          throw new Error("Selecione ao menos um meio de pagamento suportado.");
        }
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
        if (otherNature === "asset") {
          purposeCode = "other_asset";
        } else if (otherNature === "liability") {
          purposeCode = "other_liability";
        } else if (otherNature === "receivable") {
          purposeCode = "other_receivable";
        } else if (otherNature === "clearing") {
          purposeCode = "temporary_clearing";
        }
      }

      const advancedConfiguration: any = {};
      if (representation === "other") {
        advancedConfiguration.natureCode = otherNature;
        advancedConfiguration.availabilityBehavior = behavior;
        advancedConfiguration.supportedInstrumentCodes = instruments;
        advancedConfiguration.explanation = purpose;
      } else if (showAdvanced) {
        advancedConfiguration.supportedInstrumentCodes = instruments;
        advancedConfiguration.availabilityBehavior = behavior;
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
            advancedConfiguration,
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

  const toggleInstrument = (code: string) => {
    if (advInstruments.includes(code)) {
      setAdvInstruments((prev) => prev.filter((i) => i !== code));
    } else {
      setAdvInstruments((prev) => [...prev, code]);
    }
  };

  return (
    <div className="mt-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col gap-3">
      <div className="flex items-start gap-2.5 text-amber-500">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-text-primary">
            {account.name}{" "}
            <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-medium ml-1">
              Pendente de Configuração
            </span>
          </h4>
          <p className="text-xs text-text-muted mt-1">
            Esta conta precisa ser configurada com um Tipo e Natureza contábil
            para poder transacionar no sistema.
          </p>
        </div>
      </div>

      {isCanonical && suggested ? (
        <div className="bg-surface-elevated/40 border border-border-subtle/50 rounded-lg p-3 text-xs flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-text-muted">
            <div>
              <span className="font-semibold text-text-primary block mb-0.5">
                Valores Atuais
              </span>
              Tipo:{" "}
              <span className="text-text-secondary">
                {account.type || "Não definido"}
              </span>{" "}
              <br />
              Natureza:{" "}
              <span className="text-text-secondary">
                {account.nature || "Não definido"}
              </span>
            </div>
            <div>
              <span className="font-semibold text-text-primary block mb-0.5">
                Valores Sugeridos
              </span>
              Tipo:{" "}
              <span className="text-text-secondary">{suggested.typeLabel}</span>{" "}
              <br />
              Natureza:{" "}
              <span className="text-text-secondary">
                {suggested.natureLabel}
              </span>
            </div>
          </div>

          {error && <p className="text-red-500 font-medium">{error}</p>}

          {success ? (
            <div className="flex items-center gap-1.5 text-green-500 font-medium mt-1">
              <CheckCircle className="w-4 h-4 animate-bounce" /> Conta reparada
              com sucesso!
            </div>
          ) : (
            <button
              type="button"
              onClick={handleRepair}
              disabled={loading}
              className="mt-1 self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Wrench className="w-3.5 h-3.5" />
              {loading ? "Processando..." : "Apenas Corrigir e Concluir"}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface-elevated/40 border border-border-subtle/50 rounded-lg p-3 text-xs flex flex-col gap-3">
          {!showConfigWizard ? (
            <>
              <p className="text-text-muted">
                Esta é uma conta personalizada. Para transacionar, precisamos
                definir rapidamente o que ela representa de forma guiada e
                inline.
              </p>
              <button
                type="button"
                onClick={() => setShowConfigWizard(true)}
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Configurar Conta Agora
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Question 1 */}
              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-text-primary text-sm">
                  O que esta conta representa?
                </span>
                <select
                  value={representation}
                  onChange={(e) => {
                    setRepresentation(e.target.value);
                    if (e.target.value !== "other") {
                      setOtherNature("");
                    }
                  }}
                  className="w-full h-10 bg-surface-base border border-border-subtle text-text-primary rounded-lg px-2 outline-none"
                >
                  <option value="">Selecione uma opção...</option>
                  <option value="cash">Dinheiro guardado fisicamente</option>
                  <option value="bank_checking">Conta bancária</option>
                  <option value="payment_account">
                    Conta Pix ou carteira digital
                  </option>
                  <option value="credit_card">
                    Cartão de crédito da igreja
                  </option>
                  <option value="reimbursement_payable">
                    Valor que a igreja precisa reembolsar
                  </option>
                  <option value="card_receivable">
                    Valor que a igreja tem para receber
                  </option>
                  <option value="other">Outra conta</option>
                </select>
              </div>

              {/* Question 2 (only if representation is "other") */}
              {representation === "other" && (
                <div className="flex flex-col gap-1.5 animate-fadeIn">
                  <span className="font-semibold text-text-primary text-sm">
                    Qual o propósito ou natureza deste outro valor?
                  </span>
                  <select
                    value={otherNature}
                    onChange={(e) => {
                      setOtherNature(e.target.value);
                      if (e.target.value === "clearing") {
                        setAdvBehavior("clearing");
                      } else if (e.target.value === "asset") {
                        setAdvBehavior("immediate");
                      } else if (e.target.value === "liability") {
                        setAdvBehavior("restricted");
                      } else {
                        setAdvBehavior("delayed");
                      }
                    }}
                    className="w-full h-10 bg-surface-base border border-border-subtle text-text-primary rounded-lg px-2 outline-none"
                  >
                    <option value="">Selecione o propósito...</option>
                    <option value="asset">Pertence à igreja (Ativo)</option>
                    <option value="liability">
                      É uma dívida da igreja (Passivo)
                    </option>
                    <option value="receivable">
                      É um valor a receber (Recebível)
                    </option>
                    <option value="clearing">
                      Serve apenas para controle temporário (Compensação)
                    </option>
                  </select>
                </div>
              )}

              {/* Advanced Technical Toggle */}
              {representation && (
                <div className="border-t border-border-subtle/50 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1 text-text-muted hover:text-text-primary font-medium focus:outline-none"
                  >
                    {showAdvanced ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    <span>Modo Avançado (Classificação Técnica)</span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 bg-surface-base/50 p-3 rounded-lg border border-border-subtle/40 flex flex-col gap-3.5 animate-fadeIn text-xs text-text-muted">
                      <div>
                        <span className="font-semibold text-text-primary block mb-0.5">
                          Mapeamento Server-side Detectado:
                        </span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div className="bg-surface-elevated/40 p-2 rounded border border-border-subtle/20">
                            <strong>Tipo de conta:</strong>{" "}
                            <code className="text-amber-500 font-semibold">
                              {representation === "other"
                                ? "other"
                                : representation || "Pendente"}
                            </code>
                          </div>
                          <div className="bg-surface-elevated/40 p-2 rounded border border-border-subtle/20">
                            <strong>Natureza técnica:</strong>{" "}
                            <code className="text-amber-500 font-semibold">
                              {representation === "other"
                                ? otherNature || "Pendente"
                                : representation === "cash" ||
                                    representation === "bank_checking" ||
                                    representation === "payment_account"
                                  ? "asset"
                                  : representation === "credit_card" ||
                                      representation === "reimbursement_payable"
                                    ? "liability"
                                    : representation === "card_receivable"
                                      ? "receivable"
                                      : "Pendente"}
                            </code>
                          </div>
                        </div>
                      </div>

                      {representation === "other" && (
                        <>
                          <div className="flex flex-col gap-1">
                            <label className="font-semibold text-text-primary">
                              Finalidade Operacional (Mínimo 5 caracteres)
                            </label>
                            <textarea
                              rows={2}
                              value={advPurpose}
                              onChange={(e) => setAdvPurpose(e.target.value)}
                              placeholder="Descreva para que serve esta conta..."
                              className="w-full bg-surface-base border border-border-subtle text-text-primary rounded-lg p-2 outline-none resize-none"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="font-semibold text-text-primary">
                              Meios Suportados
                            </label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {["pix", "cash", "transfer", "slip", "card"].map(
                                (inst) => (
                                  <button
                                    type="button"
                                    key={inst}
                                    onClick={() => toggleInstrument(inst)}
                                    className={`px-2.5 py-1 rounded-full border transition-colors ${advInstruments.includes(inst) ? "bg-amber-500/20 border-amber-500 text-amber-500 font-semibold" : "border-border-subtle text-text-muted bg-surface-base"}`}
                                  >
                                    {inst === "pix"
                                      ? "Pix"
                                      : inst === "cash"
                                        ? "Dinheiro"
                                        : inst === "transfer"
                                          ? "Transf."
                                          : inst === "slip"
                                            ? "Boleto"
                                            : "Cartão"}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="font-semibold text-text-primary">
                              Comportamento de Disponibilidade
                            </label>
                            <select
                              value={advBehavior}
                              onChange={(e) => setAdvBehavior(e.target.value)}
                              className="w-full h-8 bg-surface-base border border-border-subtle text-text-primary rounded px-2 outline-none"
                            >
                              <option value="immediate">
                                Imediata (immediate)
                              </option>
                              <option value="delayed">
                                Diferida (delayed)
                              </option>
                              <option value="restricted">
                                Restrita (restricted)
                              </option>
                              <option value="clearing">
                                Compensação (clearing)
                              </option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p className="text-red-500 font-medium mt-1">{error}</p>
              )}

              {success ? (
                <div className="flex items-center gap-1.5 text-green-500 font-medium mt-1">
                  <CheckCircle className="w-4 h-4 animate-bounce" /> Conta
                  configurada com sucesso!
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={handleSaveCustomConfig}
                    disabled={
                      loading ||
                      !representation ||
                      (representation === "other" && !otherNature)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? "Salvando..." : "Salvar e Concluir"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfigWizard(false);
                      setError(null);
                    }}
                    className="inline-flex items-center px-3 py-1.5 bg-surface-base hover:bg-surface-secondary border border-border-subtle text-text-primary rounded-lg transition-colors"
                  >
                    Voltar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
