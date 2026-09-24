import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Landmark,
  RefreshCw,
  Tags,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button } from '@/src/components/foundation';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';

type Props = {
  transactionId: string | null;
  onClose: () => void;
  onDiscarded?: (transactionId: string) => void;
};

type InspectorCopy = {
  title: string;
  loading: string;
  failedTitle: string;
  failedBody: string;
  retry: string;
  close: string;
  openFull: string;
  edit: string;
  discard: string;
  discardTitle: string;
  discardBody: string;
  discardConfirm: string;
  discarding: string;
  discardFailed: string;
  cancel: string;
  date: string;
  account: string;
  category: string;
  payment: string;
  allocations: string;
  readiness: string;
  ready: string;
  blocked: string;
  noDescription: string;
  notInformed: string;
  statusDraft: string;
  statusReview: string;
  statusApproved: string;
  statusPosted: string;
  statusReversed: string;
  statusOther: string;
  income: string;
  expense: string;
  transfer: string;
  other: string;
};

const COPY: Record<Language, InspectorCopy> = {
  PT: {
    title: 'Visão rápida',
    loading: 'Carregando movimentação…',
    failedTitle: 'Não foi possível abrir esta movimentação',
    failedBody: 'A lista continua intacta. Tente novamente ou abra o registro completo.',
    retry: 'Tentar novamente',
    close: 'Fechar visão rápida',
    openFull: 'Abrir registro completo',
    edit: 'Editar movimentação',
    discard: 'Descartar rascunho',
    discardTitle: 'Descartar este rascunho?',
    discardBody: 'As informações ainda não enviadas serão apagadas. Esta ação não pode ser desfeita.',
    discardConfirm: 'Descartar',
    discarding: 'Descartando…',
    discardFailed: 'Não foi possível descartar o rascunho. Tente novamente.',
    cancel: 'Cancelar',
    date: 'Data',
    account: 'Conta',
    category: 'Categoria',
    payment: 'Pagamento',
    allocations: 'Classificações',
    readiness: 'Conferência',
    ready: 'Pronta para seguir',
    blocked: 'Ainda precisa de atenção',
    noDescription: 'Movimentação sem descrição',
    notInformed: 'Não informado',
    statusDraft: 'Rascunho',
    statusReview: 'Para conferir',
    statusApproved: 'Aprovada',
    statusPosted: 'Lançada',
    statusReversed: 'Revertida',
    statusOther: 'Em andamento',
    income: 'Entrada',
    expense: 'Saída',
    transfer: 'Transferência',
    other: 'Operação',
  },
  EN: {
    title: 'Quick view',
    loading: 'Loading transaction…',
    failedTitle: 'This transaction could not be opened',
    failedBody: 'Your list is still intact. Try again or open the full record.',
    retry: 'Try again',
    close: 'Close quick view',
    openFull: 'Open full record',
    edit: 'Edit transaction',
    discard: 'Discard draft',
    discardTitle: 'Discard this draft?',
    discardBody: 'Information that has not been submitted will be deleted. This action cannot be undone.',
    discardConfirm: 'Discard',
    discarding: 'Discarding…',
    discardFailed: 'The draft could not be discarded. Try again.',
    cancel: 'Cancel',
    date: 'Date',
    account: 'Account',
    category: 'Category',
    payment: 'Payment',
    allocations: 'Classifications',
    readiness: 'Review',
    ready: 'Ready to continue',
    blocked: 'Still needs attention',
    noDescription: 'Transaction without description',
    notInformed: 'Not informed',
    statusDraft: 'Draft',
    statusReview: 'Needs review',
    statusApproved: 'Approved',
    statusPosted: 'Posted',
    statusReversed: 'Reversed',
    statusOther: 'In progress',
    income: 'Income',
    expense: 'Expense',
    transfer: 'Transfer',
    other: 'Operation',
  },
  ES: {
    title: 'Vista rápida',
    loading: 'Cargando movimiento…',
    failedTitle: 'No fue posible abrir este movimiento',
    failedBody: 'La lista sigue intacta. Inténtalo de nuevo o abre el registro completo.',
    retry: 'Intentar de nuevo',
    close: 'Cerrar vista rápida',
    openFull: 'Abrir registro completo',
    edit: 'Editar movimiento',
    discard: 'Descartar borrador',
    discardTitle: '¿Descartar este borrador?',
    discardBody: 'Se eliminará la información que aún no fue enviada. Esta acción no se puede deshacer.',
    discardConfirm: 'Descartar',
    discarding: 'Descartando…',
    discardFailed: 'No fue posible descartar el borrador. Inténtalo de nuevo.',
    cancel: 'Cancelar',
    date: 'Fecha',
    account: 'Cuenta',
    category: 'Categoría',
    payment: 'Pago',
    allocations: 'Clasificaciones',
    readiness: 'Revisión',
    ready: 'Listo para continuar',
    blocked: 'Todavía necesita atención',
    noDescription: 'Movimiento sin descripción',
    notInformed: 'No informado',
    statusDraft: 'Borrador',
    statusReview: 'Para revisar',
    statusApproved: 'Aprobado',
    statusPosted: 'Registrado',
    statusReversed: 'Revertido',
    statusOther: 'En curso',
    income: 'Ingreso',
    expense: 'Egreso',
    transfer: 'Transferencia',
    other: 'Operación',
  },
};

function localeFor(language: Language) {
  if (language === 'EN') return 'en-US';
  if (language === 'ES') return 'es-ES';
  return 'pt-BR';
}

function formatMoney(cents: unknown, language: Language, currency = 'BRL') {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency,
  }).format(value);
}

function formatDate(value: unknown, language: Language) {
  if (!value) return null;
  const date = typeof value === 'string' || value instanceof Date ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(localeFor(language), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function statusLabel(status: string, copy: InspectorCopy) {
  if (status === 'draft') return copy.statusDraft;
  if (status === 'ready_for_review') return copy.statusReview;
  if (status === 'approved_for_posting') return copy.statusApproved;
  if (status === 'posted') return copy.statusPosted;
  if (status === 'reversed') return copy.statusReversed;
  return copy.statusOther;
}

function makeRequestToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function directionMeta(direction: string, copy: InspectorCopy) {
  if (direction === 'income') {
    return { label: copy.income, Icon: ArrowDownLeft, className: 'bg-semantic-success/10 text-semantic-success' };
  }
  if (direction === 'expense') {
    return { label: copy.expense, Icon: ArrowUpRight, className: 'bg-semantic-danger/10 text-semantic-danger' };
  }
  if (direction === 'transfer') {
    return { label: copy.transfer, Icon: ArrowRightLeft, className: 'bg-accent-primary/10 text-accent-primary' };
  }
  return { label: copy.other, Icon: Wallet, className: 'bg-surface-secondary text-text-secondary' };
}

export function TransactionInspector({ transactionId, onClose, onDiscarded }: Props) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COPY[language];
  const { getTransactionDetail, discardDraft } = useTransactions();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardFailed, setDiscardFailed] = useState(false);

  useEffect(() => {
    if (!transactionId) {
      setDetail(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    let active = true;
    setDiscardConfirmOpen(false);
    setDiscarding(false);
    setDiscardFailed(false);
    setDetail(null);
    setLoading(true);
    setFailed(false);
    const currentEpoch = epoch;

    void getTransactionDetail(transactionId)
      .then((result) => {
        if (!active || currentEpoch !== epoch) return;
        setDetail(result);
      })
      .catch(() => {
        if (!active || currentEpoch !== epoch) return;
        setFailed(true);
      })
      .finally(() => {
        if (!active || currentEpoch !== epoch) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [transactionId, getTransactionDetail, epoch]);

  useEffect(() => {
    if (!transactionId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transactionId, onClose]);

  useEffect(() => {
    if (!transactionId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [transactionId]);

  const transaction = detail?.transaction || null;
  const direction = String(transaction?.transactionKind || transaction?.direction || '');
  const directionUi = useMemo(() => directionMeta(direction, copy), [direction, copy]);
  const allocations = Array.isArray(detail?.allocations) ? detail.allocations : [];
  const readiness = detail?.reviewReadiness;
  const canEdit = Boolean(detail?.capabilities?.canEdit);
  const canDiscard = canEdit && transaction?.status === 'draft';
  const amount = formatMoney(transaction?.amountCents, language, transaction?.currency || 'BRL');
  const occurredAt = formatDate(transaction?.occurredAt, language);

  if (!transactionId) return null;

  const fullRoute = APP_ROUTES.transactionDetail.replace(':transactionId', transactionId);
  const editRoute = APP_ROUTES.transactionEdit.replace(':transactionId', transactionId);

  const handleDiscard = async () => {
    if (!transaction || transaction.status !== 'draft' || discarding) return;
    setDiscarding(true);
    setDiscardFailed(false);
    try {
      await discardDraft(
        transaction.id,
        Number(transaction.version),
        makeRequestToken('idsm'),
        makeRequestToken('req'),
      );
      setDiscardConfirmOpen(false);
      onDiscarded?.(transaction.id);
      onClose();
    } catch {
      setDiscardFailed(true);
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/35 backdrop-blur-[2px] sm:items-stretch sm:justify-end"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-border-subtle bg-surface-elevated shadow-2xl sm:h-full sm:max-h-none sm:w-[min(92vw,32rem)] sm:rounded-none sm:rounded-l-[28px]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{copy.title}</p>
            <p className="mt-1 truncate text-sm font-medium text-text-primary">
              {transaction?.description || copy.noDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="nf-interactive nf-touch-target flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-surface-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-text-secondary" aria-live="polite">
              <RefreshCw className="h-5 w-5 animate-spin text-accent-primary" aria-hidden="true" />
              {copy.loading}
            </div>
          ) : failed || !transaction ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-warning/10 text-semantic-warning">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-text-primary">{copy.failedTitle}</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">{copy.failedBody}</p>
              <Button variant="secondary" className="mt-5" onClick={() => setEpoch((value) => value + 1)}>
                {copy.retry}
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-3xl border border-border-subtle bg-surface-secondary/55 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ' + directionUi.className}>
                    <directionUi.Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-lg border border-border-subtle bg-surface-elevated px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
                      {directionUi.label}
                    </span>
                    <span className="rounded-lg border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-1 text-[11px] font-semibold text-accent-primary">
                      {statusLabel(String(transaction.status || ''), copy)}
                    </span>
                  </div>
                </div>
                <p className="nf-financial-number mt-5 text-3xl font-semibold tracking-tight text-text-primary">
                  {amount}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {transaction.description || copy.noDescription}
                </p>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border-subtle bg-surface-default p-4">
                  <CalendarDays className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.date}</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">{occurredAt || copy.notInformed}</p>
                </div>
                <div className="rounded-2xl border border-border-subtle bg-surface-default p-4">
                  <Landmark className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.account}</p>
                  <p className="mt-1 truncate text-sm font-medium text-text-primary">
                    {transaction.accountName || transaction.accountSnapshot?.name || copy.notInformed}
                  </p>
                </div>
                <div className="rounded-2xl border border-border-subtle bg-surface-default p-4">
                  <Tags className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.category}</p>
                  <p className="mt-1 truncate text-sm font-medium text-text-primary">
                    {transaction.categoryName || allocations[0]?.categorySnapshot?.name || copy.notInformed}
                  </p>
                </div>
                <div className="rounded-2xl border border-border-subtle bg-surface-default p-4">
                  <Wallet className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.payment}</p>
                  <p className="mt-1 truncate text-sm font-medium text-text-primary">
                    {transaction.paymentMethod || copy.notInformed}
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border border-border-subtle bg-surface-default p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.allocations}</p>
                    <p className="mt-1 text-sm font-medium text-text-primary">{allocations.length}</p>
                  </div>
                  <FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />
                </div>
              </section>

              {readiness ? (
                <section className="rounded-2xl border border-border-subtle bg-surface-default p-4">
                  <div className="flex items-start gap-3">
                    <div className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (readiness.ready ? 'bg-semantic-success/10 text-semantic-success' : 'bg-semantic-warning/10 text-semantic-warning')}>
                      {readiness.ready ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.readiness}</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">{readiness.ready ? copy.ready : copy.blocked}</p>
                      {!readiness.ready && Array.isArray(readiness.blockers) && readiness.blockers.length > 0 ? (
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          {String(readiness.blockers[0]?.message || readiness.blockers[0]?.code || '')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>

        <footer className="border-t border-border-subtle bg-surface-elevated/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            {canEdit && transaction ? (
              <Button variant="secondary" fullWidth onClick={() => navigate(editRoute)}>
                {copy.edit}
              </Button>
            ) : null}
            {canDiscard ? (
              <Button
                variant="danger"
                fullWidth
                leadingIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  setDiscardFailed(false);
                  setDiscardConfirmOpen(true);
                }}
              >
                {copy.discard}
              </Button>
            ) : null}
            <Button
              variant="primary"
              fullWidth
              trailingIcon={<ArrowRight className="h-4 w-4" />}
              onClick={() => navigate(fullRoute)}
            >
              {copy.openFull}
            </Button>
          </div>
        </footer>
      </aside>

      {discardConfirmOpen && transaction ? (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-draft-title"
            aria-describedby="discard-draft-body"
            className="w-full max-w-sm rounded-[24px] border border-border-subtle bg-surface-elevated p-6 shadow-2xl"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-semantic-danger/10 text-semantic-danger">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 id="discard-draft-title" className="mt-4 text-lg font-semibold text-text-primary">
              {copy.discardTitle}
            </h2>
            <p id="discard-draft-body" className="mt-2 text-sm leading-relaxed text-text-secondary">
              {copy.discardBody}
            </p>
            {discardFailed ? (
              <p className="mt-4 rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-3 text-sm text-text-primary" role="alert">
                {copy.discardFailed}
              </p>
            ) : null}
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                fullWidth
                disabled={discarding}
                onClick={() => {
                  setDiscardFailed(false);
                  setDiscardConfirmOpen(false);
                }}
              >
                {copy.cancel}
              </Button>
              <Button
                variant="danger"
                fullWidth
                disabled={discarding}
                leadingIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => void handleDiscard()}
              >
                {discarding ? copy.discarding : copy.discardConfirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
