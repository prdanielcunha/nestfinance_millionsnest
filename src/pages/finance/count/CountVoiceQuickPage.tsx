import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, FlowFeedback, FlowStepHeader, SpeakInstructionButton, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countService, type CountSessionDetail } from '@/src/services/countService';
import type { CountEntryDraft, CountEntryType } from '@/shared/finance/count';
import { formatReviewMoney } from '../transactions/transactionReviewModel';

type Values = Record<CountEntryType, number>;

const ZERO_VALUES: Values = { tithe: 0, offering: 0, other: 0, pix: 0 };

const COPY = {
  PT: {
    step: 'Passo 1 de 1',
    title: 'Fale ou digite os valores',
    body: 'Preencha um valor por vez. Você sempre verá o número antes de salvar.',
    listenInstruction: 'Ouvir instrução',
    stopInstruction: 'Parar instrução',
    speak: 'Falar valor',
    listening: 'Ouvindo…',
    unsupported: 'Seu navegador não oferece ditado nesta tela. Digite o valor normalmente.',
    notUnderstood: 'Não consegui identificar um número. Você pode tentar novamente ou digitar.',
    total: 'Total informado',
    save: 'Salvar valores',
    saving: 'Salvando…',
    back: 'Voltar',
    loading: 'Carregando contagem…',
    error: 'Não foi possível carregar esta contagem.',
    saveError: 'Não foi possível salvar agora. Os valores continuam guardados neste aparelho.',
    conflict: 'Esta contagem mudou em outro dispositivo. Volte e carregue a versão mais recente.',
    draftSaved: 'Rascunho salvo neste aparelho',
    categories: { tithe: 'Dízimos', offering: 'Ofertas', other: 'Outras entradas', pix: 'Pix' },
  },
  EN: {
    step: 'Step 1 of 1',
    title: 'Speak or type the amounts',
    body: 'Fill one amount at a time. You always see the number before saving.',
    listenInstruction: 'Listen to instruction',
    stopInstruction: 'Stop instruction',
    speak: 'Speak amount',
    listening: 'Listening…',
    unsupported: 'Your browser does not offer dictation on this screen. Type the amount normally.',
    notUnderstood: 'I could not identify a number. Try again or type it.',
    total: 'Entered total',
    save: 'Save amounts',
    saving: 'Saving…',
    back: 'Back',
    loading: 'Loading count…',
    error: 'Could not load this count.',
    saveError: 'Could not save right now. The amounts are still stored on this device.',
    conflict: 'This count changed on another device. Go back and load the latest version.',
    draftSaved: 'Draft saved on this device',
    categories: { tithe: 'Tithes', offering: 'Offerings', other: 'Other income', pix: 'Pix' },
  },
  ES: {
    step: 'Paso 1 de 1',
    title: 'Habla o escribe los valores',
    body: 'Completa un valor por vez. Siempre verás el número antes de guardar.',
    listenInstruction: 'Escuchar instrucción',
    stopInstruction: 'Detener instrucción',
    speak: 'Hablar valor',
    listening: 'Escuchando…',
    unsupported: 'Tu navegador no ofrece dictado en esta pantalla. Escribe el valor normalmente.',
    notUnderstood: 'No pude identificar un número. Intenta de nuevo o escríbelo.',
    total: 'Total informado',
    save: 'Guardar valores',
    saving: 'Guardando…',
    back: 'Volver',
    loading: 'Cargando conteo…',
    error: 'No fue posible cargar este conteo.',
    saveError: 'No fue posible guardar ahora. Los valores siguen guardados en este dispositivo.',
    conflict: 'Este conteo cambió en otro dispositivo. Vuelve y carga la versión más reciente.',
    draftSaved: 'Borrador guardado en este dispositivo',
    categories: { tithe: 'Diezmos', offering: 'Ofrendas', other: 'Otras entradas', pix: 'Pix' },
  },
} as const;

function makeToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function inputToCents(value: string) {
  const digits = value.replace(/\D/g, '');
  return Number.parseInt(digits || '0', 10) || 0;
}

function transcriptToCents(transcript: string): number | null {
  const match = transcript.match(/\d[\d\s.,]*/);
  if (!match) return null;
  const raw = match[0].replace(/\s/g, '');
  const decimalMatch = raw.match(/^(.*?)[,.](\d{1,2})$/);
  if (decimalMatch) {
    const whole = decimalMatch[1].replace(/\D/g, '');
    const fraction = decimalMatch[2].padEnd(2, '0').slice(0, 2);
    return (Number.parseInt(whole || '0', 10) || 0) * 100 + Number.parseInt(fraction, 10);
  }
  const whole = raw.replace(/\D/g, '');
  return (Number.parseInt(whole || '0', 10) || 0) * 100;
}

function getRecognitionConstructor() {
  if (typeof window === 'undefined') return null;
  const candidate = window as typeof window & {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  };
  return candidate.SpeechRecognition || candidate.webkitSpeechRecognition || null;
}

function draftKey(organizationId: string, entityId: string, sessionId: string) {
  return `nestfinance_count_voice_v1:${organizationId}:${entityId}:${sessionId}`;
}

export default function CountVoiceQuickPage() {
  return (
    <FinanceContextGuard>
      <CountVoiceQuickContent />
    </FinanceContextGuard>
  );
}

function CountVoiceQuickContent() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { language } = useLanguage();
  const copy = COPY[language];
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const canEdit = hasEffectiveCapability(accessState, 'finance.create_drafts');

  const [session, setSession] = useState<CountSessionDetail | null>(null);
  const [values, setValues] = useState<Values>(ZERO_VALUES);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [listeningField, setListeningField] = useState<CountEntryType | null>(null);
  const [speechError, setSpeechError] = useState(false);
  const recognitionRef = useRef<any>(null);

  const storageKey =
    organizationId && activeFinanceEntityId && sessionId
      ? draftKey(organizationId, activeFinanceEntityId, sessionId)
      : null;

  useEffect(() => {
    if (!organizationId || !activeFinanceEntityId || !sessionId) return;
    let cancelled = false;

    void countService
      .detail(organizationId, activeFinanceEntityId, sessionId)
      .then(({ session: loaded }) => {
        if (cancelled) return;
        setSession(loaded);
        const serverValues = { ...ZERO_VALUES };
        for (const entry of loaded.countA?.entries || []) serverValues[entry.type] = entry.totalCents;

        if (storageKey) {
          try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
              const parsed = JSON.parse(raw) as Partial<Values>;
              for (const type of Object.keys(serverValues) as CountEntryType[]) {
                const value = Number(parsed[type]);
                if (Number.isFinite(value) && value >= 0) serverValues[type] = Math.round(value);
              }
            }
          } catch {
            // Ignore malformed local-only training/draft data.
          }
        }
        setValues(serverValues);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      recognitionRef.current?.stop?.();
    };
  }, [activeFinanceEntityId, organizationId, sessionId, storageKey]);

  useEffect(() => {
    if (!storageKey || loading) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      // Cloud save remains available even if localStorage is unavailable.
    }
  }, [loading, storageKey, values]);

  const total = useMemo(
    () => (Object.values(values) as number[]).reduce((sum, value) => sum + value, 0),
    [values],
  );

  const Recognition = getRecognitionConstructor();

  const speakValue = (field: CountEntryType) => {
    if (!Recognition || listeningField) return;
    setSpeechError(false);

    const recognition = new Recognition();
    recognition.lang = language === 'PT' ? 'pt-BR' : language === 'EN' ? 'en-US' : 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || '');
      const cents = transcriptToCents(transcript);
      if (cents === null) {
        setSpeechError(true);
      } else {
        setValues((current) => ({ ...current, [field]: cents }));
      }
    };
    recognition.onerror = () => setSpeechError(true);
    recognition.onend = () => {
      setListeningField(null);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListeningField(field);
    recognition.start();
  };

  const save = async () => {
    if (!canEdit || !session || !activeFinanceEntityId || !sessionId || saving) return;
    setSaving(true);
    setSaveError(false);
    setConflict(false);
    const entries: CountEntryDraft[] = (Object.keys(values) as CountEntryType[]).map((type) => ({
      type,
      method: 'total',
      totalCents: values[type],
      denominations: {},
    }));
    try {
      await countService.saveFirstCount(organizationId, activeFinanceEntityId, {
        countSessionId: sessionId,
        expectedVersion: session.version,
        entries,
        idempotencyKey: makeToken('idcount_voice'),
        requestId: makeToken('req'),
      });
      if (storageKey) localStorage.removeItem(storageKey);
      navigate(APP_ROUTES.countSession.replace(':sessionId', sessionId));
    } catch (error: any) {
      if (error?.code === 'COUNT_VERSION_CONFLICT') setConflict(true);
      else setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-text-secondary" role="status">{copy.loading}</div>;
  }

  if (loadError || !session || session.status !== 'counting_a') {
    return (
      <FlowFeedback tone="error" title={copy.error}>
        <Button className="mt-4" variant="secondary" onClick={() => navigate(APP_ROUTES.count)}>
          {copy.back}
        </Button>
      </FlowFeedback>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-24">
      <FlowStepHeader
        currentStep={1}
        totalSteps={1}
        title={copy.title}
        stepLabel={copy.step}
        description={copy.body}
      />

      <div className="flex flex-wrap gap-3">
        <SpeakInstructionButton
          text={copy.body}
          language={language}
          label={copy.listenInstruction}
          stopLabel={copy.stopInstruction}
        />
        <span className="self-center nf-helper-text text-text-muted" role="status" aria-live="polite">
          {copy.draftSaved}
        </span>
      </div>

      {!Recognition ? (
        <FlowFeedback tone="info" title={copy.unsupported} />
      ) : null}
      {speechError ? (
        <FlowFeedback tone="warning" title={copy.notUnderstood} />
      ) : null}
      {conflict ? (
        <FlowFeedback tone="warning" title={copy.conflict} />
      ) : null}
      {saveError ? (
        <FlowFeedback tone="error" title={copy.saveError} />
      ) : null}

      <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(values) as CountEntryType[]).map((field) => (
            <div key={field}>
              <label className="block">
                <span className="font-semibold text-text-primary">{copy.categories[field]}</span>
                <div className="mt-2 flex min-h-14 items-center rounded-xl border border-border-subtle bg-surface-base px-4 focus-within:border-accent-primary">
                  <span className="mr-2 font-semibold text-text-muted">R$</span>
                  <input
                    inputMode="numeric"
                    value={(values[field] / 100).toLocaleString(
                      language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR',
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field]: inputToCents(event.target.value),
                      }))
                    }
                    className="min-w-0 flex-1 bg-transparent text-xl font-semibold text-text-primary outline-none"
                    aria-label={copy.categories[field]}
                  />
                </div>
              </label>
              {Recognition ? (
                <Button
                  className="mt-2"
                  variant="secondary"
                  fullWidth
                  onClick={() => speakValue(field)}
                  disabled={Boolean(listeningField)}
                >
                  {listeningField === field ? copy.listening : copy.speak}
                </Button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-5 text-center">
          <p className="nf-helper-text font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.total}</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums text-text-primary">
            {formatReviewMoney(total, language, 'BRL')}
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button variant="secondary" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.countSession.replace(':sessionId', sessionId || ''))}>
            {copy.back}
          </Button>
          <Button size="lg" fullWidth onClick={() => void save()} disabled={!canEdit || saving}>
            {saving ? copy.saving : copy.save}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
