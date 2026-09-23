import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, FlowFeedback, FlowStepHeader, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { countService, type CountProposalPreview } from '@/src/services/countService';
import { formatReviewDate, formatReviewMoney } from '../transactions/transactionReviewModel';

type EntryType = 'tithe' | 'offering' | 'other' | 'pix';
type SelectionState = Record<EntryType, {
  accountId: string;
  categoryId: string;
  fundId: string;
  editAccount: boolean;
  editCategory: boolean;
}>;

const COPY = {
  PT: {
    area: 'Preparar lançamentos',
    step: 'Passo 1 de 1',
    title: 'Confira o que vai para a revisão',
    body: 'O NestFinance montou propostas a partir da contagem conferida. Nada será contabilizado agora.',
    loading: 'Preparando as propostas…',
    loadError: 'Não foi possível preparar os lançamentos agora.',
    retry: 'Tentar novamente',
    back: 'Voltar para a contagem',
    sourceTitle: 'Origem verificada',
    sourceBody: 'Estes valores vêm da dupla contagem. Fotos e folhas continuam ligadas à origem.',
    firstCounter: 'Primeira contagem',
    secondCounter: 'Segunda contagem',
    evidence: 'Evidência',
    noEvidence: 'Sem foto vinculada. A trilha da contagem continua registrada.',
    lineLabels: { tithe: 'Dízimos', offering: 'Ofertas', other: 'Outras entradas', pix: 'Pix' },
    payment: { cash: 'Dinheiro', pix: 'Pix' },
    where: 'Onde este valor ficou?',
    category: 'Como classificar?',
    fund: 'Fundo (opcional)',
    suggested: 'Sugerido pelo NestFinance',
    change: 'Alterar',
    keep: 'Usar sugestão',
    chooseAccount: 'Escolha uma conta',
    chooseCategory: 'Escolha uma categoria',
    noFund: 'Sem fundo',
    missingTitle: 'Falta só completar alguns campos',
    missingBody: 'Preencha apenas os campos destacados. Os demais já foram sugeridos.',
    readyTitle: 'Tudo pronto para enviar à conferência',
    readyBody: 'Ao continuar, serão criados rascunhos em revisão. Nenhum saldo será alterado.',
    create: 'Criar lançamentos para conferência',
    creating: 'Criando propostas…',
    createError: 'Não foi possível criar os lançamentos. Nada foi contabilizado.',
    conflict: 'A contagem mudou. Recarregue antes de continuar.',
    createdTitle: 'Lançamentos já preparados',
    createdBody: 'Eles estão na fila de conferência e ainda não alteraram nenhum saldo.',
    review: 'Abrir fila de conferência',
    workflow: 'Etapa atual',
    workflowLabels: {
      counted: 'Contado',
      reviewed: 'Em conferência',
      deposited: 'Depositado',
      reconciled: 'Conferido com o banco',
      closed: 'Fechado',
    },
  },
  EN: {
    area: 'Prepare entries',
    step: 'Step 1 of 1',
    title: 'Review what will go to review',
    body: 'NestFinance built proposals from the verified count. Nothing will be posted now.',
    loading: 'Preparing proposals…',
    loadError: 'Could not prepare the entries right now.',
    retry: 'Try again',
    back: 'Back to count',
    sourceTitle: 'Verified source',
    sourceBody: 'These amounts come from the double count. Photos and sheets remain linked to the source.',
    firstCounter: 'First count',
    secondCounter: 'Second count',
    evidence: 'Evidence',
    noEvidence: 'No photo linked. The count audit trail remains recorded.',
    lineLabels: { tithe: 'Tithes', offering: 'Offerings', other: 'Other income', pix: 'Pix' },
    payment: { cash: 'Cash', pix: 'Pix' },
    where: 'Where did this amount stay?',
    category: 'How should it be classified?',
    fund: 'Fund (optional)',
    suggested: 'Suggested by NestFinance',
    change: 'Change',
    keep: 'Use suggestion',
    chooseAccount: 'Choose an account',
    chooseCategory: 'Choose a category',
    noFund: 'No fund',
    missingTitle: 'Only a few fields are missing',
    missingBody: 'Fill only the highlighted fields. The others are already suggested.',
    readyTitle: 'Ready to send for review',
    readyBody: 'Continuing creates review-ready drafts. No balance will change.',
    create: 'Create entries for review',
    creating: 'Creating proposals…',
    createError: 'Could not create the entries. Nothing was posted.',
    conflict: 'The count changed. Reload before continuing.',
    createdTitle: 'Entries already prepared',
    createdBody: 'They are in the review queue and still have not changed any balance.',
    review: 'Open review queue',
    workflow: 'Current stage',
    workflowLabels: {
      counted: 'Counted',
      reviewed: 'In review',
      deposited: 'Deposited',
      reconciled: 'Checked with bank',
      closed: 'Closed',
    },
  },
  ES: {
    area: 'Preparar movimientos',
    step: 'Paso 1 de 1',
    title: 'Revisa lo que irá a revisión',
    body: 'NestFinance armó propuestas desde el conteo verificado. Nada se contabilizará ahora.',
    loading: 'Preparando propuestas…',
    loadError: 'No fue posible preparar los movimientos ahora.',
    retry: 'Intentar de nuevo',
    back: 'Volver al conteo',
    sourceTitle: 'Origen verificado',
    sourceBody: 'Estos valores vienen del doble conteo. Fotos y hojas siguen vinculadas al origen.',
    firstCounter: 'Primer conteo',
    secondCounter: 'Segundo conteo',
    evidence: 'Evidencia',
    noEvidence: 'Sin foto vinculada. La trazabilidad del conteo sigue registrada.',
    lineLabels: { tithe: 'Diezmos', offering: 'Ofrendas', other: 'Otras entradas', pix: 'Pix' },
    payment: { cash: 'Efectivo', pix: 'Pix' },
    where: '¿Dónde quedó este valor?',
    category: '¿Cómo clasificarlo?',
    fund: 'Fondo (opcional)',
    suggested: 'Sugerido por NestFinance',
    change: 'Cambiar',
    keep: 'Usar sugerencia',
    chooseAccount: 'Elige una cuenta',
    chooseCategory: 'Elige una categoría',
    noFund: 'Sin fondo',
    missingTitle: 'Solo faltan algunos campos',
    missingBody: 'Completa solo los campos destacados. Los demás ya fueron sugeridos.',
    readyTitle: 'Todo listo para enviar a revisión',
    readyBody: 'Al continuar se crean borradores en revisión. Ningún saldo cambiará.',
    create: 'Crear movimientos para revisión',
    creating: 'Creando propuestas…',
    createError: 'No fue posible crear los movimientos. Nada fue contabilizado.',
    conflict: 'El conteo cambió. Recarga antes de continuar.',
    createdTitle: 'Movimientos ya preparados',
    createdBody: 'Están en la cola de revisión y aún no cambiaron ningún saldo.',
    review: 'Abrir cola de revisión',
    workflow: 'Etapa actual',
    workflowLabels: {
      counted: 'Contado',
      reviewed: 'En revisión',
      deposited: 'Depositado',
      reconciled: 'Conferido con el banco',
      closed: 'Cerrado',
    },
  },
} as const;

function makeToken(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function buildInitialSelections(preview: CountProposalPreview): SelectionState {
  const empty = {
    tithe: { accountId: '', categoryId: '', fundId: '', editAccount: true, editCategory: true },
    offering: { accountId: '', categoryId: '', fundId: '', editAccount: true, editCategory: true },
    other: { accountId: '', categoryId: '', fundId: '', editAccount: true, editCategory: true },
    pix: { accountId: '', categoryId: '', fundId: '', editAccount: true, editCategory: true },
  } satisfies SelectionState;

  for (const line of preview.lines) {
    empty[line.entryType] = {
      accountId: line.suggestedAccountId || '',
      categoryId: line.suggestedCategoryId || '',
      fundId: '',
      editAccount: !line.suggestedAccountId,
      editCategory: !line.suggestedCategoryId,
    };
  }
  return empty;
}

export default function CountProposalPage() {
  return (
    <FinanceContextGuard>
      <CountProposalContent />
    </FinanceContextGuard>
  );
}

function CountProposalContent() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { language } = useLanguage();
  const copy = COPY[language];
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const organizationId = accessState.organizationId || accessState.organization?.id || '';

  const [preview, setPreview] = useState<CountProposalPreview | null>(null);
  const [selections, setSelections] = useState<SelectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const attemptRef = useRef<{ identity: string; key: string } | null>(null);

  const load = async () => {
    if (!organizationId || !activeFinanceEntityId || !sessionId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await countService.proposalPreview(
        organizationId,
        activeFinanceEntityId,
        sessionId,
      );
      setPreview(response.preview);
      setSelections(buildInitialSelections(response.preview));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Canonical scope changes require a fresh preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId, sessionId]);

  const missingCount = useMemo(() => {
    if (!preview || !selections) return 0;
    return preview.lines.reduce((count, line) => {
      const selection = selections[line.entryType];
      return count + (selection.accountId ? 0 : 1) + (selection.categoryId ? 0 : 1);
    }, 0);
  }, [preview, selections]);

  const updateSelection = (
    type: EntryType,
    field: 'accountId' | 'categoryId' | 'fundId' | 'editAccount' | 'editCategory',
    value: string | boolean,
  ) => {
    setSelections((current) => current ? {
      ...current,
      [type]: { ...current[type], [field]: value },
    } : current);
    setCreateError(null);
  };

  const createDrafts = async () => {
    if (!preview || !selections || !activeFinanceEntityId || !sessionId || missingCount > 0 || creating) return;
    const payloadSelections = preview.lines.map((line) => ({
      entryType: line.entryType,
      accountId: selections[line.entryType].accountId,
      categoryId: selections[line.entryType].categoryId,
      fundId: selections[line.entryType].fundId || null,
    }));
    const identity = JSON.stringify({ version: preview.countVersion, payloadSelections });
    if (!attemptRef.current || attemptRef.current.identity !== identity) {
      attemptRef.current = { identity, key: makeToken('idcount_proposal') };
    }

    setCreating(true);
    setCreateError(null);
    try {
      await countService.createProposedDrafts(organizationId, activeFinanceEntityId, {
        countSessionId: sessionId,
        expectedVersion: preview.countVersion,
        selections: payloadSelections,
        idempotencyKey: attemptRef.current.key,
        requestId: makeToken('req'),
      });
      attemptRef.current = null;
      navigate(APP_ROUTES.financeReview);
    } catch (error: any) {
      setCreateError(
        error?.code === 'COUNT_VERSION_CONFLICT'
          ? 'conflict'
          : String(error?.code || 'error'),
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.area} />
        <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6" role="status">
          <Surface variant="elevated" radius="xl" className="animate-pulse p-6">
            <div className="h-7 w-56 rounded bg-surface-secondary" />
            <div className="mt-5 h-40 rounded-2xl bg-surface-secondary" />
          </Surface>
          <p className="mt-4 nf-helper-text text-text-muted">{copy.loading}</p>
        </div>
      </div>
    );
  }

  if (loadError || !preview || !selections) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.area} />
        <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
          <FlowFeedback tone="error" title={copy.loadError}>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button onClick={() => void load()}>{copy.retry}</Button>
              <Button variant="secondary" onClick={() => navigate(APP_ROUTES.countSession.replace(':sessionId', sessionId || ''))}>
                {copy.back}
              </Button>
            </div>
          </FlowFeedback>
        </div>
      </div>
    );
  }

  if (preview.alreadyCreated) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar areaName={copy.area} />
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
          <FlowFeedback tone="success" title={copy.createdTitle}>
            <p>{copy.createdBody}</p>
            <Button className="mt-5" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.financeReview)}>
              {copy.review}
            </Button>
          </FlowFeedback>
        </div>
      </div>
    );
  }

  const workflowLabel = preview.workflowState
    ? copy.workflowLabels[preview.workflowState]
    : copy.workflowLabels.counted;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-base pb-28 md:pb-8">
      <FinanceEntityContextBar areaName={copy.area} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <FlowStepHeader
            currentStep={1}
            totalSteps={1}
            stepLabel={copy.step}
            title={copy.title}
            description={copy.body}
          />

          <Surface variant="secondary" radius="xl" className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{copy.sourceTitle}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{copy.sourceBody}</p>
              </div>
              <span className="rounded-full border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-semibold text-text-secondary">
                {copy.workflow}: {workflowLabel}
              </span>
            </div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-base p-4">
                <dt className="nf-helper-text text-text-muted">{copy.firstCounter}</dt>
                <dd className="mt-1 font-semibold text-text-primary">{preview.firstCounterLabel || '—'}</dd>
              </div>
              <div className="rounded-xl bg-surface-base p-4">
                <dt className="nf-helper-text text-text-muted">{copy.secondCounter}</dt>
                <dd className="mt-1 font-semibold text-text-primary">{preview.secondCounterLabel || '—'}</dd>
              </div>
            </dl>
            <p className="mt-4 nf-helper-text text-text-muted">
              {preview.serviceLabel} · {formatReviewDate(`${preview.serviceDate}T12:00:00.000Z`, language)}
            </p>
            {preview.sourceCaptureIds.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {preview.sourceCaptureIds.map((captureId, index) => (
                  <Button
                    key={captureId}
                    variant="secondary"
                    onClick={() => navigate(APP_ROUTES.countCaptureReview.replace(':captureId', captureId))}
                  >
                    {copy.evidence} {index + 1}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-4 nf-helper-text text-text-muted">{copy.noEvidence}</p>
            )}
          </Surface>

          {preview.lines.map((line) => {
            const selection = selections[line.entryType];
            const account = preview.accountOptions.find((item) => item.id === selection.accountId);
            const category = preview.categoryOptions.find((item) => item.id === selection.categoryId);
            return (
              <Surface key={line.lineId} variant="elevated" radius="xl" className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">{copy.lineLabels[line.entryType]}</h2>
                    <p className="mt-1 text-sm text-text-muted">{copy.payment[line.paymentMethod]}</p>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums text-text-primary">
                    {formatReviewMoney(line.amountCents, language, 'BRL')}
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="font-semibold text-text-primary">{copy.where}</label>
                    {!selection.editAccount && account ? (
                      <div className="mt-2 rounded-xl border border-semantic-success/20 bg-semantic-success/10 p-4">
                        <p className="nf-helper-text text-text-muted">{copy.suggested}</p>
                        <p className="mt-1 font-semibold text-text-primary">{account.name}</p>
                        <Button className="mt-3" variant="ghost" onClick={() => updateSelection(line.entryType, 'editAccount', true)}>
                          {copy.change}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={selection.accountId}
                          onChange={(event) => updateSelection(line.entryType, 'accountId', event.target.value)}
                          className={`mt-2 min-h-14 w-full rounded-xl border bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary ${selection.accountId ? 'border-border-subtle' : 'border-semantic-warning'}`}
                        >
                          <option value="">{copy.chooseAccount}</option>
                          {preview.accountOptions.map((option) => (
                            <option key={option.id} value={option.id}>{option.name}</option>
                          ))}
                        </select>
                        {line.suggestedAccountId && selection.accountId === line.suggestedAccountId ? (
                          <Button className="mt-2" variant="ghost" onClick={() => updateSelection(line.entryType, 'editAccount', false)}>
                            {copy.keep}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div>
                    <label className="font-semibold text-text-primary">{copy.category}</label>
                    {!selection.editCategory && category ? (
                      <div className="mt-2 rounded-xl border border-semantic-success/20 bg-semantic-success/10 p-4">
                        <p className="nf-helper-text text-text-muted">{copy.suggested}</p>
                        <p className="mt-1 font-semibold text-text-primary">{category.name}</p>
                        <Button className="mt-3" variant="ghost" onClick={() => updateSelection(line.entryType, 'editCategory', true)}>
                          {copy.change}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={selection.categoryId}
                          onChange={(event) => updateSelection(line.entryType, 'categoryId', event.target.value)}
                          className={`mt-2 min-h-14 w-full rounded-xl border bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary ${selection.categoryId ? 'border-border-subtle' : 'border-semantic-warning'}`}
                        >
                          <option value="">{copy.chooseCategory}</option>
                          {preview.categoryOptions.map((option) => (
                            <option key={option.id} value={option.id}>{option.name}</option>
                          ))}
                        </select>
                        {line.suggestedCategoryId && selection.categoryId === line.suggestedCategoryId ? (
                          <Button className="mt-2" variant="ghost" onClick={() => updateSelection(line.entryType, 'editCategory', false)}>
                            {copy.keep}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                <label className="mt-4 block">
                  <span className="font-semibold text-text-primary">{copy.fund}</span>
                  <select
                    value={selection.fundId}
                    onChange={(event) => updateSelection(line.entryType, 'fundId', event.target.value)}
                    className="mt-2 min-h-14 w-full rounded-xl border border-border-subtle bg-surface-base px-4 text-base text-text-primary outline-none focus:border-accent-primary"
                  >
                    <option value="">{copy.noFund}</option>
                    {preview.fundOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </label>
              </Surface>
            );
          })}

          {missingCount > 0 ? (
            <FlowFeedback tone="warning" title={copy.missingTitle}>
              <p>{copy.missingBody}</p>
            </FlowFeedback>
          ) : (
            <FlowFeedback tone="success" title={copy.readyTitle}>
              <p>{copy.readyBody}</p>
            </FlowFeedback>
          )}

          {createError ? (
            <FlowFeedback
              tone="error"
              title={createError === 'conflict' ? copy.conflict : copy.createError}
              action={createError === 'conflict' ? <Button variant="secondary" onClick={() => void load()}>{copy.retry}</Button> : undefined}
            />
          ) : null}

          <div className="sticky bottom-0 z-20 -mx-4 border-t border-border-subtle bg-surface-base/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,16px))] backdrop-blur-md sm:-mx-6 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="secondary" size="lg" fullWidth onClick={() => navigate(APP_ROUTES.countSession.replace(':sessionId', sessionId || ''))}>
                {copy.back}
              </Button>
              <Button size="lg" fullWidth disabled={missingCount > 0 || creating} onClick={() => void createDrafts()}>
                {creating ? copy.creating : copy.create}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
