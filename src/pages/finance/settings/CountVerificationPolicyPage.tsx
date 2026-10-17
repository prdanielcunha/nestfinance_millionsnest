import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ShieldCheck, Users, AlertCircle } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { Surface } from '@/src/components/foundation';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import {
  COUNT_V3_UI_ENABLED, countV3Service,
  type CountV3Policy, type CountV3PolicyRecord,
} from '@/src/services/countV3Service';

const WORDS = {
  PT: {
    title: 'Como sua igreja confere a contagem',
    intro: 'Defina como os dízimos e ofertas serão conferidos após o culto. Só a tesouraria autorizada pode alterar esta regra.',
    team: 'Pessoas na equipe', quorum: 'Conferências independentes necessárias',
    teamHint: 'Máximo de participantes com acesso a cada contagem.',
    quorumHint: 'Quantas pessoas diferentes, autenticadas, precisam registrar os próprios valores.',
    assisted: 'Permitir contagem acompanhada',
    assistedHint: 'Um usuário pode digitar o papel de outra pessoa. Isso é registrado como acompanhado, sem substituir conferência independente.',
    single: 'Com apenas uma conferência independente, o resultado exige revisão explícita da tesouraria; não é aprovado automaticamente.',
    version: 'Versão da regra', future: 'As alterações valem para novas contagens. As contagens já iniciadas preservam a regra anterior.',
    save: 'Salvar regra', saved: 'Regra salva. Novas contagens usarão essa configuração.',
    retry: 'Tentar novamente', loading: 'Carregando configuração...', saving: 'Salvando...',
    invalid: 'A quantidade de conferências não pode ser maior que o tamanho da equipe.',
    error: 'Não foi possível carregar ou salvar. Verifique sua conexão e tente novamente.',
    conflict: 'Outra pessoa alterou a configuração. Recarregue antes de salvar.',
    restricted: 'Esta configuração exige a permissão financeira de gestão.',
    back: 'Voltar às configurações',
  },
  EN: {
    title: 'How your church verifies counts',
    intro: 'Set how tithes and offerings are checked after a service. Only authorized treasury staff may update this policy.',
    team: 'Team members', quorum: 'Required independent verifications',
    teamHint: 'Maximum participants allowed in one count.',
    quorumHint: 'How many distinct authenticated people must enter their own figures.',
    assisted: 'Allow assisted counting',
    assistedHint: 'A user may enter figures from another person’s paper. Assisted records never replace independent checks.',
    single: 'With one independent verification, explicit treasury review is always required; the count is never auto-approved.',
    version: 'Policy version', future: 'New policies affect only new counts; existing sessions keep their previous policy.',
    save: 'Save policy', saved: 'Saved. New counts will use this configuration.',
    retry: 'Retry', loading: 'Loading settings...', saving: 'Saving...',
    invalid: 'Required verifications cannot exceed the team size.',
    error: 'Could not load or save settings. Check your connection and retry.',
    conflict: 'Someone else updated this policy. Reload before saving.',
    restricted: 'Financial management permission is required.',
    back: 'Back to settings',
  },
  ES: {
    title: 'Cómo su iglesia verifica los conteos',
    intro: 'Defina cómo se revisan diezmos y ofrendas después del culto. Solo tesorería autorizada puede actualizar la regla.',
    team: 'Personas del equipo', quorum: 'Verificaciones independientes necesarias',
    teamHint: 'Máximo de participantes en cada conteo.',
    quorumHint: 'Cuántas personas diferentes y autenticadas deben registrar sus importes.',
    assisted: 'Permitir conteo acompañado',
    assistedHint: 'Una persona puede transcribir el papel de otra. Esto no sustituye una revisión independiente.',
    single: 'Una sola verificación requiere revisión explícita de tesorería; nunca se aprueba automáticamente.',
    version: 'Versión de la regla', future: 'Los cambios valen solo para conteos nuevos. Los existentes conservan la regla anterior.',
    save: 'Guardar regla', saved: 'Guardado. Los nuevos conteos usarán esta configuración.',
    retry: 'Reintentar', loading: 'Cargando configuración...', saving: 'Guardando...',
    invalid: 'Las verificaciones necesarias no pueden superar el tamaño del equipo.',
    error: 'No fue posible cargar o guardar. Revise su conexión y reintente.',
    conflict: 'Otra persona modificó la regla. Actualice antes de guardar.',
    restricted: 'Necesita permiso de gestión financiera.',
    back: 'Volver a configuración',
  },
} as const;
const NUMBERS = Array.from({ length:20 }, (_, index) => index + 1);

function PolicyBody() {
  const { language } = useLanguage();
  const w = WORDS[language];
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const financeEntityId = activeFinanceEntityId || '';
  const allowed = hasEffectiveCapability(accessState, 'finance.manage');
  const [record, setRecord] = useState<CountV3PolicyRecord|null>(null);
  const [minimum, setMinimum] = useState(2);
  const [maximum, setMaximum] = useState(20);
  const [allowAssisted, setAllowAssisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const epoch = useRef(0);
  const attempt = useRef<{fingerprint:string;key:string}|null>(null);

  const refresh = async () => {
    if (!organizationId || !financeEntityId || !allowed) return;
    const current = ++epoch.current;
    setLoading(true); setError(''); setMessage('');
    try {
      const next = await countV3Service.getPolicy(organizationId, financeEntityId);
      if (epoch.current !== current) return;
      setRecord(next);
      setMinimum(next.policy.minimumIndependentConfirmations);
      setMaximum(next.policy.maximumParticipants);
      setAllowAssisted(next.policy.allowAssisted);
      attempt.current = null;
    } catch { if (epoch.current === current) setError(w.error); }
    finally { if (epoch.current === current) setLoading(false); }
  };

  useEffect(() => {
    setRecord(null); attempt.current = null;
    void refresh();
    return () => { epoch.current++; };
    // The entity, organization and authorization scope define the policy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, financeEntityId, allowed, language]);

  if (!COUNT_V3_UI_ENABLED) return <Navigate to={APP_ROUTES.financeSettings} replace />;
  if (!allowed) return <main className="mx-auto max-w-xl p-6" role="alert">{w.restricted}</main>;
  const submit = async () => {
    if (!record || busy) return;
    if (minimum > maximum) { setError(w.invalid); return; }
    const policy: CountV3Policy = {
      policyVersion: 3, minimumIndependentConfirmations: minimum,
      maximumParticipants: maximum, allowAssisted,
      singleCounterRequiresTreasuryReview: true,
    };
    const fingerprint = JSON.stringify([organizationId,financeEntityId,record.revision,policy]);
    if (attempt.current?.fingerprint !== fingerprint) {
      if (typeof crypto?.randomUUID !== 'function') { setError(w.error); return; }
      attempt.current = { fingerprint, key: 'idcountpolicy_' + crypto.randomUUID() };
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await countV3Service.updatePolicy(organizationId,financeEntityId,policy,record.revision,attempt.current.key);
      setRecord(next); attempt.current=null; setMessage(w.saved);
    } catch (e) {
      setError((e as {status?:number})?.status===409 ? w.conflict : w.error);
    } finally { setBusy(false); }
  };

  return <main className="flex min-h-0 flex-1 flex-col bg-surface-base pb-20">
    <FinanceEntityContextBar areaName={w.title} />
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <Link to={APP_ROUTES.financeSettings} className="nf-interactive inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{w.back}
      </Link>
      <div>
        <div className="mb-3 flex items-center gap-2 text-accent-primary"><ShieldCheck className="h-6 w-6" aria-hidden="true" /><Users className="h-5 w-5" aria-hidden="true"/></div>
        <h1 className="text-2xl font-semibold text-text-primary">{w.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{w.intro}</p>
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-semantic-danger/10 p-4 text-sm text-semantic-danger">
        <AlertCircle className="h-4 w-4" aria-hidden="true"/>{error}
        <button type="button" onClick={() => void refresh()} className="ml-auto min-h-10 underline">{w.retry}</button>
      </div>}
      {message && <p role="status" className="rounded-xl bg-semantic-success/10 p-4 text-sm text-semantic-success">{message}</p>}
      {loading ? <p aria-live="polite" className="py-8 text-sm text-text-muted">{w.loading}</p> : record ? (
        <Surface variant="elevated" radius="xl" className="space-y-6 p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-text-primary">
              {w.team}
              <select className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3"
                value={maximum} onChange={event=>setMaximum(Number(event.target.value))}>
                {NUMBERS.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
              <span className="mt-2 block text-xs font-normal leading-relaxed text-text-muted">{w.teamHint}</span>
            </label>
            <label className="block text-sm font-semibold text-text-primary">
              {w.quorum}
              <select className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-3"
                value={minimum} onChange={event=>setMinimum(Number(event.target.value))}>
                {NUMBERS.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
              <span className="mt-2 block text-xs font-normal leading-relaxed text-text-muted">{w.quorumHint}</span>
            </label>
          </div>
          {minimum===1 && <p className="rounded-xl bg-semantic-warning/10 p-4 text-sm text-semantic-warning">{w.single}</p>}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle p-4">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-accent-primary"
              checked={allowAssisted} onChange={event=>setAllowAssisted(event.target.checked)} />
            <span><span className="block text-sm font-semibold text-text-primary">{w.assisted}</span>
              <span className="mt-2 block text-sm leading-relaxed text-text-muted">{w.assistedHint}</span></span>
          </label>
          <p className="rounded-xl bg-surface-secondary p-4 text-sm leading-relaxed text-text-secondary">{w.future}</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-text-muted">{w.version}: {record.revision}</span>
            <button type="button" disabled={busy || minimum>maximum}
              onClick={() => void submit()}
              className="nf-interactive min-h-12 rounded-xl bg-accent-primary px-6 text-sm font-semibold text-background-base disabled:opacity-50">
              {busy ? w.saving : w.save}
            </button>
          </div>
        </Surface>
      ) : null}
    </div>
  </main>;
}

export default function CountVerificationPolicyPage() {
  return <FinanceContextGuard><PolicyBody /></FinanceContextGuard>;
}
