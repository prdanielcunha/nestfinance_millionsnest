import { useEffect, useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { ArrowRight, Settings, Landmark, Plus, FolderHeart, Bookmark, Building2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';
import FinanceBootstrapWizard from '@/src/components/finance/FinanceBootstrapWizard';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';

import { FinanceContextHeader } from '@/src/components/finance/FinanceContextHeader';

export default function FinancePage() {
  const { accessState } = useAuth();
  const navigate = useNavigate();
  const { activeFinanceEntityId, setActiveFinanceEntityId } = useFinanceEntity();
  const [loadingOnboarding, setLoadingOnboarding] = useState(true);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [hasFunds, setHasFunds] = useState(false);
  const [hasCategories, setHasCategories] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [entities, setEntities] = useState<any[]>([]);
  const [bootstrapStatuses, setBootstrapStatuses] = useState<Record<string, any>>({});
  const [bootstrappingEntity, setBootstrappingEntity] = useState<any | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState(0);
  
  const setupStatus = accessState.financeSetup?.status;

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
  }, [setupStatus, activeFinanceEntityId, currentEpoch]);

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
      if (readyList.length > 0) {
          let nextId = activeFinanceEntityId && readyList.find((e: any) => e.id === activeFinanceEntityId) 
             ? activeFinanceEntityId 
             : readyList[0].id;
             
          if (nextId !== activeFinanceEntityId && !signal?.aborted) {
            const nextEntity = readyList.find((e: any) => e.id === nextId);
            setActiveFinanceEntityId(nextId, nextEntity?.displayName);
            return; // Will be triggered again by the useEffect dependency
          }

          const [accountsRes, fundsRes, categoriesRes] = await Promise.all([
            fetch('/api/finance/accounts/list', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ financeEntityId: nextId }),
              signal
            }),
            fetch('/api/finance/funds/list', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ financeEntityId: nextId }),
              signal
            }),
            fetch('/api/finance/categories/list', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ financeEntityId: nextId }),
              signal
            })
          ]);
          
          if (!accountsRes.ok || !fundsRes.ok || !categoriesRes.ok) {
            throw new Error('API_LOAD_FAIL');
          }
          
          const accountsData = await accountsRes.json();
          const fundsData = await fundsRes.json();
          const categoriesData = await categoriesRes.json();

          if (!signal?.aborted) {
            const activeAccountsCount = accountsData.accounts
              ? accountsData.accounts.filter((a: any) => a.active !== false).length
              : 0;
            setHasAccounts(activeAccountsCount > 0);

            const activeFundsCount = fundsData.funds
              ? fundsData.funds.filter((f: any) => f.active !== false).length
              : 0;
            setHasFunds(activeFundsCount > 0);
            
            const activeCategoriesCount = categoriesData.categories 
              ? categoriesData.categories.filter((c: any) => c.active !== false).length 
              : 0;
            setHasCategories(activeCategoriesCount > 0);
          }
      } else {
          if (!signal?.aborted) setActiveFinanceEntityId(null);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (!signal?.aborted) setApiError(true);
    } finally {
      if (!signal?.aborted) setLoadingOnboarding(false);
    }
  };

  const pendingEntities = entities.filter(e => {
     const status = bootstrapStatuses[e.id]?.status;
     // If status is not explicitly 'ready', treat as pending (including undefined on API failure)
     return status !== 'ready';
  });

  const readyEntities = entities.filter(e => {
     const status = bootstrapStatuses[e.id]?.status;
     return status === 'ready';
  });

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

  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0">
      <FinanceContextHeader
        pageName="Finance"
        title="Finance"
        rightContent={
          readyEntities.length > 0 && activeFinanceEntityId && (
            <select
               value={activeFinanceEntityId}
               onChange={(e) => {
                  const changedEntity = readyEntities.find(en => en.id === e.target.value);
                  if (changedEntity) {
                    setActiveFinanceEntityId(e.target.value, changedEntity.displayName);
                    // fetchOnboardingData() is handled by useEffect dependency tracking
                  }
               }}
               className="h-10 px-3 pr-8 rounded-lg outline-none bg-surface-elevated border border-border-subtle text-sm text-text-primary focus:ring-2 focus:ring-accent-primary max-w-xs truncate"
            >
               {readyEntities.map(e => <option key={e.id} value={e.id}>{e.displayName}</option>)}
            </select>
          )
        }
      />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 font-sans">
        <div className="flex flex-col items-center justify-center border border-border-subtle rounded-2xl bg-surface-base p-6 min-h-[40vh] w-full">
        {loadingOnboarding ? (
          <div className="flex flex-col w-full max-w-3xl justify-start self-start space-y-6">
            <div className="flex flex-col items-start justify-center gap-4">
              <div className="w-8 h-8 border-4 border-surface-elevated border-t-accent-primary rounded-full animate-spin" />
              <p className="text-text-secondary text-sm font-medium animate-pulse">
                Carregando os dados da {activeFinanceEntityId ? (readyEntities.find(e => e.id === activeFinanceEntityId)?.displayName || 'igreja') : 'igreja'}...
              </p>
            </div>
            {/* Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4">
              <div className="bg-surface-elevated rounded-xl p-5 border border-border-subtle h-[104px] animate-pulse"></div>
              <div className="bg-surface-elevated rounded-xl p-5 border border-border-subtle h-[104px] animate-pulse hidden sm:block"></div>
              <div className="bg-surface-elevated rounded-xl p-5 border border-border-subtle h-[104px] animate-pulse hidden sm:block"></div>
            </div>
          </div>
        ) : apiError ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm">
            <p className="text-red-500 text-sm mb-4">Falha ao verificar os dados financeiros da organização.</p>
            <button
              onClick={() => setCurrentEpoch(prev => prev + 1)}
              className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        ) : readyEntities.length === 0 && pendingEntities.length > 0 ? (
          <div className="flex flex-col w-full max-w-3xl justify-start self-start">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Prepare a estrutura financeira da igreja</h2>
                <p className="text-sm text-text-secondary">Organize os cadastros básicos antes de começar</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingEntities.map(entity => {
                 const statusData = bootstrapStatuses[entity.id] || {};
                 const isLegacy = statusData.status === 'legacy_data_available';
                 const isEnabledByBackend = statusData.applicationAvailability?.available === true;
                 const canApply = isEnabledByBackend || isLegacy;
                 return (
                   <div key={entity.id} className="bg-surface-elevated border border-border-subtle rounded-xl p-5 relative">
                      <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded bg-surface-secondary flex items-center justify-center shrink-0">
                             <Building2 className="w-5 h-5 text-text-muted" />
                          </div>
                          <div className="flex-1 min-w-0">
                              <h3 className="text-base font-medium text-text-primary truncate">{entity.displayName}</h3>
                              <p className="text-xs text-text-secondary mt-1">
                                  {isLegacy ? 'Cadastros existentes encontrados' : 'Preparação ainda não liberada'}
                              </p>
                          </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-border-subtle">
                         {canApply ? (
                             <button
                                onClick={() => setBootstrappingEntity({ entity, statusData })}
                                className="w-full flex items-center justify-center h-10 rounded-lg bg-surface-secondary hover:bg-border-subtle text-text-primary text-sm font-medium transition-colors"
                             >
                                <Building2 className="w-4 h-4 mr-2" />
                                {isLegacy ? 'Organizar dados financeiros' : 'Preparar igreja'}
                             </button>
                         ) : (
                             <div className="w-full flex items-center justify-center h-10 rounded-lg bg-surface-base border border-border-subtle text-text-muted text-sm cursor-not-allowed">
                                <AlertCircle className="w-4 h-4 mr-2" />
                                Preparação ainda não liberada
                             </div>
                         )}
                      </div>
                   </div>
                 );
              })}
            </div>
          </div>
        ) : !hasAccounts ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm font-sans">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted border border-border-subtle">
              <Landmark className="w-6 h-6" />
            </div>
            <h2 className="text-base font-medium text-text-primary mb-2">Cadastre ou reative uma conta financeira</h2>
            <p className="text-sm text-text-secondary mb-6">
              O NestFinance precisa de pelo menos uma conta para registrar suas transações.
            </p>
            <button
              onClick={() => navigate(APP_ROUTES.financeSettingsAccounts)}
              className="flex items-center justify-center h-10 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Conta
            </button>
          </div>
        ) : !hasFunds ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm font-sans">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted border border-border-subtle">
              <FolderHeart className="w-6 h-6 text-rose-500" />
            </div>
            <h2 className="text-base font-medium text-text-primary mb-2">Cadastre o primeiro fundo</h2>
            <p className="text-sm text-text-secondary mb-6">
              Fundos ajudam a separar recursos livres de valores destinados a finalidades específicas.
            </p>
            <button
              onClick={() => navigate(APP_ROUTES.financeSettingsFunds)}
              className="flex items-center justify-center h-10 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Fundo
            </button>
          </div>
        ) : !hasCategories ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm font-sans">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted border border-border-subtle">
              <Bookmark className="w-6 h-6 text-amber-500" />
            </div>
            <h2 className="text-base font-medium text-text-primary mb-2">Cadastre as categorias financeiras</h2>
            <p className="text-sm text-text-secondary mb-6">
              Categorias identificam a natureza das entradas e saídas, como Dízimos, Ofertas, Energia e Manutenção.
            </p>
            <button
              onClick={() => navigate(APP_ROUTES.financeSettingsCategories)}
              className="flex items-center justify-center h-10 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Categoria
            </button>
          </div>
        ) : (
          <div className="flex flex-col w-full max-w-3xl justify-start self-start gap-8">
            <div className="flex flex-col w-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Atividade</h2>
                </div>
              </div>
              <button
                onClick={() => navigate(APP_ROUTES.transactions)}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-xl p-5 text-left transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center border border-border-subtle group-hover:scale-105 transition-transform text-text-base">
                     <ArrowRight className="w-5 h-5 text-teal-500/70 group-hover:text-teal-500 transition-colors" />
                   </div>
                   <div>
                     <h3 className="text-sm font-medium text-text-primary mb-1">Ver movimentações</h3>
                     <p className="text-xs text-text-secondary">Entradas e saídas registradas.</p>
                   </div>
                </div>
                <ArrowRight className="w-5 h-5 text-text-muted" />
              </button>
            </div>

            <div className="flex flex-col w-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Organização financeira</h2>
                  <p className="text-sm text-text-secondary">Estrutura de contas, fundos e categorias ativas</p>
                </div>
                <button
                  onClick={() => navigate(APP_ROUTES.financeSettings)}
                  className="hidden sm:flex items-center px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Organizar finanças
                </button>
              </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                onClick={() => navigate(APP_ROUTES.financeSettingsAccounts)}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-xl p-5 text-left transition-colors flex flex-col group"
              >
                <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center border border-border-subtle mb-3 group-hover:scale-105 transition-transform text-text-base">
                  <Landmark className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-medium text-text-primary mb-1">Contas</h3>
                <p className="text-xs text-text-secondary">Onde o dinheiro fica.</p>
              </button>

              <button
                onClick={() => navigate(APP_ROUTES.financeSettingsFunds)}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-xl p-5 text-left transition-colors flex flex-col group"
              >
                <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center border border-border-subtle mb-3 group-hover:scale-105 transition-transform text-text-base">
                  <FolderHeart className="w-5 h-5 text-rose-500/70 group-hover:text-rose-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-text-primary mb-1">Fundos</h3>
                <p className="text-xs text-text-secondary">Para que ele foi separado.</p>
              </button>

              <button
                onClick={() => navigate(APP_ROUTES.financeSettingsCategories)}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-xl p-5 text-left transition-colors flex flex-col group"
              >
                <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center border border-border-subtle mb-3 group-hover:scale-105 transition-transform text-text-base">
                  <Bookmark className="w-5 h-5 text-amber-500/70 group-hover:text-amber-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-text-primary mb-1">Categorias</h3>
                <p className="text-xs text-text-secondary">Por que entrou ou saiu.</p>
              </button>
            </div>
            
            <button
              onClick={() => navigate(APP_ROUTES.financeSettings)}
              className="sm:hidden mt-4 w-full flex items-center justify-center px-4 py-3 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors min-h-[44px]"
            >
              <Settings className="w-4 h-4 mr-2" />
              Organizar finanças
            </button>
            </div>
          </div>
        )}
      </div>

      {readyEntities.length > 0 && pendingEntities.length > 0 && (
          <div className="mt-4 border border-border-subtle rounded-2xl bg-surface-base p-6 max-w-3xl">
             <h3 className="text-sm font-medium text-text-secondary mb-3">Organizações pendentes</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                             className="ml-4 shrink-0 px-3 py-1.5 bg-surface-secondary hover:bg-border-subtle text-text-primary text-xs font-medium rounded-lg transition-colors"
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
      </main>

      {bootstrappingEntity && (
          <FinanceBootstrapWizard
            entity={bootstrappingEntity.entity}
            statusData={bootstrappingEntity.statusData}
            onClose={() => {
              setBootstrappingEntity(null);
              setCurrentEpoch(prev => prev + 1); // Trigger refetch
            }}
          />
      )}
    </div>
  );
}

