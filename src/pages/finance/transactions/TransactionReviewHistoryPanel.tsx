import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Clock3,
  History,
  RefreshCw,
  ScrollText,
  UserRound,
} from 'lucide-react';
import type { AuditTimelineItem } from '../../../../shared/finance/auditReadModel.js';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { auditService } from '@/src/services/auditService';
import { TRANSACTION_REVIEW_HISTORY_COPY } from './transactionReviewHistoryCopy';
import {
  normalizeReviewHistoryResourceIds,
  selectRelatedReviewHistory,
} from './transactionReviewHistoryModel';

type Props = {
  transactionId: unknown;
  evidenceIds: unknown;
};

type State = 'idle' | 'loading' | 'ready' | 'error';

function formatAuditDate(value: string | null, language: Language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function TransactionReviewHistoryPanel({
  transactionId,
  evidenceIds,
}: Props) {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const copy = TRANSACTION_REVIEW_HISTORY_COPY[language];

  const resourceIds = useMemo(
    () => normalizeReviewHistoryResourceIds(transactionId, evidenceIds),
    [transactionId, evidenceIds],
  );
  const resourceKey = resourceIds.join('|');

  const [state, setState] = useState<State>('idle');
  const [items, setItems] = useState<AuditTimelineItem[]>([]);
  const [truncatedAtSource, setTruncatedAtSource] = useState(false);
  const epochRef = useRef(0);

  useEffect(() => {
    epochRef.current += 1;
    setState('idle');
    setItems([]);
    setTruncatedAtSource(false);
  }, [accessState.organizationId, activeFinanceEntityId, resourceKey]);

  const loadHistory = async () => {
    const organizationId = accessState.organizationId;
    if (
      !organizationId ||
      !activeFinanceEntityId ||
      resourceIds.length === 0 ||
      state === 'loading'
    ) {
      return;
    }

    const epoch = ++epochRef.current;
    setState('loading');

    try {
      const response = await auditService.list(
        organizationId,
        activeFinanceEntityId,
      );
      if (epoch !== epochRef.current) return;

      const selected = selectRelatedReviewHistory(
        response.items,
        resourceIds,
        response.truncated,
      );
      setItems(selected.items);
      setTruncatedAtSource(selected.truncatedAtSource);
      setState('ready');
    } catch {
      if (epoch !== epochRef.current) return;
      setItems([]);
      setTruncatedAtSource(false);
      setState('error');
    }
  };

  if (resourceIds.length === 0) return null;

  const actorLabel = (item: AuditTimelineItem) => {
    if (item.actorKind === 'system') return copy.systemActor;
    return item.actorDisplayName || copy.teamActor;
  };

  const actionLabel = (item: AuditTimelineItem) =>
    copy.actions[item.action] || copy.unknownAction;

  return (
    <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
            <History className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-primary">
              {copy.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
              {copy.subtitle}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {state === 'idle' ? (
            <Button variant="secondary" onClick={() => void loadHistory()}>
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {copy.load}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => navigate(APP_ROUTES.audit)}>
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            {copy.openAudit}
          </Button>
        </div>
      </div>

      {state === 'loading' ? (
        <div
          className="mt-5 flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-secondary/50 p-4 text-sm text-text-muted"
          aria-live="polite"
        >
          <RefreshCw className="h-4 w-4 animate-spin text-accent-primary" aria-hidden="true" />
          {copy.loading}
        </div>
      ) : null}

      {state === 'error' ? (
        <div
          className="mt-5 rounded-2xl border border-semantic-danger/20 bg-semantic-danger/10 p-4"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary">
                {copy.errorTitle}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                {copy.errorBody}
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => void loadHistory()}
              >
                {copy.retry}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {state === 'ready' && items.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-border-subtle bg-surface-secondary/40 p-5 text-center">
          <History className="mx-auto h-6 w-6 text-text-muted" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-text-primary">
            {copy.emptyTitle}
          </p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-text-muted">
            {copy.emptyBody}
          </p>
        </div>
      ) : null}

      {state === 'ready' && items.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {items.map((item) => (
            <li
              key={item.eventId}
              className="rounded-2xl border border-border-subtle bg-surface-secondary/35 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {actionLabel(item)}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                    <UserRound className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                    <span className="truncate">{actorLabel(item)}</span>
                  </div>
                </div>
                <time
                  className="shrink-0 text-xs text-text-muted"
                  dateTime={item.occurredAt || undefined}
                >
                  {formatAuditDate(item.occurredAt, language)}
                </time>
              </div>

              {(item.metadata.reason ||
                item.metadata.reasonCode ||
                item.metadata.status) ? (
                <dl className="mt-3 grid gap-2 border-t border-border-subtle pt-3 text-xs sm:grid-cols-2">
                  {item.metadata.status ? (
                    <div>
                      <dt className="font-semibold text-text-muted">
                        {copy.status}
                      </dt>
                      <dd className="mt-1 break-words text-text-secondary">
                        {item.metadata.status}
                      </dd>
                    </div>
                  ) : null}
                  {item.metadata.reason || item.metadata.reasonCode ? (
                    <div>
                      <dt className="font-semibold text-text-muted">
                        {copy.reason}
                      </dt>
                      <dd className="mt-1 break-words text-text-secondary">
                        {item.metadata.reason || item.metadata.reasonCode}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {state === 'ready' && truncatedAtSource ? (
        <p className="mt-4 text-xs leading-relaxed text-semantic-warning">
          {copy.recentOnly}
        </p>
      ) : null}
    </Surface>
  );
}
