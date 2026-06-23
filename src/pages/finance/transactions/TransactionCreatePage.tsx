import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Landmark, Layers, AlertCircle, ShieldX, Wallet, Plus, Trash2, Split } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { firebaseAuth } from '@/src/lib/firebase';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { FinanceSelect, FinanceSelectOption } from '@/src/components/finance/FinanceSelect';

export default function TransactionCreatePage() {
  const { accessState } = useAuth();
  
  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.create_drafts')) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <ShieldX className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">Acesso Negado</h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">
           Você não tem permissão para registrar movimentações.
        </p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <TransactionCreateContent />
    </FinanceContextGuard>
  );
}

function TransactionCreateContent() {
  const navigate = useNavigate();
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const { createDraft } = useTransactions();
  
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);

  // Form State
  const [direction, setDirection] = useState<'income' | 'expense'>('expense');
  const [amountRaw, setAmountRaw] = useState('0'); // Value in cents as a string for raw typing
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [description, setDescription] = useState('');
  
  // Single/split
  const [isSplit, setIsSplit] = useState(false);
  const [allocations, setAllocations] = useState<{ id: string, categoryId: string, fundId: string, amountRaw: string | null }[]>([
     { id: 'initial', categoryId: '', fundId: '', amountRaw: null }
  ]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastReqId, setLastReqId] = useState<string | null>(null);

  const epochRef = useRef(0);
  const idempotencyKeyRef = useRef<string | null>(null);
  const lastMaterialPayloadRef = useRef<string | null>(null);

  useEffect(() => {
    let abortController = new AbortController();
    
    // Clear idempotency when entity changes
    idempotencyKeyRef.current = null;
    lastMaterialPayloadRef.current = null;
    
    if (activeFinanceEntityId) {
      loadCatalogs(abortController.signal, ++epochRef.current);
    }
    
    return () => {
      abortController.abort();
    };
  }, [activeFinanceEntityId]);

  const loadCatalogs = async (signal?: AbortSignal, currentEpoch?: number) => {
    setLoadingInitial(true);
    setInitialError(null);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Unauthenticated');
      const token = await user.getIdToken();

      const [accountsRes, fundsRes, categoriesRes] = await Promise.all([
        fetch('/api/finance/accounts/list', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
          signal
        }),
        fetch('/api/finance/funds/list', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
          signal
        }),
        fetch('/api/finance/categories/list', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ financeEntityId: activeFinanceEntityId }),
          signal
        })
      ]);

      if (signal?.aborted || currentEpoch !== epochRef.current) return;

      const accsData = await accountsRes.json().catch(() => ({}));
      const fundsData = await fundsRes.json().catch(() => ({}));
      const catsData = await categoriesRes.json().catch(() => ({}));

      const activeAccounts = (accsData.accounts || []).filter((a: any) => a.active);
      const activeFunds = (fundsData.funds || []).filter((f: any) => f.active);
      const activeCats = (catsData.categories || []).filter((c: any) => c.active);

      setAccounts(activeAccounts);
      setFunds(activeFunds);
      setCategories(activeCats);

      if (activeAccounts.length > 0) setAccountId(activeAccounts[0].id);

    } catch (err: any) {
      if (signal?.aborted || currentEpoch !== epochRef.current) return;
      setInitialError(err.message || 'Erro ao carregar dados');
    } finally {
      if (!signal?.aborted && currentEpoch === epochRef.current) {
        setLoadingInitial(false);
      }
    }
  };

  // Auto clean categories when direction changes
  useEffect(() => {
     setAllocations(prev => prev.map(a => {
        const cat = categories.find(c => c.id === a.categoryId);
        if (cat && cat.kind !== direction) {
           return { ...a, categoryId: '' };
        }
        return a;
     }));
  }, [direction, categories]);

  const handleDirectionChange = (newDir: 'income' | 'expense') => {
    setDirection(newDir);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/\D/g, '');
    let parsed = parseInt(numericValue, 10);
    if (isNaN(parsed)) parsed = 0;
    setAmountRaw(parsed.toString());
  };
  
  const parseAmountToCents = (val: string | null) => {
     if (!val) return 0;
     const parsed = parseInt(val, 10);
     return isNaN(parsed) ? 0 : parsed;
  };
  
  const formatMoneyInput = (cents: string | null) => {
    if (!cents) return '0,00';
    let parsed = parseInt(cents, 10);
    if (isNaN(parsed)) parsed = 0;
    return (parsed / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const compatibleCategories = useMemo(() => {
    return categories.filter(c => c.kind === direction);
  }, [categories, direction]);
  
  const paymentMethods = [
    { id: 'cash', label: 'Dinheiro' },
    { id: 'pix', label: 'Pix' },
    { id: 'bank_transfer', label: 'Transferência Bancária' },
    { id: 'credit_card', label: 'Cartão de Crédito' },
    { id: 'debit_card', label: 'Cartão de Débito' },
    { id: 'check', label: 'Cheque' }
  ];

  const selectedAccount = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId]);

  const availablePaymentMethods = useMemo(() => {
     if (!selectedAccount) return paymentMethods;
     if (selectedAccount.type === 'cash') {
       return paymentMethods.filter(p => p.id === 'cash');
     }
     return paymentMethods;
  }, [selectedAccount, paymentMethods]);

  const [paymentMethodWarning, setPaymentMethodWarning] = useState<string | null>(null);

  useEffect(() => {
     if (paymentMethod && availablePaymentMethods.length > 0) {
        if (!availablePaymentMethods.some(p => p.id === paymentMethod)) {
           setPaymentMethod('');
           setPaymentMethodWarning('A forma de pagamento anterior foi removida porque não é compatível com a nova conta selecionada.');
        } else {
           setPaymentMethodWarning(null);
        }
     }
  }, [availablePaymentMethods, paymentMethod]);

  const totalCents = parseAmountToCents(amountRaw);
  const allocatedCents = isSplit ? allocations.reduce((sum, a) => sum + parseAmountToCents(a.amountRaw || '0'), 0) : totalCents;
  const targetDiff = totalCents - allocatedCents;

  const handleSave = async () => {
    if (saving) return; // double click prevention

    setSaveError(null);

    // Basic validation
    if (!accountId) {
      setSaveError('Selecione uma conta');
      return;
    }

    if (totalCents <= 0) {
      setSaveError('O valor da movimentação deve ser maior que zero');
      return;
    }

    // validate allocations
    const finalAllocs = [];
    if (isSplit) {
       for (const a of allocations) {
          if (!a.categoryId) {
             setSaveError('Selecione uma categoria para todos os rateios');
             return;
          }
          const amt = parseAmountToCents(a.amountRaw || '0');
          if (amt <= 0) {
             setSaveError('O valor de cada rateio deve ser maior que zero');
             return;
          }
          finalAllocs.push({
             categoryId: a.categoryId,
             fundId: a.fundId || undefined,
             amountCents: amt
          });
       }
    } else {
       if (!allocations[0].categoryId) {
          setSaveError('Selecione uma categoria');
          return;
       }
       finalAllocs.push({
          categoryId: allocations[0].categoryId,
          fundId: allocations[0].fundId || undefined,
          amountCents: totalCents
       });
    }

    const payload = {
       direction,
       amountCents: totalCents,
       occurredAt: new Date(occurredAt + 'T12:00:00Z').toISOString(),
       accountId,
       paymentMethod: paymentMethod || undefined,
       description: description || undefined,
       sourceContext: 'manual',
       allocations: finalAllocs
    };

    // calculate material payload string for comparison
    const materialPayloadArray: any[] = [
      activeFinanceEntityId, direction, totalCents, occurredAt, accountId, paymentMethod, description,
      finalAllocs.map(a => `${a.categoryId}|${a.fundId || ''}|${a.amountCents}`).sort()
    ];
    const materialPayloadString = JSON.stringify(materialPayloadArray);

    if (materialPayloadString !== lastMaterialPayloadRef.current || !idempotencyKeyRef.current) {
       idempotencyKeyRef.current = 'idkl_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
       lastMaterialPayloadRef.current = materialPayloadString;
    }

    const currentEpochOnSave = epochRef.current;

    setSaving(true);
    try {
       const reqId = 'req_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
       setLastReqId(reqId);
       const res = await createDraft(payload, idempotencyKeyRef.current, reqId);
       
       if (epochRef.current !== currentEpochOnSave) return; // drop if entity changed

       idempotencyKeyRef.current = null;
       lastMaterialPayloadRef.current = null;
       setLastReqId(null);

       navigate(APP_ROUTES.transactionDetail.replace(':transactionId', res.transactionId), { replace: true });
    } catch (err: any) {
       if (epochRef.current !== currentEpochOnSave) return;

       let msg = err.message || 'Erro ao salvar';
       if (msg.includes('FINANCE_ALLOCATION_TOTAL_MISMATCH')) msg = 'A divisão precisa ser revisada. O rateio não corresponde ao valor total.';
       else if (msg.includes('FINANCE_ACCOUNT_MISMATCH')) msg = 'Essa conta não pertence à igreja selecionada.';
       else if (msg.includes('FINANCE_CATEGORY_MISMATCH')) msg = 'Essa categoria não pode ser usada nesta movimentação.';
       else if (msg.includes('FINANCE_FUND_MISMATCH')) msg = 'Esse fundo não pertence à igreja selecionada.';
       else if (msg.includes('FINANCE_IDEMPOTENCY_CONFLICT')) msg = 'Esta tentativa não pode ser repetida com informações diferentes.';
       else if (msg.includes('FINANCE_PAYMENT_METHOD_MISMATCH')) msg = 'A forma de pagamento ' + (paymentMethod === 'pix' ? 'Pix' : '') + ' não é compatível com esta conta.';
       else if (msg.includes('permission') || msg.includes('FORBIDDEN')) msg = 'Você não tem permissão para registrar esta movimentação.';
       else if (msg.includes('ROUTE_NOT_FOUND') || msg.includes('Unexpected token')) msg = 'O serviço financeiro está temporariamente indisponível.';
       else if (msg.includes('Failed to create transaction draft')) msg = 'Não foi possível salvar o rascunho.';
       else if (msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('timeout') || msg === 'Erro ao salvar' || err.name === 'TypeError') {
           msg = 'Não foi possível confirmar se o rascunho foi salvo. Tente novamente com segurança.';
       } else {
           // Some other application error
           msg = msg; // keep the original server error if conclusive
       }
       
       setSaveError(msg);
       setSaving(false);
    }
  };

  const addAllocation = () => {
    setAllocations(prev => [...prev, { id: 'alloc_' + Date.now(), categoryId: '', fundId: '', amountRaw: '0' }]);
  };
  
  const removeAllocation = (index: number) => {
    setAllocations(prev => {
       if (prev.length <= 1) return prev;
       const next = [...prev];
       next.splice(index, 1);
       return next;
    });
  };

  const updateAllocation = (index: number, field: string, value: string) => {
    setAllocations(prev => {
       const next = [...prev];
       next[index] = { ...next[index], [field]: value };
       return next;
    });
  };
  
  const updateAllocationAmount = (index: number, rawInput: string) => {
    const numericValue = rawInput.replace(/\D/g, '');
    let parsed = parseInt(numericValue, 10);
    if (isNaN(parsed)) parsed = 0;
    updateAllocation(index, 'amountRaw', parsed.toString());
  };

  if (initialError) {
     return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">Erro ao carregar</h3>
        <button 
          onClick={() => loadCatalogs(undefined, epochRef.current)} 
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
        >
          Tentar novamente
        </button>
      </main>
     );
  }

  const handleBeforeSwitch = () => {
    const hasModifications = amountRaw !== '0' || description !== '';
    if (hasModifications) {
      const confirmDiscard = window.confirm('Você tem alterações não salvas. Deseja sair e trocar de igreja? O rascunho atual será descartado.');
      if (!confirmDiscard) return false;
    }
    // Clean states properly before leaving
    idempotencyKeyRef.current = null;
    lastMaterialPayloadRef.current = null;
    setAmountRaw('0');
    setDescription('');
    setIsSplit(false);
    setAllocations([{ id: 'initial', categoryId: '', fundId: '', amountRaw: null }]);
    return true;
  };

  return (
    <div className="flex flex-col font-sans -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
      <FinanceEntityContextBar areaName="Nova movimentação" onBeforeSwitch={handleBeforeSwitch} />
      <header className="shrink-0 max-w-2xl w-full mx-auto px-4 py-4 sm:px-6 flex items-center gap-4">
        <button 
           onClick={() => navigate(APP_ROUTES.transactions)}
           className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-surface-elevated text-text-secondary transition-colors -ml-4"
           aria-label="Voltar para listagem de movimentações"
        >
           <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
           <h1 className="text-xl font-semibold text-text-primary tracking-tight">Nova movimentação</h1>
        </div>
      </header>

      <div className="px-4 py-4 sm:px-6">
        <div className="max-w-xl mx-auto flex flex-col gap-6 pb-[calc(10rem+env(safe-area-inset-bottom))]">
          
          {loadingInitial && (
             <div className="flex flex-col gap-6 w-full animate-pulse">
               <div className="h-12 bg-surface-secondary rounded-xl w-full"></div>
               <div className="h-24 bg-surface-secondary rounded-2xl w-full"></div>
               <div className="h-20 bg-surface-elevated border border-border-subtle rounded-2xl"></div>
             </div>
          )}

          {!loadingInitial && (
            <>
              {saveError && (
                 <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl flex flex-col gap-3 text-sm items-start">
                    <div className="flex gap-3">
                       <AlertCircle className="w-5 h-5 shrink-0" />
                       <p>{saveError}</p>
                    </div>
                    {lastReqId && (
                       <div className="flex items-center gap-2 mt-1 ml-8 text-rose-500/80 text-xs">
                          <span>Código de suporte: {lastReqId}</span>
                          <button
                             onClick={() => navigator.clipboard.writeText(lastReqId)}
                             className="underline hover:text-rose-500 transition-colors"
                             title="Copiar código"
                          >
                             Copiar
                          </button>
                       </div>
                    )}
                 </div>
              )}

              {/* Bloco 1: O que aconteceu */}
              <div className="flex flex-col gap-4">
                  <h3 className="text-sm font-medium text-text-muted px-1 uppercase tracking-wider">O que aconteceu?</h3>
                  <div className="flex p-1 bg-surface-elevated border border-border-subtle rounded-xl max-w-sm w-full">
                     <button 
                        onClick={() => handleDirectionChange('income')}
                        className={`flex-1 h-12 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${direction === 'income' ? 'bg-teal-500/10 text-teal-500' : 'text-text-muted hover:text-text-primary'}`}
                     >
                        Entrada
                     </button>
                     <button 
                        onClick={() => handleDirectionChange('expense')}
                        className={`flex-1 h-12 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${direction === 'expense' ? 'bg-rose-500/10 text-rose-500' : 'text-text-muted hover:text-text-primary'}`}
                     >
                        Saída
                     </button>
                  </div>

                  <div className="flex flex-col items-center gap-2 py-4">
                     <p className="text-sm font-medium text-text-secondary">Valor total</p>
                     <div className="relative group flex items-center justify-center">
                        <span className={`text-4xl font-semibold mr-1 transition-colors ${direction === 'income' ? 'text-teal-500' : 'text-rose-500'}`}>R$</span>
                        <input 
                           inputMode="numeric"
                           value={formatMoneyInput(amountRaw)}
                           onChange={handleAmountChange}
                           className={`w-full max-w-[200px] bg-transparent text-5xl lg:text-6xl text-center font-semibold tracking-tight outline-none caret-text-primary transition-colors ${direction === 'income' ? 'text-teal-500' : 'text-rose-500'} placeholder-text-muted/30 focus:border-b-2 border-b border-transparent focus:border-border-subtle pb-1`}
                           placeholder="0,00"
                        />
                     </div>
                  </div>

                  <div className="flex flex-col gap-1.5 w-full sm:max-w-sm">
                     <label className="text-sm font-medium text-text-primary">Data</label>
                     <input 
                       type="date"
                       value={occurredAt}
                       onChange={e => setOccurredAt(e.target.value)}
                       className="w-full h-14 bg-surface-elevated border border-border-subtle text-text-primary rounded-xl px-4 outline-none focus:border-accent-primary transition-colors text-base"
                     />
                  </div>
              </div>

              {/* Bloco 2: Como aconteceu */}
              <div className="flex flex-col gap-4 mt-8">
                  <h3 className="text-sm font-medium text-text-muted px-1 uppercase tracking-wider">Como aconteceu?</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                        <label className="text-sm font-medium text-text-primary">Conta</label>
                        {accounts.length > 0 ? (
                            <FinanceSelect 
                              value={accountId}
                              onChange={val => setAccountId(val)}
                              options={accounts.map(a => ({ value: a.id, label: a.name }))}
                              placeholder="Selecione uma conta..."
                              className="h-14 bg-surface-elevated border border-border-subtle rounded-xl text-base"
                            />
                        ) : (
                            <div className="h-14 border border-border-subtle border-dashed rounded-xl px-4 flex items-center text-sm text-amber-500 bg-surface-elevated">
                               Nenhuma conta cadastrada
                            </div>
                        )}
                     </div>

                     <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                        <label className="text-sm font-medium text-text-primary">
                          {direction === 'income' ? 'Forma de recebimento' : 'Forma de pagamento'}
                        </label>
                        <FinanceSelect 
                          value={paymentMethod}
                          onChange={val => { setPaymentMethod(val); setPaymentMethodWarning(null); }}
                          options={availablePaymentMethods.map(m => ({ value: m.id, label: m.label }))}
                          placeholder="Não especificado"
                          allowClear
                          className="h-14 bg-surface-elevated border border-border-subtle rounded-xl text-base"
                        />
                        {paymentMethodWarning && (
                           <div className="text-amber-500 text-xs mt-1 px-1">
                              {paymentMethodWarning}
                           </div>
                        )}
                     </div>
                  </div>
                  <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                     <label className="text-sm font-medium text-text-primary">Descrição (opcional)</label>
                     <input 
                       type="text"
                       value={description}
                       onChange={e => setDescription(e.target.value)}
                       placeholder={direction === 'income' ? 'Ex: Dízimo do mês, oferta...' : 'Ex: Conta de energia, manutenção...'}
                       maxLength={300}
                       className="w-full h-14 bg-surface-elevated border border-border-subtle text-text-primary rounded-xl px-4 outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors text-base placeholder-text-muted/50"
                     />
                  </div>
              </div>

              {/* Bloco 3: Como classificar */}
              <div className="flex flex-col gap-4 mt-8">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-text-muted px-1 uppercase tracking-wider">Como deseja separar esse valor?</h3>
                    {totalCents > 0 ? (
                        <button 
                           onClick={() => setIsSplit(!isSplit)}
                           className="h-12 text-sm text-text-primary hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary transition-colors flex items-center justify-center sm:justify-start gap-2 bg-surface-elevated px-4 rounded-xl border border-border-subtle"
                        >
                           <Split className="w-4 h-4" />
                           {isSplit ? 'Não dividir' : 'Dividir em mais categorias'}
                        </button>
                    ) : (
                        <div className="flex flex-col items-start sm:items-end">
                            <button 
                               disabled
                               aria-disabled="true"
                               className="h-12 text-sm text-text-muted bg-surface-base px-4 rounded-xl border border-border-subtle flex items-center gap-2 cursor-not-allowed"
                            >
                               <Split className="w-4 h-4" />
                               Dividir em mais categorias
                            </button>
                            <span className="text-xs text-text-muted mt-1 px-1">Informe o valor total antes de dividir</span>
                        </div>
                    )}
                 </div>

                 {isSplit && totalCents > 0 && targetDiff !== 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-3 rounded-xl flex justify-between text-sm items-center">
                       <span>{targetDiff > 0 ? `Ainda faltam:` : `Passou do valor:`}</span>
                       <span className="font-semibold px-2 bg-amber-500/20 rounded py-0.5" >R$ {formatMoneyInput(Math.abs(targetDiff).toString())}</span>
                    </div>
                 )}

                 <div className="flex flex-col gap-3">
                   {allocations.map((alloc, i) => (
                      <div key={alloc.id} className="bg-surface-elevated border border-border-subtle rounded-2xl p-5 flex flex-col gap-4">
                         {isSplit && (
                            <div className="flex items-center justify-between gap-4">
                               <div className="flex-1">
                                 <label className="text-sm font-medium text-text-primary mb-1 block">Valor</label>
                                 <div className="flex items-center gap-2">
                                    <span className="text-text-secondary text-base font-medium">R$</span>
                                    <input 
                                       inputMode="numeric"
                                       value={formatMoneyInput(alloc.amountRaw)}
                                       onChange={(e) => updateAllocationAmount(i, e.target.value)}
                                       className="w-full h-14 bg-surface-base border border-border-subtle text-text-primary rounded-xl px-4 outline-none focus:border-accent-primary transition-colors text-base font-medium"
                                       placeholder="0,00"
                                    />
                                  </div>
                               </div>
                               <button 
                                 onClick={() => removeAllocation(i)}
                                 disabled={allocations.length <= 1}
                                 className="w-14 h-14 mt-6 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-rose-500/10 text-text-muted hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                                 title="Remover"
                               >
                                 <Trash2 className="w-5 h-5" />
                               </button>
                            </div>
                         )}

                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                                <label className="text-sm font-medium text-text-primary">Categoria</label>
                                {compatibleCategories.length > 0 ? (
                                    <FinanceSelect 
                                      value={alloc.categoryId}
                                      onChange={val => updateAllocation(i, 'categoryId', val)}
                                      options={compatibleCategories.map(c => ({ value: c.id, label: c.name }))}
                                      placeholder="Selecione uma categoria..."
                                      className="h-14 bg-surface-base border border-border-subtle rounded-xl text-base"
                                    />
                                ) : (
                                    <div className="h-14 border border-border-subtle border-dashed rounded-xl px-4 flex items-center justify-center text-sm text-amber-500 bg-surface-base">
                                       Nenhuma categoria compatível
                                    </div>
                                )}
                             </div>
                             
                             <div className="flex flex-col gap-1.5 focus-within:relative focus-within:z-10">
                                <label className="text-sm font-medium text-text-primary">Fundo (opcional)</label>
                                {funds.length > 0 ? (
                                    <FinanceSelect 
                                      value={alloc.fundId}
                                      onChange={val => updateAllocation(i, 'fundId', val)}
                                      options={funds.map(f => ({ value: f.id, label: f.name }))}
                                      placeholder="Nenhum fundo"
                                      allowClear
                                      className="h-14 bg-surface-base border border-border-subtle rounded-xl text-base"
                                    />
                                ) : (
                                    <div className="h-14 bg-surface-base border border-border-subtle rounded-xl px-4 flex items-center text-sm text-text-muted">
                                       Nenhum fundo ativo
                                    </div>
                                )}
                             </div>
                         </div>
                      </div>
                   ))}

                   {isSplit && (
                      <button 
                        onClick={addAllocation}
                        className="w-full flex items-center justify-center gap-2 h-14 border border-border-subtle border-dashed rounded-2xl text-text-primary hover:bg-surface-elevated transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                      >
                         <Plus className="w-5 h-5" />
                         Adicionar outra categoria
                      </button>
                   )}
                 </div>
              </div>

              <div className="mt-8 sm:mt-12">
                 <div className="max-w-xl mx-auto">
                     <p className="flex sm:flex text-center text-xs text-text-muted mb-4 items-center justify-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5" />
                        Este rascunho será salvo em <span className="font-medium text-text-primary">{activeFinanceEntityName || activeFinanceEntityId}</span>
                     </p>
                     
                     {!accountId && (
                         <span className="block text-center text-xs text-text-muted mb-3 sm:hidden">Escolha uma conta para continuar</span>
                     )}
                     
                     <button 
                       onClick={handleSave}
                       disabled={saving || !accountId || totalCents <= 0 || (isSplit && allocations.some(a => !a.categoryId || parseAmountToCents(a.amountRaw) <= 0)) || (!isSplit && !allocations[0].categoryId)}
                       aria-disabled={saving || !accountId || totalCents <= 0 || (isSplit && allocations.some(a => !a.categoryId || parseAmountToCents(a.amountRaw) <= 0)) || (!isSplit && !allocations[0].categoryId)}
                       className="w-full h-14 flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/90 text-background-base rounded-2xl font-medium transition-colors disabled:bg-surface-elevated disabled:text-text-muted disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base text-base"
                     >
                       {saving ? (
                          <>
                             <div className="w-5 h-5 border-2 border-background-base/30 border-t-background-base rounded-full animate-spin" />
                             <span>Salvando rascunho...</span>
                          </>
                       ) : (
                          'Salvar rascunho'
                       )}
                     </button>
                 </div>
              </div>

            </>
          )}

        </div>
      </div>
    </div>
  );
}
