import React, { useState, useEffect } from 'react';
import { X, Save, Building2, MapPin } from 'lucide-react';
import { updateFinanceEntity } from '@/src/services/financeEntitiesService';

interface FinanceEntityEditModalProps {
  entity: any;
  onClose: () => void;
  onSuccess: (updatedEntity: any) => void;
}

export default function FinanceEntityEditModal({ entity, onClose, onSuccess }: FinanceEntityEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(entity.displayName || '');
  const [legalName, setLegalName] = useState(entity.legalName || '');
  const [tradeName, setTradeName] = useState(entity.tradeName || '');

  const [registeredAddress, setRegisteredAddress] = useState({
    postalCode: entity.registeredAddress?.postalCode || '',
    street: entity.registeredAddress?.street || '',
    number: entity.registeredAddress?.number || '',
    complement: entity.registeredAddress?.complement || '',
    neighborhood: entity.registeredAddress?.neighborhood || '',
    city: entity.registeredAddress?.city || '',
    state: entity.registeredAddress?.state || '',
  });

  const [operationalAddressSame, setOperationalAddressSame] = useState(entity.operationalAddressSameAsRegistered ?? true);
  
  const [operationalAddress, setOperationalAddress] = useState({
    postalCode: entity.operationalAddress?.postalCode || '',
    street: entity.operationalAddress?.street || '',
    number: entity.operationalAddress?.number || '',
    complement: entity.operationalAddress?.complement || '',
    neighborhood: entity.operationalAddress?.neighborhood || '',
    city: entity.operationalAddress?.city || '',
    state: entity.operationalAddress?.state || '',
  });

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setErrorMsg(null);
    if (!displayName.trim() || !legalName.trim()) {
      setErrorMsg('Nome de exibição e razão social são obrigatórios.');
      return;
    }

    try {
      setLoading(true);
      const payload: any = {
        financeEntityId: entity.id,
        displayName: displayName.trim(),
        legalName: legalName.trim(),
        tradeName: tradeName.trim() || null,
        registeredAddress: {
           postalCode: registeredAddress.postalCode.trim() || null,
           street: registeredAddress.street.trim() || null,
           number: registeredAddress.number.trim() || null,
           complement: registeredAddress.complement.trim() || null,
           neighborhood: registeredAddress.neighborhood.trim() || null,
           city: registeredAddress.city.trim() || null,
           state: registeredAddress.state.trim() || null,
        },
        operationalAddressSameAsRegistered: operationalAddressSame,
        operationalAddress: operationalAddressSame ? {
           postalCode: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null
        } : {
           postalCode: operationalAddress.postalCode.trim() || null,
           street: operationalAddress.street.trim() || null,
           number: operationalAddress.number.trim() || null,
           complement: operationalAddress.complement.trim() || null,
           neighborhood: operationalAddress.neighborhood.trim() || null,
           city: operationalAddress.city.trim() || null,
           state: operationalAddress.state.trim() || null,
        }
      };

      const res = await updateFinanceEntity(payload);
      onSuccess(res.entity);
    } catch (err: any) {
      if (err.message === 'FINANCE_ENTITY_ALREADY_EXISTS') {
        setErrorMsg('Já existe uma igreja com esse nome.');
      } else {
        setErrorMsg(err.message || 'Não foi possível atualizar a igreja. Tente novamente.');
      }
      setLoading(false);
    }
  };

  const handleRegChange = (field: string, value: string) => {
    setRegisteredAddress(prev => ({ ...prev, [field]: value }));
  };

  const handleOpChange = (field: string, value: string) => {
    setOperationalAddress(prev => ({ ...prev, [field]: value }));
  };

  // Close on Escape when safe
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !loading) {
            onClose();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-base w-full max-w-[780px] h-[90vh] sm:h-auto sm:max-h-[85vh] rounded-2xl sm:rounded-[24px] shadow-2xl flex flex-col border border-border-subtle overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-base shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Editar igreja</h2>
              <p className="text-sm text-text-secondary">Atualize como esta igreja aparece e corrija os dados necessários.</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={loading}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-secondary text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
              <p className="text-blue-400 text-sm">O CNPJ e o histórico financeiro serão preservados.</p>
          </div>

          {errorMsg && (
             <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                {errorMsg}
             </div>
          )}

          <form onSubmit={handleUpdate} className="space-y-8" id="update-form">
            
            {/* CNPJ - Read Only */}
             <div>
                <label className="block text-sm font-medium text-text-muted mb-2">CNPJ</label>
                <div className="w-full h-12 px-4 flex items-center bg-surface-elevated border border-border-subtle rounded-xl text-text-secondary tabular-nums text-lg opacity-80 cursor-not-allowed">
                    {entity.taxIdFormatted || entity.taxId}
                </div>
                <p className="text-xs text-text-muted mt-2">O CNPJ identifica legalmente esta igreja e não pode ser alterado.</p>
             </div>

             {/* Section 1: Identificação */}
             <div className="space-y-6">
               <h3 className="text-base font-semibold text-text-primary border-b border-border-subtle pb-2">Identificação da igreja</h3>
               
               <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Nome no NestFinance</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full h-12 px-4 bg-surface-secondary border border-border-subtle rounded-xl text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all placeholder:text-text-muted"
                    placeholder="Ex: OBPC Monte Castelo"
                    autoFocus
                    required
                    disabled={loading}
                  />
                  <p className="text-xs text-text-muted mt-2">Como a igreja será chamada dentro do sistema.</p>
               </div>

               <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Razão social</label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="w-full h-12 px-4 bg-surface-secondary border border-border-subtle rounded-xl text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all placeholder:text-text-muted text-sm"
                    required
                    disabled={loading}
                  />
                  <p className="text-xs text-text-muted mt-2">Mantenha este campo de acordo com o cadastro legal da igreja.</p>
               </div>

               <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Nome fantasia <span className="text-text-muted font-normal">(Opcional)</span></label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    className="w-full h-12 px-4 bg-surface-secondary border border-border-subtle rounded-xl text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all placeholder:text-text-muted text-sm"
                    disabled={loading}
                  />
               </div>
               
               <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Logo</label>
                  <div className="w-full h-12 px-4 flex items-center bg-surface-elevated border border-border-subtle border-dashed rounded-xl text-text-muted text-sm cursor-not-allowed">
                     Disponível em uma próxima etapa.
                  </div>
               </div>
             </div>

             {/* Section 2: Endereço Cadastral */}
             <div className="space-y-6 pt-4">
               <h3 className="text-base font-semibold text-text-primary border-b border-border-subtle pb-2 flex items-center gap-2">
                 <MapPin className="w-4 h-4 text-text-muted" />
                 Endereço cadastral
               </h3>
               <p className="text-xs text-text-muted -mt-4 mb-4">Endereço relacionado ao cadastro do CNPJ.</p>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-text-muted mb-1">CEP</label>
                      <input type="text" value={registeredAddress.postalCode} onChange={(e) => handleRegChange('postalCode', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                  </div>
                  <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-text-muted mb-1">Logradouro / Rua</label>
                      <input type="text" value={registeredAddress.street} onChange={(e) => handleRegChange('street', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                  </div>
                  <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-text-muted mb-1">Número</label>
                      <input type="text" value={registeredAddress.number} onChange={(e) => handleRegChange('number', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                  </div>
                  <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-text-muted mb-1">Complemento</label>
                      <input type="text" value={registeredAddress.complement} onChange={(e) => handleRegChange('complement', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                  </div>
                  <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-text-muted mb-1">Bairro</label>
                      <input type="text" value={registeredAddress.neighborhood} onChange={(e) => handleRegChange('neighborhood', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                  </div>
                  <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-text-muted mb-1">Cidade</label>
                      <input type="text" value={registeredAddress.city} onChange={(e) => handleRegChange('city', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                  </div>
                  <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-text-muted mb-1">UF</label>
                      <input type="text" value={registeredAddress.state} onChange={(e) => handleRegChange('state', e.target.value)} disabled={loading} placeholder="PR" className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all uppercase" maxLength={2} />
                  </div>
               </div>
             </div>

             {/* Section 3: Endereço Operacional */}
             <div className="space-y-6 pt-4">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-subtle pb-2 gap-4">
                  <h3 className="text-base font-semibold text-text-primary">Endereço onde a igreja funciona</h3>
                  <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={operationalAddressSame}
                        onChange={(e) => setOperationalAddressSame(e.target.checked)}
                        disabled={loading}
                        className="w-4 h-4 rounded border-border-subtle text-accent-primary focus:ring-accent-primary bg-surface-base"
                      />
                      <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">Usar o mesmo endereço do cadastro do CNPJ</span>
                  </label>
               </div>

               {!operationalAddressSame && (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4">
                    <div className="sm:col-span-1">
                        <label className="block text-xs font-medium text-text-muted mb-1">CEP</label>
                        <input type="text" value={operationalAddress.postalCode} onChange={(e) => handleOpChange('postalCode', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-text-muted mb-1">Logradouro / Rua</label>
                        <input type="text" value={operationalAddress.street} onChange={(e) => handleOpChange('street', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                    </div>
                    <div className="sm:col-span-1">
                        <label className="block text-xs font-medium text-text-muted mb-1">Número</label>
                        <input type="text" value={operationalAddress.number} onChange={(e) => handleOpChange('number', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                    </div>
                    <div className="sm:col-span-1">
                        <label className="block text-xs font-medium text-text-muted mb-1">Complemento</label>
                        <input type="text" value={operationalAddress.complement} onChange={(e) => handleOpChange('complement', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                    </div>
                    <div className="sm:col-span-1">
                        <label className="block text-xs font-medium text-text-muted mb-1">Bairro</label>
                        <input type="text" value={operationalAddress.neighborhood} onChange={(e) => handleOpChange('neighborhood', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                    </div>
                    <div className="sm:col-span-1">
                        <label className="block text-xs font-medium text-text-muted mb-1">Cidade</label>
                        <input type="text" value={operationalAddress.city} onChange={(e) => handleOpChange('city', e.target.value)} disabled={loading} className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all" />
                    </div>
                    <div className="sm:col-span-1">
                        <label className="block text-xs font-medium text-text-muted mb-1">UF</label>
                        <input type="text" value={operationalAddress.state} onChange={(e) => handleOpChange('state', e.target.value)} disabled={loading} placeholder="PR" className="w-full h-10 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-primary text-sm focus:border-accent-primary outline-none transition-all uppercase" maxLength={2} />
                    </div>
                 </div>
               )}
             </div>

          </form>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-base shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-11 px-5 rounded-xl bg-transparent border border-border-subtle text-text-primary font-medium hover:bg-surface-secondary transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="update-form"
            disabled={loading}
            className="flex items-center gap-2 h-11 px-6 rounded-xl bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar alterações
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
