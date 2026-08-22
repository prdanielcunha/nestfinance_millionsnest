import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, FileText, ShieldX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countPaperService } from '@/src/services/countPaperService';
import { countService, type CountSessionListItem } from '@/src/services/countService';
import type { CountPaperStage } from '@/shared/finance/countPaper';
import { COUNT_PAPER_COPY } from './countPaperCopy';
import { COUNT_COPY } from './countCopy';
import { formatReviewDate } from '../transactions/transactionReviewModel';

const CAPTURE_LABEL = { PT: 'Capturar preenchida', EN: 'Capture completed', ES: 'Capturar completada' } as const;

function makeToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export default function CountPaperFormsPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COUNT_PAPER_COPY[language];

  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') return null;
  if (!hasEffectiveCapability(accessState, 'finance.view')) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-surface-base p-8 text-center">
        <ShieldX className="h-10 w-10 text-semantic-danger" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold text-text-primary">{copy.accessDeniedTitle}</h1>
        <p className="mt-2 max-w-sm text-sm text-text-muted">{copy.accessDeniedBody}</p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <CountPaperFormsContent />
    </FinanceContextGuard>
  );
}

function CountPaperFormsContent() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COUNT_PAPER_COPY[language];
  const countCopy = COUNT_COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const canCreate = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const [items, setItems] = useState<CountSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState(false);
  const epochRef = useRef(0);
  const attemptRef = useRef<{ identity: string; key: string } | null>(null);

  const load = async (epoch = ++epochRef.current) => {
    if (!organizationId || !activeFinanceEntityId) return;
    setLoading(true);
    setError(false);
    try {
      const response = await countService.list(organizationId, activeFinanceEntityId);
      if (epoch !== epochRef.current) return;
      setItems(response.items);
    } catch {
      if (epoch !== epochRef.current) return;
      setError(true);
    } finally {
      if (epoch === epochRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const epoch = ++epochRef.current;
    setItems([]);
    attemptRef.current = null;
    if (organizationId && activeFinanceEntityId) void load(epoch);
    // Entity context is the canonical list scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId]);

  const generate = async (session: CountSessionListItem, stage: CountPaperStage) => {
    if (!canCreate || generatingKey || !activeFinanceEntityId) return;
    const identity = `${activeFinanceEntityId}|${session.id}|${stage}|${language}`;
    if (!attemptRef.current || attemptRef.current.identity !== identity) {
      attemptRef.current = { identity, key: makeToken('idcountpaper') };
    }

    setGenerateError(false);
    setGeneratingKey(`${session.id}:${stage}`);
    try {
      const response = await countPaperService.generate(organizationId, activeFinanceEntityId, {
        countSessionId: session.id,
        stage,
        locale: language,
        idempotencyKey: attemptRef.current.key,
        requestId: makeToken('req'),
      });
      attemptRef.current = null;
      navigate(APP_ROUTES.countPaperForm.replace(':formId', response.formId));
    } catch {
      setGenerateError(true);
    } finally {
      setGeneratingKey(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.hubTitle} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <Button variant="ghost" className="!min-h-12 !w-12 !px-0" aria-label={copy.back} onClick={() => navigate(APP_ROUTES.count)}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
              <div className="pt-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-accent-primary" aria-hidden="true" />
                  <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{copy.hubTitle}</h1>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.hubSubtitle}</p>
              </div>
            </div>
            {canCreate ? (
              <Button size="lg" variant="secondary" onClick={() => navigate(APP_ROUTES.countCapture)}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                {CAPTURE_LABEL[language]}
              </Button>
            ) : null}
          </header>

          {generateError ? (
            <Surface variant="secondary" radius="lg" role="alert" className="border-semantic-danger/20 bg-semantic-danger/10 p-4 text-sm text-text-primary">
              {copy.safeError}
            </Surface>
          ) : null}

          {loading ? (
            <div className="grid gap-3" aria-busy="true" aria-label={copy.loading}>
              {[0, 1, 2].map((index) => <Surface key={index} variant="elevated" radius="lg" className="h-32 animate-pulse" />)}
            </div>
          ) : error ? (
            <Surface variant="elevated" radius="xl" className="p-6 text-center" role="alert">
              <p className="text-sm text-text-muted">{copy.safeError}</p>
              <Button className="mt-4" variant="secondary" onClick={() => void load()}>{copy.retry}</Button>
            </Surface>
          ) : items.length === 0 ? (
            <Surface variant="elevated" radius="xl" className="p-8 text-center">
              <h2 className="text-lg font-semibold text-text-primary">{copy.emptyTitle}</h2>
              <p className="mt-2 text-sm text-text-muted">{copy.emptyBody}</p>
            </Surface>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((item) => {
                const canIssueA = item.status === 'counting_a';
                const canIssueB = item.status === 'counting_b' || (item.status === 'counting_a' && item.firstCountEntryTypes.length > 0);
                const advanced = !['counting_a', 'counting_b'].includes(item.status);
                return (
                  <Surface key={item.id} variant="elevated" radius="xl" className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-semibold text-text-primary">{item.serviceLabel}</h2>
                        <p className="mt-1 text-sm text-text-muted">{formatReviewDate(`${item.serviceDate}T12:00:00.000Z`, language)}</p>
                      </div>
                      <span className="rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 text-xs font-semibold text-text-secondary">
                        {countCopy.statusLabels[item.status]}
                      </span>
                    </div>

                    {advanced ? (
                      <p className="mt-5 text-sm leading-relaxed text-text-muted">{copy.alreadyAdvanced}</p>
                    ) : (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <Button variant="secondary" fullWidth disabled={!canCreate || !canIssueA || Boolean(generatingKey)} onClick={() => void generate(item, 'count_a')}>
                          {generatingKey === `${item.id}:count_a` ? copy.generating : copy.generateA}
                        </Button>
                        <Button fullWidth disabled={!canCreate || !canIssueB || Boolean(generatingKey)} onClick={() => void generate(item, 'count_b')}>
                          {generatingKey === `${item.id}:count_b` ? copy.generating : copy.generateB}
                        </Button>
                      </div>
                    )}
                    {!advanced && !canIssueB ? <p className="mt-3 text-xs leading-relaxed text-text-muted">{copy.notReadyB}</p> : null}
                  </Surface>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
