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
import { Button, FlowConfirmation, FlowFeedback, FlowStepHeader, SpeakInstructionButton, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countService, type CountSessionDetail } from '@/src/services/countService';
import { countDraftPersistence } from '@/src/services/countDraftPersistence';
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
import { CountBlindWorkspace, CountResultPanel } from './CountH2Panels';
import { CountSecondCounterGate } from './CountSecondCounterGate';
import { formatReviewDate, formatReviewMoney } from '../transactions/transactionReviewModel';

const AUTOSAVE_COPY = {
  PT: {
    listen: 'Ouvir instrução',
    stop: 'Parar instrução',
    saving: 'Salvando na nuvem…',
    cloud: 'Salvo na nuvem',
    local: 'Salvo neste aparelho. A nuvem será atualizada quando a internet voltar.',
    restored: 'Retomamos seu rascunho salvo neste aparelho.',
  },
  EN: {
    listen: 'Listen to instruction',
    stop: 'Stop instruction',
    saving: 'Saving to cloud…',
    cloud: 'Saved to cloud',
    local: 'Saved on this device. The cloud will update when the connection returns.',
    restored: 'We restored the draft saved on this device.',
  },
  ES: {
    listen: 'Escuchar instrucción',
    stop: 'Detener instrucción',
    saving: 'Guardando en la nube…',
    cloud: 'Guardado en la nube',
    local: 'Guardado en este dispositivo. La nube se actualizará cuando vuelva la conexión.',
    restored: 'Restauramos el borrador guardado en este dispositivo.',
  },
} as const;

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
  const { accessState, user } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COUNT_COPY[language];
  const autosaveCopy = AUTOSAVE_COPY[language];
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
  const [startingSecond, setStartingSecond] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [supportCode, setSupportCode] = useState<string | null>(null);
  const [cloudSaveState, setCloudSaveState] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  const epochRef = useRef(0);
  const saveAttemptRef = useRef<SaveAttempt | null>(null);
  const secondStartAttemptRef = useRef<SaveAttempt | null>(null);
  const autosaveAttemptRef = useRef<SaveAttempt | null>(null);
  const autosaveInFlightRef = useRef(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const loadSession = async (currentEpoch = ++epochRef.current) => {
    if (!organizationId || !activeFinanceEntityId || !sessionId) return;
    setLoading(true);
    setLoadError(false);
    setConflict(false);
    setSaveError(false);
    setSupportCode(null);
    setRestoredDraft(false);
    setCloudSaveState('idle');
    try {
      const response = await countService.detail(
        organizationId,
        activeFinanceEntityId,
        sessionId,
      );
      if (currentEpoch !== epochRef.current) return;
      setSession(response.session);
      const serverEntries =
        response.session.status === 'counting_a' ? response.session.countA?.entries || [] : [];
      setEntries(serverEntries);

      if (response.session.status === 'counting_a') {
        const localDraft = countDraftPersistence.load(
          organizationId,
          activeFinanceEntityId,
          sessionId,
        );
        if (localDraft) {
          setActiveType(localDraft.activeType);
          setMethod(localDraft.method);
          setTotalRaw(localDraft.totalRaw);
          setQuantities({ ...localDraft.quantities });
          setStep(localDraft.step);
          setRestoredDraft(true);
        } else {
          setStep('choose');
        }
      } else {
        countDraftPersistence.clear(organizationId, activeFinanceEntityId, sessionId);
      }

      saveAttemptRef.current = null;
      secondStartAttemptRef.current = null;
      autosaveAttemptRef.current = null;
      autosaveInFlightRef.current = false;
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
    setRestoredDraft(false);
    setCloudSaveState('idle');
    saveAttemptRef.current = null;
    secondStartAttemptRef.current = null;
    autosaveAttemptRef.current = null;
    autosaveInFlightRef.current = false;
    if (organizationId && activeFinanceEntityId && sessionId) void loadSession(epoch);
    // Canonical Count scope is organization + finance entity + session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId, sessionId]);

  useEffect(() => {
    if (
      loading ||
      !session ||
      session.status !== 'counting_a' ||
      !organizationId ||
      !activeFinanceEntityId ||
      !sessionId
    ) {
      return;
    }

    countDraftPersistence.save(organizationId, activeFinanceEntityId, sessionId, {
      activeType,
      method,
      totalRaw,
      quantities,
      step,
    });
  }, [
    activeFinanceEntityId,
    activeType,
    loading,
    method,
    organizationId,
    quantities,
    session,
    sessionId,
    step,
    totalRaw,
  ]);

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
    setRestoredDraft(false);
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

  useEffect(() => {
    if (
      !canEdit ||
      !session ||
      session.status !== 'counting_a' ||
      step !== 'count' ||
      !organizationId ||
      !activeFinanceEntityId ||
      !sessionId
    ) {
      return;
    }

    let nextEntries: NormalizedCountEntry[];
    try {
      const draft: CountEntryDraft = {
        type: activeType,
        method: activeType === 'pix' ? 'total' : method,
        totalCents: workingTotal,
        denominations:
          activeType !== 'pix' && method === 'denominations' ? quantities : {},
      };
      const others = entries
        .filter((entry) => entry.type !== activeType)
        .map(toDraftEntry);
      nextEntries = normalizeCountEntries([...others, draft]);
    } catch {
      return;
    }

    const nextDraftEntries = nextEntries.map(toDraftEntry);
    const nextMaterial = buildCountMaterialFingerprint({
      serviceLabel: session.serviceLabel,
      serviceDate: session.serviceDate,
      entries: nextDraftEntries,
    });
    const canonicalMaterial = buildCountMaterialFingerprint({
      serviceLabel: session.serviceLabel,
      serviceDate: session.serviceDate,
      entries: entries.map(toDraftEntry),
    });

    if (nextMaterial === canonicalMaterial) {
      setCloudSaveState('saved');
      return;
    }

    if (!online) {
      setCloudSaveState('local');
      return;
    }

    const timeout = window.setTimeout(() => {
      if (autosaveInFlightRef.current) return;
      autosaveInFlightRef.current = true;
      setCloudSaveState('saving');

      const identity = `${session.id}|${session.version}|${nextMaterial}`;
      if (!autosaveAttemptRef.current || autosaveAttemptRef.current.identity !== identity) {
        autosaveAttemptRef.current = {
          identity,
          key: makeToken('idcount_autosave'),
        };
      }

      const actionEpoch = epochRef.current;
      const idempotencyKey = autosaveAttemptRef.current.key;
      void countService
        .saveFirstCount(organizationId, activeFinanceEntityId, {
          countSessionId: session.id,
          expectedVersion: session.version,
          entries: nextDraftEntries,
          idempotencyKey,
          requestId: makeToken('req'),
        })
        .then((response) => {
          if (actionEpoch !== epochRef.current) return;
          autosaveAttemptRef.current = null;
          setEntries(response.entries);
          setSession((current) => {
            if (!current) return current;
            const currentCountA = current.countA || { entries: [], totalCents: 0 };
            return {
              ...current,
              version: response.version,
              countA: {
                ...currentCountA,
                entries: response.entries,
                totalCents: response.totalCents,
              },
            };
          });
          setCloudSaveState('saved');
        })
        .catch((error: any) => {
          if (actionEpoch !== epochRef.current) return;
          if (error?.code === 'COUNT_VERSION_CONFLICT') {
            setConflict(true);
          }
          setCloudSaveState('local');
        })
        .finally(() => {
          autosaveInFlightRef.current = false;
        });
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [
    activeFinanceEntityId,
    activeType,
    canEdit,
    entries,
    method,
    online,
    organizationId,
    quantities,
    session,
    sessionId,
    step,
    totalRaw,
    workingTotal,
  ]);

  const saveCurrentEntry = async () => {
    if (
      !canEdit ||
      !session ||
      saving ||
      cloudSaveState === 'saving' ||
      session.status !== 'counting_a'
    ) return;
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
      setCloudSaveState('saved');
      setSession((current) => {
        if (!current) return current;
        const currentCountA = current.countA || { entries: [], totalCents: 0 };
        return {
          ...current,
          version: response.version,
          countA: {
            ...currentCountA,
            entries: response.entries,
            totalCents: response.totalCents,
          },
        };
      });
      setStep('choose');
    } catch (error: any) {
      if (actionEpoch !== epochRef.current) return;
      if (error?.code === 'COUNT_VERSION_CONFLICT') {
        setConflict(true);
        setSaveError(false);
      } else {
        setSaveError(true);
        if (!online) setCloudSaveState('local');
      }
      setSupportCode(error?.details?.requestId || requestId);
    } finally {
      if (actionEpoch === epochRef.current) setSaving(false);
    }
  };

  const startSecondCount = async () => {
    if (!canEdit || !session || startingSecond || session.status !== 'counting_a' || entries.length === 0) return;
    setSaveError(false);
    setConflict(false);
    const identity = `${session.id}|${session.version}|start-second`;
    if (!secondStartAttemptRef.current || secondStartAttemptRef.current.identity !== identity) {
      secondStartAttemptRef.current = { identity, key: makeToken('idcount_second_start') };
    }
    const requestId = makeToken('req');
    setSupportCode(requestId);
    setStartingSecond(true);
    try {
      await countService.startSecondCount(organizationId, activeFinanceEntityId || '', {
        countSessionId: session.id,
        expectedVersion: session.version,
        idempotencyKey: secondStartAttemptRef.current.key,
        requestId,
      });
      secondStartAttemptRef.current = null;
      setStartingSecond(false);
      setSupportCode(null);
      if (activeFinanceEntityId && sessionId) {
        countDraftPersistence.clear(organizationId, activeFinanceEntityId, sessionId);
      }
      await loadSession();
    } catch (error: any) {
      if (error?.code === 'COUNT_VERSION_CONFLICT') {
        setConflict(true);
      } else {
        setSaveError(true);
      }
      setSupportCode(error?.details?.requestId || requestId);
      setStartingSecond(false);
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

  if (session.status === 'counting_b') {
    const assignedToCurrentUser =
      !session.secondCountInviteRequired ||
      Boolean(user?.uid && session.secondCountAssignedToUid === user.uid);

    if (!assignedToCurrentUser) {
      return (
        <CountSecondCounterGate
          session={session}
          currentUserUid={user?.uid || null}
          onReload={() => loadSession()}
        />
      );
    }

    return (
      <CountBlindWorkspace
        session={session}
        organizationId={organizationId}
        financeEntityId={activeFinanceEntityId || ''}
        canEdit={canEdit}
        onReload={() => loadSession()}
      />
    );
  }

  if (session.status === 'recounting') {
    return (
      <CountBlindWorkspace
        session={session}
        organizationId={organizationId}
        financeEntityId={activeFinanceEntityId || ''}
        canEdit={canEdit}
        onReload={() => loadSession()}
      />
    );
  }

  if (session.status === 'matched' || session.status === 'divergent') {
    return (
      <CountResultPanel
        session={session}
        organizationId={organizationId}
        financeEntityId={activeFinanceEntityId || ''}
        canEdit={canEdit}
        onReload={() => loadSession()}
      />
    );
  }

  const activeLabel = copy.entryLabels[activeType];
  const stepNumber = step === 'choose' ? 1 : step === 'count' ? 2 : 3;
  const stepTitle =
    step === 'choose'
      ? copy.stepChoose
      : step === 'count'
        ? copy.countTitle(activeLabel)
        : copy.stepReview;
  const stepDescription =
    step === 'choose'
      ? copy.chooseBody
      : step === 'count'
        ? copy.entryDescriptions[activeType]
        : copy.reviewBody;
  const stepProgress =
    language === 'EN'
      ? `Step ${stepNumber} of 3`
      : language === 'ES'
        ? `Paso ${stepNumber} de 3`
        : `Passo ${stepNumber} de 3`;

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

          <FlowStepHeader
            currentStep={stepNumber}
            totalSteps={3}
            eyebrow={copy.sessionTitle}
            title={stepTitle}
            stepLabel={stepProgress}
            description={stepDescription}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SpeakInstructionButton
              text={`${stepTitle}. ${stepDescription}`}
              language={language}
              label={autosaveCopy.listen}
              stopLabel={autosaveCopy.stop}
            />
            <p className="nf-helper-text text-text-muted" role="status" aria-live="polite">
              {cloudSaveState === 'saving'
                ? autosaveCopy.saving
                : cloudSaveState === 'saved'
                  ? autosaveCopy.cloud
                  : cloudSaveState === 'local'
                    ? autosaveCopy.local
                    : ''}
            </p>
          </div>

          {restoredDraft ? (
            <FlowFeedback tone="info" title={autosaveCopy.restored} />
          ) : null}

          {conflict ? (
            <FlowFeedback
              tone="warning"
              title={copy.conflictTitle}
              action={(
                <Button variant="secondary" fullWidth onClick={() => void loadSession()}>
                  {copy.reload}
                </Button>
              )}
            >
              <p>{copy.conflictBody}</p>
            </FlowFeedback>
          ) : null}

          {saveError && !conflict ? (
            <FlowFeedback tone="error" title={copy.safeError}>
              {supportCode ? (
                <p className="mt-2 break-all font-mono nf-helper-text">{copy.supportCode}: {supportCode}</p>
              ) : null}
            </FlowFeedback>
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
                                <span className="inline-flex items-center gap-1 rounded-full border border-semantic-success/20 bg-semantic-success/10 px-2 py-0.5 text-xs font-semibold text-semantic-success">
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
                <Button size="lg" fullWidth onClick={() => void saveCurrentEntry()} disabled={saving || cloudSaveState === 'saving' || !canEdit}>
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

              <FlowConfirmation
                title={copy.firstCountSaved}
                description={(
                  <div className="space-y-2">
                    <p>{copy.firstCountSavedBody}</p>
                    <p className="nf-helper-text text-text-muted">{copy.secondCountSafety}</p>
                    <p className="nf-helper-text text-text-muted">{copy.noPosting}</p>
                  </div>
                )}
                cancelLabel={copy.returnToCount}
                confirmLabel={startingSecond ? copy.startingSecond : copy.startSecond}
                onCancel={() => navigate(APP_ROUTES.count)}
                onConfirm={() => void startSecondCount()}
                busy={startingSecond}
                disabled={!canEdit || entries.length === 0}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
