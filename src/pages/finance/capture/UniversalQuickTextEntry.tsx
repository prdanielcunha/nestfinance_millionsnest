import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, FlowFeedback, Surface } from '@/src/components/foundation';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { transactionsService } from '@/src/services/transactionsService';
import {
  parseUniversalTextIntent,
  type UniversalInputDirection,
  type UniversalInputPaymentMethod,
} from '@/shared/finance/universalInputIntent';
import { formatReviewMoney } from '../transactions/transactionReviewModel';
import { RecordedVoiceCapture } from './RecordedVoiceCapture';

type RecognitionConstructor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

const COPY = {
  PT: {
    title: 'Escrever ou falar',
    body: 'Diga como você falaria com uma pessoa. Ex.: “Paguei R$ 150 no Pix hoje”.',
    placeholder: 'Ex.: Recebi R$ 500 de oferta no Pix hoje',
    interpret: 'Entender',
    speak: 'Falar',
    listening: 'Ouvindo…',
    speechUnavailable: 'Seu navegador não oferece ditado aqui. Você pode digitar normalmente.',
    understood: 'Entendi assim',
    wrong: 'Entendeu errado?',
    closeCorrection: 'Fechar correção',
    direction: 'Tipo',
    expense: 'Saída',
    income: 'Entrada',
    transfer: 'Transferência',
    unknown: 'Não identificado',
    amount: 'Valor',
    date: 'Data',
    payment: 'Forma',
    paymentLabels: {
      cash: 'Dinheiro',
      pix: 'Pix',
      bank_transfer: 'Transferência bancária',
      debit_card: 'Cartão de débito',
      credit_card: 'Cartão de crédito',
      bank_slip: 'Boleto',
      check: 'Cheque',
    },
    sentenceExpense: (amount: string, payment: string, date: string) => `Saída de ${amount}${payment ? ` via ${payment}` : ''}${date ? ` em ${date}` : ''}.`,
    sentenceIncome: (amount: string, payment: string, date: string) => `Entrada de ${amount}${payment ? ` via ${payment}` : ''}${date ? ` em ${date}` : ''}.`,
    sentenceTransfer: (amount: string, date: string) => `Transferência de ${amount}${date ? ` em ${date}` : ''}.`,
    incomplete: 'Ainda faltam tipo, valor ou data. Corrija abaixo antes de criar o rascunho.',
    transferNeedsAccounts: 'Transferências precisam das contas de origem e destino. Use o cadastro guiado para completar com segurança.',
    noEffect: 'Vou criar apenas um rascunho. Nada será aprovado, conciliado ou contabilizado automaticamente.',
    saveOffline: 'Guardar neste aparelho',
    savedOffline: 'Guardado neste aparelho. Quando a internet voltar, você poderá criar o rascunho.',
    create: 'Criar rascunho',
    creating: 'Criando rascunho…',
    createError: 'Não foi possível criar agora. O texto continua disponível.',
    offline: 'Você está sem internet. A captura pode ser guardada, mas nenhuma decisão financeira final será feita offline.',
  },
  EN: {
    title: 'Type or speak',
    body: 'Say it as you would to a person. Example: “I paid R$ 150 by Pix today”.',
    placeholder: 'Example: I received R$ 500 in offerings by Pix today',
    interpret: 'Understand',
    speak: 'Speak',
    listening: 'Listening…',
    speechUnavailable: 'Your browser does not offer dictation here. You can type normally.',
    understood: 'I understood this',
    wrong: 'Did I get it wrong?',
    closeCorrection: 'Close correction',
    direction: 'Type',
    expense: 'Outflow',
    income: 'Income',
    transfer: 'Transfer',
    unknown: 'Not identified',
    amount: 'Amount',
    date: 'Date',
    payment: 'Method',
    paymentLabels: {
      cash: 'Cash',
      pix: 'Pix',
      bank_transfer: 'Bank transfer',
      debit_card: 'Debit card',
      credit_card: 'Credit card',
      bank_slip: 'Bank slip',
      check: 'Check',
    },
    sentenceExpense: (amount: string, payment: string, date: string) => `Outflow of ${amount}${payment ? ` via ${payment}` : ''}${date ? ` on ${date}` : ''}.`,
    sentenceIncome: (amount: string, payment: string, date: string) => `Income of ${amount}${payment ? ` via ${payment}` : ''}${date ? ` on ${date}` : ''}.`,
    sentenceTransfer: (amount: string, date: string) => `Transfer of ${amount}${date ? ` on ${date}` : ''}.`,
    incomplete: 'Type, amount, or date is still missing. Correct it below before creating the draft.',
    transferNeedsAccounts: 'Transfers need source and destination accounts. Use the guided form to complete them safely.',
    noEffect: 'I will create only a draft. Nothing will be approved, reconciled, or posted automatically.',
    saveOffline: 'Save on this device',
    savedOffline: 'Saved on this device. When you are back online, you can create the draft.',
    create: 'Create draft',
    creating: 'Creating draft…',
    createError: 'Could not create it right now. Your text is still available.',
    offline: 'You are offline. Capture can be saved, but no final financial decision will be made offline.',
  },
  ES: {
    title: 'Escribir o hablar',
    body: 'Dilo como se lo dirías a una persona. Ej.: “Pagué R$ 150 por Pix hoy”.',
    placeholder: 'Ej.: Recibí R$ 500 de ofrenda por Pix hoy',
    interpret: 'Entender',
    speak: 'Hablar',
    listening: 'Escuchando…',
    speechUnavailable: 'Tu navegador no ofrece dictado aquí. Puedes escribir normalmente.',
    understood: 'Entendí esto',
    wrong: '¿Entendió mal?',
    closeCorrection: 'Cerrar corrección',
    direction: 'Tipo',
    expense: 'Salida',
    income: 'Entrada',
    transfer: 'Transferencia',
    unknown: 'No identificado',
    amount: 'Valor',
    date: 'Fecha',
    payment: 'Forma',
    paymentLabels: {
      cash: 'Efectivo',
      pix: 'Pix',
      bank_transfer: 'Transferencia bancaria',
      debit_card: 'Tarjeta de débito',
      credit_card: 'Tarjeta de crédito',
      bank_slip: 'Boleto',
      check: 'Cheque',
    },
    sentenceExpense: (amount: string, payment: string, date: string) => `Salida de ${amount}${payment ? ` vía ${payment}` : ''}${date ? ` el ${date}` : ''}.`,
    sentenceIncome: (amount: string, payment: string, date: string) => `Entrada de ${amount}${payment ? ` vía ${payment}` : ''}${date ? ` el ${date}` : ''}.`,
    sentenceTransfer: (amount: string, date: string) => `Transferencia de ${amount}${date ? ` el ${date}` : ''}.`,
    incomplete: 'Todavía falta tipo, valor o fecha. Corrígelo abajo antes de crear el borrador.',
    transferNeedsAccounts: 'Las transferencias necesitan cuenta de origen y destino. Usa el formulario guiado para completarlas con seguridad.',
    noEffect: 'Crearé solamente un borrador. Nada será aprobado, conciliado o contabilizado automáticamente.',
    saveOffline: 'Guardar en este dispositivo',
    savedOffline: 'Guardado en este dispositivo. Cuando vuelva internet, podrás crear el borrador.',
    create: 'Crear borrador',
    creating: 'Creando borrador…',
    createError: 'No fue posible crearlo ahora. Tu texto sigue disponible.',
    offline: 'Estás sin internet. La captura puede guardarse, pero ninguna decisión financiera final se hará offline.',
  },
} as const;

const PAYMENT_OPTIONS: Exclude<UniversalInputPaymentMethod, null>[] = [
  'cash',
  'pix',
  'bank_transfer',
  'debit_card',
  'credit_card',
  'bank_slip',
  'check',
];

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return candidate.SpeechRecognition || candidate.webkitSpeechRecognition || null;
}

function localDraftKey(organizationId: string, financeEntityId: string) {
  return `nestfinance_universal_text_v1:${organizationId}:${financeEntityId}`;
}

export function UniversalQuickTextEntry({ initialText = '' }: { initialText?: string }) {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const online = useOnlineStatus();
  const copy = COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const storageKey = organizationId && activeFinanceEntityId
    ? localDraftKey(organizationId, activeFinanceEntityId)
    : null;

  const [text, setText] = useState(initialText);
  const [interpreted, setInterpreted] = useState(false);
  const [direction, setDirection] = useState<UniversalInputDirection>(null);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [occurredAt, setOccurredAt] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<UniversalInputPaymentMethod>(null);
  const [correcting, setCorrecting] = useState(false);
  const [listening, setListening] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const recognitionRef = useRef<InstanceType<RecognitionConstructor> | null>(null);
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!storageKey || initialText) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.text === 'string') setText(parsed.text);
    } catch {
      // Local capture is best effort.
    }
  }, [initialText, storageKey]);

  useEffect(() => {
    if (initialText && initialText !== text) {
      setText(initialText);
      setInterpreted(false);
    }
    // Only incoming share content should reset interpretation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  useEffect(() => () => recognitionRef.current?.stop?.(), []);

  const interpret = (nextText = text) => {
    const result = parseUniversalTextIntent(nextText);
    setDirection(result.direction);
    setAmountCents(result.amountCents);
    setOccurredAt(result.occurredAt);
    setPaymentMethod(result.paymentMethod);
    setInterpreted(true);
    setCorrecting(false);
    setCreateError(false);
    setSavedOffline(false);
    attemptRef.current = null;
  };

  const Recognition = getRecognitionConstructor();
  const startSpeech = () => {
    if (!Recognition || listening) return;
    const recognition = new Recognition();
    recognition.lang = language === 'PT' ? 'pt-BR' : language === 'EN' ? 'en-US' : 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || '').trim();
      if (!transcript) return;
      setText(transcript);
      interpret(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const ready = Boolean(direction && direction !== 'transfer' && amountCents && amountCents > 0 && occurredAt);

  const amountLabel = amountCents
    ? formatReviewMoney(amountCents, language, 'BRL')
    : language === 'PT' ? 'valor pendente' : language === 'ES' ? 'valor pendiente' : 'amount pending';
  const dateLabel = occurredAt || '';
  const paymentLabel = paymentMethod ? copy.paymentLabels[paymentMethod] : '';
  const sentence = direction === 'expense'
    ? copy.sentenceExpense(amountLabel, paymentLabel, dateLabel)
    : direction === 'income'
      ? copy.sentenceIncome(amountLabel, paymentLabel, dateLabel)
      : direction === 'transfer'
        ? copy.sentenceTransfer(amountLabel, dateLabel)
        : copy.incomplete;

  const saveLocal = () => {
    if (!storageKey || !text.trim()) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ text: text.trim(), savedAt: Date.now() }));
      setSavedOffline(true);
    } catch {
      setCreateError(true);
    }
  };

  const createDraft = async () => {
    if (
      !ready ||
      !direction ||
      !amountCents ||
      !occurredAt ||
      !organizationId ||
      !activeFinanceEntityId ||
      creating ||
      !online
    ) return;

    const payload = {
      direction,
      amountCents,
      occurredAt,
      paymentMethod: paymentMethod || undefined,
      description: text.trim().slice(0, 180) || undefined,
      allocations: [],
      evidenceIds: [],
      sourceContext: 'universal_text',
    };
    const fingerprint = JSON.stringify(payload);
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = {
        fingerprint,
        key: `idem_${crypto.randomUUID().replaceAll('-', '')}`,
      };
    }

    setCreating(true);
    setCreateError(false);
    try {
      const result = await transactionsService.createDraft(
        organizationId,
        activeFinanceEntityId,
        payload,
        attemptRef.current.key,
        `req_${crypto.randomUUID().replaceAll('-', '')}`,
      );
      if (storageKey) localStorage.removeItem(storageKey);
      attemptRef.current = null;
      navigate(APP_ROUTES.transactionEdit.replace(':transactionId', result.transactionId));
    } catch {
      setCreateError(true);
      saveLocal();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">{copy.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.body}</p>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setInterpreted(false);
          setCreateError(false);
          setSavedOffline(false);
        }}
        maxLength={1000}
        rows={3}
        placeholder={copy.placeholder}
        className="mt-4 w-full rounded-2xl border border-border-subtle bg-surface-base p-4 text-base leading-relaxed text-text-primary outline-none focus:border-accent-primary"
      />

      <RecordedVoiceCapture
        onTranscript={(transcript) => {
          setText(transcript);
          interpret(transcript);
        }}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Button variant="secondary" disabled={!text.trim()} onClick={() => interpret()}>
          {copy.interpret}
        </Button>
        {Recognition ? (
          <Button variant="secondary" disabled={listening} onClick={startSpeech}>
            {listening ? copy.listening : copy.speak}
          </Button>
        ) : (
          <p className="self-center nf-helper-text text-text-muted">{copy.speechUnavailable}</p>
        )}
      </div>

      {interpreted ? (
        <div className="mt-5 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-5" aria-live="polite">
          <p className="nf-helper-text font-semibold uppercase tracking-[0.1em] text-text-muted">{copy.understood}</p>
          <p className="mt-2 text-lg font-semibold leading-relaxed text-text-primary">{sentence}</p>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            {direction === 'transfer' ? copy.transferNeedsAccounts : copy.noEffect}
          </p>
          <Button className="mt-4" variant="ghost" onClick={() => setCorrecting((value) => !value)}>
            {correcting ? copy.closeCorrection : copy.wrong}
          </Button>
        </div>
      ) : null}

      {correcting ? (
        <div className="mt-4 grid gap-4 rounded-2xl border border-border-subtle bg-surface-secondary/40 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <RecordedVoiceCapture
              mode="correction"
              onTranscript={(transcript) => {
                setText(transcript);
                interpret(transcript);
              }}
            />
          </div>
          <label>
            <span className="nf-helper-text font-semibold text-text-muted">{copy.direction}</span>
            <select
              value={direction || ''}
              onChange={(event) => {
                setDirection((event.target.value || null) as UniversalInputDirection);
                attemptRef.current = null;
              }}
              className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary"
            >
              <option value="">{copy.unknown}</option>
              <option value="expense">{copy.expense}</option>
              <option value="income">{copy.income}</option>
              <option value="transfer">{copy.transfer}</option>
            </select>
          </label>
          <label>
            <span className="nf-helper-text font-semibold text-text-muted">{copy.amount}</span>
            <input
              inputMode="decimal"
              value={amountCents ? (amountCents / 100).toFixed(2) : ''}
              onChange={(event) => {
                const numeric = Number(event.target.value.replace(',', '.'));
                setAmountCents(Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : null);
                attemptRef.current = null;
              }}
              className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary"
            />
          </label>
          <label>
            <span className="nf-helper-text font-semibold text-text-muted">{copy.date}</span>
            <input
              type="date"
              value={occurredAt || ''}
              onChange={(event) => {
                setOccurredAt(event.target.value || null);
                attemptRef.current = null;
              }}
              className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary"
            />
          </label>
          <label>
            <span className="nf-helper-text font-semibold text-text-muted">{copy.payment}</span>
            <select
              value={paymentMethod || ''}
              onChange={(event) => {
                setPaymentMethod((event.target.value || null) as UniversalInputPaymentMethod);
                attemptRef.current = null;
              }}
              className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary"
            >
              <option value="">{copy.unknown}</option>
              {PAYMENT_OPTIONS.map((method) => (
                <option key={method} value={method}>{copy.paymentLabels[method]}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {!online ? (
        <FlowFeedback tone="warning" title={copy.offline}>
          {savedOffline ? <p>{copy.savedOffline}</p> : null}
        </FlowFeedback>
      ) : null}
      {createError ? <FlowFeedback tone="error" title={copy.createError} /> : null}

      {interpreted ? (
        <div className="mt-5">
          {online ? (
            direction === 'transfer' ? (
              <Button size="lg" fullWidth onClick={() => navigate(APP_ROUTES.transactionCreate + '?type=transfer')}>
                {copy.transfer}
              </Button>
            ) : (
              <Button size="lg" fullWidth disabled={!ready || creating} onClick={() => void createDraft()}>
                {creating ? copy.creating : copy.create}
              </Button>
            )
          ) : (
            <Button size="lg" fullWidth disabled={!text.trim()} onClick={saveLocal}>
              {copy.saveOffline}
            </Button>
          )}
        </div>
      ) : null}
    </Surface>
  );
}
