import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  HelpCircle,
  ListChecks,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { Language } from '@/src/contexts/LanguageContext';
import { Button, Surface } from '@/src/components/foundation';
import type {
  ReconciliationBankAccount,
  ReconciliationStatementSource,
} from '../../../../shared/finance/reconciliation.js';
import type {
  ReconciliationPreparationUnavailableReason,
  ReconciliationStatementPreparationResponse,
} from '../../../../shared/finance/reconciliationStatementPreparation.js';
import type {
  PreparedStatementLine,
  StatementLineParseState,
} from '../../../../shared/finance/reconciliationStatementLines.js';
import { reconciliationService } from '@/src/services/reconciliationService';

type Props = {
  organizationId: string;
  financeEntityId: string;
  statement: ReconciliationStatementSource;
  eligibleAccounts: ReconciliationBankAccount[];
  language: Language;
};

type Copy = {
  title: string;
  body: string;
  chooseAccount: string;
  accountFallback: string;
  prepare: string;
  preparing: string;
  retry: string;
  errorTitle: string;
  errorBody: string;
  safeNote: string;
  noAccount: string;
  unavailableTitle: string;
  unavailable: Record<ReconciliationPreparationUnavailableReason, string>;
  candidatesLabel: string;
  prepared: string;
  confirm: string;
  limited: string;
  noLinesTitle: string;
  noLinesBody: string;
  date: string;
  description: string;
  amount: string;
  inflow: string;
  outflow: string;
  unknown: string;
  multipleDates: string;
  multipleAmounts: string;
  rawLine: string;
  showRaw: string;
  states: Record<StatementLineParseState, string>;
  showingLimit: string;
  humanReview: string;
};

const COPY: Record<Language, Copy> = {
  PT: {
    title: 'Preparar linhas do extrato',
    body: 'Organize candidatos de data, valor e direção a partir do texto nativo deste PDF. Nada é conciliado automaticamente.',
    chooseAccount: 'Qual conta este extrato representa?',
    accountFallback: 'Conta bancária',
    prepare: 'Preparar linhas',
    preparing: 'Preparando…',
    retry: 'Preparar novamente',
    errorTitle: 'Não foi possível preparar as linhas',
    errorBody: 'Tente novamente. Nenhuma movimentação, saldo ou conciliação foi alterada.',
    safeNote: 'Análise determinística, sem OCR e sem IA. A associação com a conta vale apenas para esta análise e não é salva.',
    noAccount: 'Configure pelo menos uma conta bancária pronta antes de preparar este extrato.',
    unavailableTitle: 'O texto deste PDF não está disponível para preparação segura',
    unavailable: {
      input_too_large: 'O PDF ultrapassa o limite seguro desta etapa.',
      encrypted: 'O PDF está protegido ou criptografado.',
      text_layer_not_detected: 'Não foi encontrada uma camada de texto nativa. OCR continua desativado.',
      structural_preflight_incomplete: 'A estrutura do PDF não passou pelas verificações necessárias.',
      page_limit_exceeded: 'O PDF tem páginas demais para esta etapa.',
      extraction_empty: 'A camada de texto não retornou conteúdo utilizável.',
      parser_error: 'O analisador nativo não conseguiu ler este PDF com segurança.',
    },
    candidatesLabel: 'Linhas candidatas',
    prepared: 'Com direção explícita',
    confirm: 'Precisam de confirmação',
    limited: 'A análise atingiu um limite de segurança. A fonte original continua preservada.',
    noLinesTitle: 'Nenhuma linha segura foi preparada',
    noLinesBody: 'O texto existe, mas não encontramos linhas com data válida e valor decimal de forma suficientemente clara.',
    date: 'Data',
    description: 'Descrição',
    amount: 'Valor',
    inflow: 'Entrada',
    outflow: 'Saída',
    unknown: 'Confirmar',
    multipleDates: 'Múltiplas datas',
    multipleAmounts: 'Múltiplos valores',
    rawLine: 'Linha original',
    showRaw: 'Ver origem',
    states: {
      prepared: 'Estrutura clara',
      needs_direction_confirmation: 'Confirmar entrada/saída',
      needs_amount_choice: 'Escolher o valor',
      needs_date_choice: 'Escolher a data',
    },
    showingLimit: 'A lista visual mostra as primeiras 100 linhas para manter a tela rápida.',
    humanReview: 'Mesmo as linhas estruturadas continuam não confirmadas. O NestFinance não as transforma em lançamentos ou conciliações nesta etapa.',
  },
  EN: {
    title: 'Prepare statement lines',
    body: 'Organize date, amount, and direction candidates from this PDF’s native text. Nothing is reconciled automatically.',
    chooseAccount: 'Which account does this statement represent?',
    accountFallback: 'Bank account',
    prepare: 'Prepare lines',
    preparing: 'Preparing…',
    retry: 'Prepare again',
    errorTitle: 'Unable to prepare statement lines',
    errorBody: 'Try again. No transaction, balance, or reconciliation was changed.',
    safeNote: 'Deterministic analysis with no OCR or AI. The account association is only request context and is not saved.',
    noAccount: 'Configure at least one ready bank account before preparing this statement.',
    unavailableTitle: 'This PDF text is not available for safe preparation',
    unavailable: {
      input_too_large: 'The PDF exceeds the safe size limit for this stage.',
      encrypted: 'The PDF is protected or encrypted.',
      text_layer_not_detected: 'No native text layer was found. OCR remains disabled.',
      structural_preflight_incomplete: 'The PDF structure did not pass the required checks.',
      page_limit_exceeded: 'The PDF has too many pages for this stage.',
      extraction_empty: 'The text layer returned no usable content.',
      parser_error: 'The native analyzer could not read this PDF safely.',
    },
    candidatesLabel: 'Candidate lines',
    prepared: 'Explicit direction',
    confirm: 'Need confirmation',
    limited: 'The analysis reached a safety limit. The original source remains preserved.',
    noLinesTitle: 'No safe lines were prepared',
    noLinesBody: 'Text exists, but no lines with a valid date and sufficiently clear decimal amount were found.',
    date: 'Date',
    description: 'Description',
    amount: 'Amount',
    inflow: 'Inflow',
    outflow: 'Outflow',
    unknown: 'Confirm',
    multipleDates: 'Multiple dates',
    multipleAmounts: 'Multiple amounts',
    rawLine: 'Original line',
    showRaw: 'View source',
    states: {
      prepared: 'Clear structure',
      needs_direction_confirmation: 'Confirm inflow/outflow',
      needs_amount_choice: 'Choose amount',
      needs_date_choice: 'Choose date',
    },
    showingLimit: 'The visual list shows the first 100 lines to keep the screen fast.',
    humanReview: 'Even structured lines remain unconfirmed. NestFinance does not turn them into postings or reconciliations at this stage.',
  },
  ES: {
    title: 'Preparar líneas del extracto',
    body: 'Organiza candidatos de fecha, valor y dirección desde el texto nativo de este PDF. Nada se concilia automáticamente.',
    chooseAccount: '¿Qué cuenta representa este extracto?',
    accountFallback: 'Cuenta bancaria',
    prepare: 'Preparar líneas',
    preparing: 'Preparando…',
    retry: 'Preparar de nuevo',
    errorTitle: 'No fue posible preparar las líneas',
    errorBody: 'Inténtalo de nuevo. Ningún movimiento, saldo o conciliación fue modificado.',
    safeNote: 'Análisis determinístico, sin OCR ni IA. La asociación con la cuenta vale solo para este análisis y no se guarda.',
    noAccount: 'Configura al menos una cuenta bancaria lista antes de preparar este extracto.',
    unavailableTitle: 'El texto de este PDF no está disponible para una preparación segura',
    unavailable: {
      input_too_large: 'El PDF supera el límite seguro de esta etapa.',
      encrypted: 'El PDF está protegido o cifrado.',
      text_layer_not_detected: 'No se encontró una capa de texto nativa. OCR permanece desactivado.',
      structural_preflight_incomplete: 'La estructura del PDF no superó las verificaciones necesarias.',
      page_limit_exceeded: 'El PDF tiene demasiadas páginas para esta etapa.',
      extraction_empty: 'La capa de texto no devolvió contenido utilizable.',
      parser_error: 'El analizador nativo no pudo leer este PDF de forma segura.',
    },
    candidatesLabel: 'Líneas candidatas',
    prepared: 'Con dirección explícita',
    confirm: 'Necesitan confirmación',
    limited: 'El análisis alcanzó un límite de seguridad. La fuente original permanece preservada.',
    noLinesTitle: 'No se prepararon líneas seguras',
    noLinesBody: 'Existe texto, pero no encontramos líneas con fecha válida y valor decimal suficientemente claro.',
    date: 'Fecha',
    description: 'Descripción',
    amount: 'Valor',
    inflow: 'Entrada',
    outflow: 'Salida',
    unknown: 'Confirmar',
    multipleDates: 'Múltiples fechas',
    multipleAmounts: 'Múltiples valores',
    rawLine: 'Línea original',
    showRaw: 'Ver origen',
    states: {
      prepared: 'Estructura clara',
      needs_direction_confirmation: 'Confirmar entrada/salida',
      needs_amount_choice: 'Elegir valor',
      needs_date_choice: 'Elegir fecha',
    },
    showingLimit: 'La lista visual muestra las primeras 100 líneas para mantener la pantalla rápida.',
    humanReview: 'Incluso las líneas estructuradas siguen sin confirmar. NestFinance no las convierte en asientos ni conciliaciones en esta etapa.',
  },
};

function formatMoney(cents: number, language: Language) {
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(value: string, language: Language) {
  const date = new Date(value + 'T12:00:00.000Z');
  if (Number.isNaN(date.getTime())) return value;
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function accountLabel(account: ReconciliationBankAccount, copy: Copy) {
  const parts = [account.name || copy.accountFallback];
  if (account.institutionName) parts.push(account.institutionName);
  if (account.accountLast4) parts.push('•••• ' + account.accountLast4);
  return parts.join(' · ');
}

function directionPresentation(line: PreparedStatementLine, copy: Copy) {
  if (line.selectedDirection === 'inflow') {
    return { label: copy.inflow, icon: ArrowDownLeft, className: 'text-semantic-success' };
  }
  if (line.selectedDirection === 'outflow') {
    return { label: copy.outflow, icon: ArrowUpRight, className: 'text-semantic-warning' };
  }
  return { label: copy.unknown, icon: HelpCircle, className: 'text-text-muted' };
}

export function ReconciliationStatementPreparationPanel({
  organizationId,
  financeEntityId,
  statement,
  eligibleAccounts,
  language,
}: Props) {
  const copy = COPY[language];
  const [accountId, setAccountId] = useState(eligibleAccounts[0]?.accountId || '');
  const [result, setResult] = useState<ReconciliationStatementPreparationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAccountId((current) =>
      eligibleAccounts.some((account) => account.accountId === current)
        ? current
        : eligibleAccounts[0]?.accountId || '',
    );
    setResult(null);
    setFailed(false);
  }, [eligibleAccounts, statement.evidenceId]);

  const visibleLines = useMemo(
    () => result?.state === 'prepared' ? result.preparation.lines.slice(0, 100) : [],
    [result],
  );

  const prepare = async () => {
    if (!accountId) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(
        await reconciliationService.prepareStatement(
          organizationId,
          financeEntityId,
          statement.evidenceId,
          accountId,
        ),
      );
    } catch {
      setResult(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (eligibleAccounts.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-semantic-warning/20 bg-semantic-warning/10 p-4 text-sm text-text-secondary">
        {copy.noAccount}
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-text-primary">{copy.title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.body}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.chooseAccount}</span>
          <select
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              setResult(null);
              setFailed(false);
            }}
            className="min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-primary outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
          >
            {eligibleAccounts.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {accountLabel(account, copy)}
              </option>
            ))}
          </select>
        </label>

        <Button variant="secondary" disabled={loading || !accountId} onClick={() => void prepare()}>
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              {copy.preparing}
            </>
          ) : result || failed ? copy.retry : copy.prepare}
        </Button>
      </div>

      <div className="mt-3 flex gap-2 rounded-lg border border-border-subtle bg-surface-secondary px-3 py-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-semantic-success" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-text-muted">{copy.safeNote}</p>
      </div>

      {failed ? (
        <div className="mt-4 rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-text-primary">{copy.errorTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.errorBody}</p>
            </div>
          </div>
        </div>
      ) : null}

      {result?.state === 'unavailable' ? (
        <div className="mt-4 rounded-xl border border-semantic-warning/20 bg-semantic-warning/10 p-4">
          <p className="text-sm font-semibold text-text-primary">{copy.unavailableTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {copy.unavailable[result.extraction.reason]}
          </p>
        </div>
      ) : null}

      {result?.state === 'prepared' ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Surface variant="subtle" radius="lg" className="p-3">
              <p className="text-[11px] font-medium text-text-muted">{copy.candidatesLabel}</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">{result.preparation.candidateLines}</p>
            </Surface>
            <Surface variant="subtle" radius="lg" className="p-3">
              <p className="text-[11px] font-medium text-text-muted">{copy.prepared}</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">{result.preparation.preparedLines}</p>
            </Surface>
            <Surface variant="subtle" radius="lg" className="p-3">
              <p className="text-[11px] font-medium text-text-muted">{copy.confirm}</p>
              <p className="mt-1 text-xl font-semibold text-text-primary">{result.preparation.needsConfirmationLines}</p>
            </Surface>
          </div>

          {result.preparation.limited ? (
            <p className="rounded-lg border border-semantic-warning/20 bg-semantic-warning/10 px-3 py-2 text-xs leading-relaxed text-text-muted">
              {copy.limited}
            </p>
          ) : null}

          {result.preparation.lines.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface-secondary p-4">
              <p className="text-sm font-semibold text-text-primary">{copy.noLinesTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.noLinesBody}</p>
            </div>
          ) : (
            <>
              {result.preparation.lines.length > visibleLines.length ? (
                <p className="text-xs text-text-muted">{copy.showingLimit}</p>
              ) : null}

              <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
                {visibleLines.map((line) => {
                  const direction = directionPresentation(line, copy);
                  const DirectionIcon = direction.icon;
                  return (
                    <div
                      key={String(line.lineNumber) + ':' + line.raw}
                      className="rounded-xl border border-border-subtle bg-surface-base p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full border border-border-subtle bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
                          {copy.states[line.parseState]}
                        </span>
                        <span className={'inline-flex items-center gap-1.5 text-xs font-semibold ' + direction.className}>
                          <DirectionIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {direction.label}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.date}</p>
                          <p className="mt-1 text-sm font-medium text-text-primary">
                            {line.selectedDate ? formatDate(line.selectedDate, language) : copy.multipleDates}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.description}</p>
                          <p className="mt-1 truncate text-sm text-text-secondary">
                            {line.descriptionCandidate || '—'}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.amount}</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                            {line.selectedAmountCents !== null
                              ? formatMoney(line.selectedAmountCents, language)
                              : copy.multipleAmounts}
                          </p>
                        </div>
                      </div>

                      <details className="mt-3 border-t border-border-subtle pt-2">
                        <summary className="cursor-pointer text-xs font-medium text-accent-primary">{copy.showRaw}</summary>
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          {copy.rawLine} {line.lineNumber}
                        </p>
                        <p className="mt-1 break-words font-mono text-xs leading-relaxed text-text-secondary">{line.raw}</p>
                      </details>
                    </div>
                  );
                })}
              </div>

              <p className="rounded-lg border border-border-subtle bg-surface-secondary px-3 py-2 text-xs leading-relaxed text-text-muted">
                {copy.humanReview}
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
