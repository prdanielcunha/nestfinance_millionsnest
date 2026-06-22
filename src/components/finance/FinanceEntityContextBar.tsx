import React, { useState, useEffect } from 'react';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { Building2, ArrowRight, RefreshCw, X } from 'lucide-react';
import { listFinanceEntities } from '@/src/services/financeEntitiesService';
import { firebaseAuth } from '@/src/lib/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';

interface FinanceEntityContextBarProps {
  areaName?: string;
  returnTo?: string;
  allowSwitch?: boolean;
  onBeforeSwitch?: () => boolean | Promise<boolean>; // return true to allow, false to cancel
}

export function FinanceEntityContextBar({ 
  areaName, 
  returnTo, 
  allowSwitch = true,
  onBeforeSwitch 
}: FinanceEntityContextBarProps) {
  const { activeFinanceEntityId, activeFinanceEntityName, setActiveFinanceEntityId } = useFinanceEntity();
  const navigate = useNavigate();
  const location = useLocation();

  const [readyEntities, setReadyEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  
  useEffect(() => {
    // Only fetch if we allow switch. But actually, we only need to fetch when the user clicks or if we want to know if there's > 1 entity to show "Trocar".
    // Let's fetch silently to know the count.
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
      
      // We also need bootstrap statuses to know which are ready
      const statuses: Record<string, any> = {};
      await Promise.all(allEntities.map(async (e: any) => {
          try {
              const bRes = await fetch('/api/finance/entities/bootstrap/status', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ financeEntityId: e.id })
              });
              if (bRes.ok) {
                  statuses[e.id] = await bRes.json();
              }
          } catch (err) {}
      }));
      
      const readyList = allEntities.filter((e: any) => statuses[e.id]?.status === 'ready');
      setReadyEntities(readyList);
    } catch (e) {
      // ignore silently for background fetch
    }
  };

  const handleSwitchClick = async () => {
    if (onBeforeSwitch) {
      const allowed = await onBeforeSwitch();
      if (!allowed) return;
    }

    if (readyEntities.length === 2) {
      const other = readyEntities.find(e => e.id !== activeFinanceEntityId);
      if (other) {
        setActiveFinanceEntityId(other.id, other.displayName);
        // If we shouldn't stay on the current route
        if (returnTo) {
          navigate(returnTo);
        }
      }
    } else if (readyEntities.length > 2) {
      setSelectorOpen(true);
    } else if (readyEntities.length <= 1) {
      // Just clear and go to main selector
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

  // Mobile layout vs Desktop layout requirements
  // Mobile: 2 lines
  // Desktop: compact breadcrumb

  return (
    <>
      <div className="bg-surface-elevated border-b border-border-subtle shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col md:flex-row md:items-center min-w-0">
            {/* Desktop breadcrumb style */}
            <div className="hidden md:flex items-center text-sm">
              <Building2 className="w-4 h-4 text-text-muted mr-2 shrink-0" />
              <span className="font-medium text-text-primary truncate max-w-[200px]">
                {activeFinanceEntityName}
              </span>
              {areaName && (
                <>
                  <span className="mx-2 text-text-muted">/</span>
                  <span className="text-text-muted truncate">{areaName}</span>
                </>
              )}
            </div>

            {/* Mobile style */}
            <div className="flex md:hidden flex-col min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-0.5">Igreja atual</span>
              <div className="flex items-center">
                <span className="font-medium text-text-primary text-sm truncate">
                  {activeFinanceEntityName}
                </span>
                {areaName && (
                  <>
                    <span className="mx-1.5 text-text-muted text-sm">·</span>
                    <span className="text-text-muted text-sm truncate">{areaName}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {canSwitch && (
            <button
              onClick={handleSwitchClick}
              aria-label={`Trocar igreja atual, ${activeFinanceEntityName}`}
              className="ml-4 shrink-0 h-8 px-3 inline-flex items-center justify-center rounded-lg bg-surface-base hover:bg-surface-secondary border border-border-subtle text-xs font-medium text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <RefreshCw className="w-3 h-3 mr-1.5 text-text-muted" />
              Trocar
            </button>
          )}
        </div>
      </div>

      {selectorOpen && (
        <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
           <div className="bg-surface-elevated w-full max-w-sm rounded-[24px] border border-border-subtle shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
              <div className="p-6 flex flex-col gap-4">
                 <h3 className="text-xl font-semibold text-text-primary">Selecionar igreja</h3>
                 <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                    {readyEntities.map(e => (
                       <button
                          key={e.id}
                          onClick={() => handleSelectEntity(e.id, e.displayName)}
                          className={`flex items-center p-4 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${e.id === activeFinanceEntityId ? 'border-accent-primary bg-accent-primary/10' : 'border-border-subtle hover:bg-surface-secondary'}`}
                       >
                          <Building2 className={`w-5 h-5 mr-3 ${e.id === activeFinanceEntityId ? 'text-accent-primary' : 'text-text-muted'}`} />
                          <span className={`font-medium ${e.id === activeFinanceEntityId ? 'text-accent-primary' : 'text-text-primary'}`}>{e.displayName}</span>
                       </button>
                    ))}
                 </div>
                 <button 
                    onClick={() => setSelectorOpen(false)}
                    className="w-full h-12 flex items-center justify-center bg-surface-base border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-xl font-medium transition-colors text-sm mt-2"
                 >
                    Cancelar
                 </button>
              </div>
           </div>
        </div>
      )}
    </>
  );
}
