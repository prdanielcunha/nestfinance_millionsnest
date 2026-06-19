import React, { useEffect, useState } from 'react';
import { Building2, Plus, AlertCircle } from 'lucide-react';
import { listFinanceEntities } from '@/src/services/financeEntitiesService';
import FinanceEntityOnboarding from '@/src/components/finance/FinanceEntityOnboarding';

export default function FinanceEntitiesPage() {
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchEntities();
  }, []);

  const fetchEntities = async () => {
    try {
      setLoading(true);
      const res = await listFinanceEntities();
      setEntities(res.entities || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar as igrejas.');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = () => {
    setIsModalOpen(false);
    setSuccessMsg('Igreja cadastrada. Na próxima etapa, ajudaremos você a preparar as contas, fundos e categorias iniciais.');
    fetchEntities();
    setTimeout(() => setSuccessMsg(null), 8000);
  };

  return (
    <div className="flex flex-col h-full bg-surface-base antialiased text-text-base">
      {/* Header */}
      <header className="px-6 py-6 border-b border-border-subtle bg-surface-base flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-6 h-6 text-accent-primary" />
            <h1 className="text-2xl font-semibold text-text-primary">Igrejas e CNPJs</h1>
        </div>
        <p className="text-sm text-text-secondary max-w-2xl">
          Cada igreja mantém seus próprios dados financeiros, mesmo quando é administrada pela mesma equipe.
        </p>
      </header>

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
                onClick={() => setIsModalOpen(true)}
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
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center justify-center py-2 px-4 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
                   >
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar igreja
                   </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entities.map(entity => (
                      <div key={entity.id} className="bg-surface-elevated border border-border-subtle rounded-xl p-5 hover:border-border-strong transition-colors">
                          <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center shrink-0">
                                  {entity.hasLogo ? (
                                      <img src="" alt={entity.displayName} className="w-full h-full rounded-full object-cover" />
                                  ) : (
                                      <span className="text-text-muted font-medium text-lg">{entity.displayName.charAt(0)}</span>
                                  )}
                              </div>
                              <div className="flex-1 min-w-0">
                                  <h3 className="text-lg font-medium text-text-primary truncate">{entity.displayName}</h3>
                                  <div className="text-sm text-text-muted mt-1 truncate">{entity.taxIdFormatted}</div>
                                  <div className="flex items-center gap-2 mt-3">
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
                      </div>
                  ))}
               </div>
           </div>
        )}
       </main>

       {isModalOpen && (
           <FinanceEntityOnboarding 
             onClose={() => setIsModalOpen(false)} 
             onSuccess={handleSuccess} 
           />
       )}
    </div>
  );
}
