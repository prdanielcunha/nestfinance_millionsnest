import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, EyeOff, Files, ShieldX } from 'lucide-react';
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
import { COUNT_CAPTURE_FIELD_KEYS, type CountCaptureFieldKey } from '@/shared/finance/countCapture';
import { COUNT_CAPTURE_COPY } from './countCaptureCopy';

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
  const text = raw.trim();
  if (!text) return null;
  const cleaned = text.replace(/[^0-9,.-]/g, '').replace(/-/g, '');
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  const decimalIndex = Math.max(comma, dot);
  if (decimalIndex >= 0 && cleaned.length - decimalIndex - 1 <= 2) {
    const whole = cleaned.slice(0, decimalIndex).replace(/\D/g, '') || '0';
    const fraction = cleaned.slice(decimalIndex + 1).replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
    const cents = Number(whole) * 100 + Number(fraction || '0');
    return Number.isSafeInteger(cents) ? cents : null;
  }
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return null;
  const cents = Number(digits) * 100;
  return Number.isSafeInteger(cents) ? cents : null;
}

type RowState = { amount: string; unreadable: boolean };

export default function CountCaptureReviewPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COUNT_CAPTURE_COPY[language];
  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') return null;
  if (!hasEffectiveCapability(accessState, 'finance.view')) {
    return <main className="flex flex-1 items-center justify-center p-8 text-center"><div><ShieldX className="mx-auto h-10 w-10 text-semantic-danger" /><p className="mt-4 text-sm text-text-muted">{copy.accessDenied}</p></div></main>;
  }
  return <FinanceContextGuard><CountCaptureReviewContent /></FinanceContextGuard>;
}

function CountCaptureReviewContent() {
  const { captureId = '' } = useParams();
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COUNT_CAPTURE_COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const canEdit = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const [capture, setCapture] = useState<CountCaptureDetail | null>(null);
  const [rows, setRows] = useState<Record<CountCaptureFieldKey, RowState>>(() => Object.fromEntries(COUNT_CAPTURE_FIELD_KEYS.map((key) => [key, { amount: '', unreadable: false }])) as Record<CountCaptureFieldKey, RowState>);
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
      if (review) return [key, { amount: centsToInput(review.valueCents, language), unreadable: review.decision === 'unreadable' }];
      const candidate = candidateFields.find((field) => field.key === key);
      return [key, { amount: centsToInput(candidate?.valueCents ?? null, language), unreadable: false }];
    })) as Record<CountCaptureFieldKey, RowState>);
  };

  const load = async () => {
    if (!organizationId || !activeFinanceEntityId || !captureId) return;
    const epoch = ++epochRef.current;
    setLoading(true);
    setError(false);
    try {
      const response = await countCaptureService.detail(organizationId, activeFinanceEntityId, captureId);
      if (epoch !== epochRef.current) return;
      setCapture(response.capture);
      if (!response.capture.materialHidden && response.capture.status !== 'duplicate') hydrateRows(response.capture);
    } catch {
      if (epoch === epochRef.current) setError(true);
    } finally {
      if (epoch === epochRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    setCapture(null);
    saveAttemptRef.current = null;
    void load();
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
        result.push({ key, decision: 'unreadable', valueCents: null });
        continue;
      }
      const valueCents = inputToCents(row.amount);
      if (valueCents === null) return null;
      const confirmed = candidate && candidate.state !== 'unresolved' && candidate.valueCents === valueCents;
      result.push({ key, decision: confirmed ? 'confirmed' : 'corrected', valueCents });
    }
    return result;
  }, [capture, rows]);

  const save = async () => {
    if (!capture || !preparedFields || !canEdit || saving || !activeFinanceEntityId) return;
    const fingerprint = `${capture.id}|${capture.version}|${JSON.stringify(preparedFields)}`;
    if (!saveAttemptRef.current || saveAttemptRef.current.fingerprint !== fingerprint) {
      saveAttemptRef.current = { fingerprint, key: token('idcountcapture_review') };
    }
    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      await countCaptureService.saveReview(organizationId, activeFinanceEntityId, {
        captureId: capture.id,
        expectedVersion: capture.version,
        fields: preparedFields,
        idempotencyKey: saveAttemptRef.current.key,
        requestId: token('req'),
      });
      saveAttemptRef.current = null;
      setSaved(true);
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.reviewTitle} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          <header className="flex items-start gap-3">
            <Button variant="ghost" className="!min-h-12 !w-12 !px-0" aria-label={copy.back} onClick={() => navigate(APP_ROUTES.countCapture)}><ArrowLeft className="h-5 w-5" /></Button>
            <div className="pt-1"><h1 className="text-2xl font-semibold text-text-primary">{copy.reviewTitle}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.reviewSubtitle}</p></div>
          </header>

          {loading ? <Surface variant="elevated" radius="xl" className="h-72 animate-pulse" /> : error || !capture ? <Surface variant="secondary" radius="xl" role="alert" className="border-semantic-danger/20 bg-semantic-danger/10 p-5 text-sm text-text-primary">{copy.safeError}</Surface> : capture.status === 'duplicate' ? (
            <Surface variant="elevated" radius="xl" className="p-6 text-center"><Files className="mx-auto h-8 w-8 text-accent-primary" /><h2 className="mt-4 text-lg font-semibold text-text-primary">{copy.duplicateTitle}</h2><p className="mt-2 text-sm text-text-muted">{copy.duplicateBody}</p>{capture.duplicateOfCaptureId ? <Button className="mt-5" onClick={() => navigate(APP_ROUTES.countCaptureReview.replace(':captureId', capture.duplicateOfCaptureId || ''))}>{copy.openOriginal}</Button> : null}</Surface>
          ) : capture.materialHidden ? (
            <Surface variant="elevated" radius="xl" className="p-6 text-center"><EyeOff className="mx-auto h-8 w-8 text-accent-primary" /><h2 className="mt-4 text-lg font-semibold text-text-primary">{copy.hiddenTitle}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-text-muted">{copy.hiddenBody}</p></Surface>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
              <Surface variant="elevated" radius="xl" className="overflow-hidden p-4 sm:p-5">
                {capture.normalizedUrl ? <img src={capture.normalizedUrl} alt={copy.normalizedEvidence} className="max-h-[72vh] w-full rounded-xl bg-white object-contain" /> : null}
                {capture.originalUrl ? <a className="mt-3 inline-flex text-sm font-medium text-accent-primary underline-offset-4 hover:underline" href={capture.originalUrl} target="_blank" rel="noreferrer">{copy.originalEvidence}</a> : null}
              </Surface>
              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <div className="flex flex-col gap-5">
                  {COUNT_CAPTURE_FIELD_KEYS.map((key) => {
                    const row = rows[key];
                    return <fieldset key={key} className="rounded-xl border border-border-subtle p-4"><legend className="px-1 text-sm font-semibold text-text-primary">{copy.fields[key]}</legend><label className="mt-2 block"><span className="text-xs font-medium text-text-muted">{copy.amount}</span><input inputMode="decimal" value={row.amount} disabled={row.unreadable || !canEdit} onChange={(event) => { setRows((current) => ({ ...current, [key]: { ...current[key], amount: event.target.value } })); saveAttemptRef.current = null; setSaved(false); }} className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base tabular-nums text-text-primary outline-none focus:border-accent-primary disabled:opacity-50" /></label><label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-text-secondary"><input type="checkbox" checked={row.unreadable} disabled={!canEdit} onChange={(event) => { setRows((current) => ({ ...current, [key]: { ...current[key], unreadable: event.target.checked } })); saveAttemptRef.current = null; setSaved(false); }} className="h-5 w-5" />{copy.unreadable}</label><p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.unresolvedHint}</p></fieldset>;
                  })}
                </div>
                {!preparedFields ? <p className="mt-4 text-sm text-semantic-warning">{copy.allFieldsRequired}</p> : null}
                {saved ? <p className="mt-4 flex items-center gap-2 text-sm font-medium text-semantic-success"><CheckCircle2 className="h-4 w-4" />{copy.saved}</p> : null}
                <Button className="mt-5" size="lg" fullWidth disabled={!preparedFields || !canEdit || saving} onClick={() => void save()}>{saving ? copy.saving : copy.saveReview}</Button>
              </Surface>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
