import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import type { Language } from '@/src/contexts/LanguageContext';
import { reconciliationService } from '@/src/services/reconciliationService';
import type { ReconciliationMatchPreviewResponse } from '../../../../shared/finance/reconciliationMatchPreviewApi.js';
import type { ReconciliationLineMatchPreview } from '../../../../shared/finance/reconciliationMatchPreview.js';

type Props = {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  accountId: string;
  language: Language;
  preparedLines: number;
};

type Copy = {
  title: string;
  body: string;
  action: string;
  loading: string;
  retry: string;
  safe: string;
  errorTitle: string;
  errorBody: string;
  unavailable: string;
  summarySingle: string;
  summaryMultiple: string;
  summaryNone: string;
  summarySkipped: string;
  noPrepared: string;
  sourceLine: string;
  possibleOne: string;
  possibleMany: (count: number) => string;
  possibleNone: string;
  directionIn: string;
  directionOut: string;
  dateExact: string;
  dateAdjacent: string;
  amountExact: string;
  accountExact: string;
  directionCompatible: string;
  openRecord: string;
  transactionFallback: string;
  postingStates: Record<string, string>;
  statuses: Record<string, string>;
  reconciliationUnknown: string;
  reconciliationEligible: string;
  reconciliationNotEligible: string;
  humanDecision: string;
};

const COPY: Record<Language, Copy> = {
  PT: {
    title: 'Comparar com as movimentações registradas',
    body: 'O NestFinance compara os itens claros do extrato com as movimentações já registradas nesta conta e mostra as possibilidades para você conferir.',
    action: 'Procurar possíveis pares',
    loading: 'Comparando…',
    retry: 'Comparar novamente',
    safe: 'Uma opção só aparece quando o valor é igual, a conta é a mesma, entrada/saída é compatível e a data é igual ou tem no máximo 1 dia de diferença.',
    errorTitle: 'Não foi possível comparar',
    errorBody: 'Tente novamente. Nenhum lançamento, saldo ou estado de conciliação foi alterado.',
    unavailable: 'A fonte deixou de estar disponível para comparação segura. Nada foi alterado.',
    summarySingle: 'Uma possibilidade',
    summaryMultiple: 'Mais de uma possibilidade',
    summaryNone: 'Sem correspondência',
    summarySkipped: 'Itens que ainda precisam de conferência',
    noPrepared: 'Antes de comparar, confira os itens em que data, valor ou entrada/saída ainda não estão claros.',
    sourceLine: 'Linha do extrato',
    possibleOne: '1 possibilidade encontrada',
    possibleMany: (count) => String(count) + ' possibilidades encontradas',
    possibleNone: 'Nenhuma movimentação registrada combina com estes critérios',
    directionIn: 'Entrada',
    directionOut: 'Saída',
    dateExact: 'Mesma data',
    dateAdjacent: 'Data com 1 dia de diferença',
    amountExact: 'Mesmo valor',
    accountExact: 'Mesma conta',
    directionCompatible: 'Direção compatível',
    openRecord: 'Abrir movimentação',
    transactionFallback: 'Movimentação financeira',
    postingStates: {
      posted: 'Lançada',
      not_posted: 'Ainda não lançada',
    },
    statuses: {
      draft: 'Rascunho',
      ready_for_review: 'Aguardando revisão',
      approved_for_posting: 'Aprovada para lançamento',
      posted: 'Lançada',
    },
    reconciliationUnknown: 'Ainda não sabemos se esta movimentação já foi conciliada',
    reconciliationEligible: 'Lançada e disponível para uma futura confirmação de conciliação',
    reconciliationNotEligible: 'Esta movimentação ainda não está pronta para conciliação',
    humanDecision: 'Mesmo quando há apenas uma possibilidade, o NestFinance não decide sozinho. A confirmação será feita por uma pessoa e ficará registrada no histórico.',
  },
  EN: {
    title: 'Compare with recorded transactions',
    body: 'NestFinance compares clear statement items with transactions already recorded for this account and shows the possibilities for review.',
    action: 'Find possible pairs',
    loading: 'Comparing…',
    retry: 'Compare again',
    safe: 'An option only appears when the amount is exact, the account is the same, money-in/out is compatible, and the date is the same or at most 1 day apart.',
    errorTitle: 'Unable to compare',
    errorBody: 'Try again. No posting, balance, or reconciliation state was changed.',
    unavailable: 'The source is no longer available for safe comparison. Nothing was changed.',
    summarySingle: 'One possibility',
    summaryMultiple: 'Multiple possibilities',
    summaryNone: 'No match found',
    summarySkipped: 'Items still needing review',
    noPrepared: 'Before comparing, review items where date, amount, or money-in/out is still unclear.',
    sourceLine: 'Statement line',
    possibleOne: '1 possibility found',
    possibleMany: (count) => String(count) + ' possibilities found',
    possibleNone: 'No recorded transaction matches these criteria',
    directionIn: 'Inflow',
    directionOut: 'Outflow',
    dateExact: 'Same date',
    dateAdjacent: 'Date differs by 1 day',
    amountExact: 'Same amount',
    accountExact: 'Same account',
    directionCompatible: 'Compatible direction',
    openRecord: 'Open transaction',
    transactionFallback: 'Financial transaction',
    postingStates: {
      posted: 'Posted',
      not_posted: 'Not posted yet',
    },
    statuses: {
      draft: 'Draft',
      ready_for_review: 'Awaiting review',
      approved_for_posting: 'Approved for posting',
      posted: 'Posted',
    },
    reconciliationUnknown: 'We do not yet know whether this transaction was already reconciled',
    reconciliationEligible: 'Posted and available for a future reconciliation confirmation',
    reconciliationNotEligible: 'This transaction is not ready for reconciliation yet',
    humanDecision: 'Even when there is only one possibility, NestFinance does not decide by itself. A person will confirm it and that decision will be recorded in history.',
  },
  ES: {
    title: 'Comparar con los movimientos registrados',
    body: 'NestFinance compara los elementos claros del extracto con los movimientos ya registrados en esta cuenta y muestra las posibilidades para revisión.',
    action: 'Buscar posibles pares',
    loading: 'Comparando…',
    retry: 'Comparar de nuevo',
    safe: 'Una opción solo aparece cuando el valor es igual, la cuenta es la misma, entrada/salida es compatible y la fecha es igual o tiene como máximo 1 día de diferencia.',
    errorTitle: 'No fue posible comparar',
    errorBody: 'Inténtalo de nuevo. Ningún asiento, saldo o estado de conciliación fue modificado.',
    unavailable: 'La fuente ya no está disponible para una comparación segura. Nada fue modificado.',
    summarySingle: 'Una posibilidad',
    summaryMultiple: 'Varias posibilidades',
    summaryNone: 'Sin correspondencia',
    summarySkipped: 'Elementos que aún necesitan revisión',
    noPrepared: 'Antes de comparar, revisa los elementos donde fecha, valor o entrada/salida todavía no están claros.',
    sourceLine: 'Línea del extracto',
    possibleOne: '1 posibilidad encontrada',
    possibleMany: (count) => String(count) + ' posibilidades encontradas',
    possibleNone: 'Ningún movimiento registrado coincide con estos criterios',
    directionIn: 'Entrada',
    directionOut: 'Salida',
    dateExact: 'Misma fecha',
    dateAdjacent: 'Fecha con 1 día de diferencia',
    amountExact: 'Mismo valor',
    accountExact: 'Misma cuenta',
    directionCompatible: 'Dirección compatible',
    openRecord: 'Abrir movimiento',
    transactionFallback: 'Movimiento financiero',
    postingStates: {
      posted: 'Registrada',
      not_posted: 'Aún no registrada',
    },
    statuses: {
      draft: 'Borrador',
      ready_for_review: 'Esperando revisión',
      approved_for_posting: 'Aprobada para registro',
      posted: 'Registrada',
    },
    reconciliationUnknown: 'Todavía no sabemos si este movimiento ya fue conciliado',
    reconciliationEligible: 'Registrada y disponible para una futura confirmación de conciliación',
    reconciliationNotEligible: 'Este movimiento todavía no está listo para conciliación',
    humanDecision: 'Incluso cuando hay una sola posibilidad, NestFinance no decide solo. Una persona la confirmará y esa decisión quedará registrada en el historial.',
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

function lineDirection(line: ReconciliationLineMatchPreview, copy: Copy) {
  return line.sourceDirection === 'inflow'
    ? { label: copy.directionIn, icon: ArrowDownLeft, className: 'text-semantic-success' }
    : { label: copy.directionOut, icon: ArrowUpRight, className: 'text-semantic-warning' };
}

export function ReconciliationMatchPreviewPanel({
  organizationId,
  financeEntityId,
  evidenceId,
  accountId,
  language,
  preparedLines,
}: Props) {
  const copy = COPY[language];
  const navigate = useNavigate();
  const [result, setResult] = useState<ReconciliationMatchPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setResult(null);
    setFailed(false);
    setLoading(false);
  }, [organizationId, financeEntityId, evidenceId, accountId]);

  const load = async () => {
    if (!accountId || preparedLines <= 0) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(
        await reconciliationService.previewMatches(
          organizationId,
          financeEntityId,
          evidenceId,
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

  return (
    <div className="mt-5 rounded-2xl border border-border-subtle bg-surface-secondary/50 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
            <Search className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-text-primary">{copy.title}</h4>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.body}</p>
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={loading || preparedLines <= 0}
          onClick={() => void load()}
        >
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              {copy.loading}
            </>
          ) : result || failed ? copy.retry : copy.action}
        </Button>
      </div>

      <div className="mt-3 flex gap-2 rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-semantic-success" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-text-muted">{copy.safe}</p>
      </div>

      {preparedLines <= 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-text-muted">{copy.noPrepared}</p>
      ) : null}

      {failed ? (
        <div className="mt-4 rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-4">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-text-primary">{copy.errorTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.errorBody}</p>
            </div>
          </div>
        </div>
      ) : null}

      {result?.state === 'unavailable' ? (
        <p className="mt-4 rounded-xl border border-semantic-warning/20 bg-semantic-warning/10 p-4 text-xs leading-relaxed text-text-muted">
          {copy.unavailable}
        </p>
      ) : null}

      {result?.state === 'preview' ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { label: copy.summarySingle, value: result.preview.singleCandidateLines },
              { label: copy.summaryMultiple, value: result.preview.multipleCandidateLines },
              { label: copy.summaryNone, value: result.preview.noCandidateLines },
              { label: copy.summarySkipped, value: result.preview.skippedUnconfirmedLines },
            ].map((item) => (
              <Surface key={item.label} variant="elevated" radius="lg" className="p-3">
                <p className="text-[11px] font-medium text-text-muted">{item.label}</p>
                <p className="mt-1 text-xl font-semibold text-text-primary">{item.value}</p>
              </Surface>
            ))}
          </div>

          <div className="space-y-3">
            {result.preview.lines.map((line) => {
              const direction = lineDirection(line, copy);
              const DirectionIcon = direction.icon;
              const stateLabel =
                line.state === 'single_candidate'
                  ? copy.possibleOne
                  : line.state === 'multiple_candidates'
                    ? copy.possibleMany(line.totalCandidates)
                    : copy.possibleNone;

              return (
                <Surface key={line.lineNumber} variant="elevated" radius="lg" className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        {copy.sourceLine} {line.lineNumber}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium text-text-primary">{formatDate(line.sourceDate, language)}</span>
                        <span className="font-semibold tabular-nums text-text-primary">{formatMoney(line.sourceAmountCents, language)}</span>
                        <span className={'inline-flex items-center gap-1 font-medium ' + direction.className}>
                          <DirectionIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {direction.label}
                        </span>
                      </div>
                      {line.sourceDescription ? (
                        <p className="mt-1 text-xs text-text-muted">{line.sourceDescription}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 text-xs font-semibold text-text-secondary">
                      {stateLabel}
                    </span>
                  </div>

                  {line.candidates.length > 0 ? (
                    <div className="mt-4 space-y-2 border-t border-border-subtle pt-3">
                      {line.candidates.map((candidate) => (
                        <div key={candidate.transactionId} className="rounded-xl border border-border-subtle bg-surface-base p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-text-primary">
                                  {candidate.description || copy.transactionFallback}
                                </span>
                                <span className="rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                                  {copy.statuses[candidate.transactionStatus] || candidate.transactionStatus}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-text-muted">
                                {formatDate(candidate.occurredAt, language)} · {formatMoney(candidate.amountCents, language)}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="rounded-full bg-semantic-success/10 px-2 py-1 text-[10px] font-medium text-semantic-success">{copy.amountExact}</span>
                                <span className="rounded-full bg-semantic-success/10 px-2 py-1 text-[10px] font-medium text-semantic-success">{copy.accountExact}</span>
                                <span className="rounded-full bg-semantic-success/10 px-2 py-1 text-[10px] font-medium text-semantic-success">{copy.directionCompatible}</span>
                                <span className="rounded-full bg-surface-secondary px-2 py-1 text-[10px] font-medium text-text-muted">
                                  {candidate.evidence.date === 'exact' ? copy.dateExact : copy.dateAdjacent}
                                </span>
                              </div>
                              <p className="mt-2 text-[11px] text-text-muted">
                                {copy.postingStates[candidate.postingState]}
                                {' · '}
                                {candidate.reconciliationStatus === 'unknown'
                                  ? copy.reconciliationUnknown
                                  : candidate.reconciliationEligible
                                    ? copy.reconciliationEligible
                                    : copy.reconciliationNotEligible}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              onClick={() => navigate(APP_ROUTES.transactionDetail.replace(':transactionId', candidate.transactionId))}
                            >
                              {copy.openRecord}
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {line.candidateLimitReached ? (
                        <p className="text-xs text-text-muted">
                          <HelpCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                          {copy.possibleMany(line.totalCandidates)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3 text-xs text-text-muted">
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                      {copy.possibleNone}
                    </div>
                  )}
                </Surface>
              );
            })}
          </div>

          <div className="flex gap-2 rounded-lg border border-border-subtle bg-surface-base px-3 py-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-text-muted">{copy.humanDecision}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
