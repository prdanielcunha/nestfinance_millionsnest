import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  History,
  RotateCcw,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { reconciliationService } from '@/src/services/reconciliationService';
import { useNavigate } from 'react-router-dom';
import { generateLedgerId } from '../../../../shared/finance/ledger/ids.js';
import type { ReconciliationReversalReasonCode } from '../../../../shared/finance/reconciliationReversal.js';

type Props = {
  organizationId: string;
  financeEntityId: string;
  transactionId: string;
  reconciliationStatus?: string | null;
  reconciliationId?: string | null;
  reconciliationEvidenceId?: string | null;
  reconciledAt?: string | null;
  lastReconciliationEvidenceId?: string | null;
  lastReconciliationReversalId?: string | null;
  lastReconciliationReversedAt?: string | null;
  lastReconciliationReversalReason?: string | null;
  onChanged?: () => void | Promise<void>;
};

type Copy = {
  activeTitle: string;
  activeBody: string;
  reversedTitle: string;
  reversedBody: string;
  dateLabel: string;
  reversedDateLabel: string;
  evidenceLabel: string;
  openEvidence: string;
  sourceValue: string;
  undoAction: string;
  undoTitle: string;
  undoBody: string;
  reasonLabel: string;
  noteLabel: string;
  noteOptional: string;
  cancel: string;
  confirmUndo: string;
  undoing: string;
  permission: string;
  errorTitle: string;
  errorBody: string;
  changedError: string;
  reasons: Record<ReconciliationReversalReasonCode, string>;
};

const COPY: Record<Language, Copy> = {
  PT: {
    activeTitle: 'Conferida com extrato',
    activeBody: 'Esta movimentação foi ligada a um item do extrato após confirmação humana. Nenhum valor ou saldo foi alterado por essa conferência.',
    reversedTitle: 'Conferência desfeita',
    reversedBody: 'Uma conferência anterior foi desfeita e ficou registrada no histórico. A movimentação voltou a ficar disponível para uma nova conferência.',
    dateLabel: 'Conferida em',
    reversedDateLabel: 'Desfeita em',
    evidenceLabel: 'Fonte',
    openEvidence: 'Abrir extrato usado na conferência',
    sourceValue: 'Extrato bancário',
    undoAction: 'Desfazer conferência',
    undoTitle: 'Desfazer esta conferência?',
    undoBody: 'Isso não apaga o histórico e não muda valor nem saldo. A movimentação volta a ficar disponível para você corrigir a conferência depois.',
    reasonLabel: 'Por que você está desfazendo?',
    noteLabel: 'Observação',
    noteOptional: 'Opcional',
    cancel: 'Cancelar',
    confirmUndo: 'Sim, desfazer conferência',
    undoing: 'Desfazendo…',
    permission: 'Somente quem pode revisar o financeiro pode desfazer uma conferência.',
    errorTitle: 'Não foi possível desfazer',
    errorBody: 'Tente novamente. Nenhum valor, saldo ou lançamento foi alterado.',
    changedError: 'Esta conferência mudou ou já foi desfeita. Atualize a movimentação antes de tentar novamente.',
    reasons: {
      wrong_transaction: 'Escolhi a movimentação errada',
      wrong_statement_item: 'Escolhi o item errado do extrato',
      duplicate_confirmation: 'Confirmei em duplicidade',
      other: 'Outro motivo',
    },
  },
  EN: {
    activeTitle: 'Checked against statement',
    activeBody: 'This transaction was linked to a statement item after human confirmation. This check did not change any amount or balance.',
    reversedTitle: 'Check undone',
    reversedBody: 'A previous check was undone and remains in history. The transaction is available for a new check.',
    dateLabel: 'Checked on',
    reversedDateLabel: 'Undone on',
    evidenceLabel: 'Source',
    openEvidence: 'Open statement used for this check',
    sourceValue: 'Bank statement',
    undoAction: 'Undo check',
    undoTitle: 'Undo this check?',
    undoBody: 'This does not erase history or change the amount or balance. The transaction becomes available so the check can be corrected later.',
    reasonLabel: 'Why are you undoing this?',
    noteLabel: 'Note',
    noteOptional: 'Optional',
    cancel: 'Cancel',
    confirmUndo: 'Yes, undo check',
    undoing: 'Undoing…',
    permission: 'Only someone with finance review permission can undo a check.',
    errorTitle: 'Unable to undo',
    errorBody: 'Try again. No amount, balance, or posting was changed.',
    changedError: 'This check changed or was already undone. Refresh the transaction before trying again.',
    reasons: {
      wrong_transaction: 'I chose the wrong transaction',
      wrong_statement_item: 'I chose the wrong statement item',
      duplicate_confirmation: 'I confirmed it twice',
      other: 'Another reason',
    },
  },
  ES: {
    activeTitle: 'Revisada con extracto',
    activeBody: 'Este movimiento fue vinculado a un elemento del extracto después de una confirmación humana. Esta revisión no cambió ningún valor ni saldo.',
    reversedTitle: 'Revisión deshecha',
    reversedBody: 'Una revisión anterior fue deshecha y permanece en el historial. El movimiento vuelve a estar disponible para una nueva revisión.',
    dateLabel: 'Revisada el',
    reversedDateLabel: 'Deshecha el',
    evidenceLabel: 'Fuente',
    openEvidence: 'Abrir extracto usado en la revisión',
    sourceValue: 'Extracto bancario',
    undoAction: 'Deshacer revisión',
    undoTitle: '¿Deshacer esta revisión?',
    undoBody: 'Esto no borra el historial ni cambia el valor o el saldo. El movimiento vuelve a estar disponible para corregir la revisión después.',
    reasonLabel: '¿Por qué estás deshaciendo?',
    noteLabel: 'Observación',
    noteOptional: 'Opcional',
    cancel: 'Cancelar',
    confirmUndo: 'Sí, deshacer revisión',
    undoing: 'Deshaciendo…',
    permission: 'Solo quien puede revisar el financiero puede deshacer una revisión.',
    errorTitle: 'No fue posible deshacer',
    errorBody: 'Inténtalo de nuevo. Ningún valor, saldo o registro fue modificado.',
    changedError: 'Esta revisión cambió o ya fue deshecha. Actualiza el movimiento antes de intentarlo de nuevo.',
    reasons: {
      wrong_transaction: 'Elegí el movimiento equivocado',
      wrong_statement_item: 'Elegí el elemento equivocado del extracto',
      duplicate_confirmation: 'Lo confirmé dos veces',
      other: 'Otro motivo',
    },
  },
};

const REASONS: ReconciliationReversalReasonCode[] = [
  'wrong_transaction',
  'wrong_statement_item',
  'duplicate_confirmation',
  'other',
];

function formatDate(value: string | null | undefined, language: Language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function TransactionReconciliationTraceCard({
  organizationId,
  financeEntityId,
  transactionId,
  reconciliationStatus,
  reconciliationId,
  reconciliationEvidenceId,
  reconciledAt,
  lastReconciliationEvidenceId,
  lastReconciliationReversalId,
  lastReconciliationReversedAt,
  lastReconciliationReversalReason,
  onChanged,
}: Props) {
  const { language } = useLanguage();
  const { accessState } = useAuth();
  const copy = COPY[language];
  const navigate = useNavigate();
  const canReview = hasEffectiveCapability(accessState, 'finance.review');

  const [showUndo, setShowUndo] = useState(false);
  const [reasonCode, setReasonCode] = useState<ReconciliationReversalReasonCode>('wrong_transaction');
  const [note, setNote] = useState('');
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);

  const active = reconciliationStatus === 'reconciled' && Boolean(reconciliationId);
  const reversed =
    reconciliationStatus !== 'reconciled' && Boolean(lastReconciliationReversalId);

  if (!active && !reversed) return null;

  const evidenceId = active ? reconciliationEvidenceId : lastReconciliationEvidenceId;
  const displayDate = active ? reconciledAt : lastReconciliationReversedAt;
  const title = active ? copy.activeTitle : copy.reversedTitle;
  const body = active ? copy.activeBody : copy.reversedBody;

  const cancelUndo = () => {
    if (undoing) return;
    setShowUndo(false);
    setError(null);
    setNote('');
    setReasonCode('wrong_transaction');
    idempotencyKey.current = null;
    requestId.current = null;
  };

  const undo = async () => {
    if (
      !active ||
      !reconciliationId ||
      !organizationId ||
      !financeEntityId ||
      !transactionId ||
      undoing
    ) {
      return;
    }

    if (!idempotencyKey.current) idempotencyKey.current = generateLedgerId('idem');
    if (!requestId.current) requestId.current = generateLedgerId('req');

    setUndoing(true);
    setError(null);

    try {
      await reconciliationService.reverseMatch(organizationId, {
        financeEntityId,
        transactionId,
        reconciliationId,
        reasonCode,
        note: note.trim() || null,
        idempotencyKey: idempotencyKey.current,
        requestId: requestId.current,
      });

      idempotencyKey.current = null;
      requestId.current = null;
      setShowUndo(false);
      setNote('');
      await onChanged?.();
    } catch (err: any) {
      const code = String(err?.code || '');
      setError(
        code === 'RECONCILIATION_NOT_CURRENT' ||
        code === 'RECONCILIATION_ALREADY_REVERSED' ||
        code === 'RECONCILIATION_LINE_LOCK_MISMATCH'
          ? copy.changedError
          : copy.errorBody,
      );
    } finally {
      setUndoing(false);
    }
  };

  const reversedReason =
    lastReconciliationReversalReason &&
    REASONS.includes(lastReconciliationReversalReason as ReconciliationReversalReasonCode)
      ? copy.reasons[lastReconciliationReversalReason as ReconciliationReversalReasonCode]
      : null;

  return (
    <Surface
      variant="elevated"
      radius="xl"
      className={active ? 'border-semantic-success/20 p-5' : 'border-semantic-warning/20 p-5'}
    >
      <div className="flex items-start gap-3">
        <div
          className={
            active
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-success/10 text-semantic-success'
              : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-warning/10 text-semantic-warning'
          }
        >
          {active ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <History className="h-5 w-5" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{body}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {active ? copy.dateLabel : copy.reversedDateLabel}
              </p>
              <p className="mt-1 text-sm text-text-primary">{formatDate(displayDate, language)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {copy.evidenceLabel}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-primary">
                <FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />
                {evidenceId ? copy.sourceValue : '—'}
              </p>
            </div>
          </div>

          {!active && reversedReason ? (
            <p className="mt-3 rounded-lg border border-border-subtle bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
              {reversedReason}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {evidenceId ? (
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(
                    APP_ROUTES.inboxEvidenceDetail.replace(
                      ':evidenceId',
                      evidenceId,
                    ),
                  )
                }
              >
                {copy.openEvidence}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}

            {active && canReview && !showUndo ? (
              <Button variant="ghost" onClick={() => setShowUndo(true)}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {copy.undoAction}
              </Button>
            ) : null}
          </div>

          {active && !canReview ? (
            <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
              {copy.permission}
            </p>
          ) : null}

          {active && showUndo ? (
            <div className="mt-4 rounded-xl border border-semantic-warning/20 bg-semantic-warning/5 p-4">
              <p className="text-sm font-semibold text-text-primary">{copy.undoTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{copy.undoBody}</p>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium text-text-muted">
                  {copy.reasonLabel}
                </span>
                <select
                  value={reasonCode}
                  disabled={undoing}
                  onChange={(event) =>
                    setReasonCode(event.target.value as ReconciliationReversalReasonCode)
                  }
                  className="min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-primary outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                >
                  {REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {copy.reasons[reason]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs font-medium text-text-muted">
                  {copy.noteLabel} · {copy.noteOptional}
                </span>
                <textarea
                  value={note}
                  maxLength={300}
                  rows={3}
                  disabled={undoing}
                  onChange={(event) => setNote(event.target.value)}
                  className="w-full resize-none rounded-xl border border-border-subtle bg-surface-base px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                />
                <span className="mt-1 block text-right text-[10px] text-text-muted">
                  {note.length}/300
                </span>
              </label>

              {error ? (
                <div className="mt-3 flex gap-2 text-xs leading-relaxed text-semantic-danger" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" disabled={undoing} onClick={cancelUndo}>
                  {copy.cancel}
                </Button>
                <Button disabled={undoing} onClick={() => void undo()}>
                  {undoing ? copy.undoing : copy.confirmUndo}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}
