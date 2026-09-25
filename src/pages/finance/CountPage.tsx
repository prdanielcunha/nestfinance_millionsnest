import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  ShieldX,
  Trash2,
} from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countService, type CountSessionListItem } from '@/src/services/countService';
import { countPaperService } from '@/src/services/countPaperService';
import { countDraftPersistence } from '@/src/services/countDraftPersistence';
import { recordFinanceJourneyMetric } from '@/src/services/financeJourneyMetricsService';
import { COUNT_COPY } from './count/countCopy';
import { CountStartJourney, type CountStartMode } from './count/CountStartJourney';
import { formatReviewDate, formatReviewMoney } from './transactions/transactionReviewModel';

function makeToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export default function CountPage() {
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
      <CountHomeContent />
    </FinanceContextGuard>
  );
}

function CountHomeContent() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COUNT_COPY[language];
  const canCreate = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const organizationId = accessState.organizationId || accessState.organization?.id || '';

  const [items, setItems] = useState<CountSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<CountSessionListItem | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const epochRef = useRef(0);
  const createAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const loadSessions = async (currentEpoch = ++epochRef.current) => {
    if (!organizationId || !activeFinanceEntityId) return;
    setLoading(true);
    setError(false);
    try {
      const response = await countService.list(organizationId, activeFinanceEntityId);
      if (currentEpoch !== epochRef.current) return;
      setItems(response.items);
    } catch {
      if (currentEpoch !== epochRef.current) return;
      setError(true);
    } finally {
      if (currentEpoch === epochRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const epoch = ++epochRef.current;
    setItems([]);
    setDiscardTarget(null);
    setDiscarding(false);
    setDiscardError(false);
    setNotice(null);
    createAttemptRef.current = null;
    if (organizationId && activeFinanceEntityId) void loadSessions(epoch);
    // The list is scoped by canonical organization/entity context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId]);

  const handleCreate = async (input: {
    serviceLabel: string;
    serviceDate: string;
    mode: CountStartMode;
  }) => {
    const normalizedLabel = input.serviceLabel.trim();
    if (!normalizedLabel || !input.serviceDate || !canCreate || creating) return;

    const fingerprint = `${activeFinanceEntityId}|${input.serviceDate}|${normalizedLabel}`;
    if (!createAttemptRef.current || createAttemptRef.current.fingerprint !== fingerprint) {
      createAttemptRef.current = { fingerprint, key: makeToken('idcount_create') };
    }

    recordFinanceJourneyMetric('flow_start', {
      organizationId,
      flow: `count_start_${input.mode}`,
      dedupeKey: `count_start:${createAttemptRef.current.key}:${input.mode}`,
    });
    setCreating(true);
    setCreateError(false);
    try {
      const result = await countService.create(
        organizationId,
        activeFinanceEntityId || '',
        {
          serviceLabel: normalizedLabel,
          serviceDate: input.serviceDate,
          idempotencyKey: createAttemptRef.current.key,
          requestId: makeToken('req'),
        },
      );
      createAttemptRef.current = null;
      recordFinanceJourneyMetric('flow_complete', {
        organizationId,
        flow: `count_start_${input.mode}`,
        dedupeKey: `count_start_complete:${result.sessionId}`,
      });

      if (input.mode === 'free_form') {
        navigate(APP_ROUTES.countFreeFormCapture.replace(':sessionId', result.sessionId));
      } else if (input.mode === 'paper') {
        try {
          const form = await countPaperService.generate(organizationId, activeFinanceEntityId || '', {
            countSessionId: result.sessionId,
            stage: 'count_a',
            locale: language,
            idempotencyKey: makeToken('idcountpaper'),
            requestId: makeToken('req'),
          });
          navigate(APP_ROUTES.countPaperForm.replace(':formId', form.formId));
        } catch {
          navigate(APP_ROUTES.countPaperForms);
        }
      } else if (input.mode === 'voice') {
        navigate(APP_ROUTES.countVoice.replace(':sessionId', result.sessionId));
      } else {
        navigate(APP_ROUTES.countSession.replace(':sessionId', result.sessionId));
      }
    } catch {
      setCreateError(true);
    } finally {
      setCreating(false);
    }
  };

  const handleDiscard = async () => {
    if (!discardTarget || !canCreate || discarding || !activeFinanceEntityId) return;
    setDiscarding(true);
    setDiscardError(false);
    try {
      await countService.discard(organizationId, activeFinanceEntityId, {
        countSessionId: discardTarget.id,
        expectedVersion: discardTarget.version,
        idempotencyKey: makeToken('idcount_discard'),
        requestId: makeToken('req'),
      });
      countDraftPersistence.clear(organizationId, activeFinanceEntityId, discardTarget.id);
      setItems((current) => current.filter((item) => item.id !== discardTarget.id));
      setDiscardTarget(null);
      setNotice(copy.discardSessionSuccess);
    } catch {
      setDiscardError(true);
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.homeTitle} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent-primary" aria-hidden="true" />
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                  {copy.homeTitle}
                </h1>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
                {copy.homeSubtitle}
              </p>
            </div>
          </header>

          {canCreate && !loading && !error ? (
            <CountStartJourney
              language={language}
              entityName={activeFinanceEntityName}
              items={items}
              creating={creating}
              createError={createError}
              onStart={handleCreate}
              onResume={(item) => {
                recordFinanceJourneyMetric('flow_start', {
                  organizationId,
                  flow: 'count_resume',
                  dedupeKey: `count_resume:${item.id}:${item.version}`,
                });
              }}
            />
          ) : null}

          <Surface variant="secondary" radius="xl" className="border-accent-primary/15 bg-accent-primary/5 p-5 sm:p-6">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-text-primary">{copy.secondCountPending}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.secondCountSafety}</p>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.noPosting}</p>
              </div>
            </div>
          </Surface>

          <div>
            {notice ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-4 rounded-2xl border border-semantic-success/20 bg-semantic-success/10 px-4 py-3 text-sm font-medium text-text-primary"
              >
                {notice}
              </div>
            ) : null}
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
              {copy.recentSessions}
            </h2>

            {loading ? (
              <div className="mt-4 grid gap-3" aria-busy="true" aria-label={copy.loading}>
                {[0, 1, 2].map((index) => (
                  <Surface key={index} variant="elevated" radius="lg" className="animate-pulse p-5">
                    <div className="h-5 w-40 rounded bg-surface-secondary" />
                    <div className="mt-4 h-4 w-64 max-w-full rounded bg-surface-secondary" />
                  </Surface>
                ))}
              </div>
            ) : error ? (
              <Surface variant="elevated" radius="xl" role="alert" className="mt-4 p-6 text-center">
                <AlertCircle className="mx-auto h-7 w-7 text-semantic-danger" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-semibold text-text-primary">{copy.errorTitle}</h3>
                <p className="mt-2 text-sm text-text-muted">{copy.errorBody}</p>
                <Button className="mt-5" variant="secondary" onClick={() => void loadSessions()}>
                  {copy.retry}
                </Button>
              </Surface>
            ) : items.length === 0 ? (
              <Surface variant="elevated" radius="xl" className="mt-4 p-8 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true" />
                <h3 className="mt-4 text-lg font-semibold text-text-primary">{copy.emptyTitle}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">{copy.emptyBody}</p>
              </Surface>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {items.map((item) => {
                  const blind = item.materialHidden;
                  const canDiscard = canCreate && item.status === 'counting_a';
                  return (
                    <Surface key={item.id} variant="elevated" radius="lg" className="h-full overflow-hidden">
                      <button
                        type="button"
                        onClick={() => navigate(APP_ROUTES.countSession.replace(':sessionId', item.id))}
                        className="group w-full p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-text-primary">{item.serviceLabel}</p>
                            <p className="mt-1 text-sm text-text-muted">
                              {formatReviewDate(`${item.serviceDate}T12:00:00.000Z`, language)}
                            </p>
                          </div>
                          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </div>
                        <div className="mt-5 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${item.status === 'matched' ? 'border-semantic-success/20 bg-semantic-success/10 text-semantic-success' : item.status === 'divergent' ? 'border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning' : 'border-border-subtle bg-surface-secondary text-text-secondary'}`}>
                            {copy.statusLabels[item.status]}
                          </span>
                          {item.status === 'counting_a' && item.firstCountEntryTypes.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-semantic-success/20 bg-semantic-success/10 px-3 py-1 text-xs font-semibold text-semantic-success">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {copy.savedFirstCount}
                            </span>
                          ) : null}
                          {blind ? (
                            <span className="rounded-full border border-accent-primary/20 bg-accent-primary/10 px-3 py-1 text-xs font-semibold text-accent-primary">
                              {copy.blindProtected}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-4 border-t border-border-subtle pt-4">
                          {blind || item.firstCountTotalCents === null ? (
                            <p className="max-w-[70%] text-sm font-medium text-text-muted">{copy.hiddenAmount}</p>
                          ) : (
                            <p className="text-lg font-semibold tabular-nums text-text-primary">
                              {formatReviewMoney(item.firstCountTotalCents, language, 'BRL')}
                            </p>
                          )}
                          <span className="text-sm font-semibold text-accent-primary">
                            {item.status === 'matched'
                              ? copy.viewResult
                              : item.status === 'divergent'
                                ? copy.resolveDifference
                                : copy.continueSession}
                          </span>
                        </div>
                      </button>
                      {canDiscard ? (
                        <div className="border-t border-border-subtle px-5 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setDiscardError(false);
                              setDiscardTarget(item);
                            }}
                            className="nf-interactive inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-semantic-danger hover:bg-semantic-danger/10"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            {copy.discardSession}
                          </button>
                        </div>
                      ) : null}
                    </Surface>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {discardTarget ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-count-title"
            aria-describedby="discard-count-body"
            className="w-full max-w-sm rounded-[24px] border border-border-subtle bg-surface-elevated p-6 shadow-2xl"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-semantic-danger/10 text-semantic-danger">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 id="discard-count-title" className="mt-4 text-lg font-semibold text-text-primary">
              {copy.discardSessionTitle}
            </h2>
            <p id="discard-count-body" className="mt-2 text-sm leading-relaxed text-text-secondary">
              {copy.discardSessionBody}
            </p>
            <p className="mt-3 rounded-xl bg-surface-secondary px-3 py-2 text-sm font-medium text-text-primary">
              {discardTarget.serviceLabel}
            </p>
            {discardError ? (
              <p className="mt-4 rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-3 text-sm text-text-primary" role="alert">
                {copy.discardSessionError}
              </p>
            ) : null}
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                fullWidth
                disabled={discarding}
                onClick={() => {
                  setDiscardError(false);
                  setDiscardTarget(null);
                }}
              >
                {copy.cancel}
              </Button>
              <Button
                variant="danger"
                fullWidth
                disabled={discarding}
                leadingIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => void handleDiscard()}
              >
                {discarding ? copy.discardingSession : copy.discardSessionConfirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
