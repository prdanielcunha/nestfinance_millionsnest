import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { ArrowRight, Settings, Plus, Building2, AlertCircle, RefreshCw, Clock, ClipboardCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';
import FinanceBootstrapWizard from '@/src/components/finance/FinanceBootstrapWizard';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { useTransactions } from '@/src/hooks/finance/useTransactions';

export default function FinancePage() {
  const { accessState } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeFinanceEntityId, setActiveFinanceEntityId, lastUsedFinanceEntityId } = useFinanceEntity();
  const { listTransactions } = useTransactions();
  
  const [loadingOnboarding, setLoadingOnboarding] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [entities, setEntities] = useState<any[]>([]);
  const [bootstrapStatuses, setBootstrapStatuses] = useState<Record<string, any>>({});
  const [bootstrappingEntity, setBootstrappingEntity] = useState<any | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState(0);
  
  const [entitySelectorOpen, setEntitySelectorOpen] = useState(false);
  const [reviewCount, setReviewCount] = useState<number | string | null>(null);
  const [draftCount, setDraftCount] = useState<number | string | null>(null);
  const [returnedCount, setReturnedCount] = useState<number | string | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | string | null>(null);

  const setupStatus = accessState.financeSetup?.status;
  const returnTo = searchParams.get('returnTo');

  useEffect(() => {
    let abortController = new AbortController();
    if (setupStatus === 'configured') {
      fetchOnboardingData(abortController.signal, currentEpoch);
    } else {
      setLoadingOnboarding(false);
    }
    return () => {
      abortController.abort();
    };
  }, [setupStatus, currentEpoch]);

  useEffect(() => {
    if (activeFinanceEntityId) {
      listTransactions({ status: 'ready_for_review' })
        .then((res) => {
          setReviewCount(res.items.length + (res.hasMore ? '+' : ''));
        })
        .catch(() => {
          setReviewCount(0);
        });

      listTransactions({ status: 'approved_for_posting' })
        .then((res) => {
          setApprovedCount(res.items.length + (res.hasMore ? '+' : ''));
        })
        .catch(() => {
          setApprovedCount(0);
        });

      listTransactions({ status: 'draft' })
        .then((res) => {
          const drafts = res.items || [];
          const returned = drafts.filter((d: any) => d.returnReasonCode);
          const simpleDrafts = drafts.filter((d: any) => !d.returnReasonCode);
          setReturnedCount(returned.length + (res.hasMore && returned.length > 0 ? '+' : ''));
          setDraftCount(simpleDrafts.length + (res.hasMore && simpleDrafts.length > 0 ? '+' : ''));
        })
        .catch(() => {
          setDraftCount(0);
          setReturnedCount(0);
        });
    }
  }, [activeFinanceEntityId, listTransactions]);

  const fetchOnboardingData = async (signal?: AbortSignal, epoch: number = 0) => {
    try {
      setLoadingOnboarding(true);
      setApiError(false);
      
      const user = firebaseAuth.currentUser;
      if (!user) return;
      
      const token = await user.getIdToken();
      const entitiesRes = await fetch('/api/finance/entities/list', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        signal
      });
      
      if (!entitiesRes.ok) throw new Error('API_LOAD_FAIL');
      const entitiesData = await entitiesRes.json();
      const foundEntities = entitiesData.entities || [];
      
      if (!signal?.aborted) setEntities(foundEntities);

      const statuses: Record<string, any> = {};
      await Promise.all(foundEntities.map(async (e: any) => {
          try {
              const res = await fetch('/api/finance/entities/bootstrap/status', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ financeEntityId: e.id }),
                  signal
              });
              if (res.ok) {
                  statuses[e.id] = await res.json();
              }
          } catch (e) {
              // ignore
          }
      }));
      
      if (!signal?.aborted) setBootstrapStatuses(statuses);
      
      const readyList = foundEntities.filter((e: any) => statuses[e.id]?.status === 'ready');
      
      if (!signal?.aborted) {
        if (readyList.length === 1 && !activeFinanceEntityId) {
           // Exactly one entity and none selected => Auto select it
           setActiveFinanceEntityId(readyList[0].id, readyList[0].displayName);
        } else if (readyList.length === 0 && !activeFinanceEntityId) {
           // No entities
           setActiveFinanceEntityId(null);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (!signal?.aborted) setApiError(true);
    } finally {
      if (!signal?.aborted) setLoadingOnboarding(false);
    }
  };

  const pendingEntities = entities.filter(e => bootstrapStatuses[e.id]?.status !== 'ready');
  const readyEntities = entities.filter(e => bootstrapStatuses[e.id]?.status === 'ready');

  const handleSwitchEntity = () => {
    if (readyEntities.length === 2) {
      const other = readyEntities.find(e => e.id !== activeFinanceEntityId);
      if (other) setActiveFinanceEntityId(other.id, other.displayName);
    } else if (readyEntities.length > 2) {
      setEntitySelectorOpen(true);
    } else {
      setActiveFinanceEntityId(null);
    }
  };

  // Deep Link Redirect Effect
  useEffect(() => {
    if (activeFinanceEntityId && returnTo && readyEntities.some(e => e.id === activeFinanceEntityId)) {
       navigate(returnTo, { replace: true });
    }
  }, [activeFinanceEntityId, returnTo, readyEntities, navigate]);

  if (setupStatus === 'not_configured') {
    return (
      <div className="flex flex-col items-center h-full fade-in max-w-xl mx-auto py-12 px-4 sm:px-0">
        <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Falha ao carregar a organização</h1>
          <p className="text-text-secondary">
            Não foi possível validar a estrutura organizacional base. Verifique sua conexão ou tente novamente.
          </p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (loadingOnboarding) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[50vh]">
        <div className="w-8 h-8 border-4 border-surface-elevated border-t-accent-primary rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-text-secondary animate-pulse">Carregando...</p>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[50vh]">
        <AlertCircle className="w-8 h-8 text-red-500 mb-4" />
        <p className="text-sm font-medium text-text-primary mb-4">Falha ao carregar dados financeiros.</p>
        <button 
          onClick={() => setCurrentEpoch(prev => prev + 1)}
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Se nao ha entidade ativa e estamos na selecao
  if (!activeFinanceEntityId || !readyEntities.find(en => en.id === activeFinanceEntityId)) {
    return (
      <div className="flex flex-col flex-1 h-full fade-in pb-20 md:pb-0 font-sans">
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-2xl mx-auto w-full text-center">
            
            {(readyEntities.length > 0 || pendingEntities.length > 0) && (
              <>
                <div className="w-16 h-16 bg-surface-secondary rounded-2xl flex items-center justify-center mb-6 text-text-primary border border-border-subtle mx-auto">
                   <Building2 className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-semibold text-text-primary tracking-tight mb-2">Onde você quer trabalhar?</h1>
                <p className="text-sm text-text-secondary mb-10">Escolha a igreja para acessar os dados financeiros.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  {readyEntities.map(e => {
                    const isLastUsed = e.id === lastUsedFinanceEntityId;
                    return (
                    <button
                      key={e.id}
                      onClick={() => setActiveFinanceEntityId(e.id, e.displayName)}
                      className="relative flex flex-col items-center justify-center p-6 bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl transition-colors text-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary overflow-hidden"
                    >
                      {isLastUsed && (
                        <div className="absolute top-0 inset-x-0 h-1 bg-accent-primary/20 group-hover:bg-accent-primary/40 transition-colors" />
                      )}
                      
                      <div className="flex flex-col items-center gap-2 mb-3">
                        <span className="text-base font-medium text-text-primary">{e.displayName}</span>
                        {isLastUsed && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" />
                            Última usada
                          </span>
                        )}
                      </div>
                      
                      <span className="text-xs text-text-muted group-hover:text-accent-primary transition-colors flex items-center mt-auto">
                        Acessar finanças <ArrowRight className="w-3 h-3 ml-1" />
                      </span>
                    </button>
                    );
                  })}
                </div>
              </>
            )}

            {pendingEntities.length > 0 && (
              <div className="mt-12 w-full text-left">
                <h3 className="text-sm font-medium text-text-secondary mb-3">Tornar estas organizações utilizáveis</h3>
                <div className="grid grid-cols-1 gap-4">
                  {pendingEntities.map(entity => {
                     const statusData = bootstrapStatuses[entity.id] || {};
                     const isLegacy = statusData.status === 'legacy_data_available';
                     const isEnabledByBackend = statusData.applicationAvailability?.available === true;
                     const canApply = isEnabledByBackend || isLegacy;
                     return (
                       <div key={entity.id} className="bg-surface-elevated border border-border-subtle rounded-xl p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded bg-surface-secondary flex items-center justify-center shrink-0">
                                 <Building2 className="w-4 h-4 text-text-muted" />
                              </div>
                              <div className="min-w-0">
                                  <h4 className="text-sm font-medium text-text-primary truncate">{entity.displayName}</h4>
                                  <p className="text-xs text-text-secondary truncate">Preparação pendente</p>
                              </div>
                          </div>
                          {canApply && (
                              <button
                                onClick={() => setBootstrappingEntity({ entity, statusData })}
                                className="ml-4 shrink-0 px-4 py-2 bg-surface-secondary hover:bg-border-subtle text-text-primary text-sm font-medium rounded-lg transition-colors"
                              >
                                Preparar
                              </button>
                          )}
                       </div>
                     );
                  })}
                </div>
              </div>
            )}
            
            {readyEntities.length === 0 && pendingEntities.length === 0 && (
               <div className="flex flex-col items-center text-center">
                  <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
                  <h2 className="text-lg font-semibold text-text-primary mb-2">Nenhuma organização disponível</h2>
                  <p className="text-sm text-text-secondary">Você não possui igrejas aptas para gerenciar finanças no momento.</p>
               </div>
            )}

        </main>
        {bootstrappingEntity && (
            <FinanceBootstrapWizard
              entity={bootstrappingEntity.entity}
              statusData={bootstrappingEntity.statusData}
              onClose={() => {
                setBootstrappingEntity(null);
                setCurrentEpoch(prev => prev + 1);
              }}
            />
        )}
      </div>
    );
  }

  // Dashboard Real View
  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0">
      <FinanceEntityContextBar areaName="Visão geral" />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 font-sans">
        <div className="max-w-3xl mx-auto flex flex-col gap-8">
          
          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Em preenchimento</h2>
                <p className="text-sm text-text-secondary">Rascunhos pendentes e criação de novos lançamentos.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {hasEffectiveCapability(accessState, 'finance.create_drafts') && (
                <button
                  onClick={() => navigate(APP_ROUTES.transactionCreate)}
                  className="bg-accent-primary hover:bg-accent-hover rounded-2xl p-6 text-left transition-colors flex flex-col items-start justify-center group h-auto sm:h-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
                >
                  <div className="flex items-center gap-3 text-white mb-2">
                     <Plus className="w-6 h-6 border-2 border-white/30 rounded-lg p-0.5 group-hover:rotate-90 transition-transform" />
                     <h3 className="text-base font-semibold">Registrar movimentação</h3>
                  </div>
                </button>
              )}

              <button
                onClick={() => navigate(APP_ROUTES.transactions + '?status=draft')}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-6 text-left transition-colors flex flex-col justify-center h-auto sm:h-32 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <h3 className="text-base font-medium text-text-primary mb-1">Rascunhos e correções</h3>
                    <div className="flex flex-col gap-1 mt-1">
                      {returnedCount && returnedCount !== 0 && returnedCount !== '0' ? (
                        <span className="text-[10px] uppercase font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 w-fit">
                          {returnedCount} aguardando correção
                        </span>
                      ) : null}
                      {draftCount && draftCount !== 0 && draftCount !== '0' ? (
                        <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 w-fit">
                          {draftCount} rascunho(s)
                        </span>
                      ) : null}
                      {(!returnedCount || returnedCount === 0 || returnedCount === '0') && (!draftCount || draftCount === 0 || draftCount === '0') && (
                        <p className="text-sm text-text-secondary">Continue lançamentos incompletos.</p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors shrink-0 ml-4" />
                </div>
              </button>
            </div>

            <div className="flex flex-col w-full mt-4">
               <button
                 onClick={() => navigate(APP_ROUTES.transactions + '?status=posted')}
                 className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-6 text-left transition-colors flex flex-col justify-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
               >
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20 text-teal-600 group-hover:scale-105 transition-transform">
                       <Clock className="w-6 h-6" />
                     </div>
                     <div className="flex flex-col">
                       <h3 className="text-base font-medium text-text-primary mb-1">Ver movimentações lançadas</h3>
                       <p className="text-sm text-text-secondary">Entradas e saídas concretizadas.</p>
                     </div>
                   </div>
                   <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors shrink-0 ml-4" />
                 </div>
               </button>
            </div>
          </div>

          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Auditoria e Governança</h2>
                <p className="text-sm text-text-secondary">Processos de aprovação de caixa e competência.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => navigate(APP_ROUTES.financeReview)}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-6 text-left transition-colors flex items-center justify-between group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20 text-amber-500 group-hover:scale-105 transition-transform relative">
                     <ClipboardCheck className="w-6 h-6" />
                     {reviewCount !== null && reviewCount !== 0 && reviewCount !== '0' && (
                       <div className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-surface-base">
                         {reviewCount}
                       </div>
                     )}
                   </div>
                   <div>
                     <h3 className="text-base font-medium text-text-primary mb-1">Central de Revisões</h3>
                     <p className="text-sm text-text-secondary">Avaliar lançamentos pendentes de aprovação.</p>
                   </div>
                </div>
                <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors shrink-0 hidden md:block" />
              </button>

              <button
                onClick={() => navigate(APP_ROUTES.transactions + '?status=approved_for_posting')}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-6 text-left transition-colors flex items-center justify-between group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20 text-teal-600 group-hover:scale-105 transition-transform relative">
                     <ClipboardCheck className="w-6 h-6" />
                     {approvedCount !== null && approvedCount !== 0 && approvedCount !== '0' && (
                       <div className="absolute -top-2 -right-2 bg-teal-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-surface-base">
                         {approvedCount}
                       </div>
                     )}
                   </div>
                   <div>
                     <h3 className="text-base font-medium text-text-primary mb-1">Aprovadas</h3>
                     <p className="text-sm text-text-secondary">Movimentações já aprovadas, mas que ainda não alteraram o saldo.</p>
                   </div>
                </div>
                <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors shrink-0 hidden md:block" />
              </button>
            </div>
          </div>

          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Organização financeira</h2>
                <p className="text-sm text-text-secondary">Contas, fundos, categorias e formas de movimentação.</p>
              </div>
            </div>
            
            <button
              onClick={() => navigate(APP_ROUTES.financeSettings)}
              className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-2xl p-6 text-left transition-colors flex items-center justify-between group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-surface-elevated rounded-xl flex items-center justify-center border border-border-subtle text-text-muted group-hover:scale-105 transition-transform">
                   <Settings className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-base font-medium text-text-primary mb-1">Organizar finanças</h3>
                   <p className="text-sm text-text-secondary">Ajustar os parâmetros estruturais da sua igreja.</p>
                 </div>
              </div>
              <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
            </button>
          </div>

        </div>
      </main>

      {bootstrappingEntity && (
          <FinanceBootstrapWizard
            entity={bootstrappingEntity.entity}
            statusData={bootstrappingEntity.statusData}
            onClose={() => {
              setBootstrappingEntity(null);
              setCurrentEpoch(prev => prev + 1);
            }}
          />
      )}

      {entitySelectorOpen && (
        <div className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
           <div className="bg-surface-elevated w-full max-w-sm rounded-[24px] border border-border-subtle shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
              <div className="p-6 flex flex-col gap-4">
                 <h3 className="text-xl font-semibold text-text-primary">Selecionar igreja</h3>
                 <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                    {readyEntities.map(e => (
                       <button
                          key={e.id}
                          onClick={() => {
                             setActiveFinanceEntityId(e.id, e.displayName);
                             setEntitySelectorOpen(false);
                          }}
                          className={`flex items-center p-4 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${e.id === activeFinanceEntityId ? 'border-accent-primary bg-accent-primary/10' : 'border-border-subtle hover:bg-surface-secondary'}`}
                       >
                          <Building2 className={`w-5 h-5 mr-3 ${e.id === activeFinanceEntityId ? 'text-accent-primary' : 'text-text-muted'}`} />
                          <span className={`font-medium ${e.id === activeFinanceEntityId ? 'text-accent-primary' : 'text-text-primary'}`}>{e.displayName}</span>
                       </button>
                    ))}
                 </div>
                 <button 
                    onClick={() => setEntitySelectorOpen(false)}
                    className="w-full h-12 flex items-center justify-center bg-surface-base border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-xl font-medium transition-colors text-sm mt-2"
                 >
                    Cancelar
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

