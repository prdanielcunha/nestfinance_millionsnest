import { useEffect, useRef, useState } from 'react';
import { ScanText, ShieldCheck } from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import type { Language } from '@/src/contexts/LanguageContext';
import { countCaptureService, type CountCaptureDetail } from '@/src/services/countCaptureService';
import { prepareCountCaptureExtractionRegions } from './countCaptureExtractionImage';
import { CountCaptureDenominationReviewPanel } from './CountCaptureDenominationReviewPanel';

const COPY: Record<Language, { title: string; body: string; freeFormBody: string; action: string; freeFormWorking: string; working: string; unavailable: string; failed: string; details: string; detailsBody: string; hideDetails: string }> = {
  PT: {
    title: 'Leitura assistida',
    body: 'O NestFinance pode sugerir os quatro valores usando somente os trechos necessários da folha. Nada é aprovado ou lançado: você continua responsável por conferir cada campo.',
    freeFormBody: 'O NestFinance lê a imagem inteira do seu papel e procura apenas totais claramente ligados a Dízimos, Ofertas, Outras entradas e Pix. Ele não soma números soltos. Confira cada campo.',
    action: 'Sugerir valores da imagem',
    working: 'Lendo trechos da folha…',
    freeFormWorking: 'Lendo seu papel…',
    unavailable: 'A leitura assistida ainda não está habilitada neste ambiente. Você pode continuar a conferência manual normalmente.',
    failed: 'Não foi possível gerar sugestões agora. A imagem e os valores existentes não foram alterados.',
    details: 'Conferir cédulas e moedas',
    detailsBody: 'Opcional: abra o detalhamento se quiser guardar também as quantidades de cada cédula e moeda.',
    hideDetails: 'Ocultar detalhamento',
  },
  EN: {
    title: 'Assisted reading',
    body: 'NestFinance can suggest the four values using only the required sheet regions. Nothing is approved or posted: you remain responsible for checking every field.',
    freeFormBody: 'NestFinance reads the whole image and looks only for totals clearly tied to Tithes, Offerings, Other income and Pix. It does not add loose numbers. Check every field.',
    action: 'Suggest values from image',
    working: 'Reading sheet regions…',
    freeFormWorking: 'Reading your paper…',
    unavailable: 'Assisted reading is not enabled in this environment yet. You can continue the manual review normally.',
    failed: 'Suggestions could not be generated now. The image and existing values were not changed.',
    details: 'Review banknotes and coins',
    detailsBody: 'Optional: open the detail if you also want to keep every banknote and coin quantity.',
    hideDetails: 'Hide detail',
  },
  ES: {
    title: 'Lectura asistida',
    body: 'NestFinance puede sugerir los cuatro valores usando solo las regiones necesarias de la hoja. Nada se aprueba ni registra: tú sigues siendo responsable de revisar cada campo.',
    freeFormBody: 'NestFinance lee toda la imagen y busca solo totales claramente vinculados a Diezmos, Ofrendas, Otros ingresos y Pix. No suma números sueltos. Revisa cada campo.',
    action: 'Sugerir valores de la imagen',
    working: 'Leyendo regiones de la hoja…',
    freeFormWorking: 'Leyendo tu papel…',
    unavailable: 'La lectura asistida todavía no está habilitada en este entorno. Puedes continuar la revisión manual normalmente.',
    failed: 'No fue posible generar sugerencias ahora. La imagen y los valores existentes no fueron modificados.',
    details: 'Revisar billetes y monedas',
    detailsBody: 'Opcional: abre el detalle si también deseas guardar las cantidades de cada billete y moneda.',
    hideDetails: 'Ocultar detalle',
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
  const freeForm = capture.provenance === 'free_form_note';
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<'unavailable' | 'failed' | null>(null);
  const [showDenominations, setShowDenominations] = useState(Boolean(capture.denominationReview));
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const autoAttemptRef = useRef<string | null>(null);

  const eligible = canEdit && capture.status === 'captured' && !capture.materialHidden && !capture.extraction &&
    Boolean(capture.normalizedUrl && capture.normalizedSha256) &&
    (freeForm || capture.normalization?.geometry?.mode !== 'full_frame');

  const run = async () => {
    if (!eligible || working || !capture.normalizedSha256) return;
    const fingerprint = `${capture.id}|${capture.version}|${capture.normalizedSha256}`;
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, key: token('idcountcapture_extract') };
    }
    setWorking(true);
    setMessage(null);
    try {
      if (freeForm) {
        await countCaptureService.extractFreeFormCandidates(organizationId, financeEntityId, {
          captureId: capture.id,
          expectedVersion: capture.version,
          normalizedSha256: capture.normalizedSha256,
          idempotencyKey: attemptRef.current.key,
          requestId: token('req'),
        });
      } else {
        const regions = await prepareCountCaptureExtractionRegions(capture);
        await countCaptureService.extractCandidates(organizationId, financeEntityId, {
          captureId: capture.id,
          expectedVersion: capture.version,
          normalizedSha256: capture.normalizedSha256,
          regions,
          idempotencyKey: attemptRef.current.key,
          requestId: token('req'),
        });
      }
      attemptRef.current = null;
      await onExtracted();
    } catch (error: any) {
      const code = String(error?.code || error?.message || '');
      setMessage(code === 'COUNT_CAPTURE_EXTRACTION_UNAVAILABLE' ? 'unavailable' : 'failed');
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    if (!eligible || !capture.normalizedSha256) return;
    const identity = capture.id + '|' + capture.version + '|' + capture.normalizedSha256;
    if (autoAttemptRef.current === identity) return;
    autoAttemptRef.current = identity;
    void run();
    // Automatic reading only prepares suggestions; it never verifies or applies financial values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, capture.id, capture.version, capture.normalizedSha256]);

  return (
    <>
      {eligible ? (
        <Surface variant="secondary" radius="lg" className="border-accent-primary/15 bg-accent-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ScanText className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-text-primary">{copy.title}</h2><ShieldCheck className="h-4 w-4 text-text-muted" aria-hidden="true" /></div>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{freeForm ? copy.freeFormBody : copy.body}</p>
              {message ? <p className="mt-3 text-xs leading-relaxed text-text-secondary" role="status">{copy[message]}</p> : null}
              <Button className="mt-4" variant="secondary" fullWidth disabled={working} onClick={() => void run()}>
                {working ? (freeForm ? copy.freeFormWorking : copy.working) : copy.action}
              </Button>
            </div>
          </div>
        </Surface>
      ) : null}
      {!freeForm ? <Surface variant="subtle" radius="lg" className="mt-5 p-4">
        <p className="text-sm font-semibold text-text-primary">{copy.details}</p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.detailsBody}</p>
        <Button
          className="mt-3"
          variant="ghost"
          fullWidth
          onClick={() => setShowDenominations((current) => !current)}
        >
          {showDenominations ? copy.hideDetails : copy.details}
        </Button>
      </Surface> : null}
      {!freeForm && showDenominations ? (
        <CountCaptureDenominationReviewPanel
          capture={capture}
          organizationId={organizationId}
          financeEntityId={financeEntityId}
          language={language}
          canEdit={canEdit}
          onUpdated={onExtracted}
        />
      ) : null}
    </>
  );
}
