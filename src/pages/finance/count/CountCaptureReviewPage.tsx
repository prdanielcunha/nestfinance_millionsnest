import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, EyeOff, Files, Focus, ShieldX } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countCaptureService, type CountCaptureDetail } from '@/src/services/countCaptureService';
import { COUNT_CAPTURE_FIELD_KEYS, type CountCaptureFieldKey, type CountCaptureRegion } from '@/shared/finance/countCapture';
import { parseCountCaptureMoneyObservation } from '@/shared/finance/countCaptureExtraction';
import { getCountCaptureEvidenceRegion } from '@/shared/finance/countCaptureGeometry';
import { COUNT_CAPTURE_COPY } from './countCaptureCopy';
import { CountCaptureExtractionPanel } from './CountCaptureExtractionPanel';

const HUMAN_COPY = {
  PT: { verified: 'Conferi este campo na imagem', suggested: 'Sugestão da leitura assistida', uncertain: 'A leitura ficou incerta. Confira manualmente.', unresolved: 'Sem sugestão segura. Confira manualmente.', verificationRequired: 'Confira todos os campos sugeridos ou faça uma correção antes de salvar.' },
  EN: { verified: 'I checked this field against the image', suggested: 'Assisted-reading suggestion', uncertain: 'The reading is uncertain. Check it manually.', unresolved: 'No safe suggestion. Check it manually.', verificationRequired: 'Check every suggested field or correct it before saving.' },
  ES: { verified: 'Revisé este campo en la imagen', suggested: 'Sugerencia de lectura asistida', uncertain: 'La lectura es incierta. Revísala manualmente.', unresolved: 'Sin sugerencia segura. Revísalo manualmente.', verificationRequired: 'Revisa cada campo sugerido o corrígelo antes de guardar.' },
} as const;

function token(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function centsToInput(cents: number | null, language: 'PT' | 'EN' | 'ES') {
  if (cents === null) return '';
  const separator = language === 'EN' ? '.' : ',';
  return `${Math.floor(cents / 100)}${separator}${String(cents % 100).padStart(2, '0')}`;
}
function inputToCents(raw: string): number | null {
  const parsed = parseCountCaptureMoneyObservation(raw);
  return parsed.kind === 'recognized' ? parsed.valueCents : null;
}

type RowState = { amount: string; unreadable: boolean; verified: boolean };
function blankRows(): Record<CountCaptureFieldKey, RowState> {
  return Object.fromEntries(COUNT_CAPTURE_FIELD_KEYS.map((key) => [key, { amount: '', unreadable: false, verified: false }])) as Record<CountCaptureFieldKey, RowState>;
}

function EvidenceRegionCrop({ url, region, label, width, height }: { url: string; region: CountCaptureRegion; label: string; width: number; height: number }) {
  const aspectRatio = Math.max(0.5, Math.min(5, (region.width * width) / (region.height * height)));
  return <div className="overflow-hidden rounded-xl border border-border-subtle bg-white" style={{ aspectRatio }} role="img" aria-label={label}><div className="relative h-full w-full overflow-hidden"><img src={url} alt="" className="absolute max-w-none select-none" draggable={false} style={{ width: `${100 / region.width}%`, height: `${100 / region.height}%`, left: `${-(region.x / region.width) * 100}%`, top: `${-(region.y / region.height) * 100}%` }} /></div></div>;
}

export default function CountCaptureReviewPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COUNT_CAPTURE_COPY[language];
  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') return null;
  if (!hasEffectiveCapability(accessState, 'finance.view')) return <main className="flex flex-1 items-center justify-center p-8 text-center"><div><ShieldX className="mx-auto h-10 w-10 text-semantic-danger" /><p className="mt-4 text-sm text-text-muted">{copy.accessDenied}</p></div></main>;
  return <FinanceContextGuard><CountCaptureReviewContent /></FinanceContextGuard>;
}

function CountCaptureReviewContent() {
  const { captureId = '' } = useParams();
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COUNT_CAPTURE_COPY[language];
  const humanCopy = HUMAN_COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const canEdit = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const [capture, setCapture] = useState<CountCaptureDetail | null>(null);
  const [inspectKey, setInspectKey] = useState<CountCaptureFieldKey | null>(null);
  const [rows, setRows] = useState<Record<CountCaptureFieldKey, RowState>>(blankRows);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const epochRef = useRef(0);
  const saveAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const hydrateRows = (next: CountCaptureDetail) => {
    const reviewFields = next.review?.fields || [];
    const candidateFields = next.candidates || [];
    setRows(Object.fromEntries(COUNT_CAPTURE_FIELD_KEYS.map((key) => {
      const review = reviewFields.find((field) => field.key === key);
      if (review) return [key, { amount: centsToInput(review.valueCents, language), unreadable: review.decision === 'unreadable', verified: true }];
      const candidate = candidateFields.find((field) => field.key === key);
      const recognized = candidate?.state === 'recognized' && candidate.valueCents !== null;
      return [key, { amount: centsToInput(recognized ? candidate.valueCents : null, language), unreadable: false, verified: false }];
    })) as Record<CountCaptureFieldKey, RowState>);
  };

  const load = async () => {
    if (!organizationId || !activeFinanceEntityId || !captureId) return;
    const epoch = ++epochRef.current;
    setLoading(true); setError(false);
    try {
      const response = await countCaptureService.detail(organizationId, activeFinanceEntityId, captureId);
      if (epoch !== epochRef.current) return;
      setCapture(response.capture); setInspectKey(null);
      if (!response.capture.materialHidden && response.capture.status !== 'duplicate') hydrateRows(response.capture);
    } catch { if (epoch === epochRef.current) setError(true); }
    finally { if (epoch === epochRef.current) setLoading(false); }
  };

  useEffect(() => {
    setCapture(null); setRows(blankRows()); saveAttemptRef.current = null; void load();
    return () => { epochRef.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId, captureId]);

  const preparedFields = useMemo(() => {
    if (!capture?.candidates) return null;
    const result = [] as Array<{ key: CountCaptureFieldKey; decision: 'confirmed' | 'corrected' | 'unreadable'; valueCents: number | null }>;
    for (const key of COUNT_CAPTURE_FIELD_KEYS) {
      const row = rows[key];
      const candidate = capture.candidates.find((field) => field.key === key);
      if (row.unreadable) {
        if (!row.verified) return null;
        result.push({ key, decision: 'unreadable', valueCents: null });
        continue;
      }
      const valueCents = inputToCents(row.amount);
      if (valueCents === null || !row.verified) return null;
      const confirmed = candidate?.state === 'recognized' && candidate.valueCents === valueCents;
      result.push({ key, decision: confirmed ? 'confirmed' : 'corrected', valueCents });
    }
    return result;
  }, [capture, rows]);

  const regionFor = (key: CountCaptureFieldKey): CountCaptureRegion | null => {
    if (!capture?.normalization?.geometry || capture.normalization.geometry.mode === 'full_frame') return null;
    return capture.candidates?.find((field) => field.key === key)?.region || getCountCaptureEvidenceRegion(capture.templateVersion || 1, key);
  };

  const save = async () => {
    if (!capture || !preparedFields || !canEdit || saving || !activeFinanceEntityId) return;
    const fingerprint = `${capture.id}|${capture.version}|${JSON.stringify(preparedFields)}`;
    if (!saveAttemptRef.current || saveAttemptRef.current.fingerprint !== fingerprint) saveAttemptRef.current = { fingerprint, key: token('idcountcapture_review') };
    setSaving(true); setError(false); setSaved(false);
    try {
      await countCaptureService.saveReview(organizationId, activeFinanceEntityId, { captureId: capture.id, expectedVersion: capture.version, fields: preparedFields, idempotencyKey: saveAttemptRef.current.key, requestId: token('req') });
      saveAttemptRef.current = null; setSaved(true); await load();
    } catch { setError(true); }
    finally { setSaving(false); }
  };

  const inspectRegion = inspectKey ? regionFor(inspectKey) : null;
  const normalizedWidth = capture?.normalization?.normalizedWidth || 1940;
  const normalizedHeight = capture?.normalization?.normalizedHeight || 2810;

  return <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8"><FinanceEntityContextBar areaName={copy.reviewTitle} /><div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
    <header className="flex items-start gap-3"><Button variant="ghost" className="!min-h-12 !w-12 !px-0" aria-label={copy.back} onClick={() => navigate(APP_ROUTES.countCapture)}><ArrowLeft className="h-5 w-5" /></Button><div className="pt-1"><h1 className="text-2xl font-semibold text-text-primary">{copy.reviewTitle}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.reviewSubtitle}</p></div></header>
    {loading ? <Surface variant="elevated" radius="xl" className="h-72 animate-pulse" /> : error || !capture ? <Surface variant="secondary" radius="xl" role="alert" className="border-semantic-danger/20 bg-semantic-danger/10 p-5 text-sm text-text-primary">{copy.safeError}</Surface> : capture.status === 'duplicate' ? <Surface variant="elevated" radius="xl" className="p-6 text-center"><Files className="mx-auto h-8 w-8 text-accent-primary" /><h2 className="mt-4 text-lg font-semibold text-text-primary">{copy.duplicateTitle}</h2><p className="mt-2 text-sm text-text-muted">{copy.duplicateBody}</p>{capture.duplicateOfCaptureId ? <Button className="mt-5" onClick={() => navigate(APP_ROUTES.countCaptureReview.replace(':captureId', capture.duplicateOfCaptureId || ''))}>{copy.openOriginal}</Button> : null}</Surface> : capture.materialHidden ? <Surface variant="elevated" radius="xl" className="p-6 text-center"><EyeOff className="mx-auto h-8 w-8 text-accent-primary" /><h2 className="mt-4 text-lg font-semibold text-text-primary">{copy.hiddenTitle}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-text-muted">{copy.hiddenBody}</p></Surface> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
      <Surface variant="elevated" radius="xl" className="overflow-hidden p-4 sm:p-5">{capture.normalizedUrl && inspectRegion && inspectKey ? <div className="mb-4"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-text-primary">{copy.inspectRegionTitle}: {copy.fields[inspectKey]}</p><Button variant="ghost" onClick={() => setInspectKey(null)}>{copy.fullImage}</Button></div><EvidenceRegionCrop url={capture.normalizedUrl} region={inspectRegion} label={`${copy.inspectRegionTitle}: ${copy.fields[inspectKey]}`} width={normalizedWidth} height={normalizedHeight} /></div> : null}{capture.normalizedUrl ? <img src={capture.normalizedUrl} alt={copy.normalizedEvidence} className="max-h-[72vh] w-full rounded-xl bg-white object-contain" /> : null}{capture.originalUrl ? <a className="mt-3 inline-flex text-sm font-medium text-accent-primary underline-offset-4 hover:underline" href={capture.originalUrl} target="_blank" rel="noreferrer">{copy.originalEvidence}</a> : null}</Surface>
      <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
        <CountCaptureExtractionPanel capture={capture} organizationId={organizationId} financeEntityId={activeFinanceEntityId || ''} language={language} canEdit={canEdit} onExtracted={load} />
        <div className="mt-5 flex flex-col gap-5">{COUNT_CAPTURE_FIELD_KEYS.map((key) => {
          const row = rows[key];
          const candidate = capture.candidates?.find((field) => field.key === key);
          const hasRegion = Boolean(regionFor(key));
          const statusText = candidate?.state === 'recognized' ? humanCopy.suggested : candidate?.state === 'uncertain' ? humanCopy.uncertain : humanCopy.unresolved;
          return <fieldset key={key} className="rounded-xl border border-border-subtle p-4"><legend className="px-1 text-sm font-semibold text-text-primary">{copy.fields[key]}</legend>{hasRegion ? <Button variant="ghost" className="mb-2" onClick={() => setInspectKey(key)}><Focus className="h-4 w-4" aria-hidden="true" />{copy.inspectField}</Button> : null}{capture.extraction ? <p className="mb-2 text-xs leading-relaxed text-text-muted">{statusText}</p> : null}<label className="mt-2 block"><span className="text-xs font-medium text-text-muted">{copy.amount}</span><input inputMode="decimal" value={row.amount} disabled={row.unreadable || !canEdit} onChange={(event) => { setRows((current) => ({ ...current, [key]: { ...current[key], amount: event.target.value, verified: false } })); saveAttemptRef.current = null; setSaved(false); }} className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base tabular-nums text-text-primary outline-none focus:border-accent-primary disabled:opacity-50" /></label><label className="mt-3 flex min-h-12 items-center gap-3 text-sm text-text-secondary"><input type="checkbox" checked={row.unreadable} disabled={!canEdit} onChange={(event) => { setRows((current) => ({ ...current, [key]: { ...current[key], unreadable: event.target.checked, amount: event.target.checked ? '' : current[key].amount, verified: false } })); saveAttemptRef.current = null; setSaved(false); }} className="h-5 w-5" />{copy.unreadable}</label><label className="mt-2 flex min-h-12 items-center gap-3 text-sm font-medium text-text-primary"><input type="checkbox" checked={row.verified} disabled={!canEdit || (!row.unreadable && inputToCents(row.amount) === null)} onChange={(event) => { setRows((current) => ({ ...current, [key]: { ...current[key], verified: event.target.checked } })); saveAttemptRef.current = null; setSaved(false); }} className="h-5 w-5" />{humanCopy.verified}</label>{!capture.extraction ? <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.unresolvedHint}</p> : null}</fieldset>;
        })}</div>
        {!preparedFields ? <p className="mt-4 text-sm text-semantic-warning">{capture.extraction ? humanCopy.verificationRequired : copy.allFieldsRequired}</p> : null}{saved ? <p className="mt-4 flex items-center gap-2 text-sm font-medium text-semantic-success"><CheckCircle2 className="h-4 w-4" />{copy.saved}</p> : null}<Button className="mt-5" size="lg" fullWidth disabled={!preparedFields || !canEdit || saving} onClick={() => void save()}>{saving ? copy.saving : copy.saveReview}</Button>
      </Surface>
    </div>}
  </div></div></div>;
}
