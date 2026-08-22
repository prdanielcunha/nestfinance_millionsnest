import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { countService, type CountSessionDetail } from '@/src/services/countService';
import {
  COUNT_DENOMINATIONS_CENTS,
  COUNT_ENTRY_TYPES,
  buildCountMaterialFingerprint,
  calculateDenominationTotalCents,
  normalizeCountEntries,
  type CountDenominationQuantities,
  type CountEntryDraft,
  type CountEntryMethod,
  type CountEntryType,
  type NormalizedCountEntry,
} from '@/shared/finance/count';
import { formatReviewDate, formatReviewMoney } from '../transactions/transactionReviewModel';
import { COUNT_COPY } from './countCopy';

type BlindStep = 'choose' | 'count' | 'review';

type BlindProps = {
  session: CountSessionDetail;
  organizationId: string;
  financeEntityId: string;
  canEdit: boolean;
  onReload: () => void | Promise<void>;
};

type ResultProps = BlindProps;

function makeToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function toDraftEntry(entry: NormalizedCountEntry): CountEntryDraft {
  return {
    type: entry.type,
    method: entry.method,
    totalCents: entry.totalCents,
    denominations: entry.denominations || {},
  };
}

export function CountBlindWorkspace({
  session,
  organizationId,
  financeEntityId,
  canEdit,
  onReload,
}: BlindProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COUNT_COPY[language];
  const [entries, setEntries] = useState<NormalizedCountEntry[]>([]);
  const [step, setStep] = useState<BlindStep>('choose');
  const [activeType, setActiveType] = useState<CountEntryType>('tithe');
  const [method, setMethod] = useState<CountEntryMethod>('denominations');
  const [totalRaw, setTotalRaw] = useState('0');
  const [quantities, setQuantities] = useState<CountDenominationQuantities>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [supportCode, setSupportCode] = useState<string | null>(null);
  const submitAttemptRef = useRef<{ identity: string; key: string } | null>(null);

  const isRecount = session.status === 'recounting';
  const entriesByType = useMemo(() => {
    const map = new Map<CountEntryType, NormalizedCountEntry>();
    entries.forEach((entry) => map.set(entry.type, entry));
    return map;
  }, [entries]);
  const grandTotal = useMemo(
    () => entries.reduce((total, entry) => total + entry.totalCents, 0),
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
    setError(false);
    setConflict(false);
    setSupportCode(null);
    setStep('count');
  };

  const setQuantity = (denomination: number, next: number) => {
    setQuantities((current) => ({
      ...current,
      [String(denomination)]: Math.max(0, Math.min(1_000_000, next)),
    }));
    setError(false);
  };

  const saveLocalEntry = () => {
    try {
      const draft: CountEntryDraft = {
        type: activeType,
        method: activeType === 'pix' ? 'total' : method,
        totalCents: workingTotal,
        denominations: activeType !== 'pix' && method === 'denominations' ? quantities : {},
      };
      const others = entries.filter((entry) => entry.type !== activeType).map(toDraftEntry);
      setEntries(normalizeCountEntries([...others, draft]));
      submitAttemptRef.current = null;
      setError(false);
      setStep('choose');
    } catch {
      setError(true);
    }
  };

  const submitBlindCount = async () => {
    if (!canEdit || submitting || entries.length === 0) return;
    setSubmitting(true);
    setError(false);
    setConflict(false);
    setSupportCode(null);

    const draftEntries = entries.map(toDraftEntry);
    const identity = `${session.id}|${session.version}|${session.status}|${buildCountMaterialFingerprint({ entries: draftEntries })}`;
    if (!submitAttemptRef.current || submitAttemptRef.current.identity !== identity) {
      submitAttemptRef.current = { identity, key: makeToken(isRecount ? 'idcount_recount' : 'idcount_second') };
    }
    const requestId = makeToken('req');
    setSupportCode(requestId);

    try {
      if (isRecount) {
        await countService.submitRecount(organizationId, financeEntityId, {
          countSessionId: session.id,
          expectedVersion: session.version,
          entries: draftEntries,
          idempotencyKey: submitAttemptRef.current.key,
          requestId,
        });
      } else {
        await countService.submitSecondCount(organizationId, financeEntityId, {
          countSessionId: session.id,
          expectedVersion: session.version,
          entries: draftEntries,
          idempotencyKey: submitAttemptRef.current.key,
          requestId,
        });
      }
      submitAttemptRef.current = null;
      setSupportCode(null);
      await onReload();
    } catch (requestError: any) {
      if (requestError?.code === 'COUNT_VERSION_CONFLICT') {
        setConflict(true);
      } else {
        setError(true);
      }
      setSupportCode(requestError?.details?.requestId || requestId);
    } finally {
      setSubmitting(false);
    }
  };

  const title = isRecount ? copy.recountBlindTitle : copy.blindTitle;
  const body = isRecount ? copy.recountBlindBody : copy.blindBody;
  const activeLabel = copy.entryLabels[activeType];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-28 md:pb-8">
      <FinanceEntityContextBar areaName={copy.sessionTitle} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <header className="flex items-start gap-3">
            <Button variant="ghost" className="!min-h-12 !w-12 !px-0" aria-label={copy.back} onClick={() => navigate(APP_ROUTES.count)}>
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">{session.serviceLabel}</h1>
                <span className="rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-1 text-xs font-semibold text-accent-primary">
                  {copy.blindProtected}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-muted">{formatReviewDate(`${session.serviceDate}T12:00:00.000Z`, language)}</p>
            </div>
          </header>

          <Surface variant="secondary" radius="xl" className="border-accent-primary/20 bg-accent-primary/5 p-5 sm:p-6">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-text-primary">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">{body}</p>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.noPosting}</p>
              </div>
            </div>
          </Surface>

          {conflict ? (
            <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-warning/20 bg-semantic-warning/10 p-4">
              <p className="font-semibold text-text-primary">{copy.conflictTitle}</p>
              <p className="mt-1 text-sm text-text-secondary">{copy.conflictBody}</p>
              <Button className="mt-4" variant="secondary" fullWidth onClick={() => void onReload()}>{copy.reload}</Button>
            </Surface>
          ) : null}

          {error && !conflict ? (
            <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-danger/20 bg-semantic-danger/10 p-4">
              <div className="flex gap-3 text-sm text-text-primary">
                <AlertCircle className="h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
                <p>{copy.safeError}</p>
              </div>
              {supportCode ? <p className="mt-3 break-all pl-8 font-mono text-xs text-text-muted">{copy.supportCode}: {supportCode}</p> : null}
            </Surface>
          ) : null}

          {step === 'choose' ? (
            <>
              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <h2 className="text-xl font-semibold text-text-primary">{copy.blindChooseTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.blindChooseBody}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {COUNT_ENTRY_TYPES.map((type) => {
                    const existing = entriesByType.get(type);
                    return (
                      <button key={type} type="button" onClick={() => openEntry(type)} disabled={!canEdit} className="group rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:opacity-60">
                        <Surface variant="secondary" radius="lg" className="flex min-h-28 h-full items-center justify-between gap-4 p-4 transition-colors group-hover:bg-surface-secondary">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-text-primary">{copy.entryLabels[type]}</p>
                              {existing ? <span className="inline-flex items-center gap-1 rounded-full border border-semantic-success/20 bg-semantic-success/10 px-2 py-0.5 text-[11px] font-semibold text-semantic-success"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />{copy.counted}</span> : null}
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.entryDescriptions[type]}</p>
                            {existing ? <p className="mt-3 text-lg font-semibold tabular-nums text-text-primary">{formatReviewMoney(existing.totalCents, language, 'BRL')}</p> : null}
                          </div>
                          <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
                        </Surface>
                      </button>
                    );
                  })}
                </div>
              </Surface>
              {entries.length > 0 ? <Button size="lg" fullWidth onClick={() => setStep('review')}>{copy.stepReview}</Button> : null}
            </>
          ) : null}

          {step === 'count' ? (
            <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-primary/20 bg-accent-primary/10 text-accent-primary"><Banknote className="h-5 w-5" aria-hidden="true" /></div>
                <div><h2 className="text-xl font-semibold text-text-primary">{copy.countTitle(activeLabel)}</h2><p className="mt-1 text-sm text-text-muted">{copy.entryDescriptions[activeType]}</p></div>
              </div>

              {activeType !== 'pix' ? (
                <div className="mt-5">
                  <p className="text-sm font-medium text-text-primary">{copy.cashMode}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-surface-secondary/50 p-1">
                    {([['denominations', copy.denominationMode], ['total', copy.totalMode]] as const).map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)} className={`min-h-12 rounded-xl px-3 text-sm font-semibold ${method === value ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-muted'}`}>{label}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeType === 'pix' || method === 'total' ? (
                <label className="mt-5 block">
                  <span className="text-sm font-medium text-text-primary">{copy.totalAmount}</span>
                  <div className="mt-2 flex min-h-20 items-center rounded-2xl border border-border-subtle bg-surface-base px-4 focus-within:border-accent-primary">
                    <span className="mr-2 text-lg font-semibold text-text-muted">R$</span>
                    <input inputMode="numeric" value={(workingTotal / 100).toLocaleString(language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={(event) => setTotalRaw(String(Number.parseInt(event.target.value.replace(/\D/g, '') || '0', 10) || 0))} className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight text-text-primary outline-none tabular-nums sm:text-4xl" aria-label={copy.totalAmount} />
                  </div>
                </label>
              ) : (
                <div className="mt-5 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-secondary/25">
                  {COUNT_DENOMINATIONS_CENTS.map((denomination) => {
                    const quantity = Number(quantities[String(denomination)] || 0);
                    return (
                      <div key={denomination} className="grid grid-cols-[5.5rem_minmax(9rem,1fr)_7rem] items-center gap-3 p-3 sm:grid-cols-[7rem_minmax(12rem,1fr)_9rem] sm:p-4">
                        <span className="text-sm font-semibold tabular-nums text-text-primary">{formatReviewMoney(denomination, language, 'BRL')}</span>
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" aria-label={`${copy.quantity} -`} onClick={() => setQuantity(denomination, quantity - 1)} className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"><Minus className="h-5 w-5" aria-hidden="true" /></button>
                          <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(denomination, Number.parseInt(event.target.value.replace(/\D/g, '') || '0', 10) || 0)} aria-label={`${copy.quantity} ${formatReviewMoney(denomination, language, 'BRL')}`} className="h-12 w-16 rounded-xl border border-border-subtle bg-surface-base text-center text-lg font-semibold tabular-nums text-text-primary outline-none focus:border-accent-primary" />
                          <button type="button" aria-label={`${copy.quantity} +`} onClick={() => setQuantity(denomination, quantity + 1)} className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"><Plus className="h-5 w-5" aria-hidden="true" /></button>
                        </div>
                        <span className="text-right text-sm font-semibold tabular-nums text-text-secondary">{formatReviewMoney(denomination * quantity, language, 'BRL')}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-5 text-center"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.partialTotal}</p><p className="mt-2 text-3xl font-semibold tabular-nums text-text-primary">{formatReviewMoney(workingTotal, language, 'BRL')}</p></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button variant="secondary" size="lg" fullWidth onClick={() => setStep('choose')}>{copy.back}</Button><Button size="lg" fullWidth onClick={saveLocalEntry} disabled={!canEdit}>{copy.saveEntry}</Button></div>
            </Surface>
          ) : null}

          {step === 'review' ? (
            <>
              <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
                <h2 className="text-xl font-semibold text-text-primary">{isRecount ? copy.reviewRecountTitle : copy.reviewSecondTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.reviewBlindBody}</p>
                <div className="mt-5 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-secondary/25">
                  {COUNT_ENTRY_TYPES.map((type) => {
                    const entry = entriesByType.get(type);
                    return <div key={type} className="flex min-h-16 items-center justify-between gap-4 p-4"><div><p className="font-medium text-text-primary">{copy.entryLabels[type]}</p><button type="button" onClick={() => openEntry(type)} className="mt-1 text-xs font-semibold text-accent-primary">{entry ? copy.editEntry : copy.countNow}</button></div><p className="text-base font-semibold tabular-nums text-text-primary">{formatReviewMoney(entry?.totalCents || 0, language, 'BRL')}</p></div>;
                  })}
                </div>
                <div className="mt-5 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-5 text-center"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.grandTotal}</p><p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-text-primary">{formatReviewMoney(grandTotal, language, 'BRL')}</p></div>
              </Surface>
              <Surface variant="secondary" radius="xl" className="border-accent-primary/20 bg-accent-primary/5 p-5"><p className="text-sm font-semibold text-text-primary">{copy.blindStillHidden}</p><p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.blindStillHiddenBody}</p></Surface>
              <div className="grid gap-3 sm:grid-cols-2"><Button variant="secondary" size="lg" fullWidth onClick={() => setStep('choose')} disabled={submitting}>{copy.back}</Button><Button size="lg" fullWidth onClick={() => void submitBlindCount()} disabled={submitting || !canEdit || entries.length === 0}>{submitting ? copy.submitting : isRecount ? copy.submitRecount : copy.submitSecond}</Button></div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CountResultPanel({
  session,
  organizationId,
  financeEntityId,
  canEdit,
  onReload,
}: ResultProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COUNT_COPY[language];
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);
  const [supportCode, setSupportCode] = useState<string | null>(null);
  const attemptRef = useRef<{ identity: string; key: string } | null>(null);
  const matched = session.status === 'matched';

  const startRecount = async () => {
    if (!canEdit || starting || session.status !== 'divergent') return;
    const identity = `${session.id}|${session.version}|recount-start`;
    if (!attemptRef.current || attemptRef.current.identity !== identity) {
      attemptRef.current = { identity, key: makeToken('idcount_recount_start') };
    }
    const requestId = makeToken('req');
    setStarting(true);
    setError(false);
    setSupportCode(requestId);
    try {
      await countService.startRecount(organizationId, financeEntityId, {
        countSessionId: session.id,
        expectedVersion: session.version,
        idempotencyKey: attemptRef.current.key,
        requestId,
      });
      attemptRef.current = null;
      setSupportCode(null);
      await onReload();
    } catch (requestError: any) {
      setError(true);
      setSupportCode(requestError?.details?.requestId || requestId);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.sessionTitle} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <header className="flex items-start gap-3"><Button variant="ghost" className="!min-h-12 !w-12 !px-0" aria-label={copy.back} onClick={() => navigate(APP_ROUTES.count)}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></Button><div className="min-w-0 pt-1"><h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">{session.serviceLabel}</h1><p className="mt-1 text-sm text-text-muted">{formatReviewDate(`${session.serviceDate}T12:00:00.000Z`, language)}</p></div></header>

          <Surface variant="elevated" radius="xl" className={`p-5 sm:p-6 ${matched ? 'border-semantic-success/20' : 'border-semantic-warning/20'}`}>
            <div className="flex items-start gap-3">{matched ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-semantic-success" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-semantic-warning" aria-hidden="true" />}<div><h2 className="text-xl font-semibold text-text-primary">{matched ? copy.matchTitle : copy.divergentTitle}</h2><p className="mt-1 text-sm leading-relaxed text-text-muted">{matched ? copy.matchBody : copy.divergentBody}</p><p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.noPosting}</p></div></div>
          </Surface>

          {session.countA && session.countB ? (
            <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
              <h3 className="font-semibold text-text-primary">{copy.comparisonTitle}</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><Surface variant="secondary" radius="lg" className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.countA}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{formatReviewMoney(session.countA.totalCents, language, 'BRL')}</p></Surface><Surface variant="secondary" radius="lg" className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.countB}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{formatReviewMoney(session.countB.totalCents, language, 'BRL')}</p></Surface></div>
              {!matched && session.comparison?.differences?.length ? <div className="mt-5 divide-y divide-border-subtle rounded-2xl border border-border-subtle">{session.comparison.differences.map((difference) => <div key={difference.type} className="grid grid-cols-[1fr_auto] gap-4 p-4"><div><p className="font-medium text-text-primary">{copy.entryLabels[difference.type]}</p><p className="mt-1 text-xs text-text-muted">{copy.countA}: {formatReviewMoney(difference.countATotalCents, language, 'BRL')} · {copy.countB}: {formatReviewMoney(difference.countBTotalCents, language, 'BRL')}</p></div><p className="text-sm font-semibold tabular-nums text-semantic-warning">{copy.difference}: {formatReviewMoney(Math.abs(difference.deltaCents), language, 'BRL')}</p></div>)}</div> : null}
            </Surface>
          ) : null}

          {session.recountAttemptCount > 0 ? <Surface variant="secondary" radius="xl" className="p-5"><div className="flex gap-3"><RotateCcw className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" /><div><p className="font-semibold text-text-primary">{copy.recountHistory}</p><p className="mt-1 text-sm text-text-muted">{copy.recountAttempt(session.recountAttemptCount)}</p><p className="mt-2 text-xs text-text-muted">{copy.originalEvidence}</p></div></div></Surface> : null}

          {error ? <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-danger/20 bg-semantic-danger/10 p-4"><p className="text-sm text-text-primary">{copy.safeError}</p>{supportCode ? <p className="mt-2 break-all font-mono text-xs text-text-muted">{copy.supportCode}: {supportCode}</p> : null}</Surface> : null}

          {!matched ? <Button size="lg" fullWidth onClick={() => void startRecount()} disabled={starting || !canEdit}>{starting ? copy.startingRecount : copy.startRecount}</Button> : null}
          <Button variant="secondary" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.count)}>{copy.returnToCount}</Button>
        </div>
      </div>
    </div>
  );
}
