import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import {
  Button,
  FlowFeedback,
  FlowHelp,
  FlowStepHeader,
  SpeakInstructionButton,
  Surface,
} from '@/src/components/foundation';
import type { Language } from '@/src/contexts/LanguageContext';
import type { CountSessionListItem } from '@/src/services/countService';

export type CountStartMode = 'digital' | 'free_form' | 'paper' | 'voice';

type Props = {
  language: Language;
  entityName: string | null;
  items: CountSessionListItem[];
  creating: boolean;
  createError: boolean;
  onStart: (input: {
    serviceLabel: string;
    serviceDate: string;
    mode: CountStartMode;
  }) => Promise<void> | void;
};

type JourneyStep = 'context' | 'details' | 'method';
type ContextChoice = 'today' | 'other';

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

const COPY = {
  PT: {
    contextTitle: 'O que você quer fazer agora?',
    contextBody: 'Escolha uma opção. O NestFinance cuida do restante passo a passo.',
    today: 'Contar o culto de hoje',
    todayBody: 'A igreja e a data já serão preenchidas.',
    other: 'Contar outro culto ou evento',
    otherBody: 'Você informa apenas o nome e a data.',
    continue: 'Continuar uma contagem',
    continueBody: 'Retome exatamente de onde parou.',
    training: 'Treinar sem mexer em dados reais',
    trainingBody: 'Pratique com valores fictícios. Nada será salvo.',
    detailsTitle: 'Confira o culto',
    detailsTodayBody: 'Já preenchemos o que sabemos. Se estiver certo, continue.',
    detailsOtherBody: 'Informe só estes dois dados para começar.',
    church: 'Igreja',
    service: 'Culto ou evento',
    servicePlaceholder: 'Ex.: Culto de domingo',
    date: 'Data',
    todayLabel: 'Culto de hoje',
    next: 'Continuar',
    back: 'Voltar',
    methodTitle: 'Como você quer contar?',
    methodBody: 'Escolha o jeito mais confortável. Você poderá revisar tudo antes de avançar.',
    phone: 'No celular',
    phoneBody: 'Conte cédulas e moedas ou informe os totais.',
    photo: 'Fotografar meu papel',
    photoBody: 'Use uma folha ou caderno que você já preencheu.',
    sheet: 'Folha do NestFinance',
    sheetBody: 'Crie a folha oficial do NestFinance para imprimir e preencher.',
    filledSheet: 'Já tenho uma folha oficial preenchida',
    voice: 'Falar os valores',
    voiceBody: 'Dite um valor por vez. Se o navegador não ouvir, você pode digitar.',
    listen: 'Ouvir instrução',
    stopListening: 'Parar instrução',
    helpOpen: 'Preciso de ajuda',
    helpClose: 'Fechar ajuda',
    startErrorTitle: 'Não foi possível iniciar agora',
    startErrorBody: 'Seus dados não foram perdidos. Confira a internet e tente novamente.',
    step: (value: number) => `Passo ${value} de 3`,
  },
  EN: {
    contextTitle: 'What do you want to do now?',
    contextBody: 'Choose one option. NestFinance guides the rest step by step.',
    today: 'Count today’s service',
    todayBody: 'The church and date are filled in for you.',
    other: 'Count another service or event',
    otherBody: 'You only enter the name and date.',
    continue: 'Continue a count',
    continueBody: 'Resume exactly where you stopped.',
    training: 'Practice without real data',
    trainingBody: 'Practice with fake values. Nothing is saved.',
    detailsTitle: 'Check the service',
    detailsTodayBody: 'We filled in what we know. Continue if it looks right.',
    detailsOtherBody: 'Enter only these two details to start.',
    church: 'Church',
    service: 'Service or event',
    servicePlaceholder: 'Example: Sunday service',
    date: 'Date',
    todayLabel: 'Today’s service',
    next: 'Continue',
    back: 'Back',
    methodTitle: 'How do you want to count?',
    methodBody: 'Choose the most comfortable way. You can review everything before moving on.',
    phone: 'On the phone',
    phoneBody: 'Count notes and coins or enter totals.',
    photo: 'Photograph my paper',
    photoBody: 'Use a sheet or notebook you already filled in.',
    sheet: 'NestFinance sheet',
    sheetBody: 'Create the official NestFinance sheet to print and fill in.',
    filledSheet: 'I already have a completed official sheet',
    voice: 'Speak the amounts',
    voiceBody: 'Dictate one amount at a time. If the browser cannot listen, you can type.',
    listen: 'Listen to instruction',
    stopListening: 'Stop instruction',
    helpOpen: 'I need help',
    helpClose: 'Close help',
    startErrorTitle: 'Could not start right now',
    startErrorBody: 'Your data was not lost. Check your connection and try again.',
    step: (value: number) => `Step ${value} of 3`,
  },
  ES: {
    contextTitle: '¿Qué quieres hacer ahora?',
    contextBody: 'Elige una opción. NestFinance guía el resto paso a paso.',
    today: 'Contar el culto de hoy',
    todayBody: 'La iglesia y la fecha se completan automáticamente.',
    other: 'Contar otro culto o evento',
    otherBody: 'Solo informas el nombre y la fecha.',
    continue: 'Continuar un conteo',
    continueBody: 'Retoma exactamente donde te detuviste.',
    training: 'Practicar sin datos reales',
    trainingBody: 'Practica con valores ficticios. Nada se guarda.',
    detailsTitle: 'Revisa el culto',
    detailsTodayBody: 'Completamos lo que sabemos. Continúa si está correcto.',
    detailsOtherBody: 'Informa solo estos dos datos para comenzar.',
    church: 'Iglesia',
    service: 'Culto o evento',
    servicePlaceholder: 'Ej.: Culto del domingo',
    date: 'Fecha',
    todayLabel: 'Culto de hoy',
    next: 'Continuar',
    back: 'Volver',
    methodTitle: '¿Cómo quieres contar?',
    methodBody: 'Elige la forma más cómoda. Podrás revisar todo antes de avanzar.',
    phone: 'En el celular',
    phoneBody: 'Cuenta billetes y monedas o informa los totales.',
    photo: 'Fotografiar mi papel',
    photoBody: 'Usa una hoja o cuaderno que ya hayas llenado.',
    sheet: 'Hoja de NestFinance',
    sheetBody: 'Crea la hoja oficial de NestFinance para imprimir y completar.',
    filledSheet: 'Ya tengo una hoja oficial completada',
    voice: 'Hablar los valores',
    voiceBody: 'Dicta un valor por vez. Si el navegador no puede escuchar, puedes escribir.',
    listen: 'Escuchar instrucción',
    stopListening: 'Detener instrucción',
    helpOpen: 'Necesito ayuda',
    helpClose: 'Cerrar ayuda',
    startErrorTitle: 'No fue posible comenzar ahora',
    startErrorBody: 'Tus datos no se perdieron. Revisa la conexión e inténtalo de nuevo.',
    step: (value: number) => `Paso ${value} de 3`,
  },
} as const;

const ACTIVE_STATUSES = new Set(['counting_a', 'counting_b', 'divergent', 'recounting']);

function Option({
  title,
  body,
  onClick,
  emphasis = false,
}: {
  title: string;
  body: string;
  onClick: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`nf-interactive min-h-[6.5rem] rounded-2xl border p-5 text-left ${
        emphasis
          ? 'border-accent-primary/40 bg-accent-primary/10'
          : 'border-border-subtle bg-surface-elevated hover:border-border-strong'
      }`}
    >
      <span className="block text-lg font-semibold text-text-primary">{title}</span>
      <span className="mt-1 block leading-relaxed text-text-secondary">{body}</span>
    </button>
  );
}

export function CountStartJourney({
  language,
  entityName,
  items,
  creating,
  createError,
  onStart,
}: Props) {
  const navigate = useNavigate();
  const copy = COPY[language];
  const [step, setStep] = useState<JourneyStep>('context');
  const [contextChoice, setContextChoice] = useState<ContextChoice>('today');
  const [serviceLabel, setServiceLabel] = useState(copy.todayLabel);
  const [serviceDate, setServiceDate] = useState(localDateInputValue());

  const resumable = useMemo(
    () => items.find((item) => ACTIVE_STATUSES.has(item.status)),
    [items],
  );

  const stepNumber = step === 'context' ? 1 : step === 'details' ? 2 : 3;
  const title =
    step === 'context'
      ? copy.contextTitle
      : step === 'details'
        ? copy.detailsTitle
        : copy.methodTitle;
  const description =
    step === 'context'
      ? copy.contextBody
      : step === 'details'
        ? contextChoice === 'today'
          ? copy.detailsTodayBody
          : copy.detailsOtherBody
        : copy.methodBody;

  const chooseContext = (choice: ContextChoice) => {
    setContextChoice(choice);
    if (choice === 'today') {
      setServiceLabel(copy.todayLabel);
      setServiceDate(localDateInputValue());
    } else {
      setServiceLabel('');
      setServiceDate(localDateInputValue());
    }
    setStep('details');
  };

  const start = async (mode: CountStartMode) => {
    await onStart({
      serviceLabel: serviceLabel.trim(),
      serviceDate,
      mode,
    });
  };

  return (
    <Surface variant="glass" radius="xl" className="p-5 sm:p-6">
      <FlowStepHeader
        currentStep={stepNumber}
        totalSteps={3}
        title={title}
        stepLabel={copy.step(stepNumber)}
        description={description}
      />

      <div className="mt-4 flex justify-start">
        <SpeakInstructionButton
          text={description}
          language={language}
          label={copy.listen}
          stopLabel={copy.stopListening}
        />
      </div>

      {createError ? (
        <FlowFeedback tone="error" title={copy.startErrorTitle} className="mt-4">
          <p>{copy.startErrorBody}</p>
        </FlowFeedback>
      ) : null}

      {step === 'context' ? (
        <div className="mt-6 grid gap-3">
          {resumable ? (
            <Option
              emphasis
              title={copy.continue}
              body={`${resumable.serviceLabel} · ${resumable.serviceDate}`}
              onClick={() =>
                navigate(APP_ROUTES.countSession.replace(':sessionId', resumable.id))
              }
            />
          ) : null}
          <Option title={copy.today} body={copy.todayBody} onClick={() => chooseContext('today')} />
          <Option title={copy.other} body={copy.otherBody} onClick={() => chooseContext('other')} />
          <Option
            title={copy.training}
            body={copy.trainingBody}
            onClick={() => navigate(APP_ROUTES.countTraining)}
          />
        </div>
      ) : null}

      {step === 'details' ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-border-subtle bg-surface-secondary/60 p-4">
            <p className="nf-helper-text font-semibold uppercase tracking-[0.12em] text-text-muted">
              {copy.church}
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {entityName || '—'}
            </p>
          </div>
          <label className="block">
            <span className="font-medium text-text-primary">{copy.service}</span>
            <input
              value={serviceLabel}
              maxLength={120}
              readOnly={contextChoice === 'today'}
              onChange={(event) => setServiceLabel(event.target.value)}
              placeholder={copy.servicePlaceholder}
              className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary read-only:bg-surface-secondary"
            />
          </label>
          <label className="block">
            <span className="font-medium text-text-primary">{copy.date}</span>
            <input
              type="date"
              value={serviceDate}
              readOnly={contextChoice === 'today'}
              onChange={(event) => setServiceDate(event.target.value)}
              className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary read-only:bg-surface-secondary"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" fullWidth onClick={() => setStep('context')}>
              {copy.back}
            </Button>
            <Button
              size="lg"
              fullWidth
              disabled={!serviceLabel.trim() || !serviceDate}
              onClick={() => setStep('method')}
            >
              {copy.next}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <FlowHelp
          title={title}
          openLabel={copy.helpOpen}
          closeLabel={copy.helpClose}
        >
          <p>{description}</p>
        </FlowHelp>
      </div>

      {step === 'method' ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Option
            emphasis
            title={copy.phone}
            body={copy.phoneBody}
            onClick={() => void start('digital')}
          />
          <Option
            title={copy.photo}
            body={copy.photoBody}
            onClick={() => void start('free_form')}
          />
          <Option
            title={copy.sheet}
            body={copy.sheetBody}
            onClick={() => void start('paper')}
          />
          <Option
            title={copy.voice}
            body={copy.voiceBody}
            onClick={() => void start('voice')}
          />
          <button
            type="button"
            onClick={() => navigate(APP_ROUTES.countCapture)}
            className="nf-interactive min-h-[3.25rem] rounded-xl px-4 text-left font-semibold text-accent-primary sm:col-span-2"
          >
            {copy.filledSheet}
          </button>
          <div className="sm:col-span-2">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              disabled={creating}
              onClick={() => setStep('details')}
            >
              {copy.back}
            </Button>
          </div>
          {creating ? (
            <p className="sm:col-span-2 text-center text-text-secondary" role="status" aria-live="polite">
              …
            </p>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}
