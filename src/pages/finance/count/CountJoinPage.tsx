import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, FlowFeedback, FlowStepHeader, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countService } from '@/src/services/countService';

const COPY = {
  PT: {
    area: 'Segunda contagem',
    step: 'Passo 1 de 1',
    title: 'Entrar como segundo contador',
    body: 'Digite o código que a pessoa da primeira contagem mostrou para você. Os valores dela continuam totalmente ocultos.',
    label: 'Código de 10 caracteres',
    placeholder: 'Ex.: 7K4M9P2XQH',
    join: 'Entrar na contagem',
    joining: 'Verificando código…',
    back: 'Voltar',
    invalid: 'Confira o código. Ele deve ter 10 caracteres.',
    notFound: 'Código não encontrado para esta igreja.',
    expired: 'Esse código expirou. Peça à primeira pessoa para gerar outro.',
    independent: 'A segunda contagem precisa ser feita por outra pessoa.',
    used: 'Esse código já foi assumido por outra pessoa.',
    error: 'Não foi possível entrar agora. Nenhum valor foi exibido.',
  },
  EN: {
    area: 'Second count',
    step: 'Step 1 of 1',
    title: 'Join as second counter',
    body: 'Enter the code shown by the first counter. Their values remain completely hidden.',
    label: '10-character code',
    placeholder: 'Example: 7K4M9P2XQH',
    join: 'Join count',
    joining: 'Checking code…',
    back: 'Back',
    invalid: 'Check the code. It must have 10 characters.',
    notFound: 'Code not found for this church.',
    expired: 'This code expired. Ask the first person to generate another one.',
    independent: 'The second count must be done by another person.',
    used: 'This code has already been claimed by another person.',
    error: 'Could not join right now. No values were shown.',
  },
  ES: {
    area: 'Segundo conteo',
    step: 'Paso 1 de 1',
    title: 'Entrar como segundo contador',
    body: 'Escribe el código que mostró la persona del primer conteo. Sus valores siguen totalmente ocultos.',
    label: 'Código de 10 caracteres',
    placeholder: 'Ej.: 7K4M9P2XQH',
    join: 'Entrar al conteo',
    joining: 'Verificando código…',
    back: 'Volver',
    invalid: 'Revisa el código. Debe tener 10 caracteres.',
    notFound: 'Código no encontrado para esta iglesia.',
    expired: 'Este código expiró. Pide a la primera persona que genere otro.',
    independent: 'El segundo conteo debe hacerlo otra persona.',
    used: 'Este código ya fue asumido por otra persona.',
    error: 'No fue posible entrar ahora. No se mostró ningún valor.',
  },
} as const;

function makeToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeCode(value: string) {
  return value.replace(/[\s-]/g, '').toUpperCase().slice(0, 10);
}

export default function CountJoinPage() {
  return (
    <FinanceContextGuard>
      <CountJoinContent />
    </FinanceContextGuard>
  );
}

function CountJoinContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const copy = COPY[language];
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const canEdit = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const [code, setCode] = useState(() => normalizeCode(searchParams.get('code') || ''));
  const [joining, setJoining] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const attemptRef = useRef<{ identity: string; key: string } | null>(null);

  useEffect(() => {
    const fromUrl = normalizeCode(searchParams.get('code') || '');
    if (fromUrl) setCode(fromUrl);
  }, [searchParams]);

  const valid = useMemo(
    () => /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/.test(code),
    [code],
  );

  const join = async () => {
    if (!canEdit || !valid || joining || !activeFinanceEntityId) {
      if (!valid) setErrorCode('COUNT_INVALID_JOIN_CODE');
      return;
    }
    const identity = `${activeFinanceEntityId}|${code}`;
    if (!attemptRef.current || attemptRef.current.identity !== identity) {
      attemptRef.current = { identity, key: makeToken('idcount_join') };
    }

    setJoining(true);
    setErrorCode(null);
    try {
      const response = await countService.joinSecondCount(
        organizationId,
        activeFinanceEntityId,
        {
          joinCode: code,
          idempotencyKey: attemptRef.current.key,
          requestId: makeToken('req'),
        },
      );
      attemptRef.current = null;
      navigate(APP_ROUTES.countSession.replace(':sessionId', response.countSessionId), { replace: true });
    } catch (error: any) {
      setErrorCode(String(error?.code || 'COUNT_JOIN_FAILED'));
    } finally {
      setJoining(false);
    }
  };

  const errorMessage =
    errorCode === 'COUNT_INVALID_JOIN_CODE'
      ? copy.invalid
      : errorCode === 'COUNT_JOIN_CODE_NOT_FOUND'
        ? copy.notFound
        : errorCode === 'COUNT_JOIN_CODE_EXPIRED'
          ? copy.expired
          : errorCode === 'COUNT_INDEPENDENT_COUNTER_REQUIRED'
            ? copy.independent
            : errorCode === 'COUNT_JOIN_CODE_ALREADY_USED' || errorCode === 'COUNT_SECOND_COUNTER_ALREADY_ASSIGNED'
              ? copy.used
              : errorCode
                ? copy.error
                : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.area} />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <FlowStepHeader
          currentStep={1}
          totalSteps={1}
          stepLabel={copy.step}
          title={copy.title}
          description={copy.body}
        />

        {errorMessage ? (
          <FlowFeedback tone="error" title={errorMessage} className="mt-5" />
        ) : null}

        <Surface variant="elevated" radius="xl" className="mt-5 p-5 sm:p-6">
          <label className="block">
            <span className="font-semibold text-text-primary">{copy.label}</span>
            <input
              autoFocus
              autoCapitalize="characters"
              autoComplete="one-time-code"
              spellCheck={false}
              value={code}
              onChange={(event) => {
                setCode(normalizeCode(event.target.value));
                setErrorCode(null);
              }}
              placeholder={copy.placeholder}
              className="mt-3 min-h-16 w-full rounded-2xl border border-border-subtle bg-surface-base px-4 text-center font-mono text-2xl font-semibold uppercase tracking-[0.2em] text-text-primary outline-none focus:border-accent-primary"
              aria-describedby="second-count-code-help"
            />
            <p id="second-count-code-help" className="mt-3 nf-helper-text text-text-muted">
              {copy.body}
            </p>
          </label>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.count)}>
              {copy.back}
            </Button>
            <Button size="lg" fullWidth disabled={!valid || !canEdit || joining} onClick={() => void join()}>
              {joining ? copy.joining : copy.join}
            </Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
