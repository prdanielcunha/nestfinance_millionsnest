import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Landmark, Layers, AlertCircle, ShieldX, Wallet } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';

export default function TransactionDetailPage() {
  const { accessState } = useAuth();
  
  if (!accessState.capabilities?.includes('finance.view')) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <ShieldX className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">Acesso Negado</h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">
           Você não tem permissão para visualizar estas movimentações.
        </p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <TransactionDetailContent />
    </FinanceContextGuard>
  );
}

function TransactionDetailContent() {
  const navigate = useNavigate();
  const { transactionId } = useParams<{ transactionId: string }>();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { getTransactionDetail, updateDraft } = useTransactions();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [returningToDraft, setReturningToDraft] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const epochRef = useRef(0);

  useEffect(() => {
    let abortController = new AbortController();
    setData(null);
    idempotencyKeyRef.current = null;
    
    if (activeFinanceEntityId && transactionId) {
      loadData(abortController.signal, ++epochRef.current);
    }
    
    return () => {
      abortController.abort();
    };
  }, [activeFinanceEntityId, transactionId]);

  const handleReturnToDraft = async () => {
    if (returningToDraft || !data?.transaction) return;
    setReturningToDraft(true);
    setError(null);
    
    if (!idempotencyKeyRef.current) {
       idempotencyKeyRef.current = 'idre_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    }

    try {
      const currentVersion = data.transaction.version;
      const reqId = 'req_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      
      const payload = { intent: 'return_to_draft' };
      
      const res = await updateDraft(data.transaction.id, currentVersion, payload, idempotencyKeyRef.current, reqId);
      
      if (res.changed) {
         idempotencyKeyRef.current = null;
         setData((prev: any) => ({
           ...prev,
           transaction: {
             ...prev.transaction,
             status: 'draft',
             version: res.version
           }
         }));
         navigate(APP_ROUTES.transactionEdit.replace(':transactionId', data.transaction.id));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao reabrir movimentação');
    } finally {
      setReturningToDraft(false);
    }
  };

  const loadData = async (signal?: AbortSignal, currentEpoch?: number) => {
    setLoading(true);
    setError(null);

    try {
      const res = await getTransactionDetail(transactionId!);
      
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      
      setData(res);
    } catch (err: any) {
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      
      if (err.message.includes('permission')) {
        setError('FORBIDDEN');
      } else if (err.message.includes('financeEntityId is required')) {
        setError('FINANCE_ENTITY_REQUIRED');
      } else if (err.message.includes('mismatch')) {
        setError('FINANCE_ENTITY_MISMATCH');
      } else {
        setError(err.message || 'Erro desconhecido');
      }
    } finally {
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      setLoading(false);
    }
  };

  const translateStatus = (st: string) => {
    const dict: Record<string, string> = {
      draft: 'Rascunho',
      ready_for_review: 'Pronto para revisão',
      posted: 'Registrado',
      reversed: 'Revertido'
    };
    return dict[st] || st;
  };

  const translateDirection = (dir: string) => {
    if (dir === 'income') return 'Entrada';
    if (dir === 'expense') return 'Saída';
    return dir;
  };

  const translateMethod = (method: string) => {
    const dict: Record<string, string> = {
      cash: 'Dinheiro',
      pix: 'Pix',
      bank_transfer: 'Transferência Bancária',
      credit_card: 'Cartão de Crédito',
      debit_card: 'Cartão de Débito',
      check: 'Cheque'
    };
    return dict[method] || method;
  };

  const formatMoney = (cents: number, dir?: string) => {
    const str = (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (dir === 'expense') return '-' + str;
    if (dir === 'income') return '+' + str;
    return str;
  };

  if (error === 'FORBIDDEN') {
     return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <ShieldX className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">Acesso Negado</h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">Você não tem permissão para visualizar estas movimentações.</p>
      </main>
     );
  }

  if (error === 'FINANCE_ENTITY_REQUIRED') {
     return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-surface-secondary rounded-2xl flex items-center justify-center mb-6 text-text-muted border border-border-subtle">
          <Landmark className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">Selecione uma igreja para continuar.</h3>
      </main>
     );
  }

  if (error === 'FINANCE_ENTITY_MISMATCH') {
     return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">Movimentação inválida</h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">Esta movimentação não pertence à igreja selecionada.</p>
        <button 
          onClick={() => navigate(APP_ROUTES.transactions)} 
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
        >
          Voltar para listagem
        </button>
      </main>
     );
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-surface-base font-sans">
      <header className="shrink-0 max-w-2xl w-full mx-auto p-4 flex items-center gap-4 border-b border-border-subtle">
        <button 
           onClick={() => navigate(APP_ROUTES.transactions)}
           className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-elevated text-text-secondary transition-colors -ml-2"
        >
           <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
           <h1 className="text-lg font-semibold text-text-primary">Detalhes</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-6 pb-[env(safe-area-inset-bottom)]">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
              <p className="text-sm text-red-500 mb-4">
                 Não foi possível carregar as movimentações.
              </p>
              <button 
                onClick={() => loadData(undefined, epochRef.current)} 
                className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {loading && (
             <div className="flex flex-col gap-6 w-full animate-pulse">
               <div className="h-6 bg-surface-secondary rounded w-1/3 mx-auto"></div>
               <div className="h-10 bg-surface-secondary rounded w-1/2 mx-auto"></div>
               <div className="h-64 bg-surface-elevated border border-border-subtle rounded-2xl"></div>
             </div>
          )}

          {!loading && !error && data && (() => {
             const tx = data.transaction;
             const allocs = data.allocations || [];
             const sumAllocations = allocs.reduce((acc: number, item: any) => acc + (item.amountCents || 0), 0);
             const isBalanced = sumAllocations === tx.amountCents;

             return (
               <>
                 <div className="text-center flex flex-col items-center gap-2">
                   <span className="text-sm font-medium text-text-secondary">
                      {translateDirection(tx.direction)} • {translateStatus(tx.status)}
                   </span>
                   <h2 className={`text-4xl lg:text-5xl font-semibold tracking-tight ${tx.direction === 'income' ? 'text-teal-500' : 'text-text-primary'}`}>
                      {formatMoney(tx.amountCents, tx.direction)}
                   </h2>
                   <p className="text-text-secondary">
                      {new Date(tx.occurredAt).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
                   </p>
                 </div>

                 <div className="bg-surface-elevated border border-border-subtle rounded-2xl overflow-hidden mt-2">
                    <div className="p-5 flex flex-col gap-4">
                       <div>
                          <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Descrição</p>
                          <p className="text-sm text-text-primary">{tx.description || 'Sem descrição'}</p>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Conta de Origem/Destino</p>
                             <p className="text-sm text-text-primary flex items-center gap-2">
                               <Landmark className="w-4 h-4 text-text-muted" />
                               {tx.accountName || 'Conta desconhecida'}
                             </p>
                          </div>
                          {tx.method && (
                            <div>
                               <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Forma de pagamento</p>
                               <p className="text-sm text-text-primary flex items-center gap-2">
                                 <Wallet className="w-4 h-4 text-text-muted" />
                                 {translateMethod(tx.method)}
                               </p>
                            </div>
                          )}
                       </div>
                    </div>
                 </div>

                 <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Rateios</h3>
                    
                    {!isBalanced && (
                       <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex gap-3 text-rose-500 items-start">
                          <AlertCircle className="w-5 h-5 shrink-0" />
                          <p className="text-sm">Os rateios divergem do total. Total da movimentação: {formatMoney(tx.amountCents)}, Rateado: {formatMoney(sumAllocations)}.</p>
                       </div>
                    )}

                    <div className="bg-surface-elevated border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle">
                       {allocs.length === 0 && (
                          <div className="p-4 text-sm text-text-muted text-center">Nenhum rateio cadastrado.</div>
                       )}
                       {allocs.map((alloc: any) => (
                          <div key={alloc.id} className="p-4 flex items-center justify-between gap-4">
                             <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium text-text-primary truncate">
                                   {alloc.categoryName || 'Categoria desconhecida'}
                                </span>
                                {alloc.fundName && (
                                   <span className="text-xs text-text-muted truncate mt-0.5">
                                      Fundo: {alloc.fundName}
                                   </span>
                                )}
                             </div>
                             <span className="text-sm font-medium text-text-primary shrink-0">
                               {formatMoney(alloc.amountCents)}
                             </span>
                          </div>
                       ))}
                       {allocs.length > 0 && isBalanced && (
                          <div className="bg-surface-secondary/50 p-3 flex items-center justify-between border-t border-border-subtle text-xs font-medium text-text-secondary px-4">
                             <span>Total dividido</span>
                             <span>{formatMoney(sumAllocations)}</span>
                          </div>
                       )}
                    </div>
                 </div>

                 {(tx.createdBy || tx.updatedAt) && (
                    <div className="text-xs text-text-muted text-center mt-4">
                       {tx.createdBy && <span>Registrado por {tx.createdByAlias || tx.createdBy}</span>}
                       {tx.createdBy && tx.updatedAt && <span> • </span>}
                       {tx.updatedAt && <span>Última atualização em {new Date(tx.updatedAt).toLocaleDateString('pt-BR')}</span>}
                    </div>
                 )}

                 {data.capabilities?.includes('finance.create_drafts') && (
                    <div className="pt-4 border-t border-border-subtle mt-4">
                       {tx.status === 'draft' && (
                          <button 
                             onClick={() => navigate(APP_ROUTES.transactionEdit.replace(':transactionId', tx.id))}
                             className="w-full h-12 flex items-center justify-center gap-2 bg-surface-elevated border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-xl font-medium transition-colors"
                          >
                             Editar rascunho
                          </button>
                       )}
                       {tx.status === 'ready_for_review' && (
                          <button 
                             onClick={() => handleReturnToDraft()}
                             disabled={returningToDraft}
                             className="w-full h-12 flex items-center justify-center gap-2 bg-surface-elevated border border-border-subtle hover:bg-surface-secondary text-text-primary rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                             {returningToDraft ? (
                                <div className="w-5 h-5 border-2 border-text-primary/30 border-t-text-primary rounded-full animate-spin" />
                             ) : (
                                'Editar novamente'
                             )}
                          </button>
                       )}
                    </div>
                 )}
               </>
             );
          })()}
        </div>
      </div>
    </main>
  );
}
