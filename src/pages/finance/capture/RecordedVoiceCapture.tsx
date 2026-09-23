import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, FlowFeedback } from '@/src/components/foundation';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { voiceCaptureService } from '@/src/services/voiceCaptureService';
import {
  VOICE_CAPTURE_MAX_BYTES,
  VOICE_CAPTURE_MAX_DURATION_MS,
  VOICE_CAPTURE_MIME_TYPES,
} from '@/shared/finance/voiceTranscription';

const COPY = {
  PT: {
    title: 'Gravar voz',
    correctionTitle: 'Corrigir falando',
    body: 'Grave uma frase curta. Ex.: “Paguei cento e cinquenta reais no Pix hoje”.',
    start: 'Começar gravação',
    stop: 'Parar',
    recordAgain: 'Gravar de novo',
    listening: 'Gravando',
    playback: 'Ouça antes de enviar',
    consent: 'Autorizo enviar este áudio somente para transcrição. O NestFinance não guarda o áudio depois da resposta.',
    transcribe: 'Transcrever',
    transcribing: 'Transcrevendo…',
    unsupported: 'Este navegador não permite gravação de áudio aqui. Você ainda pode usar o ditado ou digitar.',
    offline: 'A transcrição precisa de internet. O áudio continua apenas neste aparelho enquanto esta tela estiver aberta.',
    limit: 'A gravação pode ter até 60 segundos e 1,5 MB.',
    tooLarge: 'O áudio ficou maior que o limite. Grave uma frase mais curta.',
    permission: 'Não foi possível acessar o microfone. Verifique a permissão e tente novamente.',
    failed: 'Não consegui transcrever agora. Seu áudio não foi usado para nenhuma decisão financeira.',
    privacy: 'Sem retenção de áudio no servidor. A transcrição ainda precisa da sua confirmação antes de criar qualquer rascunho.',
  },
  EN: {
    title: 'Record voice',
    correctionTitle: 'Correct by voice',
    body: 'Record a short sentence. Example: “I paid one hundred and fifty reais by Pix today”.',
    start: 'Start recording',
    stop: 'Stop',
    recordAgain: 'Record again',
    listening: 'Recording',
    playback: 'Listen before sending',
    consent: 'I authorize sending this audio only for transcription. NestFinance does not keep the audio after the response.',
    transcribe: 'Transcribe',
    transcribing: 'Transcribing…',
    unsupported: 'This browser cannot record audio here. You can still use dictation or type.',
    offline: 'Transcription needs internet. Audio stays only on this device while this screen is open.',
    limit: 'Recording is limited to 60 seconds and 1.5 MB.',
    tooLarge: 'The audio exceeded the limit. Record a shorter sentence.',
    permission: 'Microphone access failed. Check permission and try again.',
    failed: 'I could not transcribe it now. Your audio was not used for any financial decision.',
    privacy: 'No server audio retention. The transcript still needs your confirmation before any draft is created.',
  },
  ES: {
    title: 'Grabar voz',
    correctionTitle: 'Corregir hablando',
    body: 'Graba una frase corta. Ej.: “Pagué ciento cincuenta reales por Pix hoy”.',
    start: 'Comenzar grabación',
    stop: 'Parar',
    recordAgain: 'Grabar de nuevo',
    listening: 'Grabando',
    playback: 'Escucha antes de enviar',
    consent: 'Autorizo enviar este audio solo para transcripción. NestFinance no guarda el audio después de la respuesta.',
    transcribe: 'Transcribir',
    transcribing: 'Transcribiendo…',
    unsupported: 'Este navegador no permite grabar audio aquí. Aún puedes usar dictado o escribir.',
    offline: 'La transcripción necesita internet. El audio queda solo en este dispositivo mientras esta pantalla esté abierta.',
    limit: 'La grabación puede durar hasta 60 segundos y 1,5 MB.',
    tooLarge: 'El audio superó el límite. Graba una frase más corta.',
    permission: 'No se pudo acceder al micrófono. Revisa el permiso e inténtalo de nuevo.',
    failed: 'No pude transcribirlo ahora. Tu audio no se usó para ninguna decisión financiera.',
    privacy: 'Sin retención de audio en el servidor. La transcripción aún requiere tu confirmación antes de crear un borrador.',
  },
} as const;

function preferredMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return VOICE_CAPTURE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function RecordedVoiceCapture({
  onTranscript,
  mode = 'primary',
}: {
  onTranscript: (transcript: string) => void;
  mode?: 'primary' | 'correction';
}) {
  const { language } = useLanguage();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const online = useOnlineStatus();
  const copy = COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const mimeType = useMemo(preferredMime, []);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    try { recorderRef.current?.stop(); } catch {}
    cleanupStream();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const resetAudio = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl('');
    setBlob(null);
    setElapsedMs(0);
    setConsent(false);
    setError('');
  };

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const start = async () => {
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) return;
    resetAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        const durationMs = Math.min(VOICE_CAPTURE_MAX_DURATION_MS, Math.max(300, Date.now() - startedAtRef.current));
        const nextBlob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        setRecording(false);
        setElapsedMs(durationMs);
        cleanupStream();
        if (!nextBlob.size || nextBlob.size > VOICE_CAPTURE_MAX_BYTES) {
          setError(copy.tooLarge);
          return;
        }
        setBlob(nextBlob);
        setBlobUrl(URL.createObjectURL(nextBlob));
      };
      recorder.onerror = () => {
        setRecording(false);
        cleanupStream();
        setError(copy.failed);
      };
      startedAtRef.current = Date.now();
      setRecording(true);
      setElapsedMs(0);
      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        const next = Date.now() - startedAtRef.current;
        setElapsedMs(Math.min(next, VOICE_CAPTURE_MAX_DURATION_MS));
        if (next >= VOICE_CAPTURE_MAX_DURATION_MS) stop();
      }, 250);
    } catch {
      cleanupStream();
      setError(copy.permission);
    }
  };

  const transcribe = async () => {
    if (!blob || !consent || !online || !organizationId || !activeFinanceEntityId || transcribing) return;
    setTranscribing(true);
    setError('');
    try {
      const result = await voiceCaptureService.transcribe({
        organizationId,
        financeEntityId: activeFinanceEntityId,
        blob,
        durationMs: Math.max(300, elapsedMs),
        locale: language,
        consent: true,
      });
      onTranscript(result.transcript);
      resetAudio();
    } catch {
      setError(copy.failed);
    } finally {
      setTranscribing(false);
    }
  };

  if (!mimeType || typeof MediaRecorder === 'undefined') {
    return <p className="mt-3 nf-helper-text text-text-muted">{copy.unsupported}</p>;
  }

  const seconds = Math.ceil(elapsedMs / 1000);

  return (
    <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-secondary/35 p-4">
      <p className="text-base font-semibold text-text-primary">{mode === 'correction' ? copy.correctionTitle : copy.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-text-muted">{copy.body}</p>
      <p className="mt-1 nf-helper-text text-text-muted">{copy.limit}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!recording ? (
          <Button variant="secondary" onClick={blob ? resetAudio : start}>
            {blob ? copy.recordAgain : copy.start}
          </Button>
        ) : (
          <Button variant="secondary" onClick={stop}>{copy.stop}</Button>
        )}
        <span className="text-sm font-semibold tabular-nums text-text-primary" aria-live="polite">
          {recording ? `${copy.listening} · ` : ''}{seconds}s / 60s
        </span>
      </div>

      {blobUrl ? (
        <div className="mt-4">
          <p className="nf-helper-text font-semibold text-text-muted">{copy.playback}</p>
          <audio className="mt-2 w-full" controls preload="metadata" src={blobUrl} />
          <label className="mt-4 flex min-h-12 cursor-pointer items-start gap-3 text-sm leading-relaxed text-text-primary">
            <input
              className="mt-1 h-5 w-5"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>{copy.consent}</span>
          </label>
          <p className="mt-2 nf-helper-text text-text-muted">{copy.privacy}</p>
          {!online ? <FlowFeedback className="mt-3" tone="warning" title={copy.offline} /> : null}
          <Button className="mt-3 w-full sm:w-auto" disabled={!consent || !online || transcribing} onClick={transcribe}>
            {transcribing ? copy.transcribing : copy.transcribe}
          </Button>
        </div>
      ) : null}

      {error ? <FlowFeedback className="mt-3" tone="error" title={error} /> : null}
    </div>
  );
}
