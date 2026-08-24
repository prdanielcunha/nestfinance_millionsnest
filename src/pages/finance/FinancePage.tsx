import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { ArrowRight, Plus, Building2, AlertCircle, RefreshCw, Clock, ClipboardCheck, ArrowUpRight, ArrowDownLeft, MoveRight, Settings } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';
import FinanceBootstrapWizard from '@/src/components/finance/FinanceBootstrapWizard';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { transactionsService } from '@/src/services/transactionsService';

// Types for Query Tracking
interface QueryState<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: T | null;
  error: string | null;
}

export interface PriorityAction {
  type: 'CORRECTION' | 'REVIEW' | 'DRAFTS' | 'APPROVED' | 'CREATE' | 'READ_ONLY' | 'HEALTHY';
  count: number;
  titleKey: 'action_correction_title' | 'action_review_title' | 'action_draft_title' | 'action_approved_title' | 'action_register_title' | 'action_unauthorized_title' | 'status_empty_work';
  descKey: 'action_correction_desc' | 'action_review_desc' | 'action_draft_desc' | 'action_approved_desc' | 'action_register_desc' | 'action_unauthorized_desc' | 'status_empty_work_desc';
  ctaKey: 'action_correction_cta' | 'action_review_cta' | 'action_draft_cta' | 'action_approved_cta' | 'action_register_cta' | null;
  route: string | null;
}

// Pure function to determine priority action
export function determinePriorityAction(
  counts: {
    returned: number;
    review: number;
    drafts: number;
    approved: number;
  },
  capabilities: {
    canCreateDrafts: boolean;
    canReview: boolean;
  }
): PriorityAction {
  if (counts.returned > 0 && capabilities.canCreateDrafts) {
    return {
      type: 'CORRECTION',
      count: counts.returned,
      titleKey: 'action_correction_title',
      descKey: 'action_correction_desc',
      ctaKey: 'action_correction_cta',
      route: `${APP_ROUTES.transactions}?status=draft&returned=true`
    };
  }

  if (counts.review > 0 && capabilities.canReview) {
    return {
      type: 'REVIEW',
      count: counts.review,
      titleKey: 'action_review_title',
      descKey: 'action_review_desc',
      ctaKey: 'action_review_cta',
      route: APP_ROUTES.financeReview
    };
  }

  if (counts.drafts > 0 && capabilities.canCreateDrafts) {
    return {
      type: 'DRAFTS',
      count: counts.drafts,
      titleKey: 'action_draft_title',
      descKey: 'action_draft_desc',
      ctaKey: 'action_draft_cta',
      route: `${APP_ROUTES.transactions}?status=draft`
    };
  }

  if (counts.approved > 0) {
    return {
      type: 'APPROVED',
      count: counts.approved,
      titleKey: 'action_approved_title',
      descKey: 'action_approved_desc',
      ctaKey: 'action_approved_cta',
      route: `${APP_ROUTES.transactions}?status=approved_for_posting`
    };
  }

  if (capabilities.canCreateDrafts) {
    return {
      type: 'CREATE',
      count: 0,
      titleKey: 'action_register_title',
      descKey: 'action_register_desc',
      ctaKey: 'action_register_cta',
      route: APP_ROUTES.transactionCreate
    };
  }

  if (!capabilities.canCreateDrafts && !capabilities.canReview) {
    return {
      type: 'READ_ONLY',
      count: 0,
      titleKey: 'action_unauthorized_title',
      descKey: 'action_unauthorized_desc',
      ctaKey: null,
      route: null
    };
  }

  return {
    type: 'HEALTHY',
    count: 0,
    titleKey: 'status_empty_work',
    descKey: 'status_empty_work_desc',
    ctaKey: null,
    route: null
  };
}

export default function FinancePage() {
  const { accessState } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeFinanceEntityId, setActiveFinanceEntityId, lastUsedFinanceEntityId } = useFinanceEntity();
  const { language, t } = useLanguage();
  const locale = language === 'PT' ? 'pt-BR' : language === 'EN' ? 'en-US' : 'es-ES';
  
  const [loadingOnboarding, setLoadingOnboarding] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [entities, setEntities] = useState<any[]>([]);
  const [bootstrapStatuses, setBootstrapStatuses] = useState<Record<string, any>>({});
  const [bootstrappingEntity, setBootstrappingEntity] = useState<any | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [entitySelectorOpen, setEntitySelectorOpen] = useState(false);

  // Separate, granular query states
  const [reviewState, setReviewState] = useState<QueryState<number>>({ status: 'idle', data: null, error: null });
  const [approvedState, setApprovedState] = useState<QueryState<number>>({ status: 'idle', data: null, error: null });
  const [draftsState, setDraftsState] = useState<QueryState<{ returned: number; simpleDrafts: number }>>({ status: 'idle', data: null, error: null });
  const [activityState, setActivityState] = useState<QueryState<any[]>>({ status: 'idle', data: null, error: null });

  const setupStatus = accessState.financeSetup?.status;
  const returnTo = searchParams.get('returnTo');
  const organizationId = accessState?.organizationId;

  const canCreateDrafts = hasEffectiveCapability(accessState, 'finance.create_drafts');
  const canReview = hasEffectiveCapability(accessState, 'finance.review') || hasEffectiveCapability(accessState, 'finance.post_transactions');

  // Greeting based on current hour
  const greetingKey = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return 'today_greeting_morning';
    if (hr < 18) return 'today_greeting_afternoon';
    return 'today_greeting_evening';
  }, []);

  const fetchOnboardingData = useCallback(async (signal?: AbortSignal) => {
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
           setActiveFinanceEntityId(readyList[0].id, readyList[0].displayName);
        } else if (readyList.length === 0 && !activeFinanceEntityId) {
           setActiveFinanceEntityId(null);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (!signal?.aborted) setApiError(true);
    } finally {
      if (!signal?.aborted) setLoadingOnboarding(false);
    }
  }, [activeFinanceEntityId, setActiveFinanceEntityId]);

  const loadDashboardData = useCallback((entityId: string, signal: AbortSignal) => {
    if (!organizationId) return;

    // 1. Ready for Review
    setReviewState({ status: 'loading', data: null, error: null });
    transactionsService.list(organizationId, entityId, { status: 'ready_for_review' })
      .then((res) => {
        if (signal.aborted) return;
        setReviewState({ status: 'success', data: res.items.length, error: null });
      })
      .catch((err) => {
        if (signal.aborted) return;
        setReviewState({ status: 'error', data: null, error: err.message || 'Error' });
      });

    // 2. Approved
    setApprovedState({ status: 'loading', data: null, error: null });
    transactionsService.list(organizationId, entityId, { status: 'approved_for_posting' })
      .then((res) => {
        if (signal.aborted) return;
        setApprovedState({ status: 'success', data: res.items.length, error: null });
      })
      .catch((err) => {
        if (signal.aborted) return;
        setApprovedState({ status: 'error', data: null, error: err.message || 'Error' });
      });

    // 3. Drafts
    setDraftsState({ status: 'loading', data: null, error: null });
    transactionsService.list(organizationId, entityId, { status: 'draft' })
      .then((res) => {
        if (signal.aborted) return;
        const items = res.items || [];
        const returned = items.filter((d: any) => d.returnReasonCode).length;
        const simpleDrafts = items.filter((d: any) => !d.returnReasonCode).length;
        setDraftsState({ status: 'success', data: { returned, simpleDrafts }, error: null });
      })
      .catch((err) => {
        if (signal.aborted) return;
        setDraftsState({ status: 'error', data: null, error: err.message || 'Error' });
      });

    // 4. Activity
    setActivityState({ status: 'loading', data: null, error: null });
    transactionsService.list(organizationId, entityId, { status: 'posted' }, undefined, 5)
      .then((res) => {
        if (signal.aborted) return;
        setActivityState({ status: 'success', data: res.items || [], error: null });
      })
      .catch((err) => {
        if (signal.aborted) return;
        setActivityState({ status: 'error', data: null, error: err.message || 'Error' });
      });
  }, [organizationId]);

  // Handle onboarding config status
  useEffect(() => {
    const abortController = new AbortController();
    if (setupStatus === 'configured') {
      fetchOnboardingData(abortController.signal);
    } else {
      setLoadingOnboarding(false);
    }
    return () => {
      abortController.abort();
    };
  }, [setupStatus, currentEpoch, fetchOnboardingData]);

  // Handle active finance entity switch
  useEffect(() => {
    if (!activeFinanceEntityId || !organizationId) return;

    const abortController = new AbortController();
    loadDashboardData(activeFinanceEntityId, abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [activeFinanceEntityId, organizationId, loadDashboardData]);

  const pendingEntities = entities.filter(e => bootstrapStatuses[e.id]?.status !== 'ready');
  const readyEntities = entities.filter(e => bootstrapStatuses[e.id]?.status === 'ready');

  // Deep Link Redirect Effect
  useEffect(() => {
    if (activeFinanceEntityId && returnTo && readyEntities.some(e => e.id === activeFinanceEntityId)) {
       navigate(returnTo, { replace: true });
    }
  }, [activeFinanceEntityId, returnTo, readyEntities, navigate]);

  // Memoized action priority determination
  const priorityAction = useMemo(() => {
    const counts = {
      returned: draftsState.data?.returned || 0,
      review: reviewState.data || 0,
      drafts: draftsState.data?.simpleDrafts || 0,
      approved: approvedState.data || 0,
    };
    const capabilities = {
      canCreateDrafts,
      canReview,
    };
    return determinePriorityAction(counts, capabilities);
  }, [reviewState.data, approvedState.data, draftsState.data, canCreateDrafts, canReview]);

  // Loading, Errors, Onboarding Rendering
  if (setupStatus === 'not_configured') {
    return (
      <div className="flex flex-col items-center h-full fade-in max-w-xl mx-auto py-12 px-4 sm:px-0">
        <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-rose-500" />
        </div>
        <div className="text-center space-y-2 mb-8 font-sans">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">{t('status_error_title')}</h1>
          <p className="text-text-secondary text-sm">
            {t('status_error_desc')}
          </p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-primary border border-border-subtle transition-colors"
        >
          {t('status_retry')}
        </button>
      </div>
    );
  }

  if (loadingOnboarding) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[50vh] font-sans">
        <div className="w-8 h-8 border-4 border-surface-elevated border-t-accent-primary rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-text-secondary animate-pulse">{t('status_loading')}</p>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[50vh] font-sans">
        <AlertCircle className="w-8 h-8 text-rose-500 mb-4" />
        <p className="text-sm font-medium text-text-primary mb-4">{t('status_error_title')}</p>
        <button 
          onClick={() => setCurrentEpoch(prev => prev + 1)}
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-primary border border-border-subtle transition-colors"
        >
          {t('status_retry')}
        </button>
      </div>
    );
  }

  // Entity selection view (When no entity is active)
  if (!activeFinanceEntityId || !readyEntities.find(en => en.id === activeFinanceEntityId)) {
    return (
      <div className="flex flex-col flex-1 h-full fade-in pb-20 md:pb-0 font-sans">
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-2xl mx-auto w-full text-center">
            
            {(readyEntities.length > 0 || pendingEntities.length > 0) && (
              <>
                <div className="w-16 h-16 bg-surface-secondary rounded-2xl flex items-center justify-center mb-6 text-text-primary border border-border-subtle mx-auto">
                   <Building2 className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-semibold text-text-primary tracking-tight mb-2">{t('select_entity_title')}</h1>
                <p className="text-sm text-text-secondary mb-10">{t('select_entity_desc')}</p>
                
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
                            {t('select_entity_last_used')}
                          </span>
                        )}
                      </div>
                      
                      <span className="text-xs text-text-muted group-hover:text-accent-primary transition-colors flex items-center mt-auto">
                        {t('select_entity_access')} <ArrowRight className="w-3 h-3 ml-1" />
                      </span>
                    </button>
                    );
                  })}
                </div>
              </>
            )}

            {pendingEntities.length > 0 && (
              <div className="mt-12 w-full text-left">
                <h3 className="text-sm font-medium text-text-secondary mb-3">{t('select_entity_prepare_title')}</h3>
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
                                   <p className="text-xs text-text-secondary truncate">{t('select_entity_prepare_desc')}</p>
                               </div>
                           </div>
                           {canApply && (
                               <button
                                 onClick={() => setBootstrappingEntity({ entity, statusData })}
                                 className="ml-4 shrink-0 px-4 py-2 bg-surface-secondary hover:bg-border-subtle text-text-primary text-sm font-medium rounded-lg transition-colors"
                               >
                                 {t('select_entity_prepare_btn')}
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
                  <h2 className="text-lg font-semibold text-text-primary mb-2">{t('select_entity_none')}</h2>
                  <p className="text-sm text-text-secondary">{t('select_entity_none_desc')}</p>
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

  // Active dashboard data state logic helpers
  const isDashboardLoading = 
    reviewState.status === 'loading' || 
    approvedState.status === 'loading' || 
    draftsState.status === 'loading';

  const hasDashboardError = 
    reviewState.status === 'error' || 
    approvedState.status === 'error' || 
    draftsState.status === 'error';

  // "Hoje" dashboard main view
  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0 font-sans">
      <FinanceEntityContextBar areaName={t('today_title')} />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        <div className="flex flex-col gap-8">
          
          {/* Header & Greetings */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-border-subtle pb-6">
            <div>
              <p className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-1">
                {t(greetingKey)}, {accessState.profile?.displayName || t('profile_fallback')}
              </p>
              <h1 className="text-4xl font-bold text-text-primary tracking-tight">
                {t('today_title')}
              </h1>
            </div>
            {activeFinanceEntityId && (
              <div className="flex items-center gap-2 text-xs bg-surface-default border border-border-subtle px-3 py-1.5 rounded-xl w-fit self-start md:self-auto">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-text-secondary">{t('today_period')}:</span>
                <span className="font-semibold text-accent-primary">{new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</span>
              </div>
            )}
          </div>

          {/* Card Principal: Precisa de Você */}
          <div className="flex flex-col">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 px-1">
              {t('needs_attention_title')}
            </h2>
            {isDashboardLoading ? (
              <div className="animate-pulse bg-surface-default border border-border-subtle rounded-2xl p-6 h-36 flex flex-col justify-between">
                <div className="h-4 bg-surface-elevated rounded w-1/3" />
                <div className="h-3 bg-surface-elevated rounded w-2/3" />
                <div className="h-10 bg-surface-elevated rounded-xl w-32 mt-2" />
              </div>
            ) : hasDashboardError ? (
              <div className="bg-surface-default border border-border-subtle rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">{t('status_error_title')}</h4>
                    <p className="text-xs text-text-secondary mt-1">{t('status_partial_error_desc')}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const abortController = new AbortController();
                    loadDashboardData(activeFinanceEntityId, abortController.signal);
                  }}
                  className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary border border-border-subtle rounded-xl text-xs font-medium text-text-primary transition-colors flex items-center justify-center gap-2 shrink-0 self-start sm:self-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('status_retry')}
                </button>
              </div>
            ) : (
              <div className="relative bg-surface-default border border-border-subtle rounded-2xl p-6 overflow-hidden transition-all duration-300">
                {/* Visual Accent */}
                <div className="absolute top-0 left-0 w-1.5 h-full bg-accent-primary" />
                
                <div className="flex flex-col gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-full border border-accent-primary/20 w-fit block mb-2">
                      {priorityAction.type === 'HEALTHY' || priorityAction.type === 'READ_ONLY' || priorityAction.type === 'CREATE' ? t('status_ok') : t('status_pending')}
                    </span>
                    <h3 className="text-xl font-bold text-text-primary tracking-tight">
                      {t(priorityAction.titleKey)}
                    </h3>
                    <p className="text-sm text-text-secondary mt-1 leading-relaxed">
                      {t(priorityAction.descKey, { count: priorityAction.count })}
                    </p>
                  </div>
                  
                  {priorityAction.ctaKey && priorityAction.route && (
                    <button
                      onClick={() => navigate(priorityAction.route!)}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-accent-primary hover:bg-opacity-90 text-surface-base font-semibold rounded-xl text-sm transition-all shadow-md hover:shadow-lg w-fit shrink-0 cursor-pointer"
                    >
                      {t(priorityAction.ctaKey)}
                      <MoveRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Resumo Operacional */}
          <div className="flex flex-col">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4 px-1">
              {t('operational_summary_title')}
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Devolvidas para Correção */}
              <button
                disabled={draftsState.status !== 'success'}
                onClick={() => navigate(`${APP_ROUTES.transactions}?status=draft&returned=true`)}
                className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-2xl p-5 text-left transition-all flex items-center justify-between group cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary font-medium">{t('op_returned')}</span>
                  {draftsState.status === 'loading' ? (
                    <div className="h-6 bg-surface-elevated animate-pulse rounded w-10 mt-2" />
                  ) : draftsState.status === 'error' ? (
                    <span className="text-xs text-rose-500 font-semibold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {t('status_error_short')}
                    </span>
                  ) : (
                    <span className={`text-2xl font-bold mt-1 tracking-tight font-mono ${draftsState.data?.returned ? 'text-rose-500' : 'text-text-primary'}`}>
                      {draftsState.data?.returned || 0}
                    </span>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
              </button>

              {/* Aguardando Revisão */}
              <button
                disabled={reviewState.status !== 'success'}
                onClick={() => navigate(APP_ROUTES.financeReview)}
                className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-2xl p-5 text-left transition-all flex items-center justify-between group cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary font-medium">{t('op_awaiting')}</span>
                  {reviewState.status === 'loading' ? (
                    <div className="h-6 bg-surface-elevated animate-pulse rounded w-10 mt-2" />
                  ) : reviewState.status === 'error' ? (
                    <span className="text-xs text-rose-500 font-semibold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {t('status_error_short')}
                    </span>
                  ) : (
                    <span className={`text-2xl font-bold mt-1 tracking-tight font-mono ${reviewState.data ? 'text-amber-500' : 'text-text-primary'}`}>
                      {reviewState.data || 0}
                    </span>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
              </button>

              {/* Outros Rascunhos */}
              <button
                disabled={draftsState.status !== 'success'}
                onClick={() => navigate(`${APP_ROUTES.transactions}?status=draft`)}
                className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-2xl p-5 text-left transition-all flex items-center justify-between group cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary font-medium">{t('op_drafts')}</span>
                  {draftsState.status === 'loading' ? (
                    <div className="h-6 bg-surface-elevated animate-pulse rounded w-10 mt-2" />
                  ) : draftsState.status === 'error' ? (
                    <span className="text-xs text-rose-500 font-semibold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {t('status_error_short')}
                    </span>
                  ) : (
                    <span className="text-2xl font-bold mt-1 tracking-tight text-text-primary font-mono">
                      {draftsState.data?.simpleDrafts || 0}
                    </span>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
              </button>

              {/* Aprovadas */}
              <button
                disabled={approvedState.status !== 'success'}
                onClick={() => navigate(`${APP_ROUTES.transactions}?status=approved_for_posting`)}
                className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-2xl p-5 text-left transition-all flex items-center justify-between group cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-secondary font-medium">{t('op_approved')}</span>
                  {approvedState.status === 'loading' ? (
                    <div className="h-6 bg-surface-elevated animate-pulse rounded w-10 mt-2" />
                  ) : approvedState.status === 'error' ? (
                    <span className="text-xs text-rose-500 font-semibold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {t('status_error_short')}
                    </span>
                  ) : (
                    <span className={`text-2xl font-bold mt-1 tracking-tight font-mono ${approvedState.data ? 'text-teal-500' : 'text-text-primary'}`}>
                      {approvedState.data || 0}
                    </span>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
              </button>

            </div>

            {/* Transações Concretizadas Shortcut Bar */}
            <div className="flex flex-col mt-4">
               <button
                 onClick={() => navigate(`${APP_ROUTES.transactions}?status=posted`)}
                 className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-2xl p-5 text-left transition-all flex items-center justify-between group cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary"
               >
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20 text-teal-500 group-hover:scale-105 transition-all">
                     <ClipboardCheck className="w-5 h-5" />
                   </div>
                   <div className="flex flex-col">
                     <h3 className="text-sm font-semibold text-text-primary mb-0.5">{t('op_posted')}</h3>
                     <p className="text-xs text-text-secondary">{t('op_posted_desc')}</p>
                   </div>
                 </div>
                 <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
               </button>
            </div>
          </div>

          {/* Atalhos de Registro (Nova Entrada, Saída, Transferência) */}
          {canCreateDrafts && (
            <div className="flex flex-col">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 px-1">
                {t('shortcuts_title')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* Nova Entrada */}
                <button
                  onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=income`)}
                  className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-xl p-4 flex items-center gap-3 transition-colors text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-500 flex items-center justify-center shrink-0 border border-teal-500/15 group-hover:scale-105 transition-transform">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{t('shortcut_income')}</span>
                </button>

                {/* Nova Saída */}
                <button
                  onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=expense`)}
                  className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-xl p-4 flex items-center gap-3 transition-colors text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 border border-rose-500/15 group-hover:scale-105 transition-transform">
                    <ArrowDownLeft className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{t('shortcut_expense')}</span>
                </button>

                {/* Transferência */}
                <button
                  onClick={() => navigate(`${APP_ROUTES.transactionCreate}?direction=transfer`)}
                  className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-xl p-4 flex items-center gap-3 transition-colors text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/15 group-hover:scale-105 transition-transform">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{t('shortcut_transfer')}</span>
                </button>

              </div>
            </div>
          )}

          {/* Atividade Recente */}
          <div className="flex flex-col">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 px-1">
              {t('recent_activity_title')}
            </h2>
            
            {activityState.status === 'loading' ? (
              <div className="animate-pulse bg-surface-default border border-border-subtle rounded-2xl p-6 h-40 flex flex-col gap-4">
                <div className="h-3 bg-surface-elevated rounded w-2/3" />
                <div className="h-3 bg-surface-elevated rounded w-1/2" />
                <div className="h-3 bg-surface-elevated rounded w-3/4" />
              </div>
            ) : activityState.status === 'error' ? (
              <div className="bg-surface-default border border-border-subtle rounded-2xl p-6 text-center text-xs text-rose-500 font-medium">
                {t('recent_activity_error')}
              </div>
            ) : !activityState.data || activityState.data.length === 0 ? (
              <div className="bg-surface-default border border-border-subtle rounded-2xl p-6 text-center text-sm text-text-muted">
                {t('recent_activity_empty')}
              </div>
            ) : (
              <div className="bg-surface-default border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle/50">
                {activityState.data.map((tx: any) => {
                  const isIncome = tx.direction === 'income';
                  const isExpense = tx.direction === 'expense';
                  const amountText = (tx.amountCents / 100).toLocaleString(locale, { style: 'currency', currency: 'BRL' });
                  
                  return (
                    <button
                      key={tx.id}
                      onClick={() => navigate(`${APP_ROUTES.transactions}/${tx.id}`)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-secondary/40 transition-colors cursor-pointer group focus:outline-none focus:bg-surface-secondary/40"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Direction indicators */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          isIncome 
                            ? 'bg-teal-500/10 border-teal-500/15 text-teal-500' 
                            : isExpense 
                              ? 'bg-rose-500/10 border-rose-500/15 text-rose-500' 
                              : 'bg-blue-500/10 border-blue-500/15 text-blue-500'
                        }`}>
                          {isIncome ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : isExpense ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </div>
                        
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate" title={tx.description}>
                            {tx.description || (isIncome ? t('activity_income') : isExpense ? t('activity_expense') : t('activity_transfer'))}
                          </p>
                          <p className="text-xs text-text-secondary mt-0.5">
                            {tx.occurredAt ? new Date(tx.occurredAt).toLocaleDateString(locale) : ''}
                            {tx.counterparty ? ` • ${tx.counterparty}` : ''}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-sm font-bold font-mono tracking-tight ${isIncome ? 'text-teal-500' : isExpense ? 'text-rose-500' : 'text-blue-500'}`}>
                          {isIncome ? '+' : isExpense ? '-' : ''} {amountText}
                        </span>
                        <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Configurações Estruturais Shortcut */}
          <div className="flex flex-col">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 px-1">
              {t('org_settings_title')}
            </h2>
            <button
              onClick={() => navigate(APP_ROUTES.financeSettings)}
              className="bg-surface-default border border-border-subtle hover:border-border-strong rounded-2xl p-5 text-left transition-all flex items-center justify-between group cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-surface-elevated rounded-xl flex items-center justify-center border border-border-subtle text-text-muted group-hover:scale-105 transition-transform">
                   <Settings className="w-5 h-5 text-text-muted" />
                 </div>
                 <div>
                   <h3 className="text-sm font-semibold text-text-primary mb-0.5">{t('org_settings_title')}</h3>
                   <p className="text-xs text-text-secondary">{t('org_settings_desc')}</p>
                 </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
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
    </div>
  );
}
