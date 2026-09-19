import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, BadgeCheck, FileSearch, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { transactionsService } from '@/src/services/transactionsService';
import {
  universalEvidenceInboxService,
  type UniversalEvidenceDetail,
} from '@/src/services/universalEvidenceInboxService';
import { generateLedgerId } from '@/shared/finance/ledger/ids';
import { formatCnpj } from '@/shared/finance/taxId';
import { formatTransactionInputAmount } from '../transactions/transactionCreateModel';
import { DOCUMENT_ANALYSIS_COPY } from './documentAnalysisCopy';

type Props = {
  evidence: UniversalEvidenceDetail;
  canCreateDraft: boolean;
  onChanged: () => Promise<void> | void;
};

const PAYMENT_LABELS = {
  PT: {
    cash: 'Dinheiro',
    pix: 'Pix',
    bank_transfer: 'Transferência bancária',
    bank_deposit: 'Depósito bancário',
    debit_card: 'Cartão de débito',
    credit_card: 'Cartão de crédito',
    prepaid_card: 'Cartão pré-pago',
    bank_slip: 'Boleto',
    check: 'Cheque',
    automatic_debit: 'Débito automático',
    other: 'Outro',
    unknown: 'Não identificado',
  },
  EN: {
    cash: 'Cash',
    pix: 'Pix',
    bank_transfer: 'Bank transfer',
    bank_deposit: 'Bank deposit',
    debit_card: 'Debit card',
    credit_card: 'Credit card',
    prepaid_card: 'Prepaid card',
    bank_slip: 'Bank slip',
    check: 'Check',
    automatic_debit: 'Automatic debit',
    other: 'Other',
    unknown: 'Not identified',
  },
  ES: {
    cash: 'Efectivo',
    pix: 'Pix',
    bank_transfer: 'Transferencia bancaria',
    bank_deposit: 'Depósito bancario',
    debit_card: 'Tarjeta de débito',
    credit_card: 'Tarjeta de crédito',
    prepaid_card: 'Tarjeta prepaga',
    bank_slip: 'Boleto',
    check: 'Cheque',
    automatic_debit: 'Débito automático',
    other: 'Otro',
    unknown: 'No identificado',
  },
} as const;

export function DocumentTransactionAnalysisCard({
  evidence,
  canCreateDraft,
  onChanged,
}: Props) {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = DOCUMENT_ANALYSIS_COPY[language];
  const analysisEnvelope = evidence.transactionAnalysis;
  const analysis = analysisEnvelope?.analysis || null;
  const organizationId = accessState.organizationId || '';

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [ackTax, setAckTax] = useState(false);
  const [direction, setDirection] = useState<'income' | 'expense' | ''>('');
  const [amountRaw, setAmountRaw] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [description, setDescription] = useState('');
  const draftAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!analysis) {
      setDirection('');
      setAmountRaw('');
      setOccurredAt('');
      setCounterparty('');
      setDescription('');
      setAckTax(false);
      draftAttemptRef.current = null;
      return;
    }
    setDirection(
      analysis.transactionKind.value === 'income' || analysis.transactionKind.value === 'expense'
        ? analysis.transactionKind.value
        : '',
    );
    setAmountRaw(
      analysis.totalAmountCents.value !== null
        ? String(analysis.totalAmountCents.value)
        : '',
    );
    setOccurredAt(analysis.occurredAt.value || '');
    setCounterparty(analysis.counterpartyName.value || '');
    setDescription(analysis.description.value || '');
    setAckTax(false);
    setDraftError(false);
    draftAttemptRef.current = null;
  }, [analysisEnvelope?.generatedAt, evidence.evidenceId, evidence.version]);

  const analyze = async () => {
    if (!organizationId || !activeFinanceEntityId || analyzing || !canCreateDraft) return;
    setAnalyzing(true);
    setAnalysisError(false);
    try {
      await universalEvidenceInboxService.analyzeTransaction(
        organizationId,
        activeFinanceEntityId,
        {
          evidenceId: evidence.evidenceId,
          expectedVersion: evidence.version,
          locale: language,
          idempotencyKey: generateLedgerId('idem'),
          requestId: generateLedgerId('req'),
        },
      );
      await onChanged();
    } catch {
      setAnalysisError(true);
    } finally {
      setAnalyzing(false);
    }
  };

  const amountCents = useMemo(() => {
    const digits = amountRaw.replace(/\D/gu, '');
    const value = Number.parseInt(digits || '0', 10);
    return Number.isSafeInteger(value) ? value : 0;
  }, [amountRaw]);

  const taxNeedsAcknowledgement = Boolean(
    analysis &&
    analysis.entityTaxIdCheck !== 'match' &&
    analysis.entityTaxIdCheck !== 'mismatch',
  );
  const hardBlocked = Boolean(
    analysis &&
    (
      analysis.entityTaxIdCheck === 'mismatch' ||
      analysis.documentMultiplicity.value === 'multiple' ||
      analysis.analysisStatus === 'not_settled' ||
      analysis.analysisStatus === 'unsupported_currency' ||
      analysis.analysisStatus === 'unsupported_transaction_kind'
    ),
  );
  const ready = Boolean(
    analysis &&
    !hardBlocked &&
    direction &&
    amountCents > 0 &&
    occurredAt &&
    analysis.currency.value === 'BRL' &&
    analysis.settlementState.value === 'paid' &&
    (!taxNeedsAcknowledgement || ackTax),
  );

  const createDraft = async () => {
    if (
      !analysis ||
      !ready ||
      !organizationId ||
      !activeFinanceEntityId ||
      !canCreateDraft ||
      creating
    ) return;

    const categoryId =
      analysis.categoryId.value &&
      analysis.transactionKind.value === direction
        ? analysis.categoryId.value
        : null;
    const paymentMethod =
      analysis.paymentMethod.value && analysis.paymentMethod.value !== 'unknown'
        ? analysis.paymentMethod.value
        : undefined;

    const payload = {
      direction,
      amountCents,
      occurredAt,
      paymentMethod,
      description: description.trim() || undefined,
      counterparty: counterparty.trim() || undefined,
      allocations: categoryId
        ? [{ categoryId, amountCents, fundId: '', costCenterId: '' }]
        : [],
      evidenceIds: [evidence.evidenceId],
      sourceContext: 'document_intelligence',
    };

    const fingerprint = JSON.stringify(payload);
    if (!draftAttemptRef.current || draftAttemptRef.current.fingerprint !== fingerprint) {
      draftAttemptRef.current = {
        fingerprint,
        key: generateLedgerId('idem'),
      };
    }

    setCreating(true);
    setDraftError(false);
    try {
      const result = await transactionsService.createDraft(
        organizationId,
        activeFinanceEntityId,
        payload,
        draftAttemptRef.current.key,
        generateLedgerId('req'),
      );
      draftAttemptRef.current = null;
      navigate(APP_ROUTES.transactionEdit.replace(':transactionId', result.transactionId));
    } catch {
      setDraftError(true);
    } finally {
      setCreating(false);
    }
  };

  if (
    evidence.processingState !== 'accepted' ||
    evidence.duplicate ||
    !canCreateDraft
  ) return null;

  if (!analysis) {
    return (
      <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-text-primary">{copy.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
          </div>
        </div>
        {analysisError ? (
          <div className="mt-4 rounded-xl border border-semantic-warning/25 bg-semantic-warning/10 p-4">
            <p className="font-medium text-text-primary">{copy.unavailableTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.unavailableBody}</p>
          </div>
        ) : null}
        <Button className="mt-5" size="lg" fullWidth disabled={analyzing} onClick={() => void analyze()}>
          <FileSearch className="h-5 w-5" aria-hidden="true" />
          {analyzing ? copy.analyzing : analysisError ? copy.retry : copy.analyze}
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-text-muted">{copy.sourceNote}</p>
      </Surface>
    );
  }

  const taxPresentation =
    analysis.entityTaxIdCheck === 'match'
      ? { text: copy.taxMatch, tone: 'border-semantic-success/25 bg-semantic-success/10 text-semantic-success', icon: BadgeCheck }
      : analysis.entityTaxIdCheck === 'mismatch'
        ? { text: copy.taxMismatch, tone: 'border-semantic-danger/25 bg-semantic-danger/10 text-semantic-danger', icon: AlertTriangle }
        : analysis.entityTaxIdCheck === 'absent'
          ? { text: copy.taxAbsent, tone: 'border-border-subtle bg-surface-secondary text-text-secondary', icon: ShieldCheck }
          : analysis.entityTaxIdCheck === 'entity_tax_id_not_configured'
            ? { text: copy.taxNotConfigured, tone: 'border-semantic-warning/25 bg-semantic-warning/10 text-semantic-warning', icon: AlertTriangle }
            : { text: copy.taxUncertain, tone: 'border-semantic-warning/25 bg-semantic-warning/10 text-semantic-warning', icon: AlertTriangle };
  const TaxIcon = taxPresentation.icon;
  const paymentLabel = analysis.paymentMethod.value
    ? PAYMENT_LABELS[language][analysis.paymentMethod.value]
    : copy.paymentPending;

  return (
    <Surface variant="elevated" radius="xl" className="overflow-hidden p-0">
      <div className="border-b border-border-subtle p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-text-primary">{copy.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
          </div>
        </div>

        <div className={`mt-5 flex items-start gap-3 rounded-xl border p-4 ${taxPresentation.tone}`}>
          <TaxIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{taxPresentation.text}</p>
            {analysis.entityTaxIdCheck === 'mismatch' ? (
              <p className="mt-1 text-xs leading-relaxed opacity-90">{copy.taxMismatchBody}</p>
            ) : null}
          </div>
        </div>

        {analysis.documentMultiplicity.value === 'multiple' ? (
          <WarningBlock title={copy.multipleDocs} body={copy.multipleDocsBody} />
        ) : null}
        {analysis.analysisStatus === 'not_settled' ? (
          <WarningBlock title={copy.unpaidTitle} body={copy.unpaidBody} />
        ) : null}
        {analysis.analysisStatus === 'unsupported_currency' ? (
          <WarningBlock title={copy.currencyTitle} body={copy.currencyBody} />
        ) : null}
        {analysis.analysisStatus === 'unsupported_transaction_kind' ? (
          <WarningBlock title={copy.unsupportedKindTitle} body={copy.unsupportedKindBody} />
        ) : null}
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{copy.suggestion}</span>
            <select
              value={direction}
              onChange={(event) => {
                setDirection(event.target.value as 'income' | 'expense' | '');
                draftAttemptRef.current = null;
              }}
              className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-primary outline-none focus:border-accent-primary"
            >
              <option value="">{copy.unknown}</option>
              <option value="expense">{copy.expense}</option>
              <option value="income">{copy.income}</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{copy.amount}</span>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-text-muted">R$</span>
              <input
                inputMode="numeric"
                value={formatTransactionInputAmount(amountRaw || '0', language)}
                onChange={(event) => {
                  setAmountRaw(event.target.value.replace(/\D/gu, ''));
                  draftAttemptRef.current = null;
                }}
                className="min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base pl-10 pr-3 text-base font-semibold tabular-nums text-text-primary outline-none focus:border-accent-primary"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{copy.date}</span>
            <input
              type="date"
              value={occurredAt}
              onChange={(event) => {
                setOccurredAt(event.target.value);
                draftAttemptRef.current = null;
              }}
              className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{copy.counterparty}</span>
            <input
              value={counterparty}
              maxLength={160}
              onChange={(event) => {
                setCounterparty(event.target.value);
                draftAttemptRef.current = null;
              }}
              className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-primary outline-none focus:border-accent-primary"
              placeholder={copy.noValue}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{copy.description}</span>
          <input
            value={description}
            maxLength={180}
            onChange={(event) => {
              setDescription(event.target.value);
              draftAttemptRef.current = null;
            }}
            className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-primary outline-none focus:border-accent-primary"
            placeholder={copy.noValue}
          />
        </label>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InfoRow label={copy.category} value={analysis.suggestedCategoryName || copy.categoryPending} />
          <InfoRow label={copy.paymentMethod} value={paymentLabel} />
          <InfoRow
            label={copy.settlement}
            value={
              analysis.settlementState.value === 'paid'
                ? copy.settledPaid
                : analysis.settlementState.value === 'unpaid'
                  ? copy.settledUnpaid
                  : copy.settledUnknown
            }
          />
          <InfoRow label={copy.currency} value={analysis.currency.value || copy.noValue} />
          {analysis.documentNumber.value ? <InfoRow label={copy.documentNumber} value={analysis.documentNumber.value} /> : null}
          {analysis.dueDate.value ? <InfoRow label={copy.dueDate} value={analysis.dueDate.value} /> : null}
          {analysis.issuerTaxId.value ? <InfoRow label={copy.issuerTaxId} value={formatCnpj(analysis.issuerTaxId.value)} /> : null}
          {analysis.recipientTaxId.value ? <InfoRow label={copy.recipientTaxId} value={formatCnpj(analysis.recipientTaxId.value)} /> : null}
          {analysis.payerTaxId.value ? <InfoRow label={copy.payerTaxId} value={formatCnpj(analysis.payerTaxId.value)} /> : null}
          {analysis.payeeTaxId.value ? <InfoRow label={copy.payeeTaxId} value={formatCnpj(analysis.payeeTaxId.value)} /> : null}
        </div>

        {taxNeedsAcknowledgement ? (
          <label className="mt-5 flex min-h-12 items-start gap-3 rounded-xl border border-border-subtle bg-surface-secondary/50 p-4 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={ackTax}
              onChange={(event) => setAckTax(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0"
            />
            <span>{copy.acknowledgeTax}</span>
          </label>
        ) : null}

        {!direction || amountCents <= 0 || !occurredAt ? (
          <p className="mt-4 text-sm font-medium text-semantic-warning">{copy.required}</p>
        ) : null}

        {draftError ? (
          <p className="mt-4 text-sm font-medium text-semantic-danger" role="alert">{copy.draftError}</p>
        ) : null}

        <div className="mt-5 rounded-xl border border-accent-primary/15 bg-accent-primary/5 p-4">
          <p className="text-xs leading-relaxed text-text-muted">{copy.draftBody}</p>
          <Button
            className="mt-3"
            size="lg"
            fullWidth
            disabled={!ready || creating}
            onClick={() => void createDraft()}
          >
            {creating ? copy.creatingDraft : copy.createDraft}
            {!creating ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
          </Button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-text-muted">{copy.sourceNote}</p>
      </div>
    </Surface>
  );
}

function WarningBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-3 flex items-start gap-3 rounded-xl border border-semantic-danger/25 bg-semantic-danger/10 p-4 text-semantic-danger">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-secondary/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
