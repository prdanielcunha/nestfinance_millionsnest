import { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, CheckCircle2, Focus, ScanText } from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import type { Language } from '@/src/contexts/LanguageContext';
import { formatReviewMoney } from '../transactions/transactionReviewModel';
import { countCaptureService, type CountCaptureDetail } from '@/src/services/countCaptureService';
import { COUNT_CASH_ENTRY_TYPES, COUNT_DENOMINATIONS_CENTS, calculateDenominationTotalCents, type CountCashEntryType } from '@/shared/finance/count';
import type { CountCaptureRegion } from '@/shared/finance/countCapture';
import {
  COUNT_CAPTURE_DENOMINATION_CELL_KEYS,
  type CountCaptureDenominationCellKey,
  type CountCaptureDenominationReviewInput,
} from '@/shared/finance/countCaptureDenominations';
import { prepareCountCaptureDenominationRegions } from './countCaptureDenominationExtractionImage';

const COPY: Record<Language, {
  title: string; body: string; assisted: string; assistedWorking: string; unavailable: string; failed: string;
  tithe: string; offering: string; other: string; quantity: string; blank: string; unreadable: string; verified: string;
  candidate: string; uncertain: string; unresolved: string; subtotal: string; incompleteSubtotal: string;
  inspect: string; inspectionTitle: string; closeInspection: string;
  save: string; saving: string; saved: string; completeRows: string;
}> = {
  PT: { title: 'Cédulas e moedas', body: 'Confira as quantidades escritas na folha. Sugestões automáticas nunca substituem sua conferência.', assisted: 'Sugerir quantidades da imagem', assistedWorking: 'Lendo células da folha…', unavailable: 'A leitura assistida não está habilitada neste ambiente. A conferência manual continua disponível.', failed: 'Não foi possível sugerir quantidades agora. Nada foi alterado.', tithe: 'Dízimos', offering: 'Ofertas', other: 'Outras entradas', quantity: 'Quantidade', blank: 'Em branco', unreadable: 'Ilegível', verified: 'Conferi na imagem', candidate: 'Sugestão', uncertain: 'Incerto', unresolved: 'Sem sugestão segura', subtotal: 'Subtotal conferido', incompleteSubtotal: 'Subtotal indisponível enquanto houver célula ilegível.', inspect: 'Ver célula', inspectionTitle: 'Trecho da folha', closeInspection: 'Fechar trecho', save: 'Salvar conferência das cédulas e moedas', saving: 'Salvando…', saved: 'Conferência das cédulas e moedas salva.', completeRows: 'Confira cada linha: informe uma quantidade, marque em branco ou marque como ilegível.' },
  EN: { title: 'Banknotes and coins', body: 'Check the quantities written on the sheet. Automated suggestions never replace your review.', assisted: 'Suggest quantities from image', assistedWorking: 'Reading sheet cells…', unavailable: 'Assisted reading is not enabled in this environment. Manual review remains available.', failed: 'Quantities could not be suggested now. Nothing was changed.', tithe: 'Tithes', offering: 'Offerings', other: 'Other income', quantity: 'Quantity', blank: 'Blank', unreadable: 'Unreadable', verified: 'I checked the image', candidate: 'Suggestion', uncertain: 'Uncertain', unresolved: 'No safe suggestion', subtotal: 'Reviewed subtotal', incompleteSubtotal: 'Subtotal is unavailable while any cell is unreadable.', inspect: 'View cell', inspectionTitle: 'Sheet region', closeInspection: 'Close region', save: 'Save banknote and coin review', saving: 'Saving…', saved: 'Banknote and coin review saved.', completeRows: 'Review every row: enter a quantity, mark it blank, or mark it unreadable.' },
  ES: { title: 'Billetes y monedas', body: 'Revisa las cantidades escritas en la hoja. Las sugerencias automáticas nunca sustituyen tu revisión.', assisted: 'Sugerir cantidades de la imagen', assistedWorking: 'Leyendo celdas de la hoja…', unavailable: 'La lectura asistida no está habilitada en este entorno. La revisión manual sigue disponible.', failed: 'No fue posible sugerir cantidades ahora. Nada fue modificado.', tithe: 'Diezmos', offering: 'Ofrendas', other: 'Otros ingresos', quantity: 'Cantidad', blank: 'En blanco', unreadable: 'Ilegible', verified: 'Revisé la imagen', candidate: 'Sugerencia', uncertain: 'Incierto', unresolved: 'Sin sugerencia segura', subtotal: 'Subtotal revisado', incompleteSubtotal: 'El subtotal no está disponible mientras exista una celda ilegible.', inspect: 'Ver celda', inspectionTitle: 'Región de la hoja', closeInspection: 'Cerrar región', save: 'Guardar revisión de billetes y monedas', saving: 'Guardando…', saved: 'Revisión de billetes y monedas guardada.', completeRows: 'Revisa cada fila: ingresa una cantidad, márcala en blanco o como ilegible.' },
};

type Mode = 'quantity' | 'blank' | 'unreadable';
type RowState = { mode: Mode; quantity: string; verified: boolean };

function token(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function blankRows(): Record<CountCaptureDenominationCellKey, RowState> {
  return Object.fromEntries(COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey) => [cellKey, { mode: 'quantity', quantity: '', verified: false }])) as Record<CountCaptureDenominationCellKey, RowState>;
}

function parseQuantity(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= 1_000_000 ? quantity : null;
}

function DenominationEvidenceCrop({ url, region, label, width, height }: { url: string; region: CountCaptureRegion; label: string; width: number; height: number }) {
  const aspectRatio = Math.max(0.75, Math.min(6, (region.width * width) / (region.height * height)));
  return <div className="overflow-hidden rounded-xl border border-border-subtle bg-white" style={{ aspectRatio }} role="img" aria-label={label}><div className="relative h-full w-full overflow-hidden"><img src={url} alt="" className="absolute max-w-none select-none" draggable={false} style={{ width: `${100 / region.width}%`, height: `${100 / region.height}%`, left: `${-(region.x / region.width) * 100}%`, top: `${-(region.y / region.height) * 100}%` }} /></div></div>;
}

export function CountCaptureDenominationReviewPanel({ capture, organizationId, financeEntityId, language, canEdit, onUpdated }: {
  capture: CountCaptureDetail;
  organizationId: string;
  financeEntityId: string;
  language: Language;
  canEdit: boolean;
  onUpdated: () => Promise<void> | void;
}) {
  const copy = COPY[language];
  const [rows, setRows] = useState<Record<CountCaptureDenominationCellKey, RowState>>(blankRows);
  const [inspectCellKey, setInspectCellKey] = useState<CountCaptureDenominationCellKey | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<'unavailable' | 'failed' | null>(null);
  const [saved, setSaved] = useState(false);
  const extractAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const saveAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const reviewFields = capture.denominationReview?.fields || [];
    const candidates = capture.denominationCandidates || [];
    const next = blankRows();
    for (const cellKey of COUNT_CAPTURE_DENOMINATION_CELL_KEYS) {
      const review = reviewFields.find((item) => item.cellKey === cellKey);
      if (review) {
        next[cellKey] = review.decision === 'blank' || review.decision === 'unreadable'
          ? { mode: review.decision as Mode, quantity: '', verified: true }
          : { mode: 'quantity', quantity: String(review.quantity ?? ''), verified: true };
        continue;
      }
      const candidate = candidates.find((item) => item.cellKey === cellKey);
      if (candidate?.state === 'recognized' && candidate.quantity !== null) next[cellKey] = { mode: 'quantity', quantity: String(candidate.quantity), verified: false };
    }
    setRows(next);
    setInspectCellKey(null);
    setSaved(capture.denominationReview?.fields?.length === COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length);
    saveAttemptRef.current = null;
  }, [capture.version, capture.denominationReview, capture.denominationCandidates]);

  const prepared = useMemo<CountCaptureDenominationReviewInput[] | null>(() => {
    const candidates = capture.denominationCandidates || [];
    const result: CountCaptureDenominationReviewInput[] = [];
    for (const cellKey of COUNT_CAPTURE_DENOMINATION_CELL_KEYS) {
      const row = rows[cellKey];
      if (row.mode === 'blank' || row.mode === 'unreadable') {
        if (!row.verified) return null;
        result.push({ cellKey, decision: row.mode, quantity: null });
        continue;
      }
      const quantity = parseQuantity(row.quantity);
      if (quantity === null || !row.verified) return null;
      const candidate = candidates.find((item) => item.cellKey === cellKey);
      const confirmed = candidate?.state === 'recognized' && candidate.quantity === quantity;
      result.push({ cellKey, decision: confirmed ? 'confirmed' : 'corrected', quantity });
    }
    return result;
  }, [capture.denominationCandidates, rows]);

  const subtotals = useMemo(() => Object.fromEntries(COUNT_CASH_ENTRY_TYPES.map((entryType) => {
    if (!prepared) return [entryType, null];
    const selected = prepared.filter((row) => row.cellKey.startsWith(`${entryType}:`));
    if (selected.some((row) => row.decision === 'unreadable')) return [entryType, null];
    const quantities: Record<string, number> = {};
    for (const row of selected) if (row.decision !== 'blank' && row.quantity !== null) quantities[row.cellKey.split(':')[1]] = row.quantity;
    return [entryType, calculateDenominationTotalCents(quantities)];
  })) as Record<CountCashEntryType, number | null>, [prepared]);

  const labels: Record<CountCashEntryType, string> = { tithe: copy.tithe, offering: copy.offering, other: copy.other };
  const canExtract = canEdit && !capture.materialHidden && ['captured', 'reviewed'].includes(capture.status) && !capture.denominationExtraction && capture.normalization?.geometry?.mode !== 'full_frame' && Boolean(capture.normalizedUrl && capture.normalizedSha256 && capture.denominationCandidates?.length);
  const inspectedCandidate = inspectCellKey ? capture.denominationCandidates?.find((item) => item.cellKey === inspectCellKey) || null : null;
  const inspectedRegion = inspectedCandidate?.region || null;
  const inspectedLabel = inspectedCandidate ? `${labels[inspectedCandidate.entryType]} · ${formatReviewMoney(inspectedCandidate.denominationCents, language, 'BRL')}` : '';
  const normalizedWidth = capture.normalization?.normalizedWidth || 1940;
  const normalizedHeight = capture.normalization?.normalizedHeight || 2810;

  const extract = async () => {
    if (!canExtract || extracting || !capture.normalizedSha256) return;
    const fingerprint = `${capture.id}|${capture.version}|${capture.normalizedSha256}|denominations`;
    if (!extractAttemptRef.current || extractAttemptRef.current.fingerprint !== fingerprint) extractAttemptRef.current = { fingerprint, key: token('idcountcapture_denom_extract') };
    setExtracting(true); setMessage(null); setSaved(false);
    try {
      const regions = await prepareCountCaptureDenominationRegions(capture);
      await countCaptureService.extractDenominations(organizationId, financeEntityId, { captureId: capture.id, expectedVersion: capture.version, normalizedSha256: capture.normalizedSha256, regions, idempotencyKey: extractAttemptRef.current.key, requestId: token('req') });
      extractAttemptRef.current = null;
      await onUpdated();
    } catch (error: any) {
      const code = String(error?.code || error?.message || '');
      setMessage(code === 'COUNT_CAPTURE_DENOMINATION_EXTRACTION_UNAVAILABLE' ? 'unavailable' : 'failed');
    } finally { setExtracting(false); }
  };

  const save = async () => {
    if (!prepared || !canEdit || saving) return;
    const fingerprint = `${capture.id}|${capture.version}|${JSON.stringify(prepared)}`;
    if (!saveAttemptRef.current || saveAttemptRef.current.fingerprint !== fingerprint) saveAttemptRef.current = { fingerprint, key: token('idcountcapture_denom_review') };
    setSaving(true); setMessage(null); setSaved(false);
    try {
      await countCaptureService.saveDenominationReview(organizationId, financeEntityId, { captureId: capture.id, expectedVersion: capture.version, denominations: prepared, idempotencyKey: saveAttemptRef.current.key, requestId: token('req') });
      saveAttemptRef.current = null; setSaved(true); await onUpdated();
    } catch { setMessage('failed'); }
    finally { setSaving(false); }
  };

  const update = (cellKey: CountCaptureDenominationCellKey, patch: Partial<RowState>) => {
    setRows((current) => ({ ...current, [cellKey]: { ...current[cellKey], ...patch } }));
    saveAttemptRef.current = null; setSaved(false);
  };

  return <Surface variant="secondary" radius="xl" className="mt-6 border-border-subtle p-4 sm:p-5">
    <div className="flex items-start gap-3"><Calculator className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" /><div><h2 className="text-base font-semibold text-text-primary">{copy.title}</h2><p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.body}</p></div></div>
    {canExtract ? <Button variant="secondary" className="mt-4" fullWidth disabled={extracting} onClick={() => void extract()}><ScanText className="h-4 w-4" aria-hidden="true" />{extracting ? copy.assistedWorking : copy.assisted}</Button> : null}
    {message ? <p className="mt-3 text-xs text-text-secondary" role="status">{copy[message]}</p> : null}
    {inspectCellKey && inspectedRegion && capture.normalizedUrl ? <div className="mt-4 rounded-xl border border-accent-primary/20 bg-surface-base p-3"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-text-primary">{copy.inspectionTitle}: {inspectedLabel}</p><Button variant="ghost" className="!min-h-9 !px-2 text-xs" onClick={() => setInspectCellKey(null)}>{copy.closeInspection}</Button></div><DenominationEvidenceCrop url={capture.normalizedUrl} region={inspectedRegion} label={`${copy.inspectionTitle}: ${inspectedLabel}`} width={normalizedWidth} height={normalizedHeight} /></div> : null}

    <div className="mt-5 space-y-5">{COUNT_CASH_ENTRY_TYPES.map((entryType) => <section key={entryType} aria-labelledby={`denom-${entryType}`}><div className="flex items-center justify-between gap-3"><h3 id={`denom-${entryType}`} className="text-sm font-semibold text-text-primary">{labels[entryType]}</h3><span className="text-xs tabular-nums text-text-muted">{copy.subtotal}: {subtotals[entryType] === null ? '—' : formatReviewMoney(subtotals[entryType]!, language, 'BRL')}</span></div>
      <div className="mt-2 overflow-hidden rounded-xl border border-border-subtle">{COUNT_DENOMINATIONS_CENTS.map((denominationCents) => {
        const cellKey = `${entryType}:${denominationCents}` as CountCaptureDenominationCellKey;
        const row = rows[cellKey];
        const candidate = capture.denominationCandidates?.find((item) => item.cellKey === cellKey);
        const status = candidate?.state === 'recognized' ? `${copy.candidate}: ${candidate.quantity}` : candidate?.state === 'uncertain' ? copy.uncertain : copy.unresolved;
        return <div key={cellKey} className="grid gap-2 border-b border-border-subtle p-3 last:border-b-0 sm:grid-cols-[7rem_minmax(7rem,1fr)_auto] sm:items-center"><div><p className="text-sm font-medium tabular-nums text-text-primary">{formatReviewMoney(denominationCents, language, 'BRL')}</p><p className="mt-0.5 text-[11px] text-text-muted">{status}</p>{candidate?.region && capture.normalizedUrl ? <Button variant="ghost" className="mt-1 !min-h-9 !px-0 text-xs" onClick={() => setInspectCellKey(cellKey)}><Focus className="h-3.5 w-3.5" aria-hidden="true" />{copy.inspect}</Button> : null}</div><label><span className="sr-only">{copy.quantity} · {formatReviewMoney(denominationCents, language, 'BRL')}</span><input inputMode="numeric" pattern="[0-9]*" value={row.quantity} disabled={!canEdit || row.mode !== 'quantity'} onChange={(event) => update(cellKey, { quantity: event.target.value, verified: false })} className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-base px-3 text-sm tabular-nums text-text-primary outline-none focus:border-accent-primary disabled:opacity-50" placeholder={copy.quantity} /></label><div className="flex flex-wrap items-center gap-2 text-xs"><label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={row.mode === 'blank'} disabled={!canEdit} onChange={(event) => update(cellKey, event.target.checked ? { mode: 'blank', quantity: '', verified: true } : { mode: 'quantity', verified: false })} />{copy.blank}</label><label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={row.mode === 'unreadable'} disabled={!canEdit} onChange={(event) => update(cellKey, event.target.checked ? { mode: 'unreadable', quantity: '', verified: true } : { mode: 'quantity', verified: false })} />{copy.unreadable}</label>{row.mode === 'quantity' ? <label className="flex min-h-9 items-center gap-1.5 font-medium text-text-primary"><input type="checkbox" checked={row.verified} disabled={!canEdit || parseQuantity(row.quantity) === null} onChange={(event) => update(cellKey, { verified: event.target.checked })} />{copy.verified}</label> : null}</div></div>;
      })}</div>{subtotals[entryType] === null && prepared ? <p className="mt-2 text-xs text-semantic-warning">{copy.incompleteSubtotal}</p> : null}</section>)}</div>

    {!prepared ? <p className="mt-4 text-sm text-semantic-warning">{copy.completeRows}</p> : null}
    {saved ? <p className="mt-4 flex items-center gap-2 text-sm font-medium text-semantic-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{copy.saved}</p> : null}
    <Button className="mt-4" size="lg" fullWidth disabled={!prepared || !canEdit || saving} onClick={() => void save()}>{saving ? copy.saving : copy.save}</Button>
  </Surface>;
}
