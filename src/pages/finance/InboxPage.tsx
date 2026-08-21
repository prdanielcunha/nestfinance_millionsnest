import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clipboard,
  Copy,
  FileText,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Plus,
  ShieldCheck,
  ShieldX,
  Upload,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import {
  universalEvidenceInboxService,
  type UniversalEvidenceInboxItem,
  type UniversalEvidenceInboxSummary,
} from '@/src/services/universalEvidenceInboxService';
import { INBOX_COPY } from './inbox/inboxCopy';
import {
  formatInboxBytes,
  formatInboxDate,
  formatInboxMime,
  normalizeInboxEvidenceState,
} from './inbox/inboxModel';

const EMPTY_SUMMARY: UniversalEvidenceInboxSummary = {
  total: 0,
  accepted: 0,
  duplicate: 0,
  awaitingUpload: 0,
};

export default function InboxPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = INBOX_COPY[language];

  if (
    accessState.status === 'initializing' ||
    accessState.status === 'authenticated_unresolved'
  ) {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.view')) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center border-t border-border-subtle bg-surface-base p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
          <ShieldX className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-text-primary">
          {copy.accessDeniedTitle}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-text-muted">
          {copy.accessDeniedBody}
        </p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <InboxContent
        canCapture={hasEffectiveCapability(accessState, 'finance.create_drafts')}
      />
    </FinanceContextGuard>
  );
}

function InboxContent({ canCapture }: { canCapture: boolean }) {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = INBOX_COPY[language];

  const [items, setItems] = useState<UniversalEvidenceInboxItem[]>([]);
  const [summary, setSummary] = useState<UniversalEvidenceInboxSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const epochRef = useRef(0);

  const loadData = async (cursor?: string, epoch = epochRef.current) => {
    const organizationId = accessState.organizationId;
    if (!organizationId || !activeFinanceEntityId) return;

    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setErrorDetails(null);

    try {
      const response = await universalEvidenceInboxService.list(
        organizationId,
        activeFinanceEntityId,
        cursor,
        25,
      );

      if (epoch !== epochRef.current) return;

      setItems((current) => (cursor ? [...current, ...response.items] : response.items));
      setSummary(response.summary);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (error: any) {
      if (epoch !== epochRef.current) return;
      setErrorDetails(error?.details || { error: error?.message });
    } finally {
      if (epoch !== epochRef.current) return;
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const epoch = ++epochRef.current;
    setItems([]);
    setSummary(EMPTY_SUMMARY);
    setNextCursor(undefined);
    setHasMore(false);
    setErrorDetails(null);

    if (accessState.organizationId && activeFinanceEntityId) {
      void loadData(undefined, epoch);
    }

    return () => {
      epochRef.current += 1;
    };
    // Requests must restart whenever the canonical organization/entity context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessState.organizationId, activeFinanceEntityId]);

  const sourceLabel = (sourceKind: string | null) => {
    if (sourceKind === 'camera') return copy.sourceCamera;
    if (sourceKind === 'photo') return copy.sourcePhoto;
    if (sourceKind === 'file') return copy.sourceFile;
    if (sourceKind === 'clipboard') return copy.sourceClipboard;
    return copy.sourceUnknown;
  };

  const sourceIcon = (sourceKind: string | null) => {
    if (sourceKind === 'camera') return <Camera className="h-4 w-4" aria-hidden="true" />;
    if (sourceKind === 'clipboard') return <Clipboard className="h-4 w-4" aria-hidden="true" />;
    if (sourceKind === 'photo') return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
    return <FileText className="h-4 w-4" aria-hidden="true" />;
  };

  const statusPresentation = (item: UniversalEvidenceInboxItem) => {
    const state = normalizeInboxEvidenceState(item.processingState);
    if (state === 'accepted') {
      return {
        label: copy.accepted,
        icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
        className: 'border-accent-primary/25 bg-accent-primary/10 text-accent-primary',
      };
    }
    if (state === 'duplicate') {
      return {
        label: copy.duplicate,
        icon: <Copy className="h-4 w-4" aria-hidden="true" />,
        className: 'border-border-subtle bg-surface-secondary text-text-secondary',
      };
    }
    if (state === 'awaiting_upload') {
      return {
        label: copy.awaitingUpload,
        icon: <Upload className="h-4 w-4" aria-hidden="true" />,
        className: 'border-border-subtle bg-surface-elevated text-text-muted',
      };
    }
    return {
      label: copy.unknownStatus,
      icon: <AlertCircle className="h-4 w-4" aria-hidden="true" />,
      className: 'border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger',
    };
  };

  if (errorDetails && items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.pageTitle} />
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-6">
          <Surface variant="elevated" radius="xl" role="alert" className="w-full max-w-md p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-text-primary">{copy.errorTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.errorBody}</p>
            <Button
              className="mt-6"
              fullWidth
              onClick={() => void loadData(undefined, epochRef.current)}
            >
              {copy.retry}
            </Button>
            {errorDetails?.requestId ? (
              <p className="mt-5 break-all font-mono text-xs text-text-muted">
                {copy.supportCode}: {errorDetails.requestId}
              </p>
            ) : null}
          </Surface>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.pageTitle} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                variant="ghost"
                className="!min-h-12 !w-12 !px-0"
                aria-label={copy.back}
                onClick={() => navigate(APP_ROUTES.finance)}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
              <div className="min-w-0 pt-1">
                <div className="flex items-center gap-2">
                  <InboxIcon className="h-5 w-5 text-accent-primary" aria-hidden="true" />
                  <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                    {copy.pageTitle}
                  </h1>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
                  {copy.pageSubtitle}
                </p>
              </div>
            </div>

            {canCapture ? (
              <Button onClick={() => navigate(APP_ROUTES.universalCapture)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {copy.capture}
              </Button>
            ) : null}
          </header>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={copy.pageTitle}>
            {[
              { label: copy.summaryTotal, value: summary.total },
              { label: copy.summaryAccepted, value: summary.accepted },
              { label: copy.summaryDuplicate, value: summary.duplicate },
              { label: copy.summaryAwaiting, value: summary.awaitingUpload },
            ].map((metric) => (
              <Surface key={metric.label} variant="elevated" radius="lg" className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {metric.label}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
                  {metric.value}
                </p>
              </Surface>
            ))}
          </section>

          <Surface variant="subtle" radius="lg" className="flex gap-3 p-4 text-sm leading-relaxed text-text-muted">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
            <p>{copy.secureMetadata}</p>
          </Surface>

          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{copy.queueTitle}</h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.queueSubtitle}</p>
            </div>

            {loading && items.length === 0 ? (
              <div className="grid gap-3" aria-busy="true" aria-label={copy.loading}>
                {[0, 1, 2].map((item) => (
                  <Surface key={item} variant="elevated" radius="lg" className="animate-pulse p-5">
                    <div className="h-4 w-28 rounded bg-surface-secondary" />
                    <div className="mt-4 h-6 w-2/3 rounded bg-surface-secondary" />
                    <div className="mt-5 h-4 w-full rounded bg-surface-secondary" />
                  </Surface>
                ))}
              </div>
            ) : items.length === 0 ? (
              <Surface variant="elevated" radius="xl" className="p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border-subtle bg-surface-secondary text-text-muted">
                  <InboxIcon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-text-primary">{copy.emptyTitle}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
                  {copy.emptyBody}
                </p>
                {canCapture ? (
                  <Button className="mt-6" onClick={() => navigate(APP_ROUTES.universalCapture)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {copy.capture}
                  </Button>
                ) : null}
              </Surface>
            ) : (
              <div className="flex flex-col gap-3">
                {items.map((item) => {
                  const status = statusPresentation(item);
                  const dimensions = item.imageMetadata
                    ? `${item.imageMetadata.width} × ${item.imageMetadata.height}`
                    : null;

                  return (
                    <Surface key={item.evidenceId} variant="elevated" radius="lg" className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${status.className}`}>
                              {status.icon}
                              {status.label}
                            </span>
                            <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-text-muted">
                              {sourceIcon(item.sourceKind)}
                              {sourceLabel(item.sourceKind)}
                            </span>
                          </div>

                          <h3 className="mt-3 truncate text-base font-semibold text-text-primary">
                            {item.originalFilename || copy.unknownFile}
                          </h3>

                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted">
                            <span>{formatInboxMime(item.mimeType)}</span>
                            <span>{formatInboxBytes(item.byteSize, language)}</span>
                            {dimensions ? <span>{copy.imageDimensions}: {dimensions}</span> : null}
                          </div>
                        </div>

                        <div className="shrink-0 text-left text-xs leading-relaxed text-text-muted sm:text-right">
                          <p>{copy.receivedAt}: {formatInboxDate(item.createdAt, language)}</p>
                          {item.validatedAt ? (
                            <p className="mt-1">{copy.validatedAt}: {formatInboxDate(item.validatedAt, language)}</p>
                          ) : null}
                        </div>
                      </div>
                    </Surface>
                  );
                })}

                {hasMore && nextCursor ? (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="secondary"
                      disabled={loadingMore}
                      onClick={() => void loadData(nextCursor, epochRef.current)}
                    >
                      {loadingMore ? copy.loading : copy.loadMore}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
