import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clipboard,
  Copy,
  Eye,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  ShieldX,
  Upload,
  X,
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
  type UniversalEvidenceDetail,
} from '@/src/services/universalEvidenceInboxService';
import { INBOX_COPY } from './inboxCopy';
import {
  formatInboxBytes,
  formatInboxDate,
  formatInboxMime,
  normalizeInboxEvidenceState,
} from './inboxModel';
import { UniversalEvidencePdfReadinessCard } from './UniversalEvidencePdfReadinessCard';

const VALID_EVIDENCE_ID = /^evd_[a-f0-9]{32}$/;
const PREVIEW_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export default function UniversalEvidenceDetailPage() {
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
        <h1 className="mb-2 text-lg font-semibold text-text-primary">{copy.accessDeniedTitle}</h1>
        <p className="max-w-sm text-sm leading-relaxed text-text-muted">{copy.accessDeniedBody}</p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <EvidenceDetailContent />
    </FinanceContextGuard>
  );
}

function EvidenceDetailContent() {
  const navigate = useNavigate();
  const { evidenceId } = useParams();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = INBOX_COPY[language];

  const [evidence, setEvidence] = useState<UniversalEvidenceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErrorDetails, setPreviewErrorDetails] = useState<any | null>(null);
  const epochRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const closePreview = () => {
    revokePreviewUrl();
    setPreviewUrl(null);
    setPreviewMime(null);
    setPreviewErrorDetails(null);
    setPreviewLoading(false);
  };

  const loadDetail = async (epoch = epochRef.current) => {
    const organizationId = accessState.organizationId;
    if (!organizationId || !activeFinanceEntityId || !evidenceId || !VALID_EVIDENCE_ID.test(evidenceId)) {
      setLoading(false);
      setEvidence(null);
      setErrorDetails({ error: 'EVIDENCE_NOT_FOUND' });
      return;
    }

    setLoading(true);
    setErrorDetails(null);

    try {
      const response = await universalEvidenceInboxService.detail(
        organizationId,
        activeFinanceEntityId,
        evidenceId,
      );
      if (epoch !== epochRef.current) return;
      setEvidence(response.evidence);
    } catch (error: any) {
      if (epoch !== epochRef.current) return;
      setEvidence(null);
      setErrorDetails(error?.details || { error: error?.message });
    } finally {
      if (epoch !== epochRef.current) return;
      setLoading(false);
    }
  };

  const openPreview = async () => {
    const organizationId = accessState.organizationId;
    if (!organizationId || !activeFinanceEntityId || !evidenceId || !VALID_EVIDENCE_ID.test(evidenceId)) return;

    const epoch = epochRef.current;
    setPreviewLoading(true);
    setPreviewErrorDetails(null);

    try {
      const response = await universalEvidenceInboxService.preview(
        organizationId,
        activeFinanceEntityId,
        evidenceId,
      );
      if (epoch !== epochRef.current) return;

      revokePreviewUrl();
      const url = URL.createObjectURL(response.blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewMime(response.mimeType);
    } catch (error: any) {
      if (epoch !== epochRef.current) return;
      revokePreviewUrl();
      setPreviewUrl(null);
      setPreviewMime(null);
      setPreviewErrorDetails(error?.details || { error: error?.message });
    } finally {
      if (epoch !== epochRef.current) return;
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    const epoch = ++epochRef.current;
    revokePreviewUrl();
    setPreviewUrl(null);
    setPreviewMime(null);
    setPreviewErrorDetails(null);
    setPreviewLoading(false);
    setEvidence(null);
    setErrorDetails(null);
    void loadDetail(epoch);

    return () => {
      epochRef.current += 1;
      revokePreviewUrl();
    };
    // Detail and preview requests must restart whenever the route or canonical context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessState.organizationId, activeFinanceEntityId, evidenceId]);

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

  const statusPresentation = (item: UniversalEvidenceDetail) => {
    const state = normalizeInboxEvidenceState(item.processingState);
    if (state === 'accepted') return { label: copy.accepted, icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />, className: 'border-accent-primary/25 bg-accent-primary/10 text-accent-primary' };
    if (state === 'duplicate') return { label: copy.duplicate, icon: <Copy className="h-4 w-4" aria-hidden="true" />, className: 'border-border-subtle bg-surface-secondary text-text-secondary' };
    if (state === 'awaiting_upload') return { label: copy.awaitingUpload, icon: <Upload className="h-4 w-4" aria-hidden="true" />, className: 'border-border-subtle bg-surface-elevated text-text-muted' };
    return { label: copy.unknownStatus, icon: <AlertCircle className="h-4 w-4" aria-hidden="true" />, className: 'border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger' };
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.detailTitle} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8" aria-busy="true" aria-label={copy.detailLoading}>
          <div className="mx-auto grid w-full max-w-5xl gap-4">
            {[0, 1, 2].map((item) => (
              <Surface key={item} variant="elevated" radius="xl" className="animate-pulse p-6">
                <div className="h-5 w-40 rounded bg-surface-secondary" />
                <div className="mt-5 h-4 w-3/4 rounded bg-surface-secondary" />
                <div className="mt-3 h-4 w-1/2 rounded bg-surface-secondary" />
              </Surface>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!evidence || errorDetails) {
    const notFound = errorDetails?.error === 'EVIDENCE_NOT_FOUND' || errorDetails?.error === 'INVALID_PARAMETERS';
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.detailTitle} />
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-6">
          <Surface variant="elevated" radius="xl" role="alert" className="w-full max-w-md p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 text-semantic-danger">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-text-primary">{copy.detailErrorTitle}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {notFound ? copy.detailNotFound : copy.detailErrorBody}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {!notFound ? <Button fullWidth onClick={() => void loadDetail(epochRef.current)}>{copy.retry}</Button> : null}
              <Button variant="secondary" fullWidth onClick={() => navigate(APP_ROUTES.inbox)}>{copy.detailBack}</Button>
            </div>
            {errorDetails?.requestId ? (
              <p className="mt-5 break-all font-mono text-xs text-text-muted">{copy.supportCode}: {errorDetails.requestId}</p>
            ) : null}
          </Surface>
        </div>
      </div>
    );
  }

  const status = statusPresentation(evidence);
  const dimensions = evidence.imageMetadata
    ? `${evidence.imageMetadata.width} × ${evidence.imageMetadata.height}`
    : '—';
  const checks = [
    { label: copy.immutableOriginal, value: evidence.verification.immutableOriginal },
    { label: copy.mimeVerified, value: evidence.verification.mimeVerified },
    { label: copy.sizeVerified, value: evidence.verification.sizeVerified },
    { label: copy.hashVerified, value: evidence.verification.contentHashVerified },
  ];
  const previewState = normalizeInboxEvidenceState(evidence.processingState);
  const canPreview =
    (previewState === 'accepted' || previewState === 'duplicate') &&
    evidence.version === 2 &&
    Boolean(evidence.verifiedMimeType && PREVIEW_MIME_TYPES.has(evidence.verifiedMimeType)) &&
    evidence.verification.immutableOriginal &&
    evidence.verification.mimeVerified &&
    evidence.verification.sizeVerified &&
    evidence.verification.contentHashVerified;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.detailTitle} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <header className="flex items-start gap-3">
            <Button variant="ghost" className="!min-h-12 !w-12 !px-0" aria-label={copy.detailBack} onClick={() => navigate(APP_ROUTES.inbox)}>
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0 pt-1">
              <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.detailTitle}</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.detailSubtitle}</p>
            </div>
          </header>

          <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${status.className}`}>{status.icon}{status.label}</span>
                  <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-text-muted">{sourceIcon(evidence.sourceKind)}{sourceLabel(evidence.sourceKind)}</span>
                </div>
                <h2 className="mt-4 break-words text-xl font-semibold text-text-primary">{evidence.originalFilename || copy.unknownFile}</h2>
                {canPreview ? (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      disabled={previewLoading}
                      onClick={() => (previewUrl ? closePreview() : void openPreview())}
                    >
                      {previewUrl ? <X className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      {previewUrl ? copy.previewClose : previewLoading ? copy.previewLoading : copy.previewOriginal}
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-left text-xs leading-relaxed text-text-muted sm:text-right">
                <p>{copy.receivedAt}: {formatInboxDate(evidence.createdAt, language)}</p>
                {evidence.validatedAt ? <p className="mt-1">{copy.validatedAt}: {formatInboxDate(evidence.validatedAt, language)}</p> : null}
              </div>
            </div>
          </Surface>

          {previewErrorDetails ? (
            <Surface variant="elevated" radius="xl" role="alert" className="border border-semantic-danger/20 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-text-primary">{copy.previewErrorTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.previewErrorBody}</p>
                  <Button className="mt-4" variant="secondary" disabled={previewLoading} onClick={() => void openPreview()}>
                    {previewLoading ? copy.previewLoading : copy.retry}
                  </Button>
                  {previewErrorDetails?.requestId ? (
                    <p className="mt-4 break-all font-mono text-xs text-text-muted">{copy.supportCode}: {previewErrorDetails.requestId}</p>
                  ) : null}
                </div>
              </div>
            </Surface>
          ) : null}

          {previewUrl ? (
            <Surface variant="elevated" radius="xl" className="overflow-hidden p-0">
              <div className="border-b border-border-subtle p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-text-primary">{copy.previewTitle}</h2>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.previewSubtitle}</p>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.previewPrivacy}</p>
              </div>
              <div className="flex min-h-64 items-center justify-center bg-surface-secondary/50 p-3 sm:p-5">
                {previewMime?.startsWith('image/') ? (
                  <img
                    src={previewUrl}
                    alt={evidence.originalFilename || copy.previewTitle}
                    className="max-h-[70vh] max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <iframe
                    src={previewUrl}
                    title={copy.previewTitle}
                    className="h-[70vh] w-full rounded-lg border-0 bg-white"
                  />
                )}
              </div>
            </Surface>
          ) : null}

          <UniversalEvidencePdfReadinessCard evidence={evidence} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-text-primary">{copy.fileInformation}</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <DetailRow label={copy.declaredMime} value={formatInboxMime(evidence.declaredMimeType)} />
                <DetailRow label={copy.verifiedMime} value={formatInboxMime(evidence.verifiedMimeType)} />
                <DetailRow label={copy.imageDimensions} value={dimensions} />
                <DetailRow label={copy.fileSize} value={formatInboxBytes(evidence.byteSize, language)} />
                <DetailRow label={copy.evidenceId} value={evidence.evidenceId} mono />
                <DetailRow label={copy.version} value={String(evidence.version)} />
              </dl>
            </Surface>

            <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{copy.integrityTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.integritySubtitle}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {checks.map((check) => (
                  <div key={check.label} className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface-secondary/50 px-4 py-3">
                    <span className="text-sm text-text-secondary">{check.label}</span>
                    <span className={`text-xs font-semibold ${check.value ? 'text-accent-primary' : 'text-text-muted'}`}>{check.value ? copy.verified : copy.pendingVerification}</span>
                  </div>
                ))}
              </div>
            </Surface>
          </div>

          <Surface variant="subtle" radius="xl" className="flex gap-3 p-5 sm:p-6">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-text-primary">{copy.noAccountingActionTitle}</h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.noAccountingActionBody}</p>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-b border-border-subtle pb-3 last:border-0 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</dt>
      <dd className={`break-all text-sm text-text-primary ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
