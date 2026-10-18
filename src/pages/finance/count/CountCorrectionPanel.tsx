import { useEffect, useRef, useState } from 'react';
import { Button, Surface } from '@/src/components/foundation';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countService, type CountSessionDetail } from '@/src/services/countService';
import { COUNT_ENTRY_TYPES, type CountEntryDraft } from '@/shared/finance/count';
import { COUNT_COPY } from './countCopy';
import { formatReviewMoney } from '../transactions/transactionReviewModel';

const COPY = {
  PT: { title: 'Corrigir conferência', hint: 'O original será preservado. Cada alteração registra os valores antes e depois, responsável, data, hora e motivo. Se houver diferença, será necessário conferir novamente.',
    confirmZero: 'Confirmo que não houve entrada nesta categoria (zero).',
    linked: 'Esta conferência já originou lançamentos ou avançou na tesouraria. A correção exige ajuste vinculado; os valores originais não podem ser sobrescritos.',
    reason: 'Motivo da alteração (obrigatório)', reasonHint: 'Explique o que estava incorreto e por que mudou (10 a 500 caracteres).',
    save: 'Salvar correção e histórico', saving: 'Salvando…', cancel: 'Cancelar', history: 'Histórico de alterações',
    before: 'Original', after: 'Final', by: 'Alterado por', at: 'Data e hora', target: 'Conferência a corrigir',
    error: 'Não foi possível salvar. Recarregue a conferência e tente novamente.',
    independent: 'Quem corrigir não pode ser o responsável pela outra contagem. Preserve uma conferência independente.',
    empty: 'Nenhuma alteração registrada.', total: 'Total', differences: 'Valores alterados' },
  EN: { title: 'Correct verification', hint: 'The original is retained. Every change records before/after values, actor, date, time and reason. Differences require another verification.',
    confirmZero: 'I confirm that nothing was received in this category (zero).',
    linked: 'This count already generated entries or advanced to treasury. A linked adjustment is required; original amounts cannot be overwritten.',
    reason: 'Reason for change (required)', reasonHint: 'Explain what was incorrect and why it changed (10–500 characters).',
    save: 'Save correction and history', saving: 'Saving…', cancel: 'Cancel', history: 'Change history',
    before: 'Original', after: 'Final', by: 'Changed by', at: 'Date and time', target: 'Count to correct',
    error: 'Could not save. Reload the verification and try again.', independent: 'The person correcting cannot be the other counter. Preserve independent verification.',
    empty: 'No recorded changes.', total: 'Total', differences: 'Changed amounts' },
  ES: { title: 'Corregir verificación', hint: 'El original se conserva. Cada cambio registra valores antes/después, responsable, fecha, hora y motivo. Las diferencias requieren una nueva verificación.',
    confirmZero: 'Confirmo que no hubo ingreso en esta categoría (cero).',
    linked: 'Este conteo ya generó movimientos o avanzó a tesorería. Se requiere un ajuste vinculado; no se pueden sobrescribir los valores originales.',
    reason: 'Motivo del cambio (obligatorio)', reasonHint: 'Explica qué estaba incorrecto y por qué cambió (10–500 caracteres).',
    save: 'Guardar corrección e historial', saving: 'Guardando…', cancel: 'Cancelar', history: 'Historial de cambios',
    before: 'Original', after: 'Final', by: 'Modificado por', at: 'Fecha y hora', target: 'Conteo a corregir',
    error: 'No se pudo guardar. Recarga la verificación e inténtalo de nuevo.', independent: 'Quien corrige no puede ser el otro contador. Conserva una verificación independiente.',
    empty: 'Sin cambios registrados.', total: 'Total', differences: 'Importes modificados' },
} as const;

export function CountCorrectionPanel({ session, organizationId, financeEntityId, onReload }: {
  key?: string; session: CountSessionDetail; organizationId: string; financeEntityId: string; onReload: () => void | Promise<void>;
}) {
  const { language } = useLanguage();
  const { accessState } = useAuth();
  const w = COPY[language];
  const c = COUNT_COPY[language];
  const canCorrect = hasEffectiveCapability(accessState, 'finance.manage');
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<'countA' | 'countB'>('countA');
  const [drafts, setDrafts] = useState<CountEntryDraft[]>([]);
  const [reason, setReason] = useState('');
  const [zeroConfirmed, setZeroConfirmed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const attempt = useRef<{ material: string; key: string } | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const linked = Boolean(session.countProposal) || ['reviewed', 'deposited', 'reconciled', 'closed'].includes(session.workflowState || '');
  const independent = session.correctionEligibility?.[target] === true;
  const zeroReady = drafts.every(entry => entry.totalCents !== 0 ||
    !(session[target]?.entries.find(item => item.type === entry.type)?.totalCents) || zeroConfirmed.includes(entry.type));
  const select = (value: 'countA' | 'countB') => {
    setTarget(value);
    setZeroConfirmed([]);
    setDrafts((session[value]?.entries || []).map(entry => ({ ...entry })));
    setError(false);
  };
  const save = async () => {
    if (busy || !canCorrect || linked || !independent || !zeroReady || reason.trim().length < 10) return;
    const material = JSON.stringify([organizationId, financeEntityId, session.id, session.version, target, drafts, reason.trim(), zeroConfirmed]);
    if (attempt.current?.material !== material) attempt.current = { material, key: `idcorrect_${crypto.randomUUID()}` };
    setBusy(true); setError(false);
    try {
      await countService.correct(organizationId, financeEntityId, { countSessionId: session.id,
        expectedVersion: session.version, target, entries: drafts, reason: reason.trim(),
        confirmedZeroEntryTypes: zeroConfirmed,
        idempotencyKey: attempt.current.key, requestId: `req_${crypto.randomUUID()}` });
      if (active.current) { attempt.current = null; setOpen(false); setReason(''); await onReload(); }
    } catch { if (active.current) setError(true); }
    finally { if (active.current) setBusy(false); }
  };
  const money = (value: number) => formatReviewMoney(value, language, 'BRL');
  return <Surface variant="secondary" radius="xl" className="p-5 sm:p-6">
    {canCorrect ? <>
      <h2 className="text-lg font-semibold text-text-primary">{w.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{linked ? w.linked : w.hint}</p>
      {!open ? <Button className="mt-4" variant="secondary" fullWidth disabled={linked} onClick={() => { select('countA'); setOpen(true); }}>{w.title}</Button> :
        <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
          <label className="block text-sm font-semibold text-text-primary">{w.target}
            <select disabled={busy} value={target} onChange={event => select(event.target.value as 'countA' | 'countB')}
              className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-base text-text-primary">
              <option value="countA">{c.countA}</option><option value="countB">{c.countB}</option>
            </select>
          </label>
          <p className="text-sm text-text-muted">{w.independent}</p>
          {drafts.map((entry, index) => <div key={entry.type}><label className="block text-sm font-semibold text-text-primary">
            {c.entryLabels[entry.type]} · {w.before}: {money(session[target]?.entries.find(item => item.type === entry.type)?.totalCents || 0)}
            <input disabled={busy} inputMode="numeric" maxLength={20} aria-label={`${c.entryLabels[entry.type]} · ${w.after}`}
              value={money(entry.totalCents || 0)}
              onChange={event => { const amount = Number(event.target.value.replace(/\D/g, '') || '0');
                setZeroConfirmed(current => current.filter(type => type !== entry.type));
                setDrafts(current => current.map((item, i) => i === index ? { type: item.type, method: 'total', totalCents: amount } : item)); }}
              className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-xl tabular-nums text-text-primary" />
          </label>{entry.totalCents === 0 && session[target]?.entries.find(item => item.type === entry.type)?.totalCents > 0 ?
            <label className="mt-2 flex min-h-12 items-center gap-3 text-sm text-text-primary"><input type="checkbox" disabled={busy}
              checked={zeroConfirmed.includes(entry.type)} onChange={event => setZeroConfirmed(current => event.target.checked ? [...current, entry.type] : current.filter(type => type !== entry.type))}
              className="h-5 w-5 shrink-0" />{w.confirmZero}</label> : null}</div>)}
          <label className="block text-sm font-semibold text-text-primary">{w.reason}
            <textarea required minLength={10} maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)}
              aria-describedby="count-correction-reason-hint" className="mt-2 min-h-28 w-full rounded-xl border border-border-subtle bg-surface-base p-3 text-base text-text-primary" />
            <span id="count-correction-reason-hint" className="mt-1 block text-xs font-normal text-text-muted">{w.reasonHint}</span>
          </label>
          {error ? <p role="alert" className="text-sm text-semantic-danger">{w.error}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2"><Button type="submit" variant="primary" size="lg" fullWidth disabled={busy || !independent || !zeroReady || reason.trim().length < 10}>{busy ? w.saving : w.save}</Button>
            <Button type="button" variant="secondary" fullWidth disabled={busy} onClick={() => { setOpen(false); setReason(''); }}>{w.cancel}</Button></div>
        </form>}
    </> : null}
    <details className={canCorrect ? 'mt-6 border-t border-border-subtle pt-4' : ''}>
      <summary className="cursor-pointer py-2 font-semibold text-text-primary">{w.history} ({session.corrections?.length || 0})</summary>
      {!session.corrections?.length ? <p className="mt-3 text-sm text-text-muted">{w.empty}</p> :
        <ol className="mt-4 space-y-4">{[...session.corrections].reverse().map(item => <li key={item.id} className="rounded-xl border border-border-subtle bg-surface-base p-4">
          <p className="font-semibold text-text-primary">{item.target === 'countA' ? c.countA : c.countB} · v{item.versionBefore} → v{item.versionAfter}</p>
          <p className="mt-2 text-sm text-text-muted">{w.by}: {item.actorLabel}</p>
          <p className="text-sm text-text-muted">{w.at}: {item.changedAt ? new Date(item.changedAt).toLocaleString(language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR') : '—'}</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text-primary">{item.reason}</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm text-text-primary">
            <caption className="sr-only">{w.differences}</caption><thead><tr><th scope="col" className="py-2">{c.sessionTitle}</th><th scope="col" className="p-2">{w.before}</th><th scope="col" className="p-2">{w.after}</th></tr></thead>
            <tbody>{COUNT_ENTRY_TYPES.filter(type => item.before.entries.some(entry => entry.type === type) || item.after.entries.some(entry => entry.type === type)).map(type =>
              <tr key={type} className="border-t border-border-subtle"><th scope="row" className="py-2 font-normal">{c.entryLabels[type]}</th><td className="p-2 tabular-nums">{money(item.before.entries.find(entry => entry.type === type)?.totalCents || 0)}</td><td className="p-2 tabular-nums">{money(item.after.entries.find(entry => entry.type === type)?.totalCents || 0)}</td></tr>)}
              <tr className="border-t border-border-subtle font-semibold"><th scope="row" className="py-2">{w.total}</th><td className="p-2 tabular-nums">{money(item.before.totalCents)}</td><td className="p-2 tabular-nums">{money(item.after.totalCents)}</td></tr>
            </tbody></table></div>
        </li>)}</ol>}
    </details>
  </Surface>;
}
