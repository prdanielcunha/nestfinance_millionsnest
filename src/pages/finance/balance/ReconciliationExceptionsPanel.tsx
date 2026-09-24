import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import type { Language } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { reconciliationService } from '@/src/services/reconciliationService';
import { generateLedgerId } from '../../../../shared/finance/ledger/ids.js';
import type {
  ReconciliationExceptionCandidate,
  ReconciliationLineMatchPreview,
} from '../../../../shared/finance/reconciliationMatchPreview.js';
import {
  RECONCILIATION_EXCEPTION_REASONS,
  type ReconciliationExceptionReason,
} from '../../../../shared/finance/reconciliationExceptionJustification.js';

type Props = {
  lines: ReconciliationLineMatchPreview[];
  language: Language;
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  accountId: string;
};

type Copy = {
  title: (count: number) => string;
  body: string;
  source: string;
  possibleMatch: string;
  noPossibleMatch: string;
  amountDifference: (cents: number) => string;
  dateDifference: (days: number) => string;
  sameDate: string;
  reviewAction: string;
  missingAction: string;
  openTransaction: string;
  candidateLimit: string;
  justifyTitle: string;
  justifyBody: string;
  reason: string;
  comment: string;
  commentPlaceholder: string;
  candidate: string;
  noCandidate: string;
  save: string;
  saving: string;
  saved: string;
  saveError: string;
  permission: string;
  offline: string;
  reasons: Record<ReconciliationExceptionReason, string>;
};

const COPY: Record<Language, Copy> = {
  PT: {
    title: (count) => count === 1 ? 'Encontramos 1 item que não bate' : `Encontramos ${count} itens que não batem`,
    body: 'Mostramos primeiro as divergências. As possíveis correspondências abaixo são apenas pistas determinísticas para você conferir; elas nunca são conciliadas automaticamente.',
    source: 'No extrato',
    possibleMatch: 'Possível correspondência',
    noPossibleMatch: 'Nenhuma movimentação próxima foi encontrada',
    amountDifference: (cents) => cents === 0 ? 'Mesmo valor' : `Diferença de valor: ${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), 'PT')}`,
    dateDifference: (days) => days === 0 ? 'Mesma data' : `Diferença de data: ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'} ${days > 0 ? 'depois' : 'antes'}`,
    sameDate: 'Mesma data',
    reviewAction: 'Ação sugerida: abra a movimentação e confira a diferença antes de corrigir qualquer dado.',
    missingAction: 'Ação sugerida: procure uma movimentação ausente ou registre uma nova somente depois de conferir o extrato.',
    openTransaction: 'Abrir movimentação',
    candidateLimit: 'Há outras possibilidades próximas. Revise antes de decidir.',
    justifyTitle: 'Registrar por que ficou diferente',
    justifyBody: 'A justificativa fica vinculada à linha original do extrato e entra no histórico. Ela não concilia nem altera valores.',
    reason: 'Motivo',
    comment: 'Observação',
    commentPlaceholder: 'Explique somente o necessário para outra pessoa entender depois.',
    candidate: 'Movimentação relacionada',
    noCandidate: 'Nenhuma / ainda não identificada',
    save: 'Registrar justificativa',
    saving: 'Registrando…',
    saved: 'Justificativa registrada no histórico.',
    saveError: 'Não foi possível registrar. Nada financeiro foi alterado.',
    permission: 'Somente quem pode revisar o financeiro registra justificativas.',
    offline: 'Conecte-se à internet para registrar com auditoria.',
    reasons: {
      timing_difference: 'Diferença de data/compensação',
      bank_fee: 'Tarifa bancária',
      amount_difference: 'Diferença de valor',
      missing_transaction: 'Movimentação ainda não registrada',
      duplicate_or_unexpected: 'Item duplicado ou inesperado',
      other: 'Outro motivo',
    },
  },
  EN: {
    title: (count) => count === 1 ? 'We found 1 item that does not match' : `We found ${count} items that do not match`,
    body: 'Exceptions are shown first. The possible matches below are deterministic review clues only; they are never reconciled automatically.',
    source: 'On the statement',
    possibleMatch: 'Possible match',
    noPossibleMatch: 'No nearby recorded transaction was found',
    amountDifference: (cents) => cents === 0 ? 'Same amount' : `Amount difference: ${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), 'EN')}`,
    dateDifference: (days) => days === 0 ? 'Same date' : `Date difference: ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ${days > 0 ? 'later' : 'earlier'}`,
    sameDate: 'Same date',
    reviewAction: 'Suggested action: open the transaction and review the difference before correcting any data.',
    missingAction: 'Suggested action: look for a missing transaction or record a new one only after checking the statement.',
    openTransaction: 'Open transaction',
    candidateLimit: 'There are additional nearby possibilities. Review them before deciding.',
    justifyTitle: 'Record why this is different',
    justifyBody: 'The justification is tied to the original statement line and recorded in history. It does not reconcile or change amounts.',
    reason: 'Reason',
    comment: 'Note',
    commentPlaceholder: 'Explain only what another person will need to understand later.',
    candidate: 'Related transaction',
    noCandidate: 'None / not identified yet',
    save: 'Record justification',
    saving: 'Recording…',
    saved: 'Justification recorded in history.',
    saveError: 'Could not record it. No financial data was changed.',
    permission: 'Only finance reviewers can record justifications.',
    offline: 'Connect to the internet to record it with audit history.',
    reasons: {
      timing_difference: 'Date/settlement timing difference',
      bank_fee: 'Bank fee',
      amount_difference: 'Amount difference',
      missing_transaction: 'Transaction not recorded yet',
      duplicate_or_unexpected: 'Duplicate or unexpected item',
      other: 'Other reason',
    },
  },
  ES: {
    title: (count) => count === 1 ? 'Encontramos 1 elemento que no coincide' : `Encontramos ${count} elementos que no coinciden`,
    body: 'Las divergencias aparecen primero. Las posibles correspondencias son solo pistas determinísticas para revisión; nunca se concilian automáticamente.',
    source: 'En el extracto',
    possibleMatch: 'Posible correspondencia',
    noPossibleMatch: 'No se encontró un movimiento registrado cercano',
    amountDifference: (cents) => cents === 0 ? 'Mismo valor' : `Diferencia de valor: ${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents), 'ES')}`,
    dateDifference: (days) => days === 0 ? 'Misma fecha' : `Diferencia de fecha: ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'} ${days > 0 ? 'después' : 'antes'}`,
    sameDate: 'Misma fecha',
    reviewAction: 'Acción sugerida: abre el movimiento y revisa la diferencia antes de corregir cualquier dato.',
    missingAction: 'Acción sugerida: busca un movimiento faltante o registra uno nuevo solo después de revisar el extracto.',
    openTransaction: 'Abrir movimiento',
    candidateLimit: 'Hay otras posibilidades cercanas. Revísalas antes de decidir.',
    justifyTitle: 'Registrar por qué quedó diferente',
    justifyBody: 'La justificación queda vinculada a la línea original del extracto y entra en el historial. No concilia ni cambia valores.',
    reason: 'Motivo',
    comment: 'Observación',
    commentPlaceholder: 'Explica solo lo necesario para que otra persona lo entienda después.',
    candidate: 'Movimiento relacionado',
    noCandidate: 'Ninguno / aún no identificado',
    save: 'Registrar justificación',
    saving: 'Registrando…',
    saved: 'Justificación registrada en el historial.',
    saveError: 'No fue posible registrarla. Ningún dato financiero cambió.',
    permission: 'Solo quien puede revisar las finanzas registra justificaciones.',
    offline: 'Conéctate a internet para registrarla con auditoría.',
    reasons: {
      timing_difference: 'Diferencia de fecha/compensación',
      bank_fee: 'Tarifa bancaria',
      amount_difference: 'Diferencia de valor',
      missing_transaction: 'Movimiento aún no registrado',
      duplicate_or_unexpected: 'Elemento duplicado o inesperado',
      other: 'Otro motivo',
    },
  },
};

function localeFor(language: Language) {
  return language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
}
function formatMoney(cents: number, language: Language) {
  return new Intl.NumberFormat(localeFor(language), { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
function formatDate(value: string, language: Language) {
  const date = new Date(value + 'T12:00:00.000Z');
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(language), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function CandidateCard({ candidate, language, copy }: { candidate: ReconciliationExceptionCandidate; language: Language; copy: Copy; key?: string }) {
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-base p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.possibleMatch}</p>
          <p className="mt-1 truncate text-sm font-semibold text-text-primary">{candidate.description || candidate.transactionId}</p>
          <p className="mt-1 text-xs text-text-muted">{formatDate(candidate.occurredAt, language)} · {formatMoney(candidate.amountCents, language)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-semantic-warning/20 bg-semantic-warning/10 px-2 py-1 text-[10px] font-medium text-semantic-warning">{copy.amountDifference(candidate.amountDifferenceCents)}</span>
            <span className="rounded-full border border-semantic-warning/20 bg-semantic-warning/10 px-2 py-1 text-[10px] font-medium text-semantic-warning">{candidate.dateOffsetDays === 0 ? copy.sameDate : copy.dateDifference(candidate.dateOffsetDays)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted">{copy.reviewAction}</p>
        </div>
        <Button variant="ghost" className="shrink-0" onClick={() => navigate(APP_ROUTES.transactionDetail.replace(':transactionId', candidate.transactionId))}>
          {copy.openTransaction}<ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function ExceptionJustificationForm({
  line, copy, organizationId, financeEntityId, evidenceId, accountId,
}: {
  line: ReconciliationLineMatchPreview; copy: Copy; organizationId:string; financeEntityId:string; evidenceId:string; accountId:string;
}) {
  const { accessState }=useAuth();
  const online=useOnlineStatus();
  const canReview=hasEffectiveCapability(accessState,'finance.review');
  const [reason,setReason]=useState<ReconciliationExceptionReason>('timing_difference');
  const [comment,setComment]=useState('');
  const [candidate,setCandidate]=useState('');
  const [state,setState]=useState<'idle'|'saving'|'saved'|'error'>('idle');

  const save=async()=>{
    if(!canReview||!online||state==='saving'||(reason==='other'&&!comment.trim())) return;
    setState('saving');
    try{
      await reconciliationService.justifyException(organizationId,{
        financeEntityId,evidenceId,accountId,lineNumber:line.lineNumber,
        candidateTransactionId:candidate||null,reasonCode:reason,comment:comment.trim()||null,
        idempotencyKey:generateLedgerId('idem'),requestId:generateLedgerId('req'),
      });
      setState('saved');
    }catch{setState('error');}
  };

  return (
    <div className="mt-4 rounded-xl border border-border-subtle bg-surface-base p-4">
      <div className="flex gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
        <div><p className="text-sm font-semibold text-text-primary">{copy.justifyTitle}</p><p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.justifyBody}</p></div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.reason}</span>
          <select value={reason} onChange={e=>{setReason(e.target.value as ReconciliationExceptionReason);setState('idle');}} className="min-h-12 w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 text-sm text-text-primary">
            {RECONCILIATION_EXCEPTION_REASONS.map(value=><option key={value} value={value}>{copy.reasons[value]}</option>)}
          </select>
        </label>
        <label><span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.candidate}</span>
          <select value={candidate} onChange={e=>{setCandidate(e.target.value);setState('idle');}} className="min-h-12 w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 text-sm text-text-primary">
            <option value="">{copy.noCandidate}</option>
            {(line.exceptionCandidates||[]).map(item=><option key={item.transactionId} value={item.transactionId}>{item.description||item.transactionId}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-3 block"><span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.comment}</span>
        <textarea value={comment} maxLength={280} rows={3} onChange={e=>{setComment(e.target.value);setState('idle');}} placeholder={copy.commentPlaceholder} className="w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 py-2 text-sm text-text-primary" />
      </label>
      {!canReview?<p className="mt-2 text-xs text-text-muted">{copy.permission}</p>:!online?<p className="mt-2 text-xs text-semantic-warning">{copy.offline}</p>:null}
      {state==='saved'?<p className="mt-2 flex items-center gap-2 text-xs font-medium text-semantic-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true"/>{copy.saved}</p>:null}
      {state==='error'?<p className="mt-2 text-xs font-medium text-semantic-danger">{copy.saveError}</p>:null}
      <Button className="mt-3 w-full sm:w-auto" variant="secondary" disabled={!canReview||!online||state==='saving'||(reason==='other'&&!comment.trim())} onClick={()=>void save()}>
        {state==='saving'?copy.saving:copy.save}
      </Button>
    </div>
  );
}

export function ReconciliationExceptionsPanel({ lines, language, organizationId, financeEntityId, evidenceId, accountId }: Props) {
  const copy=COPY[language];
  const exceptions=lines.filter(line=>line.state==='no_candidate');
  if(exceptions.length===0) return null;
  return (
    <Surface variant="secondary" radius="xl" className="border border-semantic-warning/20 p-4 sm:p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-warning/10 text-semantic-warning"><AlertTriangle className="h-5 w-5" aria-hidden="true"/></div>
        <div className="min-w-0"><h5 className="text-base font-semibold tracking-tight text-text-primary">{copy.title(exceptions.length)}</h5><p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-muted">{copy.body}</p></div>
      </div>
      <div className="mt-4 space-y-3">
        {exceptions.map(line=>(
          <div key={line.lineNumber} className="rounded-xl border border-border-subtle bg-surface-secondary/50 p-3 sm:p-4">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.source}</p><p className="mt-1 text-sm font-semibold text-text-primary">{line.sourceDescription||'—'}</p><p className="mt-1 text-xs text-text-muted">{formatDate(line.sourceDate,language)} · {formatMoney(line.sourceAmountCents,language)}</p></div>
            {(line.exceptionCandidates?.length||0)>0?(
              <div className="mt-3 space-y-2">
                {(line.exceptionCandidates||[]).map(candidate=><CandidateCard key={candidate.transactionId} candidate={candidate} language={language} copy={copy}/>)}
                {line.exceptionCandidateLimitReached?<p className="text-[11px] leading-relaxed text-text-muted">{copy.candidateLimit}</p>:null}
              </div>
            ):(
              <div className="mt-3 rounded-xl border border-border-subtle bg-surface-base p-3"><p className="text-sm font-medium text-text-primary">{copy.noPossibleMatch}</p><p className="mt-1 text-[11px] leading-relaxed text-text-muted">{copy.missingAction}</p></div>
            )}
            <ExceptionJustificationForm line={line} copy={copy} organizationId={organizationId} financeEntityId={financeEntityId} evidenceId={evidenceId} accountId={accountId}/>
          </div>
        ))}
      </div>
    </Surface>
  );
}
