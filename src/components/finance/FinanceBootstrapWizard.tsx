import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check, AlertCircle, Calendar, Plus, Save, Building2 } from 'lucide-react';
import { previewBootstrap, applyBootstrap, verifyBootstrap } from '@/src/services/financeBootstrapService';
import { BOOTSTRAP_TEMPLATES, BootstrapTemplateId, BootstrapItem } from '@/shared/finance/bootstrapTemplates';
import { PAYMENT_METHODS } from '@/shared/finance/paymentMethods';

interface FinanceBootstrapWizardProps {
  entity: any;
  statusData: any;
  onClose: () => void;
}

export default function FinanceBootstrapWizard({ entity, statusData, onClose }: FinanceBootstrapWizardProps) {
  const [step, setStep] = useState(1);
  const [legacyAssignment, setLegacyAssignment] = useState<'none' | 'assign_unscoped_to_this_entity'>('none');
  
  const templateId = statusData.recommendedTemplateId || 'church-br-v1';
  const templates = BOOTSTRAP_TEMPLATES[templateId as BootstrapTemplateId] || [];

  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Set<string>>(new Set());
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [selectedFunds, setSelectedFunds] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  const [previewPlan, setPreviewPlan] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'stale_preview' | 'blocked' | 'recoverable_error' | 'verifying' | 'verified' | 'verification_failed' | 'verification_error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const UI_ENABLED = import.meta.env.VITE_NESTFINANCE_BOOTSTRAP_APPLY_UI_ENABLED === 'true';

  useEffect(() => {
     setIdempotencyKey(null);
     setSubmitStatus('idle');
     setSubmitError(null);
  }, [selectedAccounts, selectedFunds, selectedCategories, selectedPaymentMethods, legacyAssignment]);

  useEffect(() => {
    if (statusData.canAdoptLegacyData) {
        setLegacyAssignment('assign_unscoped_to_this_entity');
    }

    const initPM = new Set<string>();
    PAYMENT_METHODS.forEach(pm => {
        if (pm.defaultEnabled) initPM.add(pm.code);
    });

    const initAcc = new Set<string>();
    const initFund = new Set<string>();
    const initCat = new Set<string>();

    templates.forEach(t => {
       if (t.defaultSelected) {
           if (t.entityType === 'account') initAcc.add(t.templateKey);
           if (t.entityType === 'fund') initFund.add(t.templateKey);
           if (t.entityType === 'category') initCat.add(t.templateKey);
       }
    });

    setSelectedPaymentMethods(initPM);
    setSelectedAccounts(initAcc);
    setSelectedFunds(initFund);
    setSelectedCategories(initCat);
  }, [templates, statusData]);

  const handleNext = () => {
     if (step === 5) {
        generatePreview();
     } else {
        setStep(s => s + 1);
     }
  };

  const generatePreview = async () => {
      try {
          setPreviewLoading(true);
          setPreviewError(null);
          const res = await previewBootstrap({
             financeEntityId: entity.id,
             templateId,
             legacyAssignment,
             selection: {
                paymentMethodCodes: Array.from(selectedPaymentMethods),
                accountTemplateKeys: Array.from(selectedAccounts),
                fundTemplateKeys: Array.from(selectedFunds),
                categoryTemplateKeys: Array.from(selectedCategories)
             }
          });
          setPreviewPlan(res);
          setStep(6);
      } catch (e: any) {
          setPreviewError(e.message || 'Erro ao gerar prévia.');
      } finally {
          setPreviewLoading(false);
      }
  };

  const canFinalize = UI_ENABLED && 
                      previewPlan?.applicationAvailability?.available === true && 
                      previewPlan?.canApply === true &&
                      submitStatus !== 'submitting' &&
                      submitStatus !== 'verifying' &&
                      submitStatus !== 'verified' &&
                      submitStatus !== 'success';

  const handleVerify = async (key: string) => {
      setSubmitStatus('verifying');
      setSubmitError(null);
      try {
          const verifyRes = await verifyBootstrap({ financeEntityId: entity.id, idempotencyKey: key });
          if (verifyRes.verified && verifyRes.status === 'passed') {
              setSubmitStatus('verified');
          } else {
              setSubmitStatus('verification_failed');
          }
      } catch (e: any) {
          setSubmitStatus('verification_error');
      }
  };

  const handleApply = async () => {
      if (!canFinalize && submitStatus !== 'verification_failed' && submitStatus !== 'verification_error') return;
      if (submitStatus === 'submitting' || submitStatus === 'verifying' || submitStatus === 'verified' || submitStatus === 'success') return;
      
      let key = idempotencyKey;

      if (submitStatus === 'verification_failed' || submitStatus === 'verification_error') {
          if (key) {
             handleVerify(key);
             return;
          }
      }

      if (!key) {
         key = crypto.randomUUID();
         setIdempotencyKey(key);
      }

      setSubmitStatus('submitting');
      setSubmitError(null);

      try {
          const res = await applyBootstrap({
              financeEntityId: entity.id,
              templateId,
              legacyAssignment,
              selection: {
                  paymentMethodCodes: Array.from(selectedPaymentMethods),
                  accountTemplateKeys: Array.from(selectedAccounts),
                  fundTemplateKeys: Array.from(selectedFunds),
                  categoryTemplateKeys: Array.from(selectedCategories)
              },
              previewDigest: previewPlan.previewDigest,
              idempotencyKey: key
          });

          // Irrespective of status 201 or 200, we verify
          handleVerify(key);
      } catch (err: any) {
          if (err.code === 'BOOTSTRAP_ENTITY_NOT_ENABLED') {
              setSubmitStatus('recoverable_error');
              setSubmitError('A conclusão ainda não está disponível para esta igreja\nSeu plano foi preservado e nenhuma alteração foi feita.');
              setIdempotencyKey(null);
          } else if (err.status === 503 || err.code === 'BOOTSTRAP_APPLY_DISABLED') {
              setSubmitStatus('blocked');
              setSubmitError(err.message || 'A conclusão ainda não está disponível.');
          } else if (err.status === 409 && err.code === 'PREVIEW_MISMATCH') {
              setSubmitStatus('stale_preview');
              setSubmitError('Alguns dados mudaram. Atualizamos o plano para você revisar novamente antes de concluir.');
              setIdempotencyKey(null);
              generatePreview();
          } else if (err.status === 409) {
              setSubmitStatus('recoverable_error');
              setSubmitError('Não foi possível concluir com segurança. Alguns cadastros foram alterados enquanto você revisava. Atualize o plano e confira novamente.');
              setIdempotencyKey(null);
          } else {
              setSubmitStatus('recoverable_error');
              setSubmitError(err.message || 'Não conseguimos concluir agora. Verifique sua conexão e tente novamente.');
          }
      }
  };

  const renderStepIcon = (s: number) => {
     if (step > s) return <Check className="w-4 h-4 text-white" />;
     return <span className="text-sm font-medium">{s}</span>;
  };

  const renderStepIndicator = (s: number, label: string) => (
      <div className="flex flex-col items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${step === s ? 'bg-accent-primary text-white' : step > s ? 'bg-emerald-500' : 'bg-surface-secondary text-text-muted'}`}>
              {renderStepIcon(s)}
          </div>
          <span className={`text-xs hidden md:block ${step === s ? 'text-accent-primary font-medium' : step > s ? 'text-emerald-400 font-medium' : 'text-text-muted'}`}>
             {label}
          </span>
      </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-background-base/80 backdrop-blur-sm">
      <div className="w-full h-full md:max-w-4xl md:h-[85vh] bg-surface-base md:rounded-2xl border border-border-subtle shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Preparação Inicial</h2>
            <p className="text-sm text-text-secondary">{entity.displayName}</p>
          </div>
          <button onClick={onClose} disabled={submitStatus === 'submitting'} className="p-2 -mr-2 text-text-muted hover:text-text-primary transition-colors hover:bg-surface-secondary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-6 border-b border-border-subtle bg-surface-base shrink-0 flex items-center justify-between md:justify-center md:gap-12 relative overflow-x-auto">
             <div className="absolute top-10 left-12 right-12 h-0.5 bg-surface-secondary -z-10 hidden md:block">
                 <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${Math.max(0, (step - 1) * 20)}%` }} />
             </div>
             {renderStepIndicator(1, 'Início')}
             {renderStepIndicator(2, 'Meios')}
             {renderStepIndicator(3, 'Contas')}
             {renderStepIndicator(4, 'Fundos')}
             {renderStepIndicator(5, 'Categorias')}
             {renderStepIndicator(6, 'Revisão')}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {previewLoading && (
                <div className="h-full flex flex-col items-center justify-center">
                   <div className="w-8 h-8 border-4 border-surface-secondary border-t-accent-primary rounded-full animate-spin mb-4" />
                   <p className="text-text-secondary">Analisando dados...</p>
                </div>
            )}
            {!previewLoading && previewError && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                    <AlertCircle className="w-10 h-10 text-rose-500 mb-4" />
                    <p className="text-text-primary mb-6">{previewError}</p>
                    <button onClick={() => setPreviewError(null)} className="h-10 px-4 rounded-lg bg-surface-secondary text-text-primary font-medium hover:bg-border-subtle transition-colors">Tentar novamente</button>
                </div>
            )}
            {!previewLoading && !previewError && step === 1 && (
                <Step1 statusData={statusData} legacyAssignment={legacyAssignment} setLegacyAssignment={setLegacyAssignment} entity={entity} />
            )}
            {!previewLoading && !previewError && step === 2 && (
                <StepPaymentMethods selected={selectedPaymentMethods} setSelected={setSelectedPaymentMethods} />
            )}
            {!previewLoading && !previewError && step === 3 && (
                <Step2 templates={templates.filter(t => t.entityType === 'account')} selected={selectedAccounts} setSelected={setSelectedAccounts} statusData={statusData} legacyAssignment={legacyAssignment} />
            )}
            {!previewLoading && !previewError && step === 4 && (
                <Step3 templates={templates.filter(t => t.entityType === 'fund')} selected={selectedFunds} setSelected={setSelectedFunds} statusData={statusData} legacyAssignment={legacyAssignment} />
            )}
            {!previewLoading && !previewError && step === 5 && (
                <Step4 templates={templates.filter(t => t.entityType === 'category')} selected={selectedCategories} setSelected={setSelectedCategories} statusData={statusData} legacyAssignment={legacyAssignment} />
            )}
            {!previewLoading && !previewError && step === 6 && previewPlan && (
                <Step5 
                    previewPlan={previewPlan} 
                    uiEnabled={UI_ENABLED}
                    submitStatus={submitStatus}
                    submitError={submitError}
                    canFinalize={canFinalize}
                />
            )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle bg-surface-base shrink-0 flex items-center justify-between">
           {step > 1 && step < 6 && !previewLoading && !previewError && submitStatus !== 'success' && submitStatus !== 'verified' && submitStatus !== 'verifying' && submitStatus !== 'verification_failed' && submitStatus !== 'verification_error' ? (
               <button onClick={() => setStep(s => s - 1)} disabled={submitStatus === 'submitting'} className="h-12 px-6 rounded-xl border border-border-subtle text-text-primary font-medium hover:bg-surface-secondary transition-colors disabled:opacity-50">
                  Voltar
               </button>
           ) : <div />}

           {step < 6 && !previewLoading && !previewError && submitStatus !== 'success' && submitStatus !== 'verified' && submitStatus !== 'verifying' && submitStatus !== 'verification_failed' && submitStatus !== 'verification_error' && (
               <button onClick={handleNext} disabled={submitStatus === 'submitting'} className="h-12 px-6 rounded-xl bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors flex items-center disabled:opacity-50">
                  Próximo <ChevronRight className="w-4 h-4 ml-2" />
               </button>
           )}

           {step === 6 && !previewLoading && !previewError && (
               <div className="flex gap-4 ml-auto">
                   {submitStatus === 'verified' || submitStatus === 'success' ? (
                       <button onClick={onClose} className="h-12 px-6 rounded-xl bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors">
                           Fechar e continuar
                       </button>
                   ) : submitStatus === 'verification_failed' || submitStatus === 'verification_error' ? (
                       <>
                           <button onClick={onClose} className="h-12 px-6 rounded-xl border border-border-subtle text-text-primary font-medium hover:bg-surface-secondary transition-colors">
                              Fechar
                           </button>
                           <button onClick={handleApply} disabled={submitStatus === 'verifying'} className="h-12 px-6 rounded-xl bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors flex items-center disabled:opacity-50">
                              <Save className="w-4 h-4 mr-2" />
                              Verificar novamente
                           </button>
                       </>
                   ) : (
                       <>
                           <button onClick={() => { setStep(5); setSubmitStatus('idle'); setSubmitError(null); }} disabled={submitStatus === 'submitting' || submitStatus === 'verifying'} className="h-12 px-6 rounded-xl border border-border-subtle text-text-primary font-medium hover:bg-surface-secondary transition-colors disabled:opacity-50">
                              Voltar e revisar
                           </button>
                           {canFinalize && (
                               <button onClick={handleApply} disabled={submitStatus === 'submitting' || submitStatus === 'verifying'} className="h-12 px-6 rounded-xl bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors flex items-center disabled:opacity-50">
                                  {submitStatus === 'submitting' ? (
                                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Preparando...</>
                                  ) : submitStatus === 'verifying' ? (
                                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Verificando...</>
                                  ) : (
                                      <><Save className="w-4 h-4 mr-2" /> Concluir preparação</>
                                  )}
                               </button>
                           )}
                       </>
                   )}
               </div>
           )}
        </div>
      </div>
    </div>
  );
}

function Step1({ statusData, legacyAssignment, setLegacyAssignment, entity }: any) {
    return (
        <div className="max-w-xl mx-auto flex flex-col items-center justify-center text-center h-full animate-in fade-in slide-in-from-bottom-4">
            <div className="w-16 h-16 bg-accent-primary/10 rounded-2xl flex items-center justify-center mb-6 text-accent-primary">
                <Building2 className="w-8 h-8" />
            </div>
            
            {statusData.canAdoptLegacyData ? (
                <>
                <h3 className="text-2xl font-semibold text-text-primary mb-3">Encontramos cadastros financeiros já existentes.</h3>
                <p className="text-text-secondary mb-8">
                    Você pode vinculá-los à {entity.displayName} e completar somente o que estiver faltando.
                </p>

                <div className="w-full space-y-4">
                    <button 
                       onClick={() => setLegacyAssignment('assign_unscoped_to_this_entity')}
                       className={`w-full p-5 rounded-2xl border text-left transition-colors flex items-center gap-4 ${legacyAssignment === 'assign_unscoped_to_this_entity' ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary' : 'border-border-subtle bg-surface-elevated hover:border-border-strong'}`}
                    >   
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${legacyAssignment === 'assign_unscoped_to_this_entity' ? 'border-accent-primary bg-accent-primary' : 'border-text-muted'}`}>
                            {legacyAssignment === 'assign_unscoped_to_this_entity' && <span className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div>
                            <div className="font-medium text-text-primary">Usar os cadastros existentes</div>
                            <div className="text-sm text-text-secondary mt-1">Recomendado. Os dados soltos serão vinculados a esta igreja.</div>
                        </div>
                    </button>

                    <button 
                       onClick={() => setLegacyAssignment('none')}
                       className={`w-full p-5 rounded-2xl border text-left transition-colors flex items-center gap-4 ${legacyAssignment === 'none' ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary' : 'border-border-subtle bg-surface-elevated hover:border-border-strong'}`}
                    >   
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${legacyAssignment === 'none' ? 'border-accent-primary bg-accent-primary' : 'border-text-muted'}`}>
                            {legacyAssignment === 'none' && <span className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div>
                            <div className="font-medium text-text-primary">Começar com uma estrutura nova</div>
                            <div className="text-sm text-text-secondary mt-1">Os cadastros antigos não serão afetados.</div>
                        </div>
                    </button>
                </div>
                </>
            ) : (
                <>
                <h3 className="text-2xl font-semibold text-text-primary mb-3">Vamos preparar os cadastros básicos da {entity.displayName}.</h3>
                <p className="text-text-secondary mb-8">
                    Você poderá ajustar tudo antes de concluir.
                </p>
                </>
            )}
        </div>
    );
}

function SelectableList({ items, selected, toggle }: { items: BootstrapItem[], selected: Set<string>, toggle: (key: string) => void }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map(t => {
                const isSelected = selected.has(t.templateKey);
                return (
                    <button 
                        key={t.templateKey}
                        onClick={() => toggle(t.templateKey)}
                        className={`p-4 rounded-xl border text-left transition-colors flex items-start gap-4 ${isSelected ? 'border-accent-primary bg-accent-primary/5' : 'border-border-subtle bg-surface-elevated hover:border-border-strong'}`}
                    >
                        <div className={`mt-1 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'border-accent-primary bg-accent-primary text-white' : 'border-text-muted bg-surface-base'}`}>
                           {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                            <div className="font-medium text-text-primary">{t.name}</div>
                            {t.description && <div className="text-sm text-text-secondary mt-1">{t.description}</div>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function StepPaymentMethods({ selected, setSelected }: { selected: Set<string>, setSelected: (s: Set<string>) => void }) {
    const toggle = (k: string) => {
        const next = new Set(selected);
        if (next.has(k)) next.delete(k); else next.add(k);
        setSelected(next);
    }
    
    // Sort so defaults are first
    const items = [...PAYMENT_METHODS].sort((a, b) => b.defaultEnabled === a.defaultEnabled ? a.sortOrder - b.sortOrder : (b.defaultEnabled ? 1 : -1));

    return (
        <div className="max-w-4xl mx-auto h-full animate-in fade-in">
            <div className="mb-6">
                <h3 className="text-xl font-medium text-text-primary">Como a igreja recebe e paga</h3>
                <p className="text-text-secondary text-sm mt-1">Selecione as formas que esta igreja utiliza. Você poderá alterar isso depois.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map(pm => {
                    const isSelected = selected.has(pm.code);
                    return (
                        <button 
                            key={pm.code}
                            onClick={() => toggle(pm.code)}
                            className={`p-4 rounded-xl border text-left transition-colors flex items-start gap-4 ${isSelected ? 'border-accent-primary bg-accent-primary/5' : 'border-border-subtle bg-surface-elevated hover:border-border-strong'}`}
                        >
                            <div className={`mt-1 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'border-accent-primary bg-accent-primary text-white' : 'border-text-muted bg-surface-base'}`}>
                               {isSelected && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                                <div className="font-medium text-text-primary">{pm.label}</div>
                                <div className="text-sm text-text-secondary mt-1">{pm.description}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
            <div className="mt-8 p-4 rounded-xl bg-surface-secondary/50 border border-border-subtle flex gap-3 text-sm text-text-muted">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>Esta seleção apenas ajusta o que aparece na tela de lançamentos. Nenhuma movimentação será criada agora.</p>
            </div>
        </div>
    );
}

function Step2({ templates, selected, setSelected }: any) {
    const toggle = (k: string) => {
        const next = new Set(selected);
        if (next.has(k)) next.delete(k); else next.add(k);
        setSelected(next);
    }
    return (
        <div className="max-w-4xl mx-auto h-full animate-in fade-in">
            <div className="mb-6">
                <h3 className="text-xl font-medium text-text-primary">Selecione as contas iniciais</h3>
                <p className="text-text-secondary text-sm mt-1">Não pediremos saldo ou dados bancários nesta fase.</p>
            </div>
            <SelectableList items={templates} selected={selected} toggle={toggle} />
        </div>
    );
}

function Step3({ templates, selected, setSelected }: any) {
    const toggle = (k: string) => {
        const next = new Set(selected);
        if (next.has(k)) next.delete(k); else next.add(k);
        setSelected(next);
    }
    return (
        <div className="max-w-4xl mx-auto h-full animate-in fade-in">
            <div className="mb-6">
                <h3 className="text-xl font-medium text-text-primary">Departamentos e Fundos</h3>
                <p className="text-text-secondary text-sm mt-1">Fundos ajudam a separar o dinheiro por finalidade, sem mudar o lugar onde ele está guardado.</p>
            </div>
            <SelectableList items={templates} selected={selected} toggle={toggle} />
        </div>
    );
}

function Step4({ templates, selected, setSelected }: any) {
    const toggle = (k: string) => {
        const next = new Set(selected);
        if (next.has(k)) next.delete(k); else next.add(k);
        setSelected(next);
    }
    const incomes = templates.filter((t: any) => t.kind === 'income').sort((a:any,b:any) => a.sortOrder - b.sortOrder);
    const expenses = templates.filter((t: any) => t.kind === 'expense').sort((a:any,b:any) => a.sortOrder - b.sortOrder);

    return (
        <div className="max-w-4xl mx-auto h-full animate-in fade-in">
            <div className="mb-6">
                <h3 className="text-xl font-medium text-text-primary">Categorias financeiras</h3>
                <p className="text-text-secondary text-sm mt-1">Você poderá criar novas categorias a qualquer momento.</p>
            </div>
            
            <h4 className="font-medium text-text-primary mb-3 mt-4">Entradas</h4>
            <div className="mb-8"><SelectableList items={incomes} selected={selected} toggle={toggle} /></div>
            
            <h4 className="font-medium text-text-primary mb-3">Saídas</h4>
            <div className="mb-4"><SelectableList items={expenses} selected={selected} toggle={toggle} /></div>
        </div>
    );
}

function Step5({ previewPlan, uiEnabled, submitStatus, submitError, canFinalize }: any) {
    if (submitStatus === 'verified' || submitStatus === 'success') {
        return (
            <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in pb-12" aria-live="polite">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 mx-auto text-emerald-500">
                   <Check className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-semibold text-text-primary mb-4">Estrutura financeira preparada e conferida</h3>
                <p className="text-text-secondary text-lg max-w-md mx-auto">
                    Os cadastros desta igreja estão prontos para uso. Nenhuma movimentação financeira foi criada. A organização dos dados e os registros de segurança foram verificados.
                </p>
            </div>
        );
    }
    
    if (submitStatus === 'verifying') {
        return (
            <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in pb-12" aria-live="polite">
                <div className="w-20 h-20 border-4 border-surface-secondary border-t-accent-primary rounded-full animate-spin mb-6 mx-auto" />
                <h3 className="text-2xl font-semibold text-text-primary mb-4">Conferindo a preparação...</h3>
                <p className="text-text-secondary text-lg max-w-md mx-auto">
                    Estamos verificando os cadastros, configurações e registros de segurança.
                </p>
            </div>
        );
    }

    if (submitStatus === 'verification_failed') {
        return (
            <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in pb-12" aria-live="assertive">
                <AlertCircle className="w-20 h-20 text-rose-500 mb-6 mx-auto" />
                <h3 className="text-2xl font-semibold text-text-primary mb-4">A preparação foi concluída, mas precisa de conferência</h3>
                <p className="text-text-secondary text-lg max-w-md mx-auto">
                    Encontramos uma diferença durante a verificação de segurança. Nenhuma nova tentativa será feita automaticamente.
                </p>
            </div>
        );
    }

    if (submitStatus === 'verification_error') {
        return (
            <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in pb-12" aria-live="assertive">
                <AlertCircle className="w-20 h-20 text-amber-500 mb-6 mx-auto" />
                <h3 className="text-2xl font-semibold text-text-primary mb-4">Não foi possível confirmar a preparação</h3>
                <p className="text-text-secondary text-lg max-w-md mx-auto">
                    A operação precisa ser revisada com segurança antes de continuar. Nenhuma nova aplicação será feita automaticamente. Você pode tentar a conferência novamente com segurança.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto h-full animate-in fade-in pb-12">
            {!canFinalize && (
                <div className="mb-8 text-center" aria-live="polite">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 mx-auto text-emerald-400">
                       <Check className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-medium text-text-primary mb-2">Plano preparado</h3>
                    <p className="text-text-secondary text-sm max-w-lg mx-auto">
                        Nenhuma alteração foi feita ainda.<br/>A conclusão desta preparação ainda não está liberada.
                    </p>
                </div>
            )}

            {canFinalize && submitStatus === 'idle' && (
                <div className="mb-8 text-center">
                    <h3 className="text-2xl font-medium text-text-primary mb-2">Tudo pronto para preparar esta igreja?</h3>
                    <p className="text-text-secondary text-base max-w-lg mx-auto">
                        Os cadastros selecionados serão organizados para esta igreja. Nenhum lançamento, saldo ou movimentação será criado.
                    </p>
                </div>
            )}

            {canFinalize && submitError && (
                 <div className="mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center" aria-live="assertive">
                    <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
                    <p className="text-text-primary font-medium">{submitError}</p>
                 </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
               <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle text-center">
                   <div className="text-2xl font-bold text-accent-primary">{previewPlan.summary.adopt}</div>
                   <div className="text-xs text-text-secondary">Serão vinculados</div>
               </div>
               <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle text-center">
                   <div className="text-2xl font-bold text-emerald-400">{previewPlan.summary.create}</div>
                   <div className="text-xs text-text-secondary">Serão criados</div>
               </div>
               <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle text-center">
                   <div className="text-2xl font-bold text-text-muted">{previewPlan.summary.skip}</div>
                   <div className="text-xs text-text-secondary">Não serão incluídos</div>
               </div>
               <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle text-center">
                   <div className="text-2xl font-bold text-rose-400">{previewPlan.summary.conflict}</div>
                   <div className="text-xs text-text-secondary">Conflitos / Atenção</div>
               </div>
            </div>

            <h4 className="font-medium text-text-primary mb-4 border-b border-border-subtle pb-2">Registros legados arquivados</h4>
            {previewPlan.plan.categories.filter((p: any) => p.action === 'adopt' && p.active === false).length > 0 ? (
                <ul className="space-y-2 text-sm max-h-48 overflow-y-auto">
                    {previewPlan.plan.categories.filter((p: any) => p.action === 'adopt' && p.active === false).map((p: any) => (
                        <li key={p.existingId} className="p-3 bg-surface-secondary/50 rounded-lg text-text-muted flex justify-between">
                             <span className="line-through">{p.name}</span>
                             <span>Arquivada</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-text-muted">Não há registros afetados.</p>
            )}
        </div>
    );
}
