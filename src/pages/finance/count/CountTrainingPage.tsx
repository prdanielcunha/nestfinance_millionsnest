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
    exerciseChoice: 'Escolha um treino',
    amountExercise: 'Treinar digitando',
    paperExercise: 'Conferir papel de exemplo',
    fictitiousPaper: 'Papel de exemplo • valores fictícios',
    paperBody: 'Leia o papel e informe os dois valores. A linha “Total” é apenas para conferir a soma: não é mais uma entrada.',
    controlTotal: 'Total escrito no papel',
    checkPaper: 'Conferi com o papel',
    paperCorrect: 'Conferiu! Dízimos e ofertas somam exatamente o total escrito no papel.',
    paperIncorrect: 'Os valores ainda não correspondem ao papel. Confira a linha de dízimos e a de ofertas antes de continuar.',
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
    exerciseChoice: 'Choose a practice task',
    amountExercise: 'Practice entering amounts',
    paperExercise: 'Review a sample note',
    fictitiousPaper: 'Sample paper • fictional values',
    paperBody: 'Read the note and enter both amounts. The Total line only checks the sum; it is not a third transaction.',
    controlTotal: 'Total written on paper',
    checkPaper: 'I checked against the paper',
    paperCorrect: 'It matches! Tithes and offerings add up to the written total.',
    paperIncorrect: 'The amounts do not match the note yet. Check both lines and try again.',
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
    exerciseChoice: 'Elige un ejercicio',
    amountExercise: 'Practicar escribiendo',
    paperExercise: 'Revisar un papel de ejemplo',
    fictitiousPaper: 'Papel de ejemplo • datos ficticios',
    paperBody: 'Lee el papel e informa ambos importes. El Total solo comprueba la suma; no es un tercer ingreso.',
    controlTotal: 'Total escrito en el papel',
    checkPaper: 'Lo comprobé con el papel',
    paperCorrect: '¡Coincide! Diezmos y ofrendas suman el total escrito.',
    paperIncorrect: 'Los importes aún no coinciden con el papel. Revisa ambas líneas.',
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
  const [exercise, setExercise] = useState<'amounts' | 'paper'>('amounts');
  const [paperValues, setPaperValues] = useState({ tithe: 0, offering: 0 });
  const [paperReviewed, setPaperReviewed] = useState(false);
  const paperTotal = paperValues.tithe + paperValues.offering;
  const paperMatches = paperValues.tithe === 35_000 && paperValues.offering === 12_000 && paperTotal === 47_000;


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

      <div role="group" aria-label={copy.exerciseChoice} className="grid gap-3 sm:grid-cols-2">
        <button type="button" aria-pressed={exercise === 'amounts'} onClick={() => setExercise('amounts')} className={`nf-interactive min-h-14 rounded-xl border px-4 py-3 text-base font-semibold ${exercise === 'amounts' ? 'border-accent-primary bg-accent-primary/10 text-text-primary' : 'border-border-strong text-text-secondary'}`}>{copy.amountExercise}</button>
        <button type="button" aria-pressed={exercise === 'paper'} onClick={() => setExercise('paper')} className={`nf-interactive min-h-14 rounded-xl border px-4 py-3 text-base font-semibold ${exercise === 'paper' ? 'border-accent-primary bg-accent-primary/10 text-text-primary' : 'border-border-strong text-text-secondary'}`}>{copy.paperExercise}</button>
      </div>

      {exercise === 'amounts' ? (
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
      ) : (
        <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-text-primary">{copy.paperExercise}</h2>
          <p className="mt-2 text-base leading-relaxed text-text-secondary">{copy.paperBody}</p>
          <div className="mt-5 rounded-xl border border-[#d8d4c9] bg-[#f6f4ef] px-5 py-5 text-[#17242c]" aria-label={copy.fictitiousPaper}>
            <p className="text-sm font-medium text-[#56696f]">{copy.fictitiousPaper}</p>
            <div className="mt-5 space-y-3 text-lg">
              <div className="flex justify-between gap-4"><span>{copy.tithe}</span><span className="tabular-nums">350,00</span></div>
              <div className="flex justify-between gap-4"><span>{copy.offering}</span><span className="tabular-nums">120,00</span></div>
              <div className="flex justify-between gap-4 border-t border-[#d8d4c9] pt-3 font-bold"><span>{copy.total}</span><span className="tabular-nums">470,00</span></div>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(['tithe', 'offering'] as const).map((field) => (
              <label key={field} className="block">
                <span className="text-base font-semibold text-text-primary">{copy[field]}</span>
                <div className="mt-2 flex min-h-14 items-center rounded-xl border border-border-subtle bg-surface-base px-4 focus-within:border-accent-primary">
                  <span className="mr-2 font-medium text-text-muted">R$</span>
                  <input inputMode="numeric" aria-label={copy[field]} value={(paperValues[field]/100).toLocaleString(language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={(event) => {
                    setPaperValues((current) => ({ ...current, [field]: centsFromInput(event.target.value) }));
                    setPaperReviewed(false);
                  }} className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tabular-nums text-text-primary outline-none" />
                </div>
              </label>
            ))}
          </div>
          <div className="mt-5 border-y border-border-subtle py-4">
            <p className="text-sm font-medium text-text-secondary">{copy.controlTotal}: <strong>{formatReviewMoney(47_000, language, 'BRL')}</strong></p>
            <p className="nf-financial-number mt-2 text-3xl font-semibold text-text-primary">{formatReviewMoney(paperTotal, language, 'BRL')}</p>
          </div>
          {paperReviewed ? <FlowFeedback tone={paperMatches ? 'success' : 'warning'} title={paperMatches ? copy.paperCorrect : copy.paperIncorrect} /> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" fullWidth onClick={() => { setPaperValues({ tithe: 0, offering: 0 }); setPaperReviewed(false); }}>{copy.reset}</Button>
            <Button size="lg" fullWidth onClick={() => setPaperReviewed(true)}>{copy.checkPaper}</Button>
          </div>
          <Button className="mt-4" variant="ghost" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.count)}>{copy.finish}</Button>
        </Surface>
      )}
    </div>
  );
}
