import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Camera, FileImage, ShieldCheck, ShieldX, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countCaptureService } from '@/src/services/countCaptureService';
import { COUNT_CAPTURE_ORIGINAL_MAX_BYTES, isSupportedCountCaptureOriginalType, parseCountPaperIdentityPayload } from '@/shared/finance/countCapture';
import { disposePreparedCountCaptureImage, prepareCountCaptureImage, type PreparedCountCaptureImage } from './countCaptureImage';
import { COUNT_CAPTURE_COPY } from './countCaptureCopy';

function token(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export default function CountCapturePage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COUNT_CAPTURE_COPY[language];
  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') return null;
  if (!hasEffectiveCapability(accessState, 'finance.view') || !hasEffectiveCapability(accessState, 'finance.create_drafts')) {
    return <main className="flex flex-1 flex-col items-center justify-center bg-surface-base p-8 text-center"><ShieldX className="h-10 w-10 text-semantic-danger" aria-hidden="true" /><p className="mt-4 max-w-sm text-sm text-text-muted">{copy.accessDenied}</p></main>;
  }
  return <FinanceContextGuard><CountCaptureContent /></FinanceContextGuard>;
}

function CountCaptureContent() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COUNT_CAPTURE_COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const inputRef = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<PreparedCountCaptureImage | null>(null);
  const [manualFormId, setManualFormId] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<{ fingerprint: string; startKey: string; finalizeKey: string } | null>(null);

  useEffect(() => () => disposePreparedCountCaptureImage(prepared), [prepared]);
  useEffect(() => {
    disposePreparedCountCaptureImage(prepared);
    setPrepared(null); setManualFormId(''); setError(null); attemptRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFinanceEntityId]);

  const choose = (camera: boolean) => {
    if (!inputRef.current) return;
    if (camera) inputRef.current.setAttribute('capture', 'environment'); else inputRef.current.removeAttribute('capture');
    inputRef.current.click();
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    disposePreparedCountCaptureImage(prepared); setPrepared(null); setError(null); attemptRef.current = null;
    if (!isSupportedCountCaptureOriginalType(file.type) || file.size <= 0 || file.size > COUNT_CAPTURE_ORIGINAL_MAX_BYTES) { setError(copy.invalidImage); return; }
    setPreparing(true);
    try {
      const next = await prepareCountCaptureImage(file);
      setPrepared(next);
      if (next.qrPayload) setManualFormId(parseCountPaperIdentityPayload(next.qrPayload).formId);
    } catch { setError(copy.invalidImage); }
    finally { setPreparing(false); }
  };

  const send = async () => {
    if (!prepared || !activeFinanceEntityId || !organizationId || sending) return;
    const formId = manualFormId.trim();
    if (!prepared.qrPayload && !/^cpf_[a-f0-9]{16}$/.test(formId)) { setError(copy.safeError); return; }
    const fingerprint = [activeFinanceEntityId, prepared.originalSha256, prepared.normalizedSha256, prepared.qrPayload || formId].join('|');
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, startKey: token('idcountcapture_start'), finalizeKey: token('idcountcapture_finalize') };
    }

    setSending(true); setError(null);
    try {
      const started = await countCaptureService.start(organizationId, activeFinanceEntityId, {
        ...(prepared.qrPayload ? { qrPayload: prepared.qrPayload } : { formId }),
        originalContentType: prepared.original.type,
        originalSize: prepared.original.size,
        originalSha256: prepared.originalSha256,
        normalizedContentType: prepared.normalized.type || 'image/jpeg',
        normalizedSize: prepared.normalized.size,
        normalizedSha256: prepared.normalizedSha256,
        idempotencyKey: attemptRef.current.startKey,
        requestId: token('req'),
      });
      await Promise.all([
        countCaptureService.upload(started.originalUpload, prepared.original),
        countCaptureService.upload(started.normalizedUpload, prepared.normalized),
      ]);
      const finalized = await countCaptureService.finalize(organizationId, activeFinanceEntityId, {
        captureId: started.captureId,
        expectedVersion: started.version,
        normalization: prepared.normalization,
        idempotencyKey: attemptRef.current.finalizeKey,
        requestId: token('req'),
      });
      attemptRef.current = null;
      navigate(APP_ROUTES.countCaptureReview.replace(':captureId', finalized.canonicalCaptureId));
    } catch { setError(copy.safeError); }
    finally { setSending(false); }
  };

  return <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
    <FinanceEntityContextBar areaName={copy.title} />
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="flex items-start gap-3"><Button variant="ghost" className="!min-h-12 !w-12 !px-0" aria-label={copy.back} onClick={() => navigate(APP_ROUTES.countPaperForms)}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></Button><div className="pt-1"><h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.subtitle}</p></div></header>
      <Surface variant="secondary" radius="xl" className="border-accent-primary/15 bg-accent-primary/5 p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" /><p className="text-sm leading-relaxed text-text-muted">{copy.noPosting}</p></div></Surface>
      {error ? <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-danger/20 bg-semantic-danger/10 p-4 text-sm text-text-primary">{error}</Surface> : null}
      {!prepared ? <Surface variant="elevated" radius="xl" className="p-6 sm:p-8"><div className="grid gap-3 sm:grid-cols-2"><Button size="lg" onClick={() => choose(true)} disabled={preparing}><Camera className="h-5 w-5" aria-hidden="true" />{preparing ? copy.processing : copy.camera}</Button><Button size="lg" variant="secondary" onClick={() => choose(false)} disabled={preparing}><FileImage className="h-5 w-5" aria-hidden="true" />{copy.choosePhoto}</Button></div></Surface> : <>
        <Surface variant="elevated" radius="xl" className="overflow-hidden p-4 sm:p-5"><img src={prepared.normalizedPreviewUrl} alt={copy.normalizedEvidence} className="max-h-[58vh] w-full rounded-xl bg-white object-contain" /><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-text-muted">{prepared.qrPayload ? copy.detectedQr : copy.manualReferenceHint}</p><Button variant="secondary" onClick={() => choose(false)} disabled={sending}>{copy.replace}</Button></div></Surface>
        <Surface variant="elevated" radius="xl" className="p-5"><label className="block"><span className="text-sm font-medium text-text-primary">{copy.manualReference}</span><input value={manualFormId} onChange={(event) => { setManualFormId(event.target.value.trim()); attemptRef.current = null; }} readOnly={Boolean(prepared.qrPayload)} placeholder="cpf_0123456789abcdef" className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 font-mono text-sm text-text-primary outline-none focus:border-accent-primary read-only:opacity-70" /></label><Button className="mt-5" size="lg" fullWidth onClick={() => void send()} disabled={sending || (!prepared.qrPayload && !/^cpf_[a-f0-9]{16}$/.test(manualFormId))}><Upload className="h-5 w-5" aria-hidden="true" />{sending ? copy.uploading : copy.upload}</Button></Surface>
      </>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(event) => void onFile(event)} />
    </div></div>
  </div>;
}
