import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
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
import { countService, type CountSessionListItem } from '@/src/services/countService';
import { COUNT_COPY } from './count/countCopy';
import { formatReviewDate, formatReviewMoney } from './transactions/transactionReviewModel';

function localDateInputValue() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COUNT_COPY[language];
  const canCreate = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const organizationId = accessState.organizationId || accessState.organization?.id || '';

  const [items, setItems] = useState<CountSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [serviceLabel, setServiceLabel] = useState('');
  const [serviceDate, setServiceDate] = useState(localDateInputValue());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
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
    createAttemptRef.current = null;
    if (organizationId && activeFinanceEntityId) void loadSessions(epoch);
    // The list is scoped by canonical organization/entity context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId]);

  const handleCreate = async () => {
    const normalizedLabel = serviceLabel.trim();
    if (!normalizedLabel || !serviceDate || !canCreate || creating) return;

    const fingerprint = `${activeFinanceEntityId}|${serviceDate}|${normalizedLabel}`;
    if (!createAttemptRef.current || createAttemptRef.current.fingerprint !== fingerprint) {
      createAttemptRef.current = { fingerprint, key: makeToken('idcount_create') };
    }

    setCreating(true);
    setCreateError(false);
    try {
      const result = await countService.create(
        organizationId,
        activeFinanceEntityId || '',
        {
          serviceLabel: normalizedLabel,
          serviceDate,
          idempotencyKey: createAttemptRef.current.key,
          requestId: makeToken('req'),
        },
      );
      createAttemptRef.current = null;
      navigate(APP_ROUTES.countSession.replace(':sessionId', result.sessionId));
    } catch {
      setCreateError(true);
    } finally {
      setCreating(false);
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
            {canCreate ? (
              <Button size="lg" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {copy.newSession}
              </Button>
            ) : null}
          </header>

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

          {showCreate ? (
            <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
                <label className="block">
                  <span className="text-sm font-medium text-text-primary">{copy.serviceLabel}</span>
                  <input
                    autoFocus
                    type="text"
                    maxLength={120}
                    value={serviceLabel}
                    onChange={(event) => {
                      setServiceLabel(event.target.value);
                      createAttemptRef.current = null;
                      setCreateError(false);
                    }}
                    placeholder={copy.serviceLabelPlaceholder}
                    className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-text-primary">{copy.serviceDate}</span>
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(event) => {
                      setServiceDate(event.target.value);
                      createAttemptRef.current = null;
                      setCreateError(false);
                    }}
                    className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary"
                  />
                </label>
              </div>
              {createError ? (
                <div className="mt-4 flex gap-3 rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 p-4 text-sm text-text-primary" role="alert">
                  <AlertCircle className="h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
                  <p>{copy.safeError}</p>
                </div>
              ) : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" size="lg" fullWidth onClick={() => setShowCreate(false)} disabled={creating}>
                  {copy.cancel}
                </Button>
                <Button size="lg" fullWidth onClick={() => void handleCreate()} disabled={creating || !serviceLabel.trim() || !serviceDate}>
                  {creating ? copy.creating : copy.create}
                </Button>
              </div>
            </Surface>
          ) : null}

          <div>
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
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(APP_ROUTES.countSession.replace(':sessionId', item.id))}
                    className="group rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                  >
                    <Surface variant="elevated" radius="lg" className="h-full p-5 transition-colors group-hover:bg-surface-secondary/70">
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
                        <span className="rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 text-xs font-semibold text-text-secondary">
                          {copy.firstCount}
                        </span>
                        {item.firstCountEntryTypes.length > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-semantic-success/20 bg-semantic-success/10 px-3 py-1 text-xs font-semibold text-semantic-success">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {copy.savedFirstCount}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-semantic-warning/20 bg-semantic-warning/10 px-3 py-1 text-xs font-semibold text-semantic-warning">
                          {copy.secondCountPending}
                        </span>
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-4 border-t border-border-subtle pt-4">
                        <p className="text-lg font-semibold tabular-nums text-text-primary">
                          {formatReviewMoney(item.firstCountTotalCents, language, 'BRL')}
                        </p>
                        <span className="text-sm font-semibold text-accent-primary">{copy.continueSession}</span>
                      </div>
                    </Surface>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
