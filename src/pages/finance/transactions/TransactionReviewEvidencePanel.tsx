import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSearch,
  FileText,
  HelpCircle,
  X,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import {
  universalEvidenceInboxService,
  type UniversalEvidenceDetail,
} from '@/src/services/universalEvidenceInboxService';
import { INBOX_REVIEW_COPY } from '@/src/pages/finance/inbox/inboxReviewCopy';
import { TRANSACTION_REVIEW_DETAIL_COPY } from './transactionReviewDetailCopy';
import { TRANSACTION_REVIEW_EVIDENCE_COPY } from './transactionReviewEvidenceCopy';
import {
  compareDocumentAnalysisToTransaction,
  normalizeReviewEvidenceIds,
  type ReviewEvidenceComparisonKey,
  type ReviewEvidenceComparisonStatus,
} from './transactionReviewEvidenceModel';
import { formatReviewDate, formatReviewMoney } from './transactionReviewModel';

type Props = {
  evidenceIds: unknown;
  transaction: any;
  allocations: any[];
};

type ComparisonRow = {
  key: ReviewEvidenceComparisonKey;
  label: string;
  documentValue: string;
  transactionValue: string;
  status: ReviewEvidenceComparisonStatus;
};

export function TransactionReviewEvidencePanel({
  evidenceIds,
  transaction,
  allocations,
}: Props) {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = TRANSACTION_REVIEW_EVIDENCE_COPY[language];
  const transactionCopy = TRANSACTION_REVIEW_DETAIL_COPY[language];
  const reviewCopy = INBOX_REVIEW_COPY[language];

  const normalizedEvidenceIds = useMemo(
    () => normalizeReviewEvidenceIds(evidenceIds),
    [evidenceIds],
  );
  const evidenceKey = normalizedEvidenceIds.join('|');

  const [evidenceItems, setEvidenceItems] = useState<UniversalEvidenceDetail[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hadLoadError, setHadLoadError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const epochRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewMime(null);
    setPreviewLoading(false);
    setPreviewError(false);
  };

  const loadEvidence = async (epoch = epochRef.current) => {
    const organizationId = accessState.organizationId;
    if (!organizationId || !activeFinanceEntityId || normalizedEvidenceIds.length === 0) {
      setEvidenceItems([]);
      setSelectedEvidenceId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setHadLoadError(false);

    const results = await Promise.allSettled(
      normalizedEvidenceIds.map((evidenceId) =>
        universalEvidenceInboxService.detail(
          organizationId,
          activeFinanceEntityId,
          evidenceId,
        ),
      ),
    );

    if (epoch !== epochRef.current) return;

    const loaded = results
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          evidence: UniversalEvidenceDetail;
          requestId?: string;
        }> => result.status === 'fulfilled',
      )
      .map((result) => result.value.evidence);

    setEvidenceItems(loaded);
    setHadLoadError(loaded.length !== normalizedEvidenceIds.length);
    setSelectedEvidenceId((current) =>
      current && loaded.some((item) => item.evidenceId === current)
        ? current
        : loaded[0]?.evidenceId || null,
    );
    setLoading(false);
  };

  useEffect(() => {
    const epoch = ++epochRef.current;
    revokePreview();
    setEvidenceItems([]);
    setSelectedEvidenceId(null);
    setHadLoadError(false);
    void loadEvidence(epoch);

    return () => {
      epochRef.current += 1;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
    // Requests must restart when the canonical tenant/entity or linked evidence changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessState.organizationId, activeFinanceEntityId, evidenceKey]);

  useEffect(() => {
    revokePreview();
    // Preview is deliberately scoped to the currently selected evidence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvidenceId]);

  const selectedEvidence =
    evidenceItems.find((item) => item.evidenceId === selectedEvidenceId) || null;

  const openPreview = async () => {
    const organizationId = accessState.organizationId;
    if (
      !organizationId ||
      !activeFinanceEntityId ||
      !selectedEvidence ||
      previewLoading
    ) {
      return;
    }

    const epoch = epochRef.current;
    setPreviewLoading(true);
    setPreviewError(false);

    try {
      const response = await universalEvidenceInboxService.preview(
        organizationId,
        activeFinanceEntityId,
        selectedEvidence.evidenceId,
      );
      if (epoch !== epochRef.current) return;

      if (
        !response.mimeType.startsWith('image/') &&
        response.mimeType !== 'application/pdf'
      ) {
        setPreviewError(true);
        return;
      }

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(response.blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewMime(response.mimeType);
    } catch {
      if (epoch !== epochRef.current) return;
      setPreviewError(true);
    } finally {
      if (epoch === epochRef.current) setPreviewLoading(false);
    }
  };

  if (normalizedEvidenceIds.length === 0) return null;

  if (loading && evidenceItems.length === 0) {
    return (
      <Surface
        variant="elevated"
        radius="xl"
        className="p-5 sm:p-6"
        aria-busy="true"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-2xl bg-surface-secondary" />
          <div className="flex-1">
            <div className="h-4 w-40 animate-pulse rounded bg-surface-secondary" />
            <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-surface-secondary" />
          </div>
        </div>
        <p className="sr-only">{copy.loading}</p>
      </Surface>
    );
  }

  if (!selectedEvidence) {
    return (
      <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary">
              {copy.loadErrorTitle}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              {copy.loadErrorBody}
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => void loadEvidence(epochRef.current)}
            >
              {copy.retry}
            </Button>
          </div>
        </div>
      </Surface>
    );
  }

  const analysis = selectedEvidence.transactionAnalysis?.analysis || null;
  const statuses = compareDocumentAnalysisToTransaction(
    analysis,
    transaction,
    allocations,
  );
  const differences = Object.values(statuses).filter(
    (status) => status === 'different',
  ).length;

  const directionLabel = (value: unknown) => {
    if (typeof value !== 'string' || !value || value === 'unknown') return copy.noValue;
    return transactionCopy.directions[value] || value.replaceAll('_', ' ');
  };

  const paymentLabel = (value: unknown) => {
    if (typeof value !== 'string' || !value || value === 'unknown') return copy.noValue;
    return transactionCopy.paymentMethods[value] || value.replaceAll('_', ' ');
  };

  const transactionCategory = (Array.isArray(allocations) ? allocations : [])
    .map(
      (allocation) =>
        allocation?.categorySnapshot?.name ||
        allocation?.categoryName ||
        null,
    )
    .filter((value): value is string => Boolean(value))
    .join(', ');

  const rows: ComparisonRow[] = [
    {
      key: 'amount',
      label: copy.fieldAmount,
      documentValue:
        analysis?.totalAmountCents.value !== null &&
        analysis?.totalAmountCents.value !== undefined
          ? formatReviewMoney(
              Number(analysis.totalAmountCents.value),
              language,
              analysis.currency.value || transaction.currency || 'BRL',
            )
          : copy.noValue,
      transactionValue: formatReviewMoney(
        Number(transaction.amountCents || 0),
        language,
        transaction.currency || 'BRL',
      ),
      status: statuses.amount,
    },
    {
      key: 'date',
      label: copy.fieldDate,
      documentValue: analysis?.occurredAt.value
        ? formatReviewDate(analysis.occurredAt.value, language) || copy.noValue
        : copy.noValue,
      transactionValue:
        formatReviewDate(transaction.occurredAt, language) || copy.noValue,
      status: statuses.date,
    },
    {
      key: 'direction',
      label: copy.fieldDirection,
      documentValue: directionLabel(analysis?.transactionKind.value),
      transactionValue: directionLabel(
        transaction.transactionKind || transaction.direction,
      ),
      status: statuses.direction,
    },
    {
      key: 'payment_method',
      label: copy.fieldPayment,
      documentValue: paymentLabel(analysis?.paymentMethod.value),
      transactionValue: paymentLabel(transaction.paymentMethod),
      status: statuses.payment_method,
    },
    {
      key: 'category',
      label: copy.fieldCategory,
      documentValue: analysis?.suggestedCategoryName || copy.noValue,
      transactionValue: transactionCategory || copy.noValue,
      status: statuses.category,
    },
  ];

  const classificationLabel = selectedEvidence.classification?.documentType
    ? reviewCopy.types[selectedEvidence.classification.documentType]
    : copy.notClassified;
  const reviewLabel = selectedEvidence.classification
    ? selectedEvidence.review?.status === 'reviewed'
      ? copy.reviewed
      : copy.pendingReview
    : copy.notClassified;
  const selectedIndex =
    Math.max(
      0,
      evidenceItems.findIndex(
        (item) => item.evidenceId === selectedEvidence.evidenceId,
      ),
    ) + 1;

  const statusPresentation = (status: ReviewEvidenceComparisonStatus) => {
    if (status === 'match') {
      return {
        label: copy.statusMatch,
        className:
          'border-semantic-success/25 bg-semantic-success/10 text-semantic-success',
        icon: CheckCircle2,
      };
    }
    if (status === 'different') {
      return {
        label: copy.statusDifferent,
        className:
          'border-semantic-warning/25 bg-semantic-warning/10 text-semantic-warning',
        icon: AlertTriangle,
      };
    }
    return {
      label: copy.statusUncertain,
      className:
        'border-border-subtle bg-surface-secondary text-text-secondary',
      icon: HelpCircle,
    };
  };

  return (
    <Surface variant="elevated" radius="xl" className="overflow-hidden p-0">
      <div className="border-b border-border-subtle p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
              <FileSearch className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-text-primary">
                {copy.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {copy.subtitle}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold text-text-muted">
            {copy.evidencePosition(selectedIndex, evidenceItems.length)}
          </span>
        </div>

        {evidenceItems.length > 1 ? (
          <div
            className="mt-4 flex gap-2 overflow-x-auto pb-1"
            aria-label={transactionCopy.evidence}
          >
            {evidenceItems.map((item, index) => (
              <button
                key={item.evidenceId}
                type="button"
                aria-pressed={item.evidenceId === selectedEvidence.evidenceId}
                onClick={() => setSelectedEvidenceId(item.evidenceId)}
                className={`min-h-11 max-w-56 shrink-0 truncate rounded-full border px-4 text-sm font-medium transition-colors ${
                  item.evidenceId === selectedEvidence.evidenceId
                    ? 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary'
                    : 'border-border-subtle bg-surface-secondary text-text-secondary hover:text-text-primary'
                }`}
              >
                {item.originalFilename || copy.evidencePosition(index + 1, evidenceItems.length)}
              </button>
            ))}
          </div>
        ) : null}

        {hadLoadError ? (
          <p className="mt-3 text-xs leading-relaxed text-semantic-warning">
            {copy.loadErrorBody}
          </p>
        ) : null}
      </div>

      <div
        className={`grid gap-0 ${
          previewUrl ? 'lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]' : ''
        }`}
      >
        {previewUrl ? (
          <div className="border-b border-border-subtle bg-surface-secondary/30 p-4 lg:border-b-0 lg:border-r sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">
                  {copy.original}
                </p>
                <p className="mt-1 max-w-md truncate text-sm font-medium text-text-primary">
                  {selectedEvidence.originalFilename}
                </p>
              </div>
              <Button
                variant="ghost"
                className="!min-h-10 !w-10 !px-0"
                aria-label={copy.closeOriginal}
                onClick={revokePreview}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-base">
              {previewMime?.startsWith('image/') ? (
                <img
                  src={previewUrl}
                  alt={selectedEvidence.originalFilename}
                  className="max-h-[36rem] w-full object-contain"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title={selectedEvidence.originalFilename}
                  className="h-[36rem] w-full border-0"
                />
              )}
            </div>
          </div>
        ) : null}

        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <span className="truncate">{selectedEvidence.originalFilename}</span>
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {classificationLabel} · {reviewLabel}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {!previewUrl ? (
                <Button
                  variant="secondary"
                  disabled={previewLoading}
                  onClick={() => void openPreview()}
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  {previewLoading ? copy.openingOriginal : copy.openOriginal}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() =>
                  navigate(
                    APP_ROUTES.inboxEvidenceDetail.replace(
                      ':evidenceId',
                      selectedEvidence.evidenceId,
                    ),
                  )
                }
              >
                {copy.openInbox}
              </Button>
            </div>
          </div>

          {previewError ? (
            <div
              className="mt-4 rounded-xl border border-semantic-warning/25 bg-semantic-warning/10 p-4 text-sm text-text-primary"
              role="status"
            >
              {copy.previewError}
            </div>
          ) : null}

          <div className="mt-6 border-t border-border-subtle pt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  {copy.analysisTitle}
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
                  {analysis ? copy.analysisNote : copy.analysisMissing}
                </p>
              </div>
              {analysis ? (
                <span
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    differences > 0
                      ? 'border-semantic-warning/25 bg-semantic-warning/10 text-semantic-warning'
                      : 'border-semantic-success/25 bg-semantic-success/10 text-semantic-success'
                  }`}
                >
                  {differences > 0
                    ? copy.differencesFound(differences)
                    : copy.noDifferences}
                </span>
              ) : null}
            </div>

            {analysis ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-border-subtle">
                <div className="hidden grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)_7rem] gap-3 border-b border-border-subtle bg-surface-secondary/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted sm:grid">
                  <span />
                  <span>{copy.documentColumn}</span>
                  <span>{copy.transactionColumn}</span>
                  <span />
                </div>
                <div className="divide-y divide-border-subtle">
                  {rows.map((row) => {
                    const presentation = statusPresentation(row.status);
                    const StatusIcon = presentation.icon;
                    return (
                      <div
                        key={row.key}
                        className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)_7rem] sm:items-center"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                          {row.label}
                        </p>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted sm:hidden">
                            {copy.documentColumn}
                          </span>
                          <p className="mt-1 break-words text-sm text-text-primary sm:mt-0">
                            {row.documentValue}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted sm:hidden">
                            {copy.transactionColumn}
                          </span>
                          <p className="mt-1 break-words text-sm text-text-primary sm:mt-0">
                            {row.transactionValue}
                          </p>
                        </div>
                        <span
                          className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${presentation.className}`}
                        >
                          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {presentation.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Surface>
  );
}
