import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import type { Language } from '@/src/contexts/LanguageContext';
import { reconciliationService } from '@/src/services/reconciliationService';
import type {
  ReconciliationProgressLine,
  ReconciliationProgressLineState,
  ReconciliationProgressResponse,
} from '../../../../shared/finance/reconciliationProgress.js';

type Props = {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  accountId: string;
  language: Language;
};

type Copy = {
  title: string;
  body: string;
  loading: string;
  refresh: string;
  errorTitle: string;
  errorBody: string;
  identified: string;
  confirmed: string;
  remaining: string;
  attention: string;
  scopeTitle: string;
  scopeBody: string;
  states: Record<ReconciliationProgressLineState, string>;
  date: string;
  amount: string;
  direction: string;
  inflow: string;
  outflow: string;
  unknown: string;
  possibilities: string;
  openTransaction: string;
};

const COPY: Record<Language, Copy> = {
  PT: {
    title: 'Andamento da conferência',
    body: 'Veja o que já foi conferido e o que ainda precisa de atenção entre os itens identificados neste extrato.',
    loading: 'Atualizando andamento…',
    refresh: 'Atualizar andamento',
    errorTitle: 'Não foi possível atualizar o andamento',
    errorBody: 'Tente novamente. Nenhum dado financeiro foi alterado.',
    identified: 'Itens identificados',
    confirmed: 'Já conferidos',
    remaining: 'Ainda faltam',
    attention: 'Precisam de atenção',
    scopeTitle: 'O que este andamento significa',
    scopeBody: 'Ele cobre apenas os itens que o NestFinance conseguiu identificar com segurança no texto do extrato. Não significa que o saldo bancário inteiro foi conciliado.',
    states: {
      confirmed: 'Conferido',
      needs_recheck: 'Conferência desfeita — revisar novamente',
      one_possibility: 'Uma possibilidade encontrada',
      multiple_possibilities: 'Mais de uma possibilidade',
      no_match: 'Sem correspondência encontrada',
      needs_review: 'Dados precisam de conferência',
    },
    date: 'Data',
    amount: 'Valor',
    direction: 'Tipo',
    inflow: 'Entrada',
    outflow: 'Saída',
    unknown: 'Confirmar',
    possibilities: 'possibilidades',
    openTransaction: 'Abrir movimentação conferida',
  },
  EN: {
    title: 'Check progress',
    body: 'See what has already been checked and what still needs attention among the items identified in this statement.',
    loading: 'Updating progress…',
    refresh: 'Refresh progress',
    errorTitle: 'Unable to update progress',
    errorBody: 'Try again. No financial data was changed.',
    identified: 'Items identified',
    confirmed: 'Already checked',
    remaining: 'Still remaining',
    attention: 'Need attention',
    scopeTitle: 'What this progress means',
    scopeBody: 'It covers only the items NestFinance could safely identify from the statement text. It does not mean the entire bank balance has been reconciled.',
    states: {
      confirmed: 'Checked',
      needs_recheck: 'Previous check undone — review again',
      one_possibility: 'One possibility found',
      multiple_possibilities: 'More than one possibility',
      no_match: 'No match found',
      needs_review: 'Data needs review',
    },
    date: 'Date',
    amount: 'Amount',
    direction: 'Type',
    inflow: 'Inflow',
    outflow: 'Outflow',
    unknown: 'Review',
    possibilities: 'possibilities',
    openTransaction: 'Open checked transaction',
  },
  ES: {
    title: 'Avance de la revisión',
    body: 'Mira qué ya fue revisado y qué todavía necesita atención entre los elementos identificados en este extracto.',
    loading: 'Actualizando avance…',
    refresh: 'Actualizar avance',
    errorTitle: 'No fue posible actualizar el avance',
    errorBody: 'Inténtalo de nuevo. Ningún dato financiero fue modificado.',
    identified: 'Elementos identificados',
    confirmed: 'Ya revisados',
    remaining: 'Aún faltan',
    attention: 'Necesitan atención',
    scopeTitle: 'Qué significa este avance',
    scopeBody: 'Cubre solo los elementos que NestFinance pudo identificar con seguridad en el texto del extracto. No significa que todo el saldo bancario esté conciliado.',
    states: {
      confirmed: 'Revisado',
      needs_recheck: 'Revisión deshecha — revisar de nuevo',
      one_possibility: 'Una posibilidad encontrada',
      multiple_possibilities: 'Más de una posibilidad',
      no_match: 'Sin correspondencia',
      needs_review: 'Los datos necesitan revisión',
    },
    date: 'Fecha',
    amount: 'Valor',
    direction: 'Tipo',
    inflow: 'Entrada',
    outflow: 'Salida',
    unknown: 'Revisar',
    possibilities: 'posibilidades',
    openTransaction: 'Abrir movimiento revisado',
  },
};

function formatMoney(cents: number | null, language: Language) {
  if (cents === null) return '—';
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(value: string | null, language: Language) {
  if (!value) return '—';
  const date = new Date(value + 'T12:00:00.000Z');
  if (Number.isNaN(date.getTime())) return value;
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function statePresentation(state: ReconciliationProgressLineState) {
  if (state === 'confirmed') {
    return {
      icon: CheckCircle2,
      className: 'border-semantic-success/20 bg-semantic-success/10 text-semantic-success',
    };
  }
  if (state === 'needs_recheck') {
    return {
      icon: History,
      className: 'border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning',
    };
  }
  if (state === 'one_possibility') {
    return {
      icon: Search,
      className: 'border-accent-primary/20 bg-accent-primary/10 text-accent-primary',
    };
  }
  return {
    icon: CircleHelp,
    className: 'border-border-subtle bg-surface-secondary text-text-secondary',
  };
}

function directionLabel(line: ReconciliationProgressLine, copy: Copy) {
  if (line.sourceDirection === 'inflow') return copy.inflow;
  if (line.sourceDirection === 'outflow') return copy.outflow;
  return copy.unknown;
}

export function ReconciliationProgressPanel({
  organizationId,
  financeEntityId,
  evidenceId,
  accountId,
  language,
}: Props) {
  const copy = COPY[language];
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ReconciliationProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    if (!organizationId || !financeEntityId || !evidenceId || !accountId) return;
    setLoading(true);
    setFailed(false);
    try {
      setProgress(
        await reconciliationService.progress(
          organizationId,
          financeEntityId,
          evidenceId,
          accountId,
        ),
      );
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProgress(null);
    setFailed(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, financeEntityId, evidenceId, accountId]);

  const attentionItems = useMemo(() => {
    if (!progress) return 0;
    return (
      progress.summary.needsRecheckItems +
      progress.summary.needsReviewItems +
      progress.summary.multiplePossibilityItems +
      progress.summary.noMatchItems
    );
  }, [progress]);

  return (
    <div className="mt-5 rounded-2xl border border-border-subtle bg-surface-secondary/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">{copy.title}</h4>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">{copy.body}</p>
        </div>
        <Button variant="ghost" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          {loading ? copy.loading : copy.refresh}
        </Button>
      </div>

      {failed && !progress ? (
        <div className="mt-4 flex gap-3 rounded-xl border border-semantic-danger/20 bg-semantic-danger/10 p-4" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-text-primary">{copy.errorTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.errorBody}</p>
          </div>
        </div>
      ) : null}

      {progress ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { label: copy.identified, value: progress.summary.recognizedItems },
              { label: copy.confirmed, value: progress.summary.confirmedItems },
              { label: copy.remaining, value: progress.summary.remainingItems },
              { label: copy.attention, value: attentionItems },
            ].map((metric) => (
              <Surface key={metric.label} variant="elevated" radius="lg" className="p-3">
                <p className="text-[11px] font-medium text-text-muted">{metric.label}</p>
                <p className="mt-1 text-xl font-semibold text-text-primary">{metric.value}</p>
              </Surface>
            ))}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl border border-border-subtle bg-surface-base p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-text-primary">{copy.scopeTitle}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{copy.scopeBody}</p>
            </div>
          </div>

          <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {progress.lines.slice(0, 100).map((line) => {
              const presentation = statePresentation(line.state);
              const StateIcon = presentation.icon;
              return (
                <Surface key={line.lineNumber} variant="elevated" radius="lg" className="p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ' + presentation.className}>
                          <StateIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {copy.states[line.state]}
                        </span>
                        {line.candidateCount > 1 ? (
                          <span className="text-[11px] text-text-muted">
                            {line.candidateCount} {copy.possibilities}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 truncate text-sm font-medium text-text-primary">
                        {line.sourceDescription || '—'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                        <span>{copy.date}: {formatDate(line.sourceDate, language)}</span>
                        <span>{copy.amount}: {formatMoney(line.sourceAmountCents, language)}</span>
                        <span>{copy.direction}: {directionLabel(line, copy)}</span>
                      </div>
                    </div>

                    {line.state === 'confirmed' && line.activeTransactionId ? (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          navigate(
                            APP_ROUTES.transactionDetail.replace(
                              ':transactionId',
                              line.activeTransactionId!,
                            ),
                          )
                        }
                      >
                        {copy.openTransaction}
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </Surface>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
