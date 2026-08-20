import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Clipboard, FileImage, FileUp, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { UNIVERSAL_EVIDENCE_MAX_BYTES, isUniversalEvidenceMime, type UniversalEvidenceSourceKind } from '@/shared/finance/universalEvidence';
import { universalCaptureService } from '@/src/services/universalCaptureService';
import { UNIVERSAL_CAPTURE_COPY } from './universalCaptureCopy';
import { createUniversalCaptureContext, hasUniversalCaptureContextChanged, isUniversalCaptureEpochCurrent, type UniversalCaptureContext } from './universalCaptureModel';

type State = 'selecting' | 'preview' | 'validating' | 'accepted' | 'duplicate' | 'unsupported' | 'too_large' | 'corrupt' | 'recoverable_error';

export default function UniversalCapturePage() {
  const { language } = useLanguage();
  const copy = UNIVERSAL_CAPTURE_COPY[language];
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { accessState } = useAuth();
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const canCapture = hasEffectiveCapability(accessState, 'finance.create_drafts');

  const inputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<UniversalEvidenceSourceKind>('file');
  const keysRef = useRef<{ fingerprint: string; start: string; finalize: string } | null>(null);
  const epochRef = useRef(0);
  const [state, setState] = useState<State>('selecting');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [captureContext, setCaptureContext] = useState<UniversalCaptureContext | null>(null);
  const clipboardAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.read);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const clearSelection = (nextNotice: string | null = null) => {
    epochRef.current += 1;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setCaptureContext(null);
    setNotice(nextNotice);
    setState('selecting');
    keysRef.current = null;
  };

  useEffect(() => {
    if (!captureContext) return;
    if (!hasUniversalCaptureContextChanged(captureContext, organizationId, activeFinanceEntityId)) return;
    clearSelection(copy.contextChanged);
  }, [organizationId, activeFinanceEntityId]);

  const reset = () => clearSelection(null);

  const adopt = (next: File | null, source: UniversalEvidenceSourceKind) => {
    setNotice(null);
    if (!next || next.size <= 0) {
      setState('corrupt');
      return;
    }
    if (!isUniversalEvidenceMime(next.type)) {
      setState('unsupported');
      return;
    }
    if (next.size > UNIVERSAL_EVIDENCE_MAX_BYTES) {
      setState('too_large');
      return;
    }
    if (!organizationId || !activeFinanceEntityId) {
      setState('selecting');
      setNotice(copy.noEntity);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    const pinned = createUniversalCaptureContext({
      organizationId,
      financeEntityId: activeFinanceEntityId,
      financeEntityName: activeFinanceEntityName,
      epoch: epochRef.current,
    });
    setFile(next);
    setCaptureContext(pinned);
    sourceRef.current = source;
    setPreview(next.type.startsWith('image/') ? URL.createObjectURL(next) : null);
    setState('preview');
    keysRef.current = null;
  };

  const choose = (source: UniversalEvidenceSourceKind) => {
    sourceRef.current = source;
    if (source === 'camera') inputRef.current?.setAttribute('capture', 'environment');
    else inputRef.current?.removeAttribute('capture');
    inputRef.current?.click();
  };

  const paste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(isUniversalEvidenceMime);
        if (type) {
          const blob = await item.getType(type);
          adopt(new File([blob], `clipboard-${Date.now()}.${type.split('/')[1]}`, { type }), 'clipboard');
          return;
        }
      }
      setNotice(copy.clipboardEmpty);
    } catch {
      setNotice(copy.clipboardEmpty);
    }
  };

  const submit = async () => {
    if (!file || !captureContext) return;
    if (hasUniversalCaptureContextChanged(captureContext, organizationId, activeFinanceEntityId)) {
      clearSelection(copy.contextChanged);
      return;
    }

    const requestEpoch = captureContext.epoch;
    setState('validating');
    const fingerprint = `${captureContext.organizationId}:${captureContext.financeEntityId}:${file.name}:${file.size}:${file.lastModified}`;
    if (!keysRef.current || keysRef.current.fingerprint !== fingerprint) {
      keysRef.current = {
        fingerprint,
        start: universalCaptureService.token('idevidence_start'),
        finalize: universalCaptureService.token('idevidence_finalize'),
      };
    }

    try {
      const result = await universalCaptureService.accept(
        captureContext.organizationId,
        captureContext.financeEntityId,
        file,
        sourceRef.current,
        keysRef.current,
      );
      if (!isUniversalCaptureEpochCurrent(requestEpoch, epochRef.current)) return;
      setState(result.duplicate ? 'duplicate' : 'accepted');
    } catch (error: any) {
      if (!isUniversalCaptureEpochCurrent(requestEpoch, epochRef.current)) return;
      const code = String(error?.code || '');
      setState(
        code.includes('UNSUPPORTED')
          ? 'unsupported'
          : code.includes('TOO_LARGE')
            ? 'too_large'
            : code.includes('CORRUPT')
              ? 'corrupt'
              : 'recoverable_error',
      );
    }
  };

  const terminal = ['accepted', 'duplicate', 'unsupported', 'too_large', 'corrupt', 'recoverable_error'].includes(state);

  if (!canCapture) {
    return <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col justify-center py-6 sm:py-10">
      <div className="mb-8"><p className="text-sm font-semibold text-accent-primary">NestFinance</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1><p className="mt-2 text-base text-text-secondary">{copy.subtitle}</p></div>
      <Surface variant="elevated" radius="xl" className="p-6 text-center text-text-secondary" role="status">{copy.noCapability}</Surface>
      <p className="mt-6 flex items-start gap-2 text-sm text-text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{copy.privacy}</p>
    </div>;
  }

  return <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col justify-center py-6 sm:py-10">
    <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { adopt(event.target.files?.[0] || null, sourceRef.current); event.currentTarget.value = ''; }} />
    <div className="mb-8"><p className="text-sm font-semibold text-accent-primary">NestFinance</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1><p className="mt-2 text-base text-text-secondary">{copy.subtitle}</p></div>
    {!activeFinanceEntityId ? <Surface variant="elevated" radius="xl" className="p-6 text-center text-text-secondary">{copy.noEntity}</Surface> : null}
    {activeFinanceEntityId && state === 'selecting' ? <div className="grid gap-3 sm:grid-cols-2">
      <Button size="lg" onClick={() => choose('camera')}><Camera className="h-5 w-5" aria-hidden="true" />{copy.camera}</Button>
      <Button size="lg" variant="secondary" onClick={() => choose('photo')}><FileImage className="h-5 w-5" aria-hidden="true" />{copy.photo}</Button>
      <Button size="lg" variant="secondary" onClick={() => choose('file')}><FileUp className="h-5 w-5" aria-hidden="true" />{copy.file}</Button>
      {clipboardAvailable ? <Button size="lg" variant="secondary" onClick={paste}><Clipboard className="h-5 w-5" aria-hidden="true" />{copy.clipboard}</Button> : null}
      {notice ? <p role="status" className="sm:col-span-2 text-sm text-text-secondary">{notice}</p> : null}
    </div> : null}
    {captureContext && (state === 'preview' || state === 'validating') && file ? <Surface variant="elevated" radius="xl" className="overflow-hidden">
      {preview ? <img src={preview} alt="" className="max-h-[46vh] w-full bg-surface-secondary object-contain" /> : <div className="flex h-44 items-center justify-center bg-surface-secondary"><FileUp className="h-12 w-12 text-text-muted" aria-hidden="true" /></div>}
      <div className="p-5 sm:p-6"><h2 className="text-lg font-semibold">{copy.preview}</h2><p className="mt-1 truncate text-sm text-text-secondary">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p><p className="mt-2 text-sm text-text-secondary"><span className="font-medium text-text-primary">{copy.entity}:</span> {captureContext.financeEntityName}</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button size="lg" onClick={submit} disabled={state === 'validating'}><Check className="h-5 w-5" aria-hidden="true" />{state === 'validating' ? copy.validating : copy.validate}</Button><Button size="lg" variant="ghost" onClick={reset} disabled={state === 'validating'}>{copy.change}</Button></div></div>
    </Surface> : null}
    {terminal ? <Surface variant="elevated" radius="xl" className="p-7 text-center sm:p-10" role="status" aria-live="polite"><div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${state === 'accepted' || state === 'duplicate' ? 'bg-semantic-success/10 text-semantic-success' : 'bg-semantic-danger/10 text-semantic-danger'}`}>{state === 'accepted' || state === 'duplicate' ? <Check className="h-7 w-7" aria-hidden="true" /> : <RefreshCw className="h-7 w-7" aria-hidden="true" />}</div><h2 className="mt-5 text-xl font-semibold">{copy[state]}</h2>{captureContext ? <p className="mt-2 text-sm text-text-secondary"><span className="font-medium text-text-primary">{copy.entity}:</span> {captureContext.financeEntityName}</p> : null}<Button className="mt-6" size="lg" variant="secondary" onClick={reset}>{copy.again}</Button></Surface> : null}
    <p className="mt-6 flex items-start gap-2 text-sm text-text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{copy.privacy}</p>
  </div>;
}
