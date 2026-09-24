import { useEffect, useRef, useState } from 'react';
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
import { ReconciliationExceptionsPanel } from './ReconciliationExceptionsPanel';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { generateLedgerId } from '../../../../shared/finance/ledger/ids.js';
import type { ReconciliationMatchPreviewResponse } from '../../../../shared/finance/reconciliationMatchPreviewApi.js';
import type {
  ReconciliationLineMatchPreview,
  ReconciliationMatchCandidate,
} from '../../../../shared/finance/reconciliationMatchPreview.js';
import type { ReconciliationConfirmResponse } from '../../../../shared/finance/reconciliationConfirmation.js';

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
  confirmAction: string;
  confirmTitle: string;
  confirmBody: string;
  confirmYes: string;
  confirmCancel: string;
  confirming: string;
  confirmSuccessTitle: string;
  confirmSuccessBody: string;
  confirmErrorTitle: string;
  confirmErrorBody: string;
  confirmChanged: string;
  reviewPermission: string;
  tooManyToConfirm: string;
  offlineGuard: string;
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
    confirmAction: 'Confirmar que é a mesma movimentação',
    confirmTitle: 'Confirmar esta conferência?',
    confirmBody: 'Você está dizendo que esta movimentação registrada é o mesmo item que aparece no extrato. Isso não muda o valor nem o saldo; apenas registra que os dois conferem.',
    confirmYes: 'Sim, confirmar',
    confirmCancel: 'Cancelar',
    confirming: 'Confirmando…',
    confirmSuccessTitle: 'Conferência registrada',
    confirmSuccessBody: 'O extrato e a movimentação foram ligados com registro de quem confirmou e quando. Nenhum valor ou saldo foi alterado.',
    confirmErrorTitle: 'Não foi possível confirmar',
    confirmErrorBody: 'Atualize a comparação e tente novamente. Nenhum valor, saldo ou lançamento foi alterado.',
    confirmChanged: 'Essa movimentação ou o extrato mudou desde a comparação. Compare novamente antes de confirmar.',
    reviewPermission: 'Somente quem tem permissão para revisar o financeiro pode confirmar esta conferência.',
    tooManyToConfirm: 'Há possibilidades demais para confirmar com segurança nesta tela. Revise as movimentações antes de escolher uma.',
    offlineGuard: 'A confirmação com o banco fica bloqueada sem internet para que o servidor revalide a movimentação e o extrato.',
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
    confirmAction: 'Confirm this is the same transaction',
    confirmTitle: 'Confirm this check?',
    confirmBody: 'You are saying this recorded transaction is the same item shown on the statement. This does not change the amount or balance; it only records that they match.',
    confirmYes: 'Yes, confirm',
    confirmCancel: 'Cancel',
    confirming: 'Confirming…',
    confirmSuccessTitle: 'Check recorded',
    confirmSuccessBody: 'The statement and transaction are now linked with who confirmed it and when. No amount or balance was changed.',
    confirmErrorTitle: 'Unable to confirm',
    confirmErrorBody: 'Refresh the comparison and try again. No amount, balance, or posting was changed.',
    confirmChanged: 'This transaction or statement changed after the comparison. Compare again before confirming.',
    reviewPermission: 'Only someone with finance review permission can confirm this check.',
    tooManyToConfirm: 'There are too many possibilities to confirm safely on this screen. Review the transactions before choosing one.',
    offlineGuard: 'Bank confirmation is blocked while offline so the server can revalidate both the transaction and statement.',
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
    confirmAction: 'Confirmar que es el mismo movimiento',
    confirmTitle: '¿Confirmar esta revisión?',
    confirmBody: 'Estás indicando que este movimiento registrado es el mismo elemento que aparece en el extracto. Esto no cambia el valor ni el saldo; solo registra que ambos coinciden.',
    confirmYes: 'Sí, confirmar',
    confirmCancel: 'Cancelar',
    confirming: 'Confirmando…',
    confirmSuccessTitle: 'Revisión registrada',
    confirmSuccessBody: 'El extracto y el movimiento quedaron vinculados con quién confirmó y cuándo. Ningún valor ni saldo fue modificado.',
    confirmErrorTitle: 'No fue posible confirmar',
    confirmErrorBody: 'Actualiza la comparación e inténtalo de nuevo. Ningún valor, saldo o registro fue modificado.',
    confirmChanged: 'Este movimiento o el extracto cambió después de la comparación. Compara de nuevo antes de confirmar.',
    reviewPermission: 'Solo quien tiene permiso para revisar el financiero puede confirmar esta revisión.',
    tooManyToConfirm: 'Hay demasiadas posibilidades para confirmar con seguridad en esta pantalla. Revisa los movimientos antes de elegir uno.',
    offlineGuard: 'La confirmación con el banco queda bloqueada sin internet para que el servidor revalide el movimiento y el extracto.',
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
  const { accessState } = useAuth();
  const canConfirm = hasEffectiveCapability(accessState, 'finance.review');
  const online = useOnlineStatus();
  const [result, setResult] = useState<ReconciliationMatchPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    line: ReconciliationLineMatchPreview;
    candidate: ReconciliationMatchCandidate;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [confirmationSuccess, setConfirmationSuccess] = useState<ReconciliationConfirmResponse | null>(null);
  const confirmationIdempotencyKey = useRef<string | null>(null);
  const confirmationRequestId = useRef<string | null>(null);

  useEffect(() => {
    setResult(null);
    setFailed(false);
    setLoading(false);
    setPendingConfirmation(null);
    setConfirming(false);
    setConfirmationError(null);
    setConfirmationSuccess(null);
    confirmationIdempotencyKey.current = null;
    confirmationRequestId.current = null;
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

  const beginConfirmation = (
    line: ReconciliationLineMatchPreview,
    candidate: ReconciliationMatchCandidate,
  ) => {
    setPendingConfirmation({ line, candidate });
    setConfirmationError(null);
    setConfirmationSuccess(null);
    confirmationIdempotencyKey.current = null;
    confirmationRequestId.current = null;
  };

  const cancelConfirmation = () => {
    if (confirming) return;
    setPendingConfirmation(null);
    setConfirmationError(null);
    confirmationIdempotencyKey.current = null;
    confirmationRequestId.current = null;
  };

  const confirmMatch = async () => {
    if (!pendingConfirmation || confirming || !canConfirm || !online) return;

    if (!confirmationIdempotencyKey.current) {
      confirmationIdempotencyKey.current = generateLedgerId('idem');
    }
    if (!confirmationRequestId.current) {
      confirmationRequestId.current = generateLedgerId('req');
    }

    setConfirming(true);
    setConfirmationError(null);
    try {
      const confirmed = await reconciliationService.confirmMatch(organizationId, {
        financeEntityId,
        evidenceId,
        accountId,
        transactionId: pendingConfirmation.candidate.transactionId,
        lineNumber: pendingConfirmation.line.lineNumber,
        idempotencyKey: confirmationIdempotencyKey.current,
        requestId: confirmationRequestId.current,
      });
      setConfirmationSuccess(confirmed);
      setPendingConfirmation(null);
      confirmationIdempotencyKey.current = null;
      confirmationRequestId.current = null;
      await load();
    } catch (error: any) {
      const code = String(error?.code || '');
      setConfirmationError(
        code === 'RECONCILIATION_MATCH_NO_LONGER_VALID' ||
        code === 'RECONCILIATION_TRANSACTION_NOT_AVAILABLE' ||
        code === 'RECONCILIATION_LINE_ALREADY_CONFIRMED' ||
        code === 'RECONCILIATION_SOURCE_CHANGED' ||
        code === 'RECONCILIATION_TOO_MANY_CANDIDATES'
          ? copy.confirmChanged
          : copy.confirmErrorBody,
      );
    } finally {
      setConfirming(false);
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
      {!online ? (
        <p className="mt-3 rounded-lg border border-semantic-warning/20 bg-semantic-warning/10 px-3 py-2 text-xs leading-relaxed text-text-secondary" role="status">
          {copy.offlineGuard}
        </p>
      ) : null}

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

      {confirmationSuccess ? (
        <div className="mt-4 flex gap-3 rounded-xl border border-semantic-success/20 bg-semantic-success/10 p-4" role="status">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-semantic-success" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-text-primary">{copy.confirmSuccessTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{copy.confirmSuccessBody}</p>
          </div>
        </div>
      ) : null}

      {result?.state === 'preview' ? (
        <div className="mt-4 space-y-4">
          <ReconciliationExceptionsPanel
            lines={result.preview.lines}
            language={language}
            organizationId={organizationId}
            financeEntityId={financeEntityId}
            evidenceId={evidenceId}
            accountId={accountId}
          />

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
            {result.preview.lines.filter((line) => line.state !== 'no_candidate').map((line) => {
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
                                  {copy.statuses[candidate.transactionStatus]}
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
                            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                              {candidate.reconciliationEligible &&
                              canConfirm &&
                              !line.candidateLimitReached ? (
                                <Button
                                  onClick={() => beginConfirmation(line, candidate)}
                                >
                                  {copy.confirmAction}
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                onClick={() => navigate(APP_ROUTES.transactionDetail.replace(':transactionId', candidate.transactionId))}
                              >
                                {copy.openRecord}
                                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              {line.candidateLimitReached ? (
                                <p className="max-w-56 text-right text-[11px] leading-relaxed text-semantic-warning">
                                  {copy.tooManyToConfirm}
                                </p>
                              ) : candidate.reconciliationEligible && !canConfirm ? (
                                <p className="max-w-48 text-right text-[11px] leading-relaxed text-text-muted">
                                  {copy.reviewPermission}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {pendingConfirmation?.line.lineNumber === line.lineNumber &&
                          pendingConfirmation.candidate.transactionId === candidate.transactionId ? (
                            <div className="mt-4 rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-4">
                              <p className="text-sm font-semibold text-text-primary">{copy.confirmTitle}</p>
                              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{copy.confirmBody}</p>
                              <div className="mt-3 rounded-lg border border-border-subtle bg-surface-base p-3">
                                <p className="text-sm font-semibold text-text-primary">
                                  {formatMoney(line.sourceAmountCents, language)} · {formatDate(line.sourceDate, language)}
                                </p>
                                <p className="mt-1 text-xs text-text-muted">
                                  {candidate.description || copy.transactionFallback}
                                </p>
                              </div>
                              {confirmationError ? (
                                <p className="mt-3 text-xs leading-relaxed text-semantic-danger" role="alert">
                                  {confirmationError}
                                </p>
                              ) : null}
                              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <Button
                                  variant="secondary"
                                  disabled={confirming}
                                  onClick={cancelConfirmation}
                                >
                                  {copy.confirmCancel}
                                </Button>
                                <Button
                                  disabled={confirming}
                                  onClick={() => void confirmMatch()}
                                >
                                  {confirming ? (
                                    <>
                                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                                      {copy.confirming}
                                    </>
                                  ) : copy.confirmYes}
                                </Button>
                              </div>
                            </div>
                          ) : null}
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
