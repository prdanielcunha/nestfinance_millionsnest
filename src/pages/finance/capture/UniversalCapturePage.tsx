import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clipboard,
  Copy,
  FileImage,
  FileSearch,
  FileUp,
  Inbox,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import {
  UNIVERSAL_EVIDENCE_MAX_BYTES,
  isUniversalEvidenceMime,
  type UniversalEvidenceSourceKind,
} from '@/shared/finance/universalEvidence';
import { universalCaptureService } from '@/src/services/universalCaptureService';
import { universalEvidenceInboxService } from '@/src/services/universalEvidenceInboxService';
import { universalCaptureOfflineQueue } from '@/src/services/universalCaptureOfflineQueue';
import { consumeShareTarget } from '@/src/services/shareTargetService';
import { classifyUniversalDocumentIntent } from '@/shared/finance/universalInputIntent';
import type { UniversalEvidenceDocumentType } from '@/shared/finance/universalEvidenceReview';
import { UNIVERSAL_CAPTURE_COPY } from './universalCaptureCopy';
import { UniversalQuickTextEntry } from './UniversalQuickTextEntry';

const MAX_BATCH = 20;
type QueueStatus =
  | 'queued'
  | 'uploading'
  | 'analyzing'
  | 'ready'
  | 'duplicate'
  | 'analysis_unavailable'
  | 'unsupported'
  | 'too_large'
  | 'corrupt'
  | 'error';

type QueueItem = {
  id: string;
  file: File;
  sourceKind: UniversalEvidenceSourceKind;
  status: QueueStatus;
  evidenceId: string | null;
  evidenceVersion: number | null;
  intent: UniversalEvidenceDocumentType;
  editingIntent: boolean;
  classified: boolean;
  keys: {
    start: string;
    finalize: string;
    classify: string;
    analyze: string;
  };
};

function itemId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function classifyFile(file: File): QueueStatus {
  if (!file || file.size <= 0) return 'corrupt';
  if (!isUniversalEvidenceMime(file.type)) return 'unsupported';
  if (file.size > UNIVERSAL_EVIDENCE_MAX_BYTES) return 'too_large';
  return 'queued';
}

export default function UniversalCapturePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useLanguage();
  const copy = UNIVERSAL_CAPTURE_COPY[language];
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { accessState } = useAuth();
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const canCapture = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const online = useOnlineStatus();

  const inputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<UniversalEvidenceSourceKind>('file');
  const processingRef = useRef(false);
  const contextRef = useRef({ organizationId, financeEntityId: activeFinanceEntityId || '' });
  const restoredScopeRef = useRef('');

  const [items, setItems] = useState<QueueItem[]>([]);
  const [sharedText, setSharedText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const clipboardAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.read);

  useEffect(() => {
    const previous = contextRef.current;
    const next = { organizationId, financeEntityId: activeFinanceEntityId || '' };
    contextRef.current = next;
    if (
      items.length > 0 &&
      (previous.organizationId !== next.organizationId || previous.financeEntityId !== next.financeEntityId)
    ) {
      processingRef.current = false;
      setProcessing(false);
      setItems([]);
      setNotice(copy.contextChanged);
    }
    // Context guard intentionally reacts only to tenant/entity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId]);

  const patchItem = (id: string, patch: Partial<QueueItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addFiles = (
    files: File[],
    sourceKind: UniversalEvidenceSourceKind,
    intentText = '',
  ) => {
    if (!organizationId || !activeFinanceEntityId) {
      setNotice(copy.noEntity);
      return;
    }
    if (files.length === 0) return;

    const available = Math.max(0, MAX_BATCH - items.length);
    const acceptedFiles = files.slice(0, available);
    if (acceptedFiles.length < files.length) setNotice(copy.maxBatchReached);
    else setNotice(null);

    const nextItems = acceptedFiles.map((file) => ({
      id: itemId(),
      file,
      sourceKind,
      status: classifyFile(file),
      evidenceId: null,
      evidenceVersion: null,
      intent: classifyUniversalDocumentIntent({ filename: file.name, sharedText: intentText }),
      editingIntent: false,
      classified: false,
      keys: {
        start: universalCaptureService.token('idevidence_start'),
        finalize: universalCaptureService.token('idevidence_finalize'),
        classify: universalCaptureService.token('idevidence_classify'),
        analyze: universalCaptureService.token('idevidence_analysis'),
      },
    }) satisfies QueueItem);

    setItems((current) => [...current, ...nextItems]);
    for (const item of nextItems) {
      if (item.status !== 'queued') continue;
      void universalCaptureOfflineQueue.put(organizationId, activeFinanceEntityId, {
        id: item.id,
        file: item.file,
        sourceKind: item.sourceKind,
        intent: item.intent,
        keys: item.keys,
        savedAt: Date.now(),
      });
    }
  };

  useEffect(() => {
    if (!organizationId || !activeFinanceEntityId) return;
    const scope = `${organizationId}:${activeFinanceEntityId}`;
    if (restoredScopeRef.current === scope) return;
    restoredScopeRef.current = scope;
    void universalCaptureOfflineQueue.list(organizationId, activeFinanceEntityId).then((records) => {
      if (contextRef.current.organizationId !== organizationId || contextRef.current.financeEntityId !== activeFinanceEntityId) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        const restored = records.filter((record) => !known.has(record.id)).map((record) => ({
          id: record.id,
          file: record.file,
          sourceKind: record.sourceKind,
          status: classifyFile(record.file),
          evidenceId: null,
          evidenceVersion: null,
          intent: record.intent,
          editingIntent: false,
          classified: false,
          keys: record.keys,
        }) satisfies QueueItem);
        return [...current, ...restored].slice(0, MAX_BATCH);
      });
    });
  }, [organizationId, activeFinanceEntityId]);

  useEffect(() => {
    const shareTargetId = searchParams.get('shareTarget');
    if (!shareTargetId || !organizationId || !activeFinanceEntityId) return;
    void consumeShareTarget(shareTargetId).then((payload) => {
      if (!payload) return;
      if (payload.text) setSharedText(payload.text);
      if (payload.files.length > 0) addFiles(payload.files, 'share_target', payload.text);
      const next = new URLSearchParams(searchParams);
      next.delete('shareTarget');
      setSearchParams(next, { replace: true });
    });
    // Consume each share-target id once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId, searchParams.get('shareTarget')]);

  const choose = (source: UniversalEvidenceSourceKind) => {
    sourceRef.current = source;
    if (!inputRef.current) return;
    if (source === 'camera') {
      inputRef.current.setAttribute('capture', 'environment');
      inputRef.current.multiple = false;
    } else {
      inputRef.current.removeAttribute('capture');
      inputRef.current.multiple = true;
    }
    inputRef.current.click();
  };

  const paste = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of clipboardItems) {
        const type = item.types.find(isUniversalEvidenceMime);
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `clipboard-${Date.now()}-${files.length + 1}.${type.split('/')[1]}`, { type }));
      }
      if (files.length === 0) setNotice(copy.clipboardEmpty);
      else addFiles(files, 'clipboard');
    } catch {
      setNotice(copy.clipboardEmpty);
    }
  };

  const analyzeAccepted = async (item: QueueItem, evidenceId: string, evidenceVersion: number) => {
    patchItem(item.id, { status: 'analyzing', evidenceId, evidenceVersion });
    try {
      const analyzed = await universalEvidenceInboxService.analyzeTransaction(
        organizationId,
        activeFinanceEntityId || '',
        {
          evidenceId,
          expectedVersion: evidenceVersion,
          locale: language,
          idempotencyKey: item.keys.analyze,
          requestId: universalCaptureService.token('req'),
        },
      );
      patchItem(item.id, {
        status: 'ready',
        evidenceId,
        evidenceVersion: analyzed.version,
      });
    } catch {
      patchItem(item.id, {
        status: 'analysis_unavailable',
        evidenceId,
        evidenceVersion,
      });
    }
  };

  const processItem = async (item: QueueItem) => {
    if (!organizationId || !activeFinanceEntityId) return;

    if (item.status === 'analysis_unavailable' && item.evidenceId && item.evidenceVersion) {
      await analyzeAccepted(item, item.evidenceId, item.evidenceVersion);
      return;
    }
    if (!['queued', 'error'].includes(item.status)) return;

    patchItem(item.id, { status: 'uploading' });
    try {
      const result = await universalCaptureService.accept(
        organizationId,
        activeFinanceEntityId,
        item.file,
        item.sourceKind,
        { start: item.keys.start, finalize: item.keys.finalize },
      );
      if (result.duplicate) {
        patchItem(item.id, {
          status: 'duplicate',
          evidenceId: result.evidenceId,
          evidenceVersion: result.version,
        });
        return;
      }
      await analyzeAccepted(item, result.evidenceId, result.version);
    } catch (error: any) {
      const code = String(error?.code || error?.message || '');
      patchItem(item.id, {
        status: code.includes('UNSUPPORTED')
          ? 'unsupported'
          : code.includes('TOO_LARGE')
            ? 'too_large'
            : code.includes('CORRUPT')
              ? 'corrupt'
              : 'error',
      });
    }
  };

  const processAll = async () => {
    if (processingRef.current || !organizationId || !activeFinanceEntityId) return;
    const pinned = { organizationId, financeEntityId: activeFinanceEntityId };
    processingRef.current = true;
    setProcessing(true);
    setNotice(null);
    try {
      const current = [...items];
      for (const item of current) {
        if (
          contextRef.current.organizationId !== pinned.organizationId ||
          contextRef.current.financeEntityId !== pinned.financeEntityId
        ) break;
        if (['queued', 'error', 'analysis_unavailable'].includes(item.status)) {
          await processItem(item);
        }
      }
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const retryItem = async (item: QueueItem) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      await processItem(item);
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const removable = (status: QueueStatus) =>
    ['queued', 'unsupported', 'too_large', 'corrupt', 'error'].includes(status);
  const finished = (status: QueueStatus) =>
    ['ready', 'duplicate', 'analysis_unavailable', 'unsupported', 'too_large', 'corrupt'].includes(status);

  const summary = useMemo(() => ({
    ready: items.filter((item) => item.status === 'ready').length,
    duplicate: items.filter((item) => item.status === 'duplicate').length,
    attention: items.filter((item) => ['analysis_unavailable', 'unsupported', 'too_large', 'corrupt', 'error'].includes(item.status)).length,
    pending: items.filter((item) => ['queued', 'uploading', 'analyzing'].includes(item.status)).length,
  }), [items]);

  const hasProcessable = items.some((item) => ['queued', 'error', 'analysis_unavailable'].includes(item.status));

  const statusPresentation = (status: QueueStatus) => {
    if (status === 'queued') return { label: copy.queued, icon: FileSearch, className: 'text-text-muted' };
    if (status === 'uploading') return { label: copy.uploading, icon: LoaderCircle, className: 'text-accent-primary' };
    if (status === 'analyzing') return { label: copy.analyzing, icon: LoaderCircle, className: 'text-accent-primary' };
    if (status === 'ready') return { label: copy.ready, icon: CheckCircle2, className: 'text-semantic-success' };
    if (status === 'duplicate') return { label: copy.duplicate, icon: Copy, className: 'text-text-muted' };
    if (status === 'analysis_unavailable') return { label: copy.analysisUnavailable, icon: AlertCircle, className: 'text-semantic-warning' };
    if (status === 'unsupported') return { label: copy.unsupported, icon: AlertCircle, className: 'text-semantic-danger' };
    if (status === 'too_large') return { label: copy.too_large, icon: AlertCircle, className: 'text-semantic-danger' };
    if (status === 'corrupt') return { label: copy.corrupt, icon: AlertCircle, className: 'text-semantic-danger' };
    return { label: copy.itemError, icon: RefreshCw, className: 'text-semantic-danger' };
  };

  if (!canCapture) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col justify-center py-6 sm:py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-accent-primary">NestFinance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1>
          <p className="mt-2 text-base text-text-secondary">{copy.subtitle}</p>
        </div>
        <Surface variant="elevated" radius="xl" className="p-6 text-center text-text-secondary" role="status">{copy.noCapability}</Surface>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[65vh] w-full max-w-4xl flex-col py-6 sm:py-10">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []), sourceRef.current);
          event.currentTarget.value = '';
        }}
      />

      <div className="mb-6">
        <p className="text-sm font-semibold text-accent-primary">NestFinance</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-base text-text-secondary">{copy.subtitle}</p>
        {activeFinanceEntityId ? (
          <p className="mt-3 text-sm text-text-muted">
            <span className="font-medium text-text-primary">{copy.entity}:</span> {activeFinanceEntityName}
          </p>
        ) : null}
      </div>

      {!activeFinanceEntityId ? (
        <Surface variant="elevated" radius="xl" className="p-6 text-center text-text-secondary">{copy.noEntity}</Surface>
      ) : (
        <>
          <Surface variant="glass" radius="xl" className="p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button size="lg" onClick={() => choose('camera')}>
                <Camera className="h-5 w-5" aria-hidden="true" />
                {copy.camera}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => choose('photo')}>
                <FileImage className="h-5 w-5" aria-hidden="true" />
                {copy.photo}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => choose('file')}>
                <FileUp className="h-5 w-5" aria-hidden="true" />
                {copy.file}
              </Button>
              {clipboardAvailable ? (
                <Button size="lg" variant="secondary" onClick={() => void paste()}>
                  <Clipboard className="h-5 w-5" aria-hidden="true" />
                  {copy.clipboard}
                </Button>
              ) : null}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-text-muted">{copy.multipleHint} {copy.batchLimit}</p>
            {notice ? <p className="mt-3 text-sm font-medium text-semantic-warning" role="status">{notice}</p> : null}
          </Surface>

          {items.length > 0 ? (
            <Surface variant="elevated" radius="xl" className="mt-5 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{copy.batchTitle}</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.batchSubtitle}</p>
                </div>
                <span className="rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 text-xs font-semibold text-text-secondary">
                  {items.length}/{MAX_BATCH}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCell label={copy.batchReady} value={summary.ready} />
                <SummaryCell label={copy.batchDuplicate} value={summary.duplicate} />
                <SummaryCell label={copy.batchNeedsAttention} value={summary.attention} />
                <SummaryCell label={copy.batchPending} value={summary.pending} />
              </div>

              <div className="mt-5 grid gap-3">
                {items.map((item, index) => {
                  const presentation = statusPresentation(item.status);
                  const StatusIcon = presentation.icon;
                  return (
                    <div key={item.id} className="rounded-2xl border border-border-subtle bg-surface-secondary/45 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-sm font-semibold text-text-secondary">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-text-primary">{item.file.name}</p>
                          <p className="mt-0.5 text-xs text-text-muted">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                          <div className={`mt-2 flex items-center gap-2 text-xs font-semibold ${presentation.className}`}>
                            <StatusIcon className={`h-4 w-4 ${item.status === 'uploading' || item.status === 'analyzing' ? 'animate-spin' : ''}`} aria-hidden="true" />
                            <span>{presentation.label}</span>
                          </div>
                          {item.status === 'analysis_unavailable' ? (
                            <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.preservedAfterAnalysisError}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.status === 'ready' && item.evidenceId ? (
                          <Button
                            variant="secondary"
                            onClick={() => navigate(APP_ROUTES.inboxEvidenceDetail.replace(':evidenceId', item.evidenceId!))}
                          >
                            {copy.openAnalysis}
                          </Button>
                        ) : null}
                        {['error', 'analysis_unavailable'].includes(item.status) ? (
                          <Button variant="secondary" disabled={processing} onClick={() => void retryItem(item)}>
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            {copy.itemRetry}
                          </Button>
                        ) : null}
                        {removable(item.status) ? (
                          <Button
                            variant="ghost"
                            disabled={processing}
                            onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            {copy.remove}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" size="lg" disabled={processing || items.length >= MAX_BATCH} onClick={() => choose('file')}>
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  {copy.addMore}
                </Button>
                <Button size="lg" disabled={processing || !hasProcessable} onClick={() => void processAll()}>
                  {processing ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FileSearch className="h-5 w-5" aria-hidden="true" />}
                  {processing ? copy.processingBatch : copy.processAll}
                </Button>
              </div>

              {items.some((item) => finished(item.status)) ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="ghost"
                    disabled={processing}
                    onClick={() => setItems((current) => current.filter((item) => !finished(item.status)))}
                  >
                    {copy.clearFinished}
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(APP_ROUTES.inbox)}>
                    <Inbox className="h-4 w-4" aria-hidden="true" />
                    {copy.openInbox}
                  </Button>
                </div>
              ) : null}
            </Surface>
          ) : null}
        </>
      )}

      <div className="mt-6 flex items-start gap-2 text-sm text-text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{copy.privacyBatch || copy.privacy}</p>
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
      <p className="text-xl font-semibold tabular-nums text-text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}
