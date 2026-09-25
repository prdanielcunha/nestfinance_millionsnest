import { useEffect, useState } from 'react';
import { Building2, RefreshCw, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';

const COPY: Record<Language, {
  loading: string;
  slow: string;
  retry: string;
  title: string;
  description: string;
  currentHint: string;
  useEntity: string;
  emptyTitle: string;
  emptyManage: string;
  emptyReadOnly: string;
  configure: string;
  errorTitle: string;
  errorText: string;
}> = {
  PT: {
    loading: 'Carregando suas igrejas…',
    slow: 'Isso está demorando mais que o normal. Você pode tentar novamente sem perder nada.',
    retry: 'Tentar novamente',
    title: 'Escolha onde você vai trabalhar',
    description: 'Você tem acesso a mais de uma igreja. Escolha uma para abrir o financeiro certo.',
    currentHint: 'Última usada',
    useEntity: 'Abrir',
    emptyTitle: 'Nenhuma igreja disponível no financeiro',
    emptyManage: 'Cadastre ou configure uma igreja para começar a usar o NestFinance.',
    emptyReadOnly: 'Peça a um administrador para liberar uma igreja para o seu acesso.',
    configure: 'Configurar igreja',
    errorTitle: 'Não conseguimos carregar suas igrejas',
    errorText: 'Seu acesso continua seguro. Tente carregar novamente.',
  },
  EN: {
    loading: 'Loading your churches…',
    slow: 'This is taking longer than usual. You can retry without losing anything.',
    retry: 'Try again',
    title: 'Choose where you want to work',
    description: 'You can access more than one church. Choose one to open the correct finance workspace.',
    currentHint: 'Last used',
    useEntity: 'Open',
    emptyTitle: 'No church is available in finance',
    emptyManage: 'Add or configure a church to start using NestFinance.',
    emptyReadOnly: 'Ask an administrator to grant you access to a church.',
    configure: 'Configure church',
    errorTitle: 'We could not load your churches',
    errorText: 'Your access remains secure. Try loading them again.',
  },
  ES: {
    loading: 'Cargando tus iglesias…',
    slow: 'Esto está tardando más de lo normal. Puedes intentarlo de nuevo sin perder nada.',
    retry: 'Intentar de nuevo',
    title: 'Elige dónde vas a trabajar',
    description: 'Tienes acceso a más de una iglesia. Elige una para abrir el espacio financiero correcto.',
    currentHint: 'Última usada',
    useEntity: 'Abrir',
    emptyTitle: 'No hay ninguna iglesia disponible en finanzas',
    emptyManage: 'Agrega o configura una iglesia para comenzar a usar NestFinance.',
    emptyReadOnly: 'Pide a un administrador que habilite una iglesia para tu acceso.',
    configure: 'Configurar iglesia',
    errorTitle: 'No pudimos cargar tus iglesias',
    errorText: 'Tu acceso sigue seguro. Intenta cargarlas nuevamente.',
  },
};

export function FinanceEntitySelectionState({ canManageFinance }: { canManageFinance: boolean }) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = COPY[language];
  const {
    activeFinanceEntityId,
    lastUsedFinanceEntityId,
    accessibleFinanceEntities,
    accessibleFinanceEntitiesLoading,
    accessibleFinanceEntitiesError,
    setActiveFinanceEntityId,
    refreshAccessibleFinanceEntities,
  } = useFinanceEntity();

  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);

  useEffect(() => {
    if (!accessibleFinanceEntitiesLoading) {
      setShowSkeleton(false);
      setShowSlowNotice(false);
      return;
    }

    const skeletonTimer = window.setTimeout(() => setShowSkeleton(true), 600);
    const slowTimer = window.setTimeout(() => setShowSlowNotice(true), 4000);

    return () => {
      window.clearTimeout(skeletonTimer);
      window.clearTimeout(slowTimer);
    };
  }, [accessibleFinanceEntitiesLoading]);

  if (activeFinanceEntityId) return null;

  if (accessibleFinanceEntitiesLoading) {
    return (
      <div className="mx-auto flex min-h-[48vh] max-w-2xl items-center justify-center" aria-live="polite" aria-busy="true">
        {showSkeleton ? (
          <Surface variant="elevated" radius="xl" className="w-full p-6 sm:p-8">
            <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-surface-secondary" aria-hidden="true" />
            <div className="mx-auto mt-6 h-5 w-52 animate-pulse rounded-lg bg-surface-secondary" aria-hidden="true" />
            <div className="mx-auto mt-3 h-4 w-full max-w-md animate-pulse rounded-lg bg-surface-secondary" aria-hidden="true" />
            <p className="mt-5 text-center text-sm text-text-secondary">{copy.loading}</p>
            {showSlowNotice ? (
              <div className="mt-5 rounded-xl border border-border-subtle bg-surface-secondary p-4 text-center">
                <p className="text-sm leading-relaxed text-text-secondary">{copy.slow}</p>
                <Button variant="secondary" size="md" className="mt-4" onClick={() => void refreshAccessibleFinanceEntities()}>
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  {copy.retry}
                </Button>
              </div>
            ) : null}
          </Surface>
        ) : (
          <span className="sr-only">{copy.loading}</span>
        )}
      </div>
    );
  }

  if (accessibleFinanceEntitiesError) {
    return (
      <div className="mx-auto flex min-h-[48vh] max-w-2xl items-center justify-center">
        <Surface variant="elevated" radius="xl" className="w-full p-6 text-center sm:p-8" role="alert">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-warning/10 text-semantic-warning">
            <RefreshCw className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">{copy.errorTitle}</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">{copy.errorText}</p>
          <Button variant="primary" size="lg" className="mt-6" onClick={() => void refreshAccessibleFinanceEntities()}>
            {copy.retry}
          </Button>
        </Surface>
      </div>
    );
  }

  if (accessibleFinanceEntities.length > 0) {
    return (
      <div className="mx-auto flex min-h-[48vh] max-w-2xl items-center justify-center">
        <Surface variant="elevated" radius="xl" className="w-full p-6 sm:p-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">{copy.title}</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">{copy.description}</p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {accessibleFinanceEntities.map((entity) => {
              const lastUsed = entity.id === lastUsedFinanceEntityId;
              return (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => setActiveFinanceEntityId(entity.id, entity.displayName)}
                  className="nf-interactive min-h-16 rounded-xl border border-border-subtle bg-background-base p-4 text-left hover:border-border-strong hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{entity.displayName}</span>
                    {lastUsed ? (
                      <span className="shrink-0 rounded-full bg-accent-primary/10 px-2 py-1 text-xs font-semibold text-accent-primary">
                        {copy.currentHint}
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-2 block text-sm font-medium text-text-secondary">{copy.useEntity}</span>
                </button>
              );
            })}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[48vh] max-w-2xl items-center justify-center">
      <Surface variant="elevated" radius="xl" className="w-full p-6 text-center sm:p-8">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
          <Settings2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">{copy.emptyTitle}</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">
          {canManageFinance ? copy.emptyManage : copy.emptyReadOnly}
        </p>
        {canManageFinance ? (
          <Button
            variant="primary"
            size="lg"
            className="mt-6"
            onClick={() => navigate(APP_ROUTES.financeSettingsEntities)}
          >
            {copy.configure}
          </Button>
        ) : null}
      </Surface>
    </div>
  );
}
