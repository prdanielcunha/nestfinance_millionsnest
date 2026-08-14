import { useEffect, useId, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { firebaseAuth } from '@/src/lib/firebase';
import { listFinanceEntities } from '@/src/services/financeEntitiesService';

interface FinanceEntityContextBarProps {
  areaName?: string;
  returnTo?: string;
  allowSwitch?: boolean;
  onBeforeSwitch?: () => boolean | Promise<boolean>;
}

const SWITCH_ARIA_LABEL: Record<Language, (entityName: string) => string> = {
  PT: (entityName) => `Trocar igreja atual, ${entityName}`,
  EN: (entityName) => `Switch current church, ${entityName}`,
  ES: (entityName) => `Cambiar iglesia actual, ${entityName}`,
};

export function FinanceEntityContextBar({
  areaName,
  returnTo,
  allowSwitch = true,
  onBeforeSwitch,
}: FinanceEntityContextBarProps) {
  const { activeFinanceEntityId, activeFinanceEntityName, setActiveFinanceEntityId } = useFinanceEntity();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const selectorTitleId = useId();

  const [readyEntities, setReadyEntities] = useState<any[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);

  useEffect(() => {
    if (allowSwitch && activeFinanceEntityId) {
      fetchEntities();
    }
  }, [allowSwitch, activeFinanceEntityId]);

  const fetchEntities = async () => {
    try {
      const user = firebaseAuth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const res = await listFinanceEntities();
      const allEntities = res.entities || [];

      const statuses: Record<string, any> = {};
      await Promise.all(
        allEntities.map(async (entity: any) => {
          try {
            const bootstrapResponse = await fetch('/api/finance/entities/bootstrap/status', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ financeEntityId: entity.id }),
            });
            if (bootstrapResponse.ok) {
              statuses[entity.id] = await bootstrapResponse.json();
            }
          } catch {
            // Background readiness lookup is intentionally non-blocking.
          }
        }),
      );

      const readyList = allEntities.filter((entity: any) => statuses[entity.id]?.status === 'ready');
      setReadyEntities(readyList);
    } catch {
      // Keep the current context usable if the background switch lookup fails.
    }
  };

  const handleSwitchClick = async () => {
    if (onBeforeSwitch) {
      const allowed = await onBeforeSwitch();
      if (!allowed) return;
    }

    if (readyEntities.length === 2) {
      const other = readyEntities.find((entity) => entity.id !== activeFinanceEntityId);
      if (other) {
        setActiveFinanceEntityId(other.id, other.displayName);
        if (returnTo) {
          navigate(returnTo);
        }
      }
    } else if (readyEntities.length > 2) {
      setSelectorOpen(true);
    } else if (readyEntities.length <= 1) {
      setActiveFinanceEntityId(null);
      navigate(APP_ROUTES.finance);
    }
  };

  const handleSelectEntity = (id: string, name: string) => {
    setActiveFinanceEntityId(id, name);
    setSelectorOpen(false);
    if (returnTo) {
      navigate(returnTo);
    }
  };

  if (!activeFinanceEntityId || !activeFinanceEntityName) return null;

  const canSwitch = allowSwitch && readyEntities.length > 1;

  return (
    <>
      <div className="shrink-0 bg-surface-base">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex min-w-0 flex-col md:flex-row md:items-center">
            <div className="hidden items-center text-sm md:flex">
              <span className="max-w-[200px] truncate font-medium text-text-primary">
                {activeFinanceEntityName}
              </span>
              {areaName ? (
                <>
                  <span className="mx-2 text-text-muted">/</span>
                  <span className="truncate text-text-muted">{areaName}</span>
                </>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col md:hidden">
              <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                {t('select_entity_current_church')}
              </span>
              <div className="flex items-center">
                <span className="truncate text-sm font-medium text-text-primary">
                  {activeFinanceEntityName}
                </span>
                {areaName ? (
                  <>
                    <span className="mx-1.5 text-sm text-text-muted">·</span>
                    <span className="truncate text-sm text-text-muted">{areaName}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {canSwitch ? (
            <button
              type="button"
              onClick={handleSwitchClick}
              aria-label={SWITCH_ARIA_LABEL[language](activeFinanceEntityName)}
              className="ml-4 inline-flex h-12 shrink-0 items-center justify-center rounded-lg px-4 text-xs font-medium text-text-primary transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              {t('select_entity_switch_btn')}
            </button>
          ) : null}
        </div>
      </div>

      {selectorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-surface-base/80 p-4 backdrop-blur-sm sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={selectorTitleId}
            className="w-full max-w-sm overflow-hidden rounded-[24px] border border-border-subtle bg-surface-elevated shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-300"
          >
            <div className="flex flex-col gap-4 p-6">
              <h3 id={selectorTitleId} className="text-xl font-semibold text-text-primary">
                {t('select_entity_modal_title')}
              </h3>

              <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
                {readyEntities.map((entity) => (
                  <button
                    type="button"
                    key={entity.id}
                    onClick={() => handleSelectEntity(entity.id, entity.displayName)}
                    className={`flex items-center rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${entity.id === activeFinanceEntityId ? 'border-accent-primary bg-accent-primary/10' : 'border-border-subtle hover:bg-surface-secondary'}`}
                  >
                    <Building2
                      className={`mr-3 h-5 w-5 ${entity.id === activeFinanceEntityId ? 'text-accent-primary' : 'text-text-muted'}`}
                      aria-hidden="true"
                    />
                    <span className={`font-medium ${entity.id === activeFinanceEntityId ? 'text-accent-primary' : 'text-text-primary'}`}>
                      {entity.displayName}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSelectorOpen(false)}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-xl border border-border-subtle bg-surface-base text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                {t('select_entity_cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
