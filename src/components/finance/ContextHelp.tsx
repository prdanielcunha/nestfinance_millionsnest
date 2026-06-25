import React from "react";
import { HelpCircle } from "lucide-react";

interface ContextHelpProps {
  topic:
    | "account"
    | "fund"
    | "category"
    | "payment_method"
    | "cost_center"
    | "draft"
    | "review"
    | "liability_settlement"
    | "cash_account";
}

const HELP_DATA: Record<
  ContextHelpProps["topic"],
  { title: string; text: string }
> = {
  account: {
    title: "Conta Financeira",
    text: "Representa a conta bancária ou caixa físico de onde saem ou entram os recursos da igreja. É o local físico ou digital que armazena os saldos.",
  },
  fund: {
    title: "Fundo Destinado",
    text: "Permite separar o dinheiro da igreja por destinação final (ex: Fundo Geral, Missões, Construção). Funciona como uma reserva contábil vinculada.",
  },
  category: {
    title: "Categoria (Taxonomia)",
    text: "Classificação contábil da receita ou despesa (ex: Dízimos, Aluguel). Essencial para a emissão de relatórios fiscais e prestação de contas.",
  },
  payment_method: {
    title: "Forma de Pagamento",
    text: "O meio físico ou digital utilizado na movimentação (ex: Pix, Dinheiro, Cartão, Boleto, Cheque). Possui validações inteligentes com a conta.",
  },
  cost_center: {
    title: "Centro de Custo",
    text: "Identifica o departamento, filial ou ministério responsável por aquela movimentação, permitindo analisar custos e orçamentos de forma segmentada.",
  },
  draft: {
    title: "Rascunho de Lançamento",
    text: "Salvar como rascunho preserva os dados inseridos sem afetar os saldos reais e sem submeter à auditoria. Ideal para concluir lançamentos mais tarde.",
  },
  review: {
    title: "Fila de Revisão",
    text: "Movimentações submetidas entram no fluxo de auditoria. Um revisor fiscal analisará as informações, podendo aprovar para lançamento definitivo ou devolver.",
  },
  liability_settlement: {
    title: "Liquidação de Passivo",
    text: "Gatilho para quitar obrigações registradas anteriormente no passivo da igreja, como faturas de cartão corporativo ou devoluções de reembolsos.",
  },
  cash_account: {
    title: "Caixa Físico",
    text: "Dinheiro vivo guardado na tesouraria da igreja. Suporta exclusivamente formas físicas de pagamento (Dinheiro) ou outros métodos documentados.",
  },
};

export default function ContextHelp({ topic }: ContextHelpProps) {
  const { title, text } = HELP_DATA[topic];

  return (
    <span className="relative inline-block group ml-1.5 align-middle select-none">
      <HelpCircle className="w-4 h-4 text-text-muted hover:text-text-primary transition-colors cursor-pointer" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3.5 bg-surface-elevated border border-border-subtle rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 text-left">
        <span className="block font-semibold text-text-primary text-xs mb-1">
          {title}
        </span>
        <span className="block text-[11px] text-text-secondary leading-relaxed font-normal">
          {text}
        </span>
      </span>
    </span>
  );
}
