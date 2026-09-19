import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Camera, FileImage, RotateCcw, RotateCw, ShieldCheck, ShieldX, Upload } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countCaptureService } from '@/src/services/countCaptureService';
import { countService } from '@/src/services/countService';
import {
  COUNT_CAPTURE_ORIGINAL_MAX_BYTES,
  isSupportedCountCaptureOriginalType,
} from '@/shared/finance/countCapture';
import {
  disposePreparedCountCaptureImage,
  nextCountCaptureRotation,
  prepareCountCaptureImage,
  type PreparedCountCaptureImage,
} from './countCaptureImage';

const COPY: Record<Language, any> = {
  PT: {
    area: 'Contagem por papel',
    title: 'Fotografe o papel que você já usa',
    subtitle: 'Pode ser caderno, folha comum ou anotação impressa. Não precisa ser a Folha Count.',
    explanation: 'O NestFinance tenta localizar Dízimos, Ofertas, Outras entradas e Pix na imagem inteira. Ele não soma números soltos nem inventa categorias.',
    camera: 'Tirar foto',
    photo: 'Escolher foto',
    replace: 'Trocar foto',
    rotateLeft: 'Girar para a esquerda',
    rotateRight: 'Girar para a direita',
    usePhoto: 'Usar esta foto',
    sending: 'Salvando o original…',
    preparing: 'Preparando imagem…',
    invalidImage: 'Escolha uma foto JPEG, PNG, WebP ou HEIC dentro do limite permitido.',
    error: 'Não foi possível salvar esta foto. Nada da contagem foi alterado.',
    accessDenied: 'Você não tem permissão para registrar esta contagem.',
    sessionClosed: 'Esta contagem não está numa etapa que aceita uma nova foto.',
    lowerProvenance: 'Papel livre não tem QR nem identidade da Folha Count. O original será preservado e você precisará conferir todos os valores antes de usá-los.',
    noPosting: 'A foto e a leitura não criam lançamento financeiro nem alteram saldo.',
    back: 'Voltar',
  },
  EN: {
    area: 'Paper count',
    title: 'Photograph the paper you already use',
    subtitle: 'It can be a notebook, plain sheet or printed note. It does not need to be the official Count Sheet.',
    explanation: 'NestFinance looks for Tithes, Offerings, Other income and Pix across the full image. It does not add loose numbers or invent categories.',
    camera: 'Take photo',
    photo: 'Choose photo',
    replace: 'Replace photo',
    rotateLeft: 'Rotate left',
    rotateRight: 'Rotate right',
    usePhoto: 'Use this photo',
    sending: 'Preserving original…',
    preparing: 'Preparing image…',
    invalidImage: 'Choose a JPEG, PNG, WebP or HEIC photo within the allowed limit.',
    error: 'This photo could not be saved. Nothing in the count was changed.',
    accessDenied: 'You do not have permission to record this count.',
    sessionClosed: 'This count is not in a stage that accepts a new photo.',
    lowerProvenance: 'Free-form paper has no QR or official Count Sheet identity. The original is preserved and you must check every value before using it.',
    noPosting: 'The photo and assisted reading do not create a financial posting or change balances.',
    back: 'Back',
  },
  ES: {
    area: 'Conteo por papel',
    title: 'Fotografía el papel que ya usas',
    subtitle: 'Puede ser un cuaderno, hoja común o anotación impresa. No necesita ser la Hoja Count oficial.',
    explanation: 'NestFinance busca Diezmos, Ofrendas, Otros ingresos y Pix en toda la imagen. No suma números sueltos ni inventa categorías.',
    camera: 'Tomar foto',
    photo: 'Elegir foto',
    replace: 'Cambiar foto',
    rotateLeft: 'Girar a la izquierda',
    rotateRight: 'Girar a la derecha',
    usePhoto: 'Usar esta foto',
    sending: 'Guardando el original…',
    preparing: 'Preparando imagen…',
    invalidImage: 'Elige una foto JPEG, PNG, WebP o HEIC dentro del límite permitido.',
    error: 'No fue posible guardar esta foto. Nada del conteo fue modificado.',
    accessDenied: 'No tienes permiso para registrar este conteo.',
    sessionClosed: 'Este conteo no está en una etapa que acepte una nueva foto.',
    lowerProvenance: 'El papel libre no tiene QR ni identidad de la Hoja Count oficial. El original se conserva y debes revisar todos los valores antes de usarlos.',
    noPosting: 'La foto y la lectura asistida no crean un asiento financiero ni cambian saldos.',
    back: 'Volver',
  },
};

function token(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export default function CountFreeFormCapturePage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];
  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') return null;
  if (!hasEffectiveCapability(accessState, 'finance.create_drafts')) {
    return <main className="flex flex-1 items-center justify-center p-8 text-center"><div><ShieldX className="mx-auto h-10 w-10 text-semantic-danger" /><p className="mt-4 text-sm text-text-muted">{copy.accessDenied}</p></div></main>;
  }
  return <FinanceContextGuard><Content /></FinanceContextGuard>;
}

function Content() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const inputRef = useRef<HTMLInputElement>(null);
  const preparedRef = useRef<PreparedCountCaptureImage | null>(null);
  const [prepared, setPrepared] = useState<PreparedCountCaptureImage | null>(null);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<'invalid' | 'send' | 'closed' | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const attemptRef = useRef<{ fingerprint: string; start: string; finalize: string } | null>(null);

  const replacePrepared = (next: PreparedCountCaptureImage | null) => {
    if (preparedRef.current && preparedRef.current !== next) disposePreparedCountCaptureImage(preparedRef.current);
    preparedRef.current = next;
    setPrepared(next);
  };

  useEffect(() => {
    let cancelled = false;
    setSessionReady(false);
    setError(null);
    if (!organizationId || !activeFinanceEntityId || !sessionId) return;
    void countService.detail(organizationId, activeFinanceEntityId, sessionId)
      .then(({ session }) => {
        if (cancelled) return;
        if (session.status !== 'counting_a' && session.status !== 'counting_b') {
          setError('closed');
          return;
        }
        setSessionReady(true);
      })
      .catch(() => { if (!cancelled) setError('closed'); });
    return () => {
      cancelled = true;
      if (preparedRef.current) disposePreparedCountCaptureImage(preparedRef.current);
      preparedRef.current = null;
    };
  }, [organizationId, activeFinanceEntityId, sessionId]);

  const prepare = async (file: File, nextRotation: 0 | 90 | 180 | 270) => {
    if (!isSupportedCountCaptureOriginalType(file.type) || file.size <= 0 || file.size > COUNT_CAPTURE_ORIGINAL_MAX_BYTES) {
      setError('invalid');
      return;
    }
    setPreparing(true);
    setError(null);
    try {
      const next = await prepareCountCaptureImage(file, { rotationDegrees: nextRotation, forceFullFrame: true });
      replacePrepared(next);
      setRotation(nextRotation);
      setSourceFile(file);
      attemptRef.current = null;
    } catch {
      setError('invalid');
    } finally {
      setPreparing(false);
    }
  };

  const choose = (camera: boolean) => {
    if (!inputRef.current) return;
    if (camera) inputRef.current.setAttribute('capture', 'environment');
    else inputRef.current.removeAttribute('capture');
    inputRef.current.click();
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.currentTarget.value = '';
    if (file) await prepare(file, 0);
  };

  const rotate = async (direction: 'left' | 'right') => {
    if (!sourceFile || preparing || sending) return;
    await prepare(sourceFile, nextCountCaptureRotation(rotation, direction));
  };

  const send = async () => {
    if (!prepared || !sourceFile || !organizationId || !activeFinanceEntityId || !sessionId || sending || !sessionReady) return;
    const fingerprint = [sessionId, prepared.originalSha256, prepared.normalizedSha256, rotation].join('|');
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = {
        fingerprint,
        start: token('idcountfreeform_start'),
        finalize: token('idcountfreeform_finalize'),
      };
    }
    setSending(true);
    setError(null);
    try {
      const started = await countCaptureService.startFreeForm(organizationId, activeFinanceEntityId, {
        countSessionId: sessionId,
        locale: language,
        originalContentType: sourceFile.type,
        originalSize: sourceFile.size,
        originalSha256: prepared.originalSha256,
        normalizedContentType: prepared.normalized.type,
        normalizedSize: prepared.normalized.size,
        normalizedSha256: prepared.normalizedSha256,
        idempotencyKey: attemptRef.current.start,
        requestId: token('req'),
      });
      await Promise.all([
        countCaptureService.upload(started.originalUpload, sourceFile),
        countCaptureService.upload(started.normalizedUpload, prepared.normalized),
      ]);
      const finalized = await countCaptureService.finalizeFreeForm(organizationId, activeFinanceEntityId, {
        captureId: started.captureId,
        expectedVersion: started.version,
        normalization: prepared.normalization,
        idempotencyKey: attemptRef.current.finalize,
        requestId: token('req'),
      });
      attemptRef.current = null;
      navigate(APP_ROUTES.countCaptureReview.replace(':captureId', finalized.canonicalCaptureId));
    } catch {
      setError('send');
    } finally {
      setSending(false);
    }
  };

  return <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
    <FinanceEntityContextBar areaName={copy.area} />
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex items-start gap-3">
          <Button variant="ghost" className="!min-h-12 !w-12 !px-0" aria-label={copy.back} onClick={() => navigate(APP_ROUTES.countSession.replace(':sessionId', sessionId))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="pt-1"><h1 className="text-2xl font-semibold text-text-primary">{copy.title}</h1><p className="mt-2 text-sm leading-relaxed text-text-muted">{copy.subtitle}</p></div>
        </header>

        <Surface variant="secondary" radius="xl" className="border-accent-primary/15 bg-accent-primary/5 p-5">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" /><div><p className="text-sm font-medium text-text-primary">{copy.explanation}</p><p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.lowerProvenance}</p><p className="mt-2 text-xs leading-relaxed text-text-muted">{copy.noPosting}</p></div></div>
        </Surface>

        {error === 'closed' ? <Surface variant="elevated" radius="xl" className="p-6 text-center text-sm text-text-muted">{copy.sessionClosed}</Surface> : null}

        {sessionReady ? (
          !prepared ? (
            <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button size="lg" fullWidth onClick={() => choose(true)} disabled={preparing}>
                  <Camera className="h-5 w-5" aria-hidden="true" />{copy.camera}
                </Button>
                <Button size="lg" variant="secondary" fullWidth onClick={() => choose(false)} disabled={preparing}>
                  <FileImage className="h-5 w-5" aria-hidden="true" />{copy.photo}
                </Button>
              </div>
              {preparing ? <p className="mt-4 text-center text-sm text-text-muted">{copy.preparing}</p> : null}
              {error === 'invalid' ? <p className="mt-4 text-sm font-medium text-semantic-danger" role="alert">{copy.invalidImage}</p> : null}
            </Surface>
          ) : (
            <Surface variant="elevated" radius="xl" className="p-4 sm:p-5">
              <img src={prepared.normalizedPreviewUrl} alt="" className="max-h-[62vh] w-full rounded-xl bg-white object-contain" />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Button variant="ghost" onClick={() => void rotate('left')} disabled={preparing || sending}><RotateCcw className="h-4 w-4" />{copy.rotateLeft}</Button>
                <Button variant="ghost" onClick={() => void rotate('right')} disabled={preparing || sending}><RotateCw className="h-4 w-4" />{copy.rotateRight}</Button>
                <Button variant="secondary" onClick={() => choose(false)} disabled={preparing || sending}>{copy.replace}</Button>
              </div>
              {error === 'send' ? <p className="mt-4 text-sm font-medium text-semantic-danger" role="alert">{copy.error}</p> : null}
              <Button className="mt-5" size="lg" fullWidth onClick={() => void send()} disabled={preparing || sending}>
                <Upload className="h-5 w-5" aria-hidden="true" />{sending ? copy.sending : copy.usePhoto}
              </Button>
            </Surface>
          )
        ) : null}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(event) => void onFile(event)} />
      </div>
    </div>
  </div>;
}
