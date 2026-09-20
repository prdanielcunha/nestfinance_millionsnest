import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import type {
  TransactionWorkspaceFilters,
  TransactionWorkspaceView,
} from '../../../shared/finance/transactionWorkspaceView';

type Props = {
  filters: TransactionWorkspaceFilters;
  onApply: (filters: TransactionWorkspaceFilters) => void;
};

type Copy = {
  title: string;
  subtitle: string;
  save: string;
  saveTitle: string;
  name: string;
  namePlaceholder: string;
  confirm: string;
  cancel: string;
  loading: string;
  empty: string;
  failed: string;
  retry: string;
  limit: (current: number, max: number) => string;
  deleteView: (name: string) => string;
  active: string;
};

const COPY: Record<Language, Copy> = {
  PT: {
    title: 'Minhas visões',
    subtitle: 'Salve combinações de filtros e retome seu trabalho em qualquer dispositivo.',
    save: 'Salvar visão atual',
    saveTitle: 'Nomeie esta visão',
    name: 'Nome da visão',
    namePlaceholder: 'Ex.: Pendências da semana',
    confirm: 'Salvar',
    cancel: 'Cancelar',
    loading: 'Carregando visões…',
    empty: 'Nenhuma visão salva ainda.',
    failed: 'Não foi possível carregar suas visões.',
    retry: 'Tentar novamente',
    limit: (current, max) => `${current}/${max} visões`,
    deleteView: (name) => `Excluir visão ${name}`,
    active: 'Ativa',
  },
  EN: {
    title: 'My views',
    subtitle: 'Save filter combinations and resume your work on any device.',
    save: 'Save current view',
    saveTitle: 'Name this view',
    name: 'View name',
    namePlaceholder: 'E.g. Weekly follow-up',
    confirm: 'Save',
    cancel: 'Cancel',
    loading: 'Loading views…',
    empty: 'No saved views yet.',
    failed: 'Your views could not be loaded.',
    retry: 'Try again',
    limit: (current, max) => `${current}/${max} views`,
    deleteView: (name) => `Delete view ${name}`,
    active: 'Active',
  },
  ES: {
    title: 'Mis vistas',
    subtitle: 'Guarda combinaciones de filtros y retoma tu trabajo en cualquier dispositivo.',
    save: 'Guardar vista actual',
    saveTitle: 'Nombra esta vista',
    name: 'Nombre de la vista',
    namePlaceholder: 'Ej.: Pendientes de la semana',
    confirm: 'Guardar',
    cancel: 'Cancelar',
    loading: 'Cargando vistas…',
    empty: 'Todavía no hay vistas guardadas.',
    failed: 'No fue posible cargar tus vistas.',
    retry: 'Intentar de nuevo',
    limit: (current, max) => `${current}/${max} vistas`,
    deleteView: (name) => `Eliminar vista ${name}`,
    active: 'Activa',
  },
};

function sameFilters(a: TransactionWorkspaceFilters, b: TransactionWorkspaceFilters) {
  return (
    a.direction === b.direction &&
    a.status === b.status &&
    (a.occurredFrom || null) === (b.occurredFrom || null) &&
    (a.occurredTo || null) === (b.occurredTo || null) &&
    (a.order || 'newest') === (b.order || 'newest')
  );
}

export function TransactionSavedViews({ filters, onApply }: Props) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const { activeFinanceEntityId } = useFinanceEntity();
  const {
    listWorkspaceViews,
    saveWorkspaceView,
    deleteWorkspaceView,
  } = useTransactions();

  const [views, setViews] = useState<TransactionWorkspaceView[]>([]);
  const [limit, setLimit] = useState(12);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const currentViewId = useMemo(
    () => views.find((view) => sameFilters(view.filters, filters))?.viewId || null,
    [views, filters],
  );

  const refresh = async () => {
    if (!activeFinanceEntityId) {
      setViews([]);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const result = await listWorkspaceViews();
      setViews(Array.isArray(result.items) ? result.items : []);
      setLimit(Number(result.limit || 12));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [activeFinanceEntityId]);

  const handleSave = async () => {
    const normalized = name.replace(/\s+/gu, ' ').trim();
    if (!normalized || saving) return;

    setSaving(true);
    try {
      await saveWorkspaceView({
        name: normalized,
        filters,
      });
      setName('');
      setSaveOpen(false);
      await refresh();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (view: TransactionWorkspaceView) => {
    if (deletingId) return;
    setDeletingId(view.viewId);
    try {
      await deleteWorkspaceView(view.viewId);
      setViews((current) => current.filter((item) => item.viewId !== view.viewId));
    } catch {
      setFailed(true);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Surface variant="glass" radius="lg" className="overflow-hidden p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-accent-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">{copy.title}</h2>
          </div>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-text-muted">{copy.subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] font-medium text-text-muted">
            {copy.limit(views.length, limit)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" />}
            disabled={views.length >= limit}
            onClick={() => setSaveOpen(true)}
          >
            {copy.save}
          </Button>
        </div>
      </div>

      {saveOpen ? (
        <div className="mt-4 rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">{copy.saveTitle}</p>
              <p className="mt-1 text-xs text-text-muted">{copy.limit(views.length, limit)}</p>
            </div>
            <button
              type="button"
              className="nf-interactive nf-touch-target flex h-9 w-9 items-center justify-center rounded-xl text-text-muted hover:bg-surface-secondary hover:text-text-primary"
              aria-label={copy.cancel}
              onClick={() => {
                setSaveOpen(false);
                setName('');
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <label className="mt-4 block">
            <span className="sr-only">{copy.name}</span>
            <input
              value={name}
              maxLength={48}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSave();
                if (event.key === 'Escape') {
                  setSaveOpen(false);
                  setName('');
                }
              }}
              placeholder={copy.namePlaceholder}
              className="h-11 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-primary outline-none transition focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/10"
            />
          </label>

          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSaveOpen(false);
                setName('');
              }}
            >
              {copy.cancel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!name.trim() || saving}
              leadingIcon={saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              onClick={() => void handleSave()}
            >
              {copy.confirm}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        {loading && views.length === 0 ? (
          <div className="flex min-h-11 items-center gap-2 text-xs text-text-muted" aria-live="polite">
            <RefreshCw className="h-4 w-4 animate-spin text-accent-primary" aria-hidden="true" />
            {copy.loading}
          </div>
        ) : failed && views.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-semantic-warning/15 bg-semantic-warning/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-secondary">{copy.failed}</p>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              {copy.retry}
            </Button>
          </div>
        ) : views.length === 0 ? (
          <p className="py-2 text-xs text-text-muted">{copy.empty}</p>
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {views.map((view) => {
              const active = currentViewId === view.viewId;
              return (
                <div
                  key={view.viewId}
                  className={
                    'flex shrink-0 items-center overflow-hidden rounded-xl border ' +
                    (active
                      ? 'border-accent-primary/35 bg-accent-primary/10'
                      : 'border-border-subtle bg-surface-default')
                  }
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onApply(view.filters)}
                    className={
                      'nf-interactive min-h-10 max-w-56 truncate px-3 text-xs font-semibold ' +
                      (active ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary')
                    }
                    title={view.name}
                  >
                    {view.name}
                    {active ? <span className="sr-only"> · {copy.active}</span> : null}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(deletingId)}
                    aria-label={copy.deleteView(view.name)}
                    onClick={() => void handleDelete(view)}
                    className="nf-interactive flex h-10 w-9 items-center justify-center border-l border-border-subtle text-text-muted hover:bg-semantic-danger/5 hover:text-semantic-danger disabled:opacity-50"
                  >
                    {deletingId === view.viewId ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Surface>
  );
}
