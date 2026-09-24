import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, FlowFeedback, FlowStepHeader, SpeakInstructionButton, Surface } from '@/src/components/foundation';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { formatReviewMoney } from '../transactions/transactionReviewModel';

const COPY = {
  PT: {
    eyebrow: 'Treino',
    step: 'Passo 1 de 1',
    title: 'Pratique uma contagem sem risco',
    body: 'Use estes dados fictícios para conhecer a tela. Nada sai deste aparelho e nenhuma informação real é alterada.',
    notice: 'Modo de treinamento',
    noticeBody: 'Os valores abaixo são fictícios. Este treino não chama nenhuma API financeira.',
    tithe: 'Dízimos',
    offering: 'Ofertas',
    other: 'Outras entradas',
    pix: 'Pix',
    amount: 'Valor',
    total: 'Total do treino',
    reset: 'Limpar treino',
    finish: 'Terminar treino',
    listen: 'Ouvir instrução',
    stop: 'Parar instrução',
  },
  EN: {
    eyebrow: 'Training',
    step: 'Step 1 of 1',
    title: 'Practice a count safely',
    body: 'Use this fake data to learn the screen. Nothing leaves this device and no real information changes.',
    notice: 'Training mode',
    noticeBody: 'The values below are fake. This practice does not call any finance API.',
    tithe: 'Tithes',
    offering: 'Offerings',
    other: 'Other income',
    pix: 'Pix',
    amount: 'Amount',
    total: 'Training total',
    reset: 'Reset training',
    finish: 'Finish training',
    listen: 'Listen to instruction',
    stop: 'Stop instruction',
  },
  ES: {
    eyebrow: 'Entrenamiento',
    step: 'Paso 1 de 1',
    title: 'Practica un conteo sin riesgo',
    body: 'Usa estos datos ficticios para conocer la pantalla. Nada sale de este dispositivo y ningún dato real cambia.',
    notice: 'Modo de entrenamiento',
    noticeBody: 'Los valores de abajo son ficticios. Este entrenamiento no llama ninguna API financiera.',
    tithe: 'Diezmos',
    offering: 'Ofrendas',
    other: 'Otras entradas',
    pix: 'Pix',
    amount: 'Valor',
    total: 'Total del entrenamiento',
    reset: 'Limpiar entrenamiento',
    finish: 'Terminar entrenamiento',
    listen: 'Escuchar instrucción',
    stop: 'Detener instrucción',
  },
} as const;

type Field = 'tithe' | 'offering' | 'other' | 'pix';

function centsFromInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return Number.parseInt(digits || '0', 10) || 0;
}

export default function CountTrainingPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COPY[language];
  const [values, setValues] = useState<Record<Field, number>>({
    tithe: 0,
    offering: 0,
    other: 0,
    pix: 0,
  });

  const total = useMemo(
    () => (Object.values(values) as number[]).reduce((sum, value) => sum + value, 0),
    [values],
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-24">
      <FlowStepHeader
        currentStep={1}
        totalSteps={1}
        eyebrow={copy.eyebrow}
        title={copy.title}
        stepLabel={copy.step}
        description={copy.body}
      />

      <SpeakInstructionButton
        text={copy.body}
        language={language}
        label={copy.listen}
        stopLabel={copy.stop}
        className="self-start"
      />

      <FlowFeedback tone="info" title={copy.notice}>
        <p>{copy.noticeBody}</p>
      </FlowFeedback>

      <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(values) as Field[]).map((field) => (
            <label key={field} className="block">
              <span className="font-semibold text-text-primary">{copy[field]}</span>
              <span className="nf-helper-text ml-2 text-text-muted">{copy.amount}</span>
              <div className="mt-2 flex min-h-14 items-center rounded-xl border border-border-subtle bg-surface-base px-4 focus-within:border-accent-primary">
                <span className="mr-2 font-semibold text-text-muted">R$</span>
                <input
                  inputMode="numeric"
                  aria-label={copy[field]}
                  value={(values[field] / 100).toLocaleString(
                    language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR',
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  )}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field]: centsFromInput(event.target.value),
                    }))
                  }
                  className="min-w-0 flex-1 bg-transparent text-xl font-semibold text-text-primary outline-none"
                />
              </div>
            </label>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-5 text-center">
          <p className="nf-helper-text font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.total}</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums text-text-primary">
            {formatReviewMoney(total, language, 'BRL')}
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => setValues({ tithe: 0, offering: 0, other: 0, pix: 0 })}
          >
            {copy.reset}
          </Button>
          <Button size="lg" fullWidth onClick={() => navigate(APP_ROUTES.count)}>
            {copy.finish}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
