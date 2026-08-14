import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Minus,
  Plus,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countService, type CountSessionDetail } from '@/src/services/countService';
import {
  COUNT_DENOMINATIONS_CENTS,
  COUNT_ENTRY_TYPES,
  buildCountMaterialFingerprint,
  calculateCountEntriesTotalCents,
  calculateDenominationTotalCents,
  normalizeCountEntries,
  type CountDenominationQuantities,
  type CountEntryDraft,
  type CountEntryMethod,
  type CountEntryType,
  type NormalizedCountEntry,
} from '@/shared/finance/count';
import { COUNT_COPY } from './countCopy';
import { formatReviewDate, formatReviewMoney } from '../transactions/transactionReviewModel';

type Step = 'choose' | 'count' | 'review';

type SaveAttempt = {
  identity: string;
  key: string;
};

function makeToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function formatDenomination(cents: number, language: 'PT' | 'EN' | 'ES') {
  return formatReviewMoney(cents, language, 'BRL');
}

function toDraftEntry(entry: NormalizedCountEntry): CountEntryDraft {
  return {
    type: entry.type,
    method: entry.method,
    totalCents: entry.totalCents,
    denominations: entry.denominations || {},
  };
}

export default function CountSessionPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COUNT_COPY[language];

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
      <CountSessionContent />
    </FinanceContextGuard>
  );
}

function CountSessionContent() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COUNT_COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const canEdit = hasEffectiveCapability(accessState, 'finance.create_drafts');

  const [session, setSession] = useState<CountSessionDetail | null>(null);
  const [entries, setEntries] = useState<NormalizedCountEntry[]>([]);
  const [step, setStep] = useState<Step>('choose');
  const [activeType, setActiveType] = useState<CountEntryType>('tithe');
  const [method, setMethod] = useState<CountEntryMethod>('denominations');
  const [totalRaw, setTotalRaw] = useState('0');
  const [quantities, setQuantities] = useState<CountDenominationQuantities>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [supportCode, setSupportCode] = useState<string | null>(null);

  const epochRef = useRef(0);
  const saveAttemptRef = useRef<SaveAttempt | null>(null);

  const loadSession = async (currentEpoch = ++epochRef.current) => {
    if (!organizationId || !activeFinanceEntityId || !sessionId) return;
    setLoading(true);
    setLoadError(false);
    setConflict(false);
    setSaveError(false);
    setSupportCode(null);
    try {
      const response = await countService.detail(
        organizationId,
        activeFinanceEntityId,
        sessionId,
      );
      if (currentEpoch !== epochRef.current) return;
      setSession(response.session);
      setEntries(response.session.countA.entries || []);
      saveAttemptRef.current = null;
    } catch (error: any) {
      if (currentEpoch !== epochRef.current) return;
      setSupportCode(error?.details?.requestId || null);
      setLoadError(true);
    } finally {
      if (currentEpoch === epochRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const epoch = ++epochRef.current;
    setSession(null);
    setEntries([]);
    setStep('choose');
    saveAttemptRef.current = null;
    if (organizationId && activeFinanceEntityId && sessionId) void loadSession(epoch);
    // Canonical Count scope is organization + finance entity + session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId, sessionId]);

  const entriesByType = useMemo(() => {
    const map = new Map<CountEntryType, NormalizedCountEntry>();
    entries.forEach((entry) => map.set(entry.type, entry));
    return map;
  }, [entries]);

  const grandTotal = useMemo(
    () => calculateCountEntriesTotalCents(entries),
    [entries],
  );

  const workingTotal = useMemo(() => {
    if (activeType === 'pix' || method === 'total') {
      const value = Number.parseInt(totalRaw || '0', 10);
      return Number.isFinite(value) ? value : 0;
    }
    try {
      return calculateDenominationTotalCents(quantities);
    } catch {
      return 0;
    }
  }, [activeType, method, totalRaw, quantities]);

  const openEntry = (type: CountEntryType) => {
    const existing = entriesByType.get(type);
    setActiveType(type);
    setMethod(type === 'pix' ? 'total' : existing?.method || 'denominations');
    setTotalRaw(String(existing?.totalCents || 0));
    setQuantities({ ...(existing?.denominations || {}) });
    setSaveError(false);
    setConflict(false);
    setSupportCode(null);
    setStep('count');
  };

  const setQuantity = (denomination: number, next: number) => {
    const safe = Math.max(0, Math.min(1_000_000, next));
    setQuantities((current) => ({
      ...current,
      [String(denomination)]: safe,
    }));
    setSaveError(false);
  };

  const buildNextEntries = () => {
    const draft: CountEntryDraft = {
      type: activeType,
      method: activeType === 'pix' ? 'total' : method,
      totalCents: workingTotal,
      denominations:
        activeType !== 'pix' && method === 'denominations' ? quantities : {},
    };
    const others = entries.filter((entry) => entry.type !== activeType).map(toDraftEntry);
    return normalizeCountEntries([...others, draft]);
  };

  const saveCurrentEntry = async () => {
    if (!canEdit || !session || saving) return;
    setSaveError(false);
    setConflict(false);
    setSupportCode(null);

    let nextEntries: NormalizedCountEntry[];
    try {
      nextEntries = buildNextEntries();
    } catch {
      setSaveError(true);
      return;
    }

    const draftEntries = nextEntries.map(toDraftEntry);
    const material = buildCountMaterialFingerprint({
      serviceLabel: session.serviceLabel,
      serviceDate: session.serviceDate,
      entries: draftEntries,
    });
    const identity = `${session.id}|${session.version}|${material}`;
    if (!saveAttemptRef.current || saveAttemptRef.current.identity !== identity) {
      saveAttemptRef.current = { identity, key: makeToken('idcount_save') };
    }

    setSaving(true);
    const actionEpoch = epochRef.current;
    const requestId = makeToken('req');
    setSupportCode(requestId);
    try {
      const response = await countService.saveFirstCount(
        organizationId,
        activeFinanceEntityId || '',
        {
          countSessionId: session.id,
          expectedVersion: session.version,
          entries: draftEntries,
          idempotencyKey: saveAttemptRef.current.key,
          requestId,
        },
      );
      if (actionEpoch !== epochRef.current) return;
      saveAttemptRef.current = null;
      setSupportCode(null);
      setEntries(response.entries);
      setSession((current) =>
        current
          ? {
              ...current,
              version: response.version,
              countA: {
                ...current.countA,
                entries: response.entries,
                totalCents: response.totalCents,
              },
            }
          : current,
      );
      setStep('choose');
    } catch (error: any) {
      if (actionEpoch !== epochRef.current) return;
      if (error?.code === 'COUNT_VERSION_CONFLICT') {
        setConflict(true);
        setSaveError(false);
      } else {
        setSaveError(true);
      }
      setSupportCode(error?.details?.requestId || requestId);
    } finally {
      if (actionEpoch === epochRef.current) setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.sessionTitle} />
        <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6" aria-busy="true" aria-label={copy.loading}>
          <Surface variant="elevated" radius="xl" className="animate-pulse p-6">
            <div className="h-6 w-40 rounded bg-surface-secondary" />
            <div className="mt-6 h-16 rounded-2xl bg-surface-secondary" />
            <div className="mt-4 h-72 rounded-2xl bg-surface-secondary" />
          </Surface>
        </div>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.sessionTitle} />
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <Surface variant="elevated" radius="xl" role="alert" className="w-full max-w-md p-6 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-semantic-danger" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-semibold text-text-primary">{copy.errorTitle}</h1>
            <p className="mt-2 text-sm text-text-muted">{copy.errorBody}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button fullWidth onClick={() => void loadSession()}>{copy.retry}</Button>
              <Button variant="secondary" fullWidth onClick={() => navigate(APP_ROUTES.count)}>{copy.back}</Button>
            </div>
            {supportCode ? (
              <p className="mt-5 break-all font-mono text-xs text-text-muted">{copy.supportCode}: {supportCode}</p>
            ) : null}
          </Surface>
        </div>
      </div>
    );
  }

  const activeLabel = copy.entryLabels[activeType];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-28 md:pb-8">
      <FinanceEntityContextBar areaName={copy.sessionTitle} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <header className="flex items-start gap-3">
            <Button
              variant="ghost"
              className="!min-h-12 !w-12 !px-0"
              aria-label={copy.back}
              onClick={() => (step === 'choose' ? navigate(APP_ROUTES.count) : setStep('choose'))}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0 pt-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">{session.serviceLabel}</h1>
              <p className="mt-1 text-sm text-text-muted">
                {formatReviewDate(`${session.serviceDate}T12:00:00.000Z`, language)}
              </p>
            </div>
          </header>

          <div className="grid grid-cols-3 gap-2" aria-label={copy.sessionTitle}>
            {([
              ['choose', copy.stepChoose],
              ['count', copy.stepCount],
              ['review', copy.stepReview],
            ] as const).map(([value, label], index) => (
              <div key={value} className="text-center">
                <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${step === value ? 'border-accent-primary bg-accent-primary text-white' : 'border-border-subtle bg-surface-elevated text-text-muted'}`}>
                  {index + 1}
                </div>
                <p className={`mt-1 text-xs font-medium ${step === value ? 'text-text-primary' : 'text-text-muted'}`}>{label}</p>
              </div>
            ))}
          </div>

          {conflict ? (
            <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-warning/20 bg-semantic-warning/10 p-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-text-primary">{copy.conflictTitle}</p>
                  <p className="mt-1 text-sm text-text-secondary">{copy.conflictBody}</p>
                </div>
              </div>
              <Button className="mt-4" variant="secondary" fullWidth onClick={() => void loadSession()}>
                {copy.reload}
              </Button>
            </Surface>
          ) : null}

          {saveError && !conflict ? (
            <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-danger/20 bg-semantic-danger/10 p-4">
              <div className="flex gap-3 text-sm text-text-primary">
                <AlertCircle className="h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
                <p>{copy.safeError}</p>
              </div>
              {supportCode ? (
                <p className="mt-3 break-all pl-8 font-mono text-xs text-text-muted">{copy.supportCode}: {supportCode}</p>
              ) : null}
            </Surface>
          ) : null}

          {step === 'choose' ? (
            <>
              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <h2 className="text-xl font-semibold text-text-primary">{copy.chooseTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.chooseBody}</p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {COUNT_ENTRY_TYPES.map((type) => {
                    const existing = entriesByType.get(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => openEntry(type)}
                        disabled={!canEdit}
                        className="group rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:opacity-60"
                      >
                        <Surface variant="secondary" radius="lg" className="flex min-h-28 h-full items-center justify-between gap-4 p-4 transition-colors group-hover:bg-surface-secondary">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-text-primary">{copy.entryLabels[type]}</p>
                              {existing ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-semantic-success/20 bg-semantic-success/10 px-2 py-0.5 text-[11px] font-semibold text-semantic-success">
                                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                  {copy.counted}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.entryDescriptions[type]}</p>
                            {existing ? (
                              <p className="mt-3 text-lg font-semibold tabular-nums text-text-primary">
                                {formatReviewMoney(existing.totalCents, language, 'BRL')}
                              </p>
                            ) : null}
                          </div>
                          <ChevronRight className="h-5 w-5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </Surface>
                      </button>
                    );
                  })}
                </div>
              </Surface>

              {entries.length > 0 ? (
                <Button size="lg" fullWidth onClick={() => setStep('review')}>
                  {copy.stepReview}
                </Button>
              ) : null}
            </>
          ) : null}

          {step === 'count' ? (
            <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-primary/20 bg-accent-primary/10 text-accent-primary">
                  <Banknote className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">{copy.countTitle(activeLabel)}</h2>
                  <p className="mt-1 text-sm text-text-muted">{copy.entryDescriptions[activeType]}</p>
                </div>
              </div>

              {activeType !== 'pix' ? (
                <div className="mt-5">
                  <p className="text-sm font-medium text-text-primary">{copy.cashMode}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-surface-secondary/50 p-1">
                    {([
                      ['denominations', copy.denominationMode],
                      ['total', copy.totalMode],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={method === value}
                        onClick={() => {
                          setMethod(value);
                          setSaveError(false);
                        }}
                        className={`min-h-12 rounded-xl px-3 text-sm font-semibold transition-colors ${method === value ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-muted'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeType === 'pix' || method === 'total' ? (
                <label className="mt-5 block">
                  <span className="text-sm font-medium text-text-primary">{copy.totalAmount}</span>
                  <div className="mt-2 flex min-h-20 items-center rounded-2xl border border-border-subtle bg-surface-base px-4 focus-within:border-accent-primary">
                    <span className="mr-2 text-lg font-semibold text-text-muted">R$</span>
                    <input
                      inputMode="numeric"
                      value={(workingTotal / 100).toLocaleString(language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, '');
                        setTotalRaw(String(Number.parseInt(digits || '0', 10) || 0));
                        setSaveError(false);
                      }}
                      className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight text-text-primary outline-none tabular-nums sm:text-4xl"
                      aria-label={copy.totalAmount}
                    />
                  </div>
                </label>
              ) : (
                <div className="mt-5 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-secondary/25">
                  {COUNT_DENOMINATIONS_CENTS.map((denomination) => {
                    const quantity = Number(quantities[String(denomination)] || 0);
                    return (
                      <div key={denomination} className="grid grid-cols-[5.5rem_minmax(9rem,1fr)_7rem] items-center gap-3 p-3 sm:grid-cols-[7rem_minmax(12rem,1fr)_9rem] sm:p-4">
                        <span className="text-sm font-semibold tabular-nums text-text-primary">
                          {formatDenomination(denomination, language)}
                        </span>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            aria-label={`${copy.quantity} -`}
                            onClick={() => setQuantity(denomination, quantity - 1)}
                            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                          >
                            <Minus className="h-5 w-5" aria-hidden="true" />
                          </button>
                          <input
                            inputMode="numeric"
                            value={quantity}
                            onChange={(event) => setQuantity(denomination, Number.parseInt(event.target.value.replace(/\D/g, '') || '0', 10) || 0)}
                            aria-label={`${copy.quantity} ${formatDenomination(denomination, language)}`}
                            className="h-12 w-16 rounded-xl border border-border-subtle bg-surface-base text-center text-lg font-semibold tabular-nums text-text-primary outline-none focus:border-accent-primary"
                          />
                          <button
                            type="button"
                            aria-label={`${copy.quantity} +`}
                            onClick={() => setQuantity(denomination, quantity + 1)}
                            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                          >
                            <Plus className="h-5 w-5" aria-hidden="true" />
                          </button>
                        </div>
                        <span className="text-right text-sm font-semibold tabular-nums text-text-secondary">
                          {formatReviewMoney(denomination * quantity, language, 'BRL')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.partialTotal}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-text-primary">
                  {formatReviewMoney(workingTotal, language, 'BRL')}
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" size="lg" fullWidth onClick={() => setStep('choose')} disabled={saving}>
                  {copy.back}
                </Button>
                <Button size="lg" fullWidth onClick={() => void saveCurrentEntry()} disabled={saving || !canEdit}>
                  {saving ? copy.saving : copy.saveEntry}
                </Button>
              </div>
            </Surface>
          ) : null}

          {step === 'review' ? (
            <>
              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">{copy.reviewTitle}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.reviewBody}</p>
                  </div>
                </div>

                <div className="mt-5 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-secondary/25">
                  {COUNT_ENTRY_TYPES.map((type) => {
                    const entry = entriesByType.get(type);
                    return (
                      <div key={type} className="flex min-h-16 items-center justify-between gap-4 p-4">
                        <div>
                          <p className="font-medium text-text-primary">{copy.entryLabels[type]}</p>
                          <button type="button" onClick={() => openEntry(type)} className="mt-1 text-xs font-semibold text-accent-primary">
                            {entry ? copy.editEntry : copy.countNow}
                          </button>
                        </div>
                        <p className="text-base font-semibold tabular-nums text-text-primary">
                          {formatReviewMoney(entry?.totalCents || 0, language, 'BRL')}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-5 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.grandTotal}</p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-text-primary">
                    {formatReviewMoney(grandTotal, language, 'BRL')}
                  </p>
                </div>
              </Surface>

              <Surface variant="secondary" radius="xl" className="border-semantic-warning/20 bg-semantic-warning/10 p-5 sm:p-6">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-text-primary">{copy.firstCountSaved}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">{copy.firstCountSavedBody}</p>
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.secondCountSafety}</p>
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.noPosting}</p>
                  </div>
                </div>
              </Surface>

              <Button variant="secondary" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.count)}>
                {copy.returnToCount}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
