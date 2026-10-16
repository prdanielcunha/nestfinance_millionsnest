import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCopy, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countV3Service, COUNT_V3_UI_ENABLED, type CountV3Session } from '@/src/services/countV3Service';
import type { CountEntryDraft, CountEntryType } from '../../../../shared/finance/count.js';

const WORDS = {
  PT: {
    title: 'Conferência em equipe',
    subtitle: 'Cada pessoa registra sua conferência. Os valores dos outros ficam ocultos até o encerramento.',
    newSession: 'Abrir contagem do culto',
    label: 'Qual foi o culto?',
    date: 'Data do culto',
    create: 'Criar contagem',
    joinTitle: 'Participar da contagem',
    joinCode: 'Código de convite',
    join: 'Entrar na equipe',
    codeTitle: 'Convide sua equipe', regenerate: 'Gerar novo convite',
    codeHelp: 'Compartilhe o código apenas com quem participará desta contagem. Ele expira em 4 horas.',
    copy: 'Copiar código',
    open: 'Abrir contagem',
    mySessions: 'Contagens da equipe',
    empty: 'Ainda não há contagens para esta igreja e seu perfil.',
    loading: 'Carregando...',
    retry: 'Tentar novamente',
    independent: 'Contagem independente',
    assisted: 'Registrar contagem de outra pessoa',
    assistedHelp: 'Use quando alguém contou no papel ou não tem acesso. Esse registro não substitui uma segunda conferência independente.',
    name: 'Nome de quem contou',
    tithe: 'Dízimos (R$)',
    offering: 'Ofertas (R$)',
    other: 'Outras contribuições (R$)',
    pix: 'PIX (R$)',
    submit: 'Salvar minha conferência',
    pending: 'Aguardando outras conferências',
    matched: 'Conferências coincidentes',
    divergent: 'Valores divergentes — necessita revisão',
    treasury: 'Conferência única — revisão financeira obrigatória',
    statusTip: 'A contagem não lança automaticamente entradas nem movimenta saldos. O financeiro fará a etapa seguinte.',
    wait: 'Os dados da outra pessoa continuam protegidos enquanto a contagem está aberta.',
    saved: 'Sua conferência foi registrada e lacrada.',
    already: 'Você já registrou uma conferência independente.',
    progress: 'Conferências independentes',
    team: 'Participantes',
    back: 'Voltar à contagem',
    permission: 'Seu perfil permite consultar, mas não registrar conferências.',
    error: 'Não foi possível concluir. Verifique sua conexão e tente novamente.',
    conflict: 'Esta contagem foi atualizada por outra pessoa. Recarregue os dados antes de continuar.',
    invalid: 'Informe pelo menos um valor válido. Zero é aceito quando foi conferido.',
  },
  EN: {
    title: 'Team verification', subtitle: 'Each person records their own count. Other values remain hidden until the process closes.',
    newSession: 'Start a service count', label: 'Service name', date: 'Service date', create: 'Create count',
    joinTitle: 'Join a count', joinCode: 'Invitation code', join: 'Join the team',
    codeTitle: 'Invite your team', regenerate: 'Generate a new invitation', codeHelp: 'Share this code only with assigned participants. It expires in 4 hours.',
    copy: 'Copy code', open: 'Open count', mySessions: 'Team counts', empty: 'No counts available for this church and role.',
    loading: 'Loading...', retry: 'Try again',
    independent: 'Independent count', assisted: 'Record someone else’s count',
    assistedHelp: 'For someone who counted on paper or has no account. This does not count as a second independent check.',
    name: 'Name of physical counter', tithe: 'Tithes (BRL)', offering: 'Offerings (BRL)',
    other: 'Other contributions (BRL)', pix: 'PIX (BRL)', submit: 'Save my count',
    pending: 'Awaiting other verifications', matched: 'Counts match',
    divergent: 'Count difference — needs review', treasury: 'Single verification — financial review required',
    statusTip: 'Counting never automatically posts income or changes balances. The finance team handles the next step.',
    wait: 'Other people’s amounts are protected while the count remains open.',
    saved: 'Your count was recorded and sealed.', already: 'You have already entered an independent count.',
    progress: 'Independent confirmations', team: 'Participants', back: 'Back to counts',
    permission: 'Your role allows reading, not submitting counts.',
    error: 'Could not complete this action. Check your connection and try again.',
    conflict: 'Someone else updated this count. Refresh before continuing.',
    invalid: 'Enter at least one valid amount. A verified zero is allowed.',
  },
  ES: {
    title: 'Conferencia en equipo', subtitle: 'Cada persona registra su conteo. Los importes ajenos permanecen ocultos hasta cerrar.',
    newSession: 'Abrir conteo del culto', label: 'Nombre del culto', date: 'Fecha del culto', create: 'Crear conteo',
    joinTitle: 'Participar del conteo', joinCode: 'Código de invitación', join: 'Unirse al equipo',
    codeTitle: 'Invite a su equipo', regenerate: 'Generar una nueva invitación', codeHelp: 'Comparta el código solo con los participantes. Vence en 4 horas.',
    copy: 'Copiar código', open: 'Abrir conteo', mySessions: 'Conteos del equipo', empty: 'No hay conteos disponibles para esta iglesia y función.',
    loading: 'Cargando...', retry: 'Intentar de nuevo',
    independent: 'Conteo independiente', assisted: 'Registrar el conteo de otra persona',
    assistedHelp: 'Para alguien que contó en papel o no tiene cuenta. No equivale a una segunda verificación independiente.',
    name: 'Nombre de quien contó', tithe: 'Diezmos (BRL)', offering: 'Ofrendas (BRL)',
    other: 'Otras contribuciones (BRL)', pix: 'PIX (BRL)', submit: 'Guardar mi conteo',
    pending: 'Esperando otras verificaciones', matched: 'Conteos coincidentes',
    divergent: 'Diferencia detectada — requiere revisión', treasury: 'Conferencia única — revisión financiera obligatoria',
    statusTip: 'El conteo no registra ingresos ni cambia saldos automáticamente. Finanzas hará el próximo paso.',
    wait: 'Los importes de otras personas están protegidos mientras el conteo esté abierto.',
    saved: 'Su conteo fue registrado y sellado.', already: 'Ya registró un conteo independiente.',
    progress: 'Confirmaciones independientes', team: 'Participantes', back: 'Volver a conteos',
    permission: 'Su función permite consultar, pero no registrar conteos.',
    error: 'No se pudo completar. Revise su conexión e intente de nuevo.',
    conflict: 'Alguien actualizó este conteo. Recargue antes de continuar.',
    invalid: 'Indique al menos un importe válido. Se acepta cero verificado.',
  },
} as const;

const TYPES: CountEntryType[] = ['tithe', 'offering', 'other', 'pix'];

function cents(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number > 100000000) return null;
  return Math.round(number * 100);
}

function makeEntries(raw: Record<CountEntryType, string>): CountEntryDraft[] | null {
  const entries: CountEntryDraft[] = [];
  for (const type of TYPES) {
    if (!raw[type].trim()) continue;
    const amount = cents(raw[type]);
    if (amount === null) return null;
    // A deliberately entered zero is valid evidence, not the same as blank.
    entries.push({ type, method: 'total', totalCents: amount });
  }
  return entries.length ? entries : null;
}

function CountVerificationBody() {
  const { sessionId } = useParams<{sessionId?:string}>();
  const navigate = useNavigate();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const w = WORDS[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const entityId = activeFinanceEntityId || '';
  const enabled = COUNT_V3_UI_ENABLED;
  const canCreate = hasEffectiveCapability(accessState, 'finance.count.execute');
  const [items, setItems] = useState<CountV3Session[]>([]);
  const [session, setSession] = useState<CountV3Session | null>(null);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  });
  const [joinCode, setJoinCode] = useState('');
  const [invite, setInvite] = useState<{sessionId:string;code:string}|null>(null);
  const [values, setValues] = useState<Record<CountEntryType,string>>({ tithe:'', offering:'', other:'', pix:'' });
  const [mode, setMode] = useState<'independent'|'assisted'>('independent');
  const [physicalCounterLabel, setPhysicalCounterLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestEpoch = useRef(0);
  const retries = useRef<Record<string,{fingerprint:string;key:string}>>({});
  const retryKey = (kind: string, fingerprint: string) => {
    if (retries.current[kind]?.fingerprint !== fingerprint) {
      if (typeof crypto?.randomUUID !== 'function') throw new Error('COUNT_SECURE_RANDOM_UNAVAILABLE');
      retries.current[kind] = { fingerprint, key: 'idcountv3_' + crypto.randomUUID() };
    }
    return retries.current[kind].key;
  };

  const refresh = useCallback(async () => {
    if (!enabled || !organizationId || !entityId) return;
    const epoch = ++requestEpoch.current;
    setLoading(true);
    setError('');
    try {
      if (sessionId) {
        const response = await countV3Service.detail(organizationId, entityId, sessionId);
        if (epoch === requestEpoch.current) setSession(response.session);
      } else {
        const response = await countV3Service.list(organizationId, entityId);
        if (epoch === requestEpoch.current) setItems(response.items);
      }
    } catch {
      if (epoch === requestEpoch.current) setError(w.error);
    } finally {
      if (epoch === requestEpoch.current) setLoading(false);
    }
  }, [enabled, organizationId, entityId, sessionId, w.error]);

  useEffect(() => {
    setSession(null);
    setItems([]);
    setInvite(null);
    retries.current = {};
    setMessage('');
    void refresh();
    return () => { requestEpoch.current++; };
  }, [refresh]);

  if (!enabled) return <Navigate to={APP_ROUTES.count} replace />;
  const startPath = APP_ROUTES.countVerificationV3;
  const messageFor = (e: unknown) =>
    (e as {status?:number})?.status === 409 ? w.conflict : w.error;

  const create = async () => {
    if (!canCreate || busy || !label.trim() || !date) return;
    setBusy(true); setError('');
    try {
      const key = retryKey('create', JSON.stringify([organizationId, entityId, label.trim(), date]));
      const result = await countV3Service.create(organizationId, entityId, label.trim(), date, key);
      delete retries.current.create;
      setInvite({ sessionId: result.countSessionId, code: result.joinCode });
      await refresh();
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  };

  const join = async () => {
    if (!canCreate || busy || !joinCode.trim()) return;
    setBusy(true); setError('');
    try {
      const key = retryKey('join', JSON.stringify([organizationId, entityId, joinCode.trim().toUpperCase()]));
      const result = await countV3Service.join(organizationId, entityId, joinCode, key);
      delete retries.current.join;
      navigate(startPath + '/' + result.countSessionId);
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  };

  const regenerateInvite = async () => {
    if (!session || !session.canManageInvite || !canCreate || busy) return;
    setBusy(true); setError('');
    try {
      const key = retryKey('refresh', JSON.stringify([organizationId, entityId, session.id, session.version]));
      const result = await countV3Service.refreshInvite(organizationId, entityId, session.id, session.version, key);
      delete retries.current.refresh;
      setInvite({ sessionId: result.countSessionId, code: result.joinCode });
      await refresh();
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!session || !canCreate || busy || session.status !== 'pending') return;
    const entries = makeEntries(values);
    if (!entries) { setError(w.invalid); return; }
    if (mode === 'assisted' && !physicalCounterLabel.trim()) { setError(w.invalid); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const key = retryKey('submit', JSON.stringify([organizationId, entityId, session.id, session.version, mode, physicalCounterLabel, entries]));
      await countV3Service.submit(organizationId, entityId, {
        countSessionId: session.id, expectedVersion: session.version,
        mode, physicalCounterLabel, entries,
      }, key);
      delete retries.current.submit;
      setMessage(w.saved);
      setValues({ tithe:'', offering:'', other:'', pix:'' });
      await refresh();
    } catch (e) { setError(messageFor(e)); }
    finally { setBusy(false); }
  };

  const statusLabels = {
    pending: w.pending, matched: w.matched,
    divergent: w.divergent, requires_treasury_review: w.treasury,
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pb-24 pt-6 sm:px-6">
      <Link to={sessionId ? startPath : APP_ROUTES.count} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{w.back}
      </Link>
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-primary/10 px-3 py-1 text-xs font-semibold text-accent-primary">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {w.title}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{session?.serviceLabel || w.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">{w.subtitle}</p>
      </div>
      <Surface variant="elevated" radius="lg" className="p-4 sm:p-5">
        <div className="flex gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-text-muted">{w.statusTip}</p>
        </div>
      </Surface>
      {message && <p role="status" className="rounded-xl bg-semantic-success/10 p-4 text-sm text-semantic-success">{message}</p>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl bg-semantic-danger/10 p-4 text-sm text-semantic-danger">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}
        <button type="button" className="ml-auto underline" onClick={() => void refresh()}>{w.retry}</button>
      </div>}
      {loading ? <p aria-live="polite" className="p-6 text-sm text-text-muted">{w.loading}</p> : sessionId && session ? (
        <>
          <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{session.serviceDate}</p>
                <p className="mt-2 text-lg font-semibold text-text-primary">{statusLabels[session.status]}</p>
              </div>
              <span className="rounded-xl bg-surface-secondary px-3 py-2 text-sm font-semibold text-text-secondary">
                {session.independentConfirmed} / {session.policySnapshot.minimumIndependentConfirmations} — {w.progress}
              </span>
            </div>
            <div className="mt-5 flex items-center gap-2 border-t border-border-subtle pt-4 text-sm text-text-muted">
              <Users className="h-4 w-4" aria-hidden="true" /> {session.participantCount} {w.team.toLowerCase()}
            </div>
            {session.materialHidden && <p className="mt-3 rounded-lg bg-accent-primary/10 p-3 text-sm text-accent-primary">{w.wait}</p>}
            {session.canManageInvite && canCreate &&
                session.participantCount < session.policySnapshot.maximumParticipants && (
              <div className="mt-4 border-t border-border-subtle pt-4">
                <button type="button" disabled={busy} onClick={() => void regenerateInvite()}
                  className="nf-interactive min-h-11 rounded-xl border border-border-subtle px-4 text-sm font-semibold text-accent-primary disabled:opacity-50">
                  {busy ? w.loading : w.regenerate}
                </button>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">{w.codeHelp}</p>
              </div>
            )}
            {invite?.sessionId === session.id && (
              <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface-secondary p-4">
                <code className="font-mono text-xl font-semibold tracking-wider text-text-primary">{invite.code}</code>
                <button type="button" onClick={() => void navigator.clipboard?.writeText(invite.code)}
                  className="nf-interactive inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle px-3 text-sm font-semibold text-text-primary">
                  <ClipboardCopy className="h-4 w-4" aria-hidden="true" />{w.copy}
                </button>
              </div>
            )}

          </Surface>
          {session.status === 'pending' ? (
            <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
              {canCreate ? (
                <div className="space-y-5">
                  <fieldset>
                    <legend className="text-sm font-semibold text-text-primary">{w.title}</legend>
                    <div className="mt-3 grid gap-2">
                      {(['independent','assisted'] as const).filter(value => value === 'independent' || session.policySnapshot.allowAssisted).map(value => (
                        <label key={value} className="flex min-h-12 items-center gap-3 rounded-xl border border-border-subtle p-3 text-sm text-text-primary">
                          <input type="radio" name="count_mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                          {value === 'independent' ? w.independent : w.assisted}
                        </label>
                      ))}
                    </div>
                    {mode === 'assisted' && <p className="mt-2 text-xs leading-relaxed text-text-muted">{w.assistedHelp}</p>}
                  </fieldset>
                  {mode === 'assisted' && <label className="block text-sm font-medium text-text-primary">
                    {w.name}
                    <input value={physicalCounterLabel} onChange={event => setPhysicalCounterLabel(event.target.value)}
                      maxLength={120} className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-base p-3" />
                  </label>}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {TYPES.map(type => (
                      <label key={type} className="block text-sm font-medium text-text-primary">
                        {w[type]}
                        <input inputMode="decimal" placeholder="0,00" value={values[type]}
                          onChange={event => setValues(prev => ({...prev,[type]:event.target.value}))}
                          className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base tabular-nums text-text-primary" />
                      </label>
                    ))}
                  </div>
                  {mode === 'independent' && session.ownConfirmations.some(c => c.mode === 'independent') && (
                    <p className="text-sm font-medium text-semantic-warning">{w.already}</p>
                  )}
                  <button type="button" disabled={busy || (mode === 'independent' && session.ownConfirmations.some(c => c.mode === 'independent'))}
                    onClick={() => void submit()}
                    className="nf-interactive min-h-12 w-full rounded-xl bg-accent-primary px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? w.loading : w.submit}
                  </button>
                </div>
              ) : <p className="text-sm text-text-muted">{w.permission}</p>}
            </Surface>
          ) : <Surface variant="elevated" radius="xl" className="flex items-center gap-3 p-6">
            <CheckCircle2 className="h-6 w-6 text-accent-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-text-primary">{statusLabels[session.status]}</p>
          </Surface>}
        </>
      ) : !sessionId ? (
        <>
          {canCreate && <div className="grid gap-4 lg:grid-cols-2">
            <Surface variant="elevated" radius="xl" className="space-y-4 p-5">
              <h2 className="font-semibold text-text-primary">{w.newSession}</h2>
              <label className="block text-sm text-text-secondary">{w.label}
                <input value={label} onChange={event=>setLabel(event.target.value)} maxLength={120}
                  className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-text-primary" />
              </label>
              <label className="block text-sm text-text-secondary">{w.date}
                <input type="date" value={date} onChange={event=>setDate(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-text-primary" />
              </label>
              <button type="button" disabled={busy || !label.trim() || !date} onClick={()=>void create()}
                className="nf-interactive min-h-12 w-full rounded-xl bg-accent-primary px-4 font-semibold text-white disabled:opacity-50">
                {busy ? w.loading : w.create}
              </button>
            </Surface>
            <Surface variant="elevated" radius="xl" className="space-y-4 p-5">
              <h2 className="font-semibold text-text-primary">{w.joinTitle}</h2>
              <label className="block text-sm text-text-secondary">{w.joinCode}
                <input value={joinCode} onChange={event=>setJoinCode(event.target.value.toUpperCase())} maxLength={15}
                  autoCapitalize="characters" autoComplete="off"
                  className="mt-2 min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base px-4 font-mono tracking-widest text-text-primary" />
              </label>
              <button type="button" disabled={busy || !joinCode.trim()} onClick={()=>void join()}
                className="nf-interactive min-h-12 w-full rounded-xl border border-border-subtle bg-surface-secondary px-4 font-semibold text-text-primary disabled:opacity-50">
                {busy ? w.loading : w.join}
              </button>
            </Surface>
          </div>}
          {invite && <Surface variant="elevated" radius="xl" className="p-5">
            <h2 className="text-lg font-semibold text-text-primary">{w.codeTitle}</h2>
            <p className="mt-2 text-sm text-text-muted">{w.codeHelp}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="rounded-xl bg-surface-secondary p-4 font-mono text-xl tracking-widest text-text-primary">{invite.code}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(invite.code)}
                className="nf-interactive inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle px-4 text-sm font-semibold text-text-primary">
                <ClipboardCopy className="h-4 w-4" aria-hidden="true" />{w.copy}
              </button>
              <button type="button" onClick={() => navigate(startPath+'/'+invite.sessionId)}
                className="nf-interactive min-h-11 rounded-xl bg-accent-primary px-4 text-sm font-semibold text-white">{w.open}</button>
            </div>
          </Surface>}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">{w.mySessions}</h2>
            {items.length ? <div className="grid gap-3 sm:grid-cols-2">
              {items.map(item => <Link key={item.id} to={startPath+'/'+item.id}>
                <Surface variant="elevated" radius="lg" className="p-5">
                  <p className="font-semibold text-text-primary">{item.serviceLabel}</p>
                  <p className="mt-2 text-sm text-text-muted">{item.serviceDate}</p>
                  <p className="mt-3 text-xs font-semibold text-accent-primary">{statusLabels[item.status]}</p>
                </Surface>
              </Link>)}
            </div> : <p className="rounded-xl bg-surface-secondary p-6 text-sm text-text-muted">{w.empty}</p>}
          </div>
        </>
      ) : null}
    </main>
  );
}

export default function CountVerificationV3Page() {
  return <FinanceContextGuard><CountVerificationBody /></FinanceContextGuard>;
}
