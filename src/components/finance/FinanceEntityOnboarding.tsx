import React, { useState } from 'react';
import { Building2, FileText, ArrowRight, ArrowLeft, RefreshCw, X, Check } from 'lucide-react';
import { lookupCnpj, createFinanceEntity } from '@/src/services/financeEntitiesService';

// Add simple formatting mask
const maskCnpj = (value: string) => {
  const v = value.replace(/\D/g, '');
  if (v.length <= 14) {
    return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value; // For alphanumeric or different sizes, leave as is during typing
};

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function FinanceEntityOnboarding({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Data
  const [taxId, setTaxId] = useState('');
  
  // Lookup Result / Manual Data
  const [registryData, setRegistryData] = useState<any>(null);
  
  // Customization
  const [displayName, setDisplayName] = useState('');
  const [sameAddress, setSameAddress] = useState(true);
  const [operationalAddress, setOperationalAddress] = useState<any>({
    postalCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: ''
  });

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxId.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await lookupCnpj(taxId);
      
      const entity = res.entity;
      setRegistryData({
        taxId: entity.taxId,
        legalName: entity.legalName || '',
        tradeName: entity.tradeName || '',
        registrationStatus: entity.registrationStatus || '',
        registrationStatusDate: entity.registrationStatusDate || '',
        openingDate: entity.openingDate || '',
        legalNatureCode: entity.legalNatureCode || '',
        legalNatureDescription: entity.legalNatureDescription || '',
        primaryActivityCode: entity.primaryActivityCode || '',
        primaryActivityDescription: entity.primaryActivityDescription || '',
        registeredAddress: entity.registeredAddress || {
            postalCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: ''
        },
        source: res.provider,
        providerDataset: res.providerDataset,
        queriedAt: res.queriedAt
      });
      
      setDisplayName(entity.tradeName || entity.legalName || '');
      setStep(2);
    } catch (err: any) {
       console.error("Lookup error:", err.message);
       if (err.message === 'REGISTRY_NOT_FOUND') {
         setErrorMsg('Não encontramos dados para este CNPJ. Confira o número ou continue preenchendo manualmente.');
       } else if (err.message === 'REGISTRY_PROVIDER_UNAVAILABLE' || err.message === 'REGISTRY_PROVIDER_TIMEOUT') {
         setErrorMsg('A consulta automática está temporariamente indisponível. Você pode continuar o cadastro manualmente.');
       } else if (err.message === 'INVALID_TAX_ID') {
         setErrorMsg('Confira o CNPJ informado.');
       } else {
         setErrorMsg('Ocorreu um erro ao consultar o CNPJ. Tente novamente ou preencha manualmente.');
       }
    } finally {
      setLoading(false);
    }
  };

  const handleManualEntry = () => {
     setRegistryData({
        taxId: taxId.replace(/\D/g, ''),
        legalName: '',
        tradeName: '',
        registrationStatus: '',
        registrationStatusDate: '',
        openingDate: '',
        legalNatureCode: '',
        legalNatureDescription: '',
        primaryActivityCode: '',
        primaryActivityDescription: '',
        registeredAddress: {
            postalCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: ''
        },
        source: 'manual',
        providerDataset: null,
        queriedAt: null
     });
     setStep(2);
     setErrorMsg(null);
  };

  const handleCreate = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const payload = {
        taxId: registryData.taxId,
        legalName: registryData.legalName,
        tradeName: registryData.tradeName || null,
        displayName: displayName || registryData.tradeName || registryData.legalName,
        registration: {
            status: registryData.registrationStatus || null,
            statusDate: registryData.registrationStatusDate || null,
            openingDate: registryData.openingDate || null,
            legalNatureCode: registryData.legalNatureCode || null,
            legalNatureDescription: registryData.legalNatureDescription || null,
            primaryActivityCode: registryData.primaryActivityCode || null,
            primaryActivityDescription: registryData.primaryActivityDescription || null
        },
        registeredAddress: registryData.registeredAddress,
        operationalAddress: sameAddress ? registryData.registeredAddress : operationalAddress,
        operationalAddressSameAsRegistered: sameAddress,
        registryConfirmation: {
            source: registryData.source,
            providerDataset: registryData.providerDataset,
            queriedAt: registryData.queriedAt
        }
      };

      await createFinanceEntity(payload);
      onSuccess();
    } catch (err: any) {
        if (err.message === 'FINANCE_ENTITY_ALREADY_EXISTS') {
            setErrorMsg('Este CNPJ já está cadastrado nesta organização.');
        } else if (err.message === 'ENTITIES_WRITE_DISABLED') {
            setErrorMsg('O cadastro de igrejas ainda não está liberado neste ambiente.');
        } else {
            setErrorMsg('Ocorreu um erro ao criar. Verifique os dados e tente novamente.');
        }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm antialiased font-sans">
      <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-[760px] bg-surface-base sm:bg-surface-elevated sm:rounded-2xl shadow-2xl flex flex-col relative animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between sticky top-0 bg-surface-base sm:bg-surface-elevated z-10 sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            {step > 1 && (
               <button onClick={() => setStep((step - 1) as any)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-secondary text-text-muted transition-colors">
                  <ArrowLeft className="w-4 h-4" />
               </button>
            )}
            <h2 className="text-lg font-medium text-text-primary">
              Adicionar igreja
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-secondary text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-surface-secondary w-full">
            <div className="h-full bg-accent-primary transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }} />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          
          {errorMsg && (
             <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                {errorMsg}
             </div>
          )}

          {/* STEP 1: IDENTIFY */}
          {step === 1 && (
            <div className="max-w-md mx-auto py-8">
              <div className="w-12 h-12 bg-surface-secondary rounded-2xl flex items-center justify-center mb-6 text-accent-primary">
                 <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-semibold text-text-primary mb-3">
                Qual é o CNPJ da igreja?
              </h3>
              <p className="text-text-secondary mb-8">
                Usaremos o CNPJ somente para preencher os dados cadastrais. Você poderá conferir e corrigir tudo antes de salvar.
              </p>

              <form onSubmit={handleLookup} className="space-y-6">
                 <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">CNPJ</label>
                    <input 
                      type="text" 
                      value={taxId}
                      onChange={(e) => setTaxId(maskCnpj(e.target.value))}
                      placeholder="00.000.000/0000-00"
                      className="w-full h-12 px-4 bg-surface-secondary border border-border-subtle rounded-xl text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all tabular-nums text-lg"
                      autoFocus
                    />
                 </div>

                 <div className="flex flex-col gap-3 pt-4">
                    <button 
                      type="submit"
                      disabled={loading || taxId.length < 14}
                      className="w-full h-12 flex items-center justify-center bg-accent-primary hover:bg-accent-hover text-white font-medium rounded-xl disabled:opacity-50 transition-colors"
                    >
                      {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Consultar dados'}
                    </button>
                    <button 
                      type="button"
                      onClick={handleManualEntry}
                      disabled={loading || taxId.length === 0}
                      className="w-full h-12 flex items-center justify-center bg-transparent border border-border-subtle hover:bg-surface-secondary text-text-primary font-medium rounded-xl transition-colors"
                    >
                      Preencher manualmente
                    </button>
                 </div>
              </form>
            </div>
          )}

          {/* STEP 2: CONFIRM DATA */}
          {step === 2 && registryData && (
            <div className="max-w-2xl mx-auto pb-safe">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-xl font-semibold text-text-primary">
                   Encontramos esta entidade
                 </h3>
                 {registryData.source === 'brasilapi' && (
                   <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                     Dados consultados automaticamente
                   </span>
                 )}
               </div>
               
               <p className="text-sm text-text-secondary mb-6">
                 Confira estas informações antes de continuar.
               </p>

               <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-text-muted mb-1">Razão Social</label>
                        <input value={registryData.legalName || ''} onChange={e => setRegistryData({...registryData, legalName: e.target.value})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                     </div>
                     <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-text-muted mb-1">Nome Fantasia (Opcional)</label>
                        <input value={registryData.tradeName || ''} onChange={e => setRegistryData({...registryData, tradeName: e.target.value})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-text-muted mb-1">Situação Cadastral</label>
                        <input value={registryData.registrationStatus || ''} onChange={e => setRegistryData({...registryData, registrationStatus: e.target.value})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-text-muted mb-1">Data de Abertura</label>
                        <input value={registryData.openingDate || ''} onChange={e => setRegistryData({...registryData, openingDate: e.target.value})} placeholder="YYYY-MM-DD" className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm tabular-nums" />
                     </div>
                  </div>

                  {/* Address */}
                  <div className="pt-4 border-t border-border-subtle">
                     <h4 className="text-sm font-medium text-text-primary mb-4">Endereço Cadastral</h4>
                     <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                        <div className="sm:col-span-2">
                           <label className="block text-xs text-text-muted mb-1">CEP</label>
                           <input value={registryData.registeredAddress?.postalCode || ''} onChange={e => setRegistryData({...registryData, registeredAddress: {...registryData.registeredAddress, postalCode: e.target.value}})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                        </div>
                        <div className="sm:col-span-4">
                           <label className="block text-xs text-text-muted mb-1">Logradouro</label>
                           <input value={registryData.registeredAddress?.street || ''} onChange={e => setRegistryData({...registryData, registeredAddress: {...registryData.registeredAddress, street: e.target.value}})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                        </div>
                        <div className="sm:col-span-2">
                           <label className="block text-xs text-text-muted mb-1">Número</label>
                           <input value={registryData.registeredAddress?.number || ''} onChange={e => setRegistryData({...registryData, registeredAddress: {...registryData.registeredAddress, number: e.target.value}})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                        </div>
                        <div className="sm:col-span-4">
                           <label className="block text-xs text-text-muted mb-1">Complemento</label>
                           <input value={registryData.registeredAddress?.complement || ''} onChange={e => setRegistryData({...registryData, registeredAddress: {...registryData.registeredAddress, complement: e.target.value}})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                        </div>
                        <div className="sm:col-span-2">
                           <label className="block text-xs text-text-muted mb-1">Bairro</label>
                           <input value={registryData.registeredAddress?.neighborhood || ''} onChange={e => setRegistryData({...registryData, registeredAddress: {...registryData.registeredAddress, neighborhood: e.target.value}})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                        </div>
                        <div className="sm:col-span-3">
                           <label className="block text-xs text-text-muted mb-1">Cidade</label>
                           <input value={registryData.registeredAddress?.city || ''} onChange={e => setRegistryData({...registryData, registeredAddress: {...registryData.registeredAddress, city: e.target.value}})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm" />
                        </div>
                        <div className="sm:col-span-1">
                           <label className="block text-xs text-text-muted mb-1">UF</label>
                           <input value={registryData.registeredAddress?.state || ''} onChange={e => setRegistryData({...registryData, registeredAddress: {...registryData.registeredAddress, state: e.target.value}})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base focus:border-accent-primary outline-none transition-all text-sm uppercase" maxLength={2} />
                        </div>
                     </div>
                  </div>
               </div>

               <div className="mt-8 pt-6 border-t border-border-subtle flex justify-end">
                   <button 
                     onClick={() => {
                         if (!registryData.legalName) {
                             setErrorMsg("Razão social é obrigatória.");
                             return;
                         }
                         setErrorMsg(null);
                         setStep(3);
                     }}
                     className="w-full sm:w-auto px-6 h-12 flex items-center justify-center bg-accent-primary hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
                   >
                     Confirmar e avançar <ArrowRight className="w-4 h-4 ml-2" />
                   </button>
               </div>
            </div>
          )}

          {/* STEP 3: DISPLAY AND OPERATIONAL */}
          {step === 3 && (
             <div className="max-w-2xl mx-auto pb-safe">
               <h3 className="text-xl font-semibold text-text-primary mb-6">
                 Como aparecerá no NestFinance
               </h3>
               
               <div className="space-y-8">
                  <div>
                      <label className="block text-sm font-medium text-text-muted mb-2">Nome da igreja no aplicativo</label>
                      <input 
                        value={displayName} 
                        onChange={e => setDisplayName(e.target.value)} 
                        className="w-full h-12 px-4 bg-surface-secondary border border-border-subtle rounded-xl text-text-base focus:border-accent-primary outline-none transition-all" 
                        placeholder="Ex: OBPC Monte Castelo"
                      />
                  </div>

                  <div>
                     <h4 className="text-sm font-medium text-text-primary mb-3">Logo opcional</h4>
                     <div className="p-4 border border-border-subtle border-dashed rounded-xl bg-surface-secondary flex items-center gap-4 text-text-muted">
                        <div className="w-12 h-12 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <p className="text-sm">Você poderá adicionar a logo depois.</p>
                     </div>
                  </div>

                  <div className="border-t border-border-subtle pt-6">
                      <h4 className="text-sm font-medium text-text-primary mb-4">Endereço onde a igreja funciona</h4>
                      
                      <label className="flex items-center gap-3 cursor-pointer group mb-6">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${sameAddress ? 'bg-accent-primary border-accent-primary' : 'border-border-subtle bg-surface-base'}`}>
                              {sameAddress && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <span className="text-sm text-text-base group-hover:text-text-primary transition-colors">Usar o mesmo endereço do cadastro do CNPJ</span>
                          <input type="checkbox" className="hidden" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} />
                      </label>

                      {!sameAddress && (
                          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 animate-in fade-in slide-in-from-top-2">
                             {/* Reduced address fields for operational */}
                             <div className="sm:col-span-4">
                                <label className="block text-xs text-text-muted mb-1">Rua / Av</label>
                                <input value={operationalAddress.street} onChange={e => setOperationalAddress({...operationalAddress, street: e.target.value})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base" />
                             </div>
                             <div className="sm:col-span-2">
                               <label className="block text-xs text-text-muted mb-1">Número</label>
                               <input value={operationalAddress.number} onChange={e => setOperationalAddress({...operationalAddress, number: e.target.value})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base" />
                             </div>
                             <div className="sm:col-span-3">
                                <label className="block text-xs text-text-muted mb-1">Bairro</label>
                                <input value={operationalAddress.neighborhood} onChange={e => setOperationalAddress({...operationalAddress, neighborhood: e.target.value})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base" />
                             </div>
                             <div className="sm:col-span-2">
                                <label className="block text-xs text-text-muted mb-1">Cidade</label>
                                <input value={operationalAddress.city} onChange={e => setOperationalAddress({...operationalAddress, city: e.target.value})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base" />
                             </div>
                             <div className="sm:col-span-1">
                                <label className="block text-xs text-text-muted mb-1">UF</label>
                                <input value={operationalAddress.state} onChange={e => setOperationalAddress({...operationalAddress, state: e.target.value})} className="w-full h-11 px-3 bg-surface-secondary border border-border-subtle rounded-lg text-text-base uppercase" maxLength={2}/>
                             </div>
                          </div>
                      )}
                  </div>
               </div>

               <div className="mt-8 pt-6 border-t border-border-subtle flex justify-end">
                   <button 
                     onClick={() => {
                         if (!displayName.trim()) {
                             setErrorMsg("O nome no aplicativo é obrigatório.");
                             return;
                         }
                         setErrorMsg(null);
                         setStep(4);
                     }}
                     className="w-full sm:w-auto px-6 h-12 flex items-center justify-center bg-accent-primary hover:bg-accent-hover text-white font-medium rounded-xl transition-colors"
                   >
                     Revisar dados <ArrowRight className="w-4 h-4 ml-2" />
                   </button>
               </div>
             </div>
          )}

          {/* STEP 4: REVIEW */}
          {step === 4 && registryData && (
             <div className="max-w-2xl mx-auto pb-safe">
                <h3 className="text-xl font-semibold text-text-primary mb-6">
                 Revisar Instituição
               </h3>

               <div className="space-y-4">
                  {/* Card 1: App identity */}
                  <div className="p-5 bg-surface-secondary border border-border-subtle rounded-xl flex items-center gap-5">
                       <div className="w-14 h-14 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center shrink-0">
                           <Building2 className="w-6 h-6 text-text-muted" />
                       </div>
                       <div>
                           <div className="text-sm text-text-muted mb-0.5">Nome no NestFinance</div>
                           <div className="text-lg font-semibold text-text-primary">{displayName}</div>
                       </div>
                  </div>

                  {/* Card 2: Legal Data */}
                  <div className="p-5 bg-surface-elevated border border-border-subtle rounded-xl space-y-4">
                      <div>
                          <div className="text-xs text-text-muted mb-1">Razão Social</div>
                          <div className="text-sm font-medium text-text-base">{registryData.legalName}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <div className="text-xs text-text-muted mb-1">CNPJ</div>
                              <div className="text-sm text-text-base tabular-nums">{maskCnpj(registryData.taxId)}</div>
                          </div>
                          <div>
                              <div className="text-xs text-text-muted mb-1">Situação</div>
                              <div className="text-sm text-text-base">{registryData.registrationStatus || 'Não informada'}</div>
                          </div>
                      </div>
                  </div>

                  {/* Card 3: Address */}
                  <div className="p-5 bg-surface-elevated border border-border-subtle rounded-xl space-y-4">
                       <div>
                          <div className="text-xs text-text-muted mb-1">Endereço da Igreja</div>
                          <div className="text-sm text-text-base">
                             {sameAddress 
                                ? `${registryData.registeredAddress?.street || ''}, ${registryData.registeredAddress?.number || ''} - ${registryData.registeredAddress?.city || ''}/${registryData.registeredAddress?.state || ''}`
                                : `${operationalAddress.street || ''}, ${operationalAddress.number || ''} - ${operationalAddress.city || ''}/${operationalAddress.state || ''}`
                             }
                          </div>
                       </div>
                  </div>
               </div>

               <div className="mt-8 pt-6 border-t border-border-subtle flex flex-col sm:flex-row-reverse justify-start gap-3">
                   <button 
                     onClick={handleCreate}
                     disabled={loading}
                     className="w-full sm:w-auto px-8 h-12 flex items-center justify-center bg-accent-primary hover:bg-accent-hover text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                   >
                     {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Criar igreja'}
                   </button>
                   <button 
                     onClick={() => setStep(3)}
                     disabled={loading}
                     className="w-full sm:w-auto px-6 h-12 flex items-center justify-center bg-surface-base border border-border-subtle hover:bg-surface-secondary text-text-primary font-medium rounded-xl transition-colors"
                   >
                     Voltar e corrigir
                   </button>
               </div>
             </div>
          )}

        </div>
      </div>
    </div>
  );
}
