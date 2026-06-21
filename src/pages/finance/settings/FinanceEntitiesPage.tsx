import React, { useEffect, useState } from 'react';
import { Building2, Plus, AlertCircle, MoreHorizontal, Edit2, ShieldAlert } from 'lucide-react';
import { listFinanceEntities, getFinanceEntityDetail } from '@/src/services/financeEntitiesService';
import { getBootstrapStatus } from '@/src/services/financeBootstrapService';
import FinanceEntityOnboarding from '@/src/components/finance/FinanceEntityOnboarding';
import FinanceEntityEditModal from '@/src/components/finance/FinanceEntityEditModal';
import FinanceBootstrapWizard from '@/src/components/finance/FinanceBootstrapWizard';
import { FinanceContextHeader } from '@/src/components/finance/FinanceContextHeader';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { canManageFinanceEntities } from '@/src/lib/permissions';

export default function FinanceEntitiesPage() {
  const { accessState } = useAuth();
  const hasAccess = canManageFinanceEntities(accessState);

  const [entities, setEntities] = useState<any[]>([]);
  const [bootstrapStatuses, setBootstrapStatuses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(hasAccess);
  const [error, setError] = useState<string | null>(null);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any | null>(null);
  
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const [bootstrappingEntity, setBootstrappingEntity] = useState<any | null>(null);

  useEffect(() => {
    if (hasAccess) {
      fetchEntities();
    }
  }, [hasAccess]);

  const fetchEntities = async () => {
    try {
      setLoading(true);
      const res = await listFinanceEntities();
      setEntities(res.entities || []);
      
      const statuses: Record<string, any> = {};
      await Promise.all((res.entities || []).map(async (e: any) => {
          try {
              const statusData = await getBootstrapStatus(e.id);
              statuses[e.id] = statusData;
          } catch (e) {
              // ignore fetch status error for individual entity
          }
      }));
      setBootstrapStatuses(statuses);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar as igrejas.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    setSuccessMsg('Igreja cadastrada. Na próxima etapa, ajudaremos você a preparar as contas, fundos e categorias iniciais.');
    fetchEntities();
    setTimeout(() => setSuccessMsg(null), 8000);
  };

  const handleEditSuccess = (updatedEntity: any) => {
    setEditingEntity(null);
    setSuccessMsg('Igreja atualizada com sucesso.');
    // We can update the list optimistically but let's just refetch to be safe since we are returning the updated entity
    setEntities(prev => prev.map(e => e.id === updatedEntity.id ? updatedEntity : e));
    setTimeout(() => setSuccessMsg(null), 8000);
  };

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  const handleEditClick = async (entity: any) => {
    setActiveMenuId(null);
    setLoadingDetailId(entity.id);
    setSuccessMsg(null);
    setError(null);
    try {
      const res = await getFinanceEntityDetail(entity.id);
      setEditingEntity(res.entity);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar os dados da igreja. Tente novamente.');
    } finally {
      setLoadingDetailId(null);
    }
  };

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuId(null);
    if (activeMenuId) {
       window.addEventListener('click', handleOutsideClick);
    }
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [activeMenuId]);

  if (!hasAccess) {
    return (
      <div className="flex flex-col h-full bg-background-base antialiased text-text-base items-center justify-center p-6 text-center">
        <div className="w-12 h-12 bg-surface-elevated border border-semantic-danger/30 rounded-full flex items-center justify-center text-semantic-danger mb-4">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-medium text-text-primary mb-2">Acesso Negado</h1>
        <p className="text-sm text-text-secondary max-w-sm">
          Você não possui permissão para visualizar e gerenciar as igrejas.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-base antialiased text-text-base">
      <FinanceContextHeader
        pageName="Igrejas e CNPJs"
        title="Igrejas e CNPJs"
        description="Cada igreja mantém seus próprios dados financeiros, mesmo quando administrados pela mesma equipe."
        backTo={APP_ROUTES.more}
        isOrganizational={true}
      />

      {/* Success Banner */}
      {successMsg && (
        <div className="px-6 py-4 bg-emerald-500/10 border-b border-emerald-500/20 text-sm text-emerald-400 flex items-center justify-center animate-in fade-in slide-in-from-top-2">
          {successMsg}
        </div>
      )}

       {/* Content */}
       <main className="flex-1 overflow-y-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-surface-secondary border-t-accent-primary rounded-full animate-spin" />
          </div>
        ) : error ? (
           <div className="flex flex-col items-center justify-center p-8 text-center bg-surface-elevated rounded-2xl border border-border-subtle border-dashed max-w-md mx-auto">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-4" />
            <p className="text-rose-400 text-sm mb-4">{error}</p>
            <button
               onClick={fetchEntities}
               className="h-10 px-4 rounded-lg bg-surface-secondary text-text-primary font-medium hover:bg-border-subtle transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        ) : entities.length === 0 ? (
           <div className="flex flex-col items-center justify-center p-10 h-64 text-center bg-surface-elevated rounded-2xl border border-border-subtle border-dashed max-w-md mx-auto mt-6">
              <div className="w-14 h-14 bg-surface-secondary rounded-2xl flex items-center justify-center mb-5 text-text-muted">
                 <Building2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">Nenhuma igreja cadastrada</h3>
              <p className="text-text-secondary text-sm max-w-sm mb-8">
                 Adicione a primeira igreja para iniciar a estrutura financeira.
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center justify-center h-12 px-6 rounded-xl bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors shadow-lg shadow-accent-primary/20 active:scale-[0.98]"
              >
                <Plus className="w-5 h-5 mr-2" />
                Adicionar igreja
              </button>
           </div>
        ) : (
           <div className="max-w-4xl mx-auto space-y-6">
               <div className="flex items-center justify-between">
                   <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
                     {entities.length} {entities.length === 1 ? 'Igreja' : 'Igrejas'}
                   </h2>
                   <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center justify-center py-2 px-4 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
                   >
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar igreja
                   </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entities.map(entity => (
                      <div key={entity.id} className="bg-surface-elevated border border-border-subtle rounded-xl p-5 hover:border-border-strong transition-colors relative">
                          <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center shrink-0">
                                  {entity.hasLogo ? (
                                      <img src="" alt={entity.displayName} className="w-full h-full rounded-full object-cover" />
                                  ) : (
                                      <span className="text-text-muted font-medium text-lg">{entity.displayName.charAt(0)}</span>
                                  )}
                              </div>
                              <div className="flex-1 min-w-0 pr-6">
                                  <h3 className="text-lg font-medium text-text-primary truncate">{entity.displayName}</h3>
                                  <div className="text-sm text-text-muted mt-1 truncate">{entity.taxIdFormatted}</div>
                                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                                     {entity.active ? (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400">Ativa</span>
                                     ) : (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-secondary text-text-muted">Inativa</span>
                                     )}
                                     
                                     {entity.city && (
                                         <span className="text-xs text-text-secondary truncate">
                                             {entity.city}{entity.state ? ` - ${entity.state}` : ''}
                                         </span>
                                     )}
                                  </div>
                              </div>
                          </div>

                           {bootstrapStatuses[entity.id] && bootstrapStatuses[entity.id].status !== 'ready' && (
                               <div className="mt-5 p-4 rounded-xl bg-surface-secondary/50 border border-border-subtle flex flex-col sm:flex-row sm:items-center gap-4">
                                   <div className="flex-1">
                                       <div className="flex items-center gap-2 mb-1">
                                           <AlertCircle className="w-4 h-4 text-accent-primary" />
                                           <h4 className="text-sm font-medium text-text-primary">Estrutura financeira pendente</h4>
                                       </div>
                                       <p className="text-xs text-text-secondary">
                                           {bootstrapStatuses[entity.id].status === 'legacy_data_available' 
                                               ? 'Há cadastros existentes para organizar.' 
                                               : 'Prepare os cadastros básicos para começar.'}
                                       </p>
                                   </div>
                                   <button 
                                      onClick={() => setBootstrappingEntity({ entity, statusData: bootstrapStatuses[entity.id] })}
                                      className="shrink-0 h-9 px-4 rounded-lg bg-surface-elevated border border-border-subtle text-text-primary text-sm font-medium hover:border-accent-primary hover:text-accent-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                                   >
                                       {bootstrapStatuses[entity.id].status === 'legacy_data_available' 
                                            ? 'Organizar dados financeiros' 
                                            : 'Preparar estrutura financeira'}
                                   </button>
                               </div>
                           )}

                          {/* Menu contextual */}
                          <div className="absolute top-4 right-4">
                              <button
                                  onClick={(e) => toggleMenu(entity.id, e)}
                                  aria-label={`Ações de ${entity.displayName}`}
                                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-secondary text-text-muted hover:text-text-primary transition-colors"
                              >
                                  <MoreHorizontal className="w-5 h-5" />
                              </button>
                              
                              {activeMenuId === entity.id && (
                                  <div className="absolute right-0 mt-1 w-48 bg-surface-elevated border border-border-subtle rounded-xl shadow-xl overflow-hidden z-10 animate-in fade-in slide-in-from-top-2">
                                      <button
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             handleEditClick(entity);
                                          }}
                                          disabled={loadingDetailId === entity.id}
                                          className="w-full h-11 px-4 flex items-center gap-3 text-sm text-text-primary hover:bg-surface-secondary transition-colors text-left disabled:opacity-50"
                                      >
                                          {loadingDetailId === entity.id ? (
                                              <div className="w-4 h-4 border-2 border-text-muted border-t-accent-primary rounded-full animate-spin" />
                                          ) : (
                                              <Edit2 className="w-4 h-4 text-text-muted" />
                                          )}
                                          {loadingDetailId === entity.id ? 'Carregando...' : 'Editar igreja'}
                                      </button>
                                  </div>
                              )}
                          </div>
                      </div>
                  ))}
               </div>
           </div>
        )}
       </main>

       {isCreateModalOpen && (
           <FinanceEntityOnboarding 
             onClose={() => setIsCreateModalOpen(false)} 
             onSuccess={handleCreateSuccess} 
           />
       )}

       {editingEntity && (
           <FinanceEntityEditModal
             entity={editingEntity}
             onClose={() => setEditingEntity(null)}
             onSuccess={handleEditSuccess}
           />
       )}

       {bootstrappingEntity && (
           <FinanceBootstrapWizard
             entity={bootstrappingEntity.entity}
             statusData={bootstrappingEntity.statusData}
             onClose={() => setBootstrappingEntity(null)}
           />
       )}
    </div>
  );
}
