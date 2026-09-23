import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, FlowFeedback, Surface } from '@/src/components/foundation';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useLanguage } from '@/src/contexts/LanguageContext';
import type { CountSessionDetail } from '@/src/services/countService';
import { formatReviewDate } from '../transactions/transactionReviewModel';

type Props = {
  session: CountSessionDetail;
  organizationId: string;
  financeEntityId: string;
  canEdit: boolean;
  onReload: () => void | Promise<void>;
};

const COPY = {
  PT: {
    title: 'Passe a contagem para outra pessoa',
    body: 'A primeira contagem foi protegida. Agora outra pessoa precisa fazer a segunda sem ver nenhum valor anterior.',
    code: 'Código para o segundo contador',
    expires: 'Válido até',
    copy: 'Copiar código',
    copied: 'Código copiado',
    share: 'Compartilhar',
    refresh: 'Atualizar status',
    newCode: 'Gerar novo código',
    refreshingCode: 'Gerando novo código…',
    refreshError: 'Não foi possível gerar outro código agora.',
    back: 'Voltar às contagens',
    assigned: (name: string) => `${name} assumiu a segunda contagem.`,
    waiting: 'Aguardando outra pessoa entrar com o código.',
    otherTitle: 'Use o código para assumir esta contagem',
    otherBody: 'Para manter a conferência independente, entre pelo código recebido. Os valores do primeiro contador continuam ocultos.',
    join: 'Digitar código',
    takenTitle: 'Outra pessoa já assumiu esta contagem',
    takenBody: (name: string) => `Responsável pela segunda contagem: ${name}.`,
  },
  EN: {
    title: 'Hand the count to another person',
    body: 'The first count is protected. Another person must now perform the second count without seeing previous values.',
    code: 'Code for the second counter',
    expires: 'Valid until',
    copy: 'Copy code',
    copied: 'Code copied',
    share: 'Share',
    refresh: 'Refresh status',
    newCode: 'Generate new code',
    refreshingCode: 'Generating new code…',
    refreshError: 'Could not generate another code right now.',
    back: 'Back to counts',
    assigned: (name: string) => `${name} claimed the second count.`,
    waiting: 'Waiting for another person to enter the code.',
    otherTitle: 'Use the code to claim this count',
    otherBody: 'To keep the review independent, join using the code you received. The first counter values stay hidden.',
    join: 'Enter code',
    takenTitle: 'Another person already claimed this count',
    takenBody: (name: string) => `Second-count owner: ${name}.`,
  },
  ES: {
    title: 'Pasa el conteo a otra persona',
    body: 'El primer conteo quedó protegido. Ahora otra persona debe hacer el segundo sin ver ningún valor anterior.',
    code: 'Código para el segundo contador',
    expires: 'Válido hasta',
    copy: 'Copiar código',
    copied: 'Código copiado',
    share: 'Compartir',
    refresh: 'Actualizar estado',
    newCode: 'Generar nuevo código',
    refreshingCode: 'Generando nuevo código…',
    refreshError: 'No fue posible generar otro código ahora.',
    back: 'Volver a conteos',
    assigned: (name: string) => `${name} asumió el segundo conteo.`,
    waiting: 'Esperando que otra persona ingrese con el código.',
    otherTitle: 'Usa el código para asumir este conteo',
    otherBody: 'Para mantener la revisión independiente, entra con el código recibido. Los valores del primer contador siguen ocultos.',
    join: 'Escribir código',
    takenTitle: 'Otra persona ya asumió este conteo',
    takenBody: (name: string) => `Responsable del segundo conteo: ${name}.`,
  },
} as const;

export function CountSecondCounterGate({
  session,
  organizationId,
  financeEntityId,
  canEdit,
  onReload,
}: Props) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COPY[language];
  const [copied, setCopied] = useState(false);
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  const firstUser = session.currentUserIsFirstCounter === true;
  const assignedToOther = Boolean(
    session.secondCounterAssigned && !session.currentUserIsSecondCounter,
  );
  const assignedName = session.secondCountAssignedToLabel || (
    language === 'PT' ? 'Outra pessoa' : language === 'ES' ? 'Otra persona' : 'Another person'
  );
  const joinCode = session.secondCountJoinCode || '';
  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined' || !joinCode) return '';
    return `${window.location.origin}${APP_ROUTES.countJoin}?code=${encodeURIComponent(joinCode)}`;
  }, [joinCode]);

  const copyCode = async () => {
    if (!joinCode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(joinCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const refreshCode = async () => {
    if (!canEdit || refreshingCode || !firstUser || session.secondCounterAssigned) return;
    setRefreshingCode(true);
    setRefreshError(false);
    try {
      await countService.refreshSecondInvite(organizationId, financeEntityId, {
        countSessionId: session.id,
        expectedVersion: session.version,
        idempotencyKey: `idcount_invite_${crypto.randomUUID()}`,
        requestId: `req_${crypto.randomUUID()}`,
      });
      await onReload();
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshingCode(false);
    }
  };

  const shareCode = async () => {
    if (!joinCode || !('share' in navigator)) {
      await copyCode();
      return;
    }
    await navigator.share({
      title: copy.code,
      text: `${copy.code}: ${joinCode}`,
      url: joinUrl || undefined,
    });
  };

  if (!firstUser) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.code} />
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
          <Surface variant="elevated" radius="xl" className="p-6">
            <h1 className="text-2xl font-semibold text-text-primary">
              {assignedToOther ? copy.takenTitle : copy.otherTitle}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-text-muted">
              {assignedToOther ? copy.takenBody(assignedName) : copy.otherBody}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {!assignedToOther ? (
                <Button size="lg" fullWidth onClick={() => navigate(APP_ROUTES.countJoin)}>
                  {copy.join}
                </Button>
              ) : null}
              <Button variant="secondary" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.count)}>
                {copy.back}
              </Button>
            </div>
          </Surface>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar areaName={copy.code} />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <Surface variant="elevated" radius="xl" className="p-6">
          <h1 className="text-2xl font-semibold text-text-primary">{copy.title}</h1>
          <p className="mt-2 text-base leading-relaxed text-text-muted">{copy.body}</p>

          {session.secondCounterAssigned ? (
            <FlowFeedback tone="success" title={copy.assigned(assignedName)} className="mt-5" />
          ) : (
            <FlowFeedback tone="info" title={copy.waiting} className="mt-5" />
          )}
          {refreshError ? (
            <FlowFeedback tone="error" title={copy.refreshError} className="mt-4" />
          ) : null}

          {joinCode && !session.secondCounterAssigned ? (
            <div className="mt-5 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-5 text-center">
              <p className="nf-helper-text font-semibold uppercase tracking-[0.12em] text-text-muted">
                {copy.code}
              </p>
              <p className="mt-3 font-mono text-3xl font-semibold tracking-[0.16em] text-text-primary sm:text-4xl">
                {joinCode}
              </p>
              {session.secondCountInviteExpiresAt ? (
                <p className="mt-3 nf-helper-text text-text-muted">
                  {copy.expires}: {formatReviewDate(session.secondCountInviteExpiresAt, language)}
                </p>
              ) : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" size="lg" fullWidth onClick={() => void copyCode()}>
                  {copied ? copy.copied : copy.copy}
                </Button>
                <Button size="lg" fullWidth onClick={() => void shareCode()}>
                  {copy.share}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {!session.secondCounterAssigned ? (
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                disabled={!canEdit || refreshingCode}
                onClick={() => void refreshCode()}
              >
                {refreshingCode ? copy.refreshingCode : copy.newCode}
              </Button>
            ) : null}
            <Button size="lg" fullWidth onClick={() => void onReload()}>
              {copy.refresh}
            </Button>
            <Button variant="ghost" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.count)} className="sm:col-span-2">
              {copy.back}
            </Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
