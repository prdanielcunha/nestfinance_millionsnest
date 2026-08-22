import { useRef, useState } from 'react';
import { ScanText, ShieldCheck } from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import type { Language } from '@/src/contexts/LanguageContext';
import { countCaptureService, type CountCaptureDetail } from '@/src/services/countCaptureService';
import { prepareCountCaptureExtractionRegions } from './countCaptureExtractionImage';
import { CountCaptureDenominationReviewPanel } from './CountCaptureDenominationReviewPanel';

const COPY: Record<Language, { title: string; body: string; action: string; working: string; unavailable: string; failed: string }> = {
  PT: {
    title: 'Leitura assistida',
    body: 'O NestFinance pode sugerir os quatro valores usando somente os trechos necessários da folha. Nada é aprovado ou lançado: você continua responsável por conferir cada campo.',
    action: 'Sugerir valores da imagem',
    working: 'Lendo trechos da folha…',
    unavailable: 'A leitura assistida ainda não está habilitada neste ambiente. Você pode continuar a conferência manual normalmente.',
    failed: 'Não foi possível gerar sugestões agora. A imagem e os valores existentes não foram alterados.',
  },
  EN: {
    title: 'Assisted reading',
    body: 'NestFinance can suggest the four values using only the required sheet regions. Nothing is approved or posted: you remain responsible for checking every field.',
    action: 'Suggest values from image',
    working: 'Reading sheet regions…',
    unavailable: 'Assisted reading is not enabled in this environment yet. You can continue the manual review normally.',
    failed: 'Suggestions could not be generated now. The image and existing values were not changed.',
  },
  ES: {
    title: 'Lectura asistida',
    body: 'NestFinance puede sugerir los cuatro valores usando solo las regiones necesarias de la hoja. Nada se aprueba ni registra: tú sigues siendo responsable de revisar cada campo.',
    action: 'Sugerir valores de la imagen',
    working: 'Leyendo regiones de la hoja…',
    unavailable: 'La lectura asistida todavía no está habilitada en este entorno. Puedes continuar la revisión manual normalmente.',
    failed: 'No fue posible generar sugerencias ahora. La imagen y los valores existentes no fueron modificados.',
  },
};

function token(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function CountCaptureExtractionPanel({
  capture,
  organizationId,
  financeEntityId,
  language,
  canEdit,
  onExtracted,
}: {
  capture: CountCaptureDetail;
  organizationId: string;
  financeEntityId: string;
  language: Language;
  canEdit: boolean;
  onExtracted: () => Promise<void> | void;
}) {
  const copy = COPY[language];
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<'unavailable' | 'failed' | null>(null);
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const eligible = canEdit && capture.status === 'captured' && !capture.materialHidden && !capture.extraction &&
    capture.normalization?.geometry?.mode !== 'full_frame' && Boolean(capture.normalizedUrl && capture.normalizedSha256);

  const run = async () => {
    if (!eligible || working || !capture.normalizedSha256) return;
    const fingerprint = `${capture.id}|${capture.version}|${capture.normalizedSha256}`;
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, key: token('idcountcapture_extract') };
    }
    setWorking(true);
    setMessage(null);
    try {
      const regions = await prepareCountCaptureExtractionRegions(capture);
      await countCaptureService.extractCandidates(organizationId, financeEntityId, {
        captureId: capture.id,
        expectedVersion: capture.version,
        normalizedSha256: capture.normalizedSha256,
        regions,
        idempotencyKey: attemptRef.current.key,
        requestId: token('req'),
      });
      attemptRef.current = null;
      await onExtracted();
    } catch (error: any) {
      const code = String(error?.code || error?.message || '');
      setMessage(code === 'COUNT_CAPTURE_EXTRACTION_UNAVAILABLE' ? 'unavailable' : 'failed');
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      {eligible ? (
        <Surface variant="secondary" radius="lg" className="border-accent-primary/15 bg-accent-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ScanText className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-text-primary">{copy.title}</h2><ShieldCheck className="h-4 w-4 text-text-muted" aria-hidden="true" /></div>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.body}</p>
              {message ? <p className="mt-3 text-xs leading-relaxed text-text-secondary" role="status">{copy[message]}</p> : null}
              <Button className="mt-4" variant="secondary" fullWidth disabled={working} onClick={() => void run()}>
                {working ? copy.working : copy.action}
              </Button>
            </div>
          </div>
        </Surface>
      ) : null}
      <CountCaptureDenominationReviewPanel
        capture={capture}
        organizationId={organizationId}
        financeEntityId={financeEntityId}
        language={language}
        canEdit={canEdit}
        onUpdated={onExtracted}
      />
    </>
  );
}
