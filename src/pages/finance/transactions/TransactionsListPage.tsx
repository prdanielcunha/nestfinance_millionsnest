import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Filter, Plus, ArrowRight, AlertCircle, Bookmark, Landmark, Wallet, Layers, ShieldX } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';

export default function TransactionsListPage() {
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
      <TransactionsListContent />
    </FinanceContextGuard>
  );
}

function TransactionsListContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { listTransactions } = useTransactions();
  const { accessState } = useAuth();
  
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const directionFilter = searchParams.get('direction') || 'all';
  const statusFilter = searchParams.get('status') || 'all';

  const epochRef = useRef(0);

  useEffect(() => {
    let abortController = new AbortController();
    setItems([]);
    setNextCursor(undefined);
    setHasMore(true);
    
    if (activeFinanceEntityId) {
      loadData(undefined, abortController.signal, ++epochRef.current);
    }
    
    return () => {
      abortController.abort();
    };
  }, [activeFinanceEntityId, directionFilter, statusFilter]);

  const loadData = async (cursor?: string, signal?: AbortSignal, currentEpoch?: number) => {
    if (!cursor) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const filters: any = {};
      if (directionFilter !== 'all') filters.direction = directionFilter;
      if (statusFilter !== 'all') filters.status = statusFilter;

      const res = await listTransactions(filters, cursor, 20);
      
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      
      setItems(prev => cursor ? [...prev, ...res.items] : res.items);
      setNextCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      
      if (err.message.includes('permission')) {
        setError('FORBIDDEN');
      } else if (err.message.includes('financeEntityId is required')) {
        setError('FINANCE_ENTITY_REQUIRED');
      } else if (err.message.includes('cursor')) {
         setError('INVALID_CURSOR');
      } else {
        setError(err.message || 'Erro desconhecido');
      }
    } finally {
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && nextCursor) {
      loadData(nextCursor, undefined, epochRef.current);
    }
  };

  const updateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === 'all') {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    setSearchParams(newParams);
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

  const formatMoney = (cents: number, dir: string) => {
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

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-surface-base font-sans">
      <header className="shrink-0 max-w-3xl w-full mx-auto p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle">
        <div className="flex flex-col gap-1">
          <button 
             onClick={() => navigate(APP_ROUTES.finance)}
             className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-elevated text-text-secondary transition-colors -ml-2 mb-1"
          >
             <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-text-primary">Movimentações</h1>
          <p className="text-sm text-text-secondary">Entradas e saídas registradas nesta igreja.</p>
        </div>
        
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
           <select 
              value={directionFilter} 
              onChange={e => updateFilter('direction', e.target.value)}
              className="h-9 outline-none bg-surface-elevated text-sm text-text-primary border border-border-subtle rounded-lg px-3 hover:bg-surface-secondary transition-colors cursor-pointer"
           >
              <option value="all">Todas</option>
              <option value="income">Entradas</option>
              <option value="expense">Saídas</option>
           </select>
           <select 
              value={statusFilter} 
              onChange={e => updateFilter('status', e.target.value)}
              className="h-9 outline-none bg-surface-elevated text-sm text-text-primary border border-border-subtle rounded-lg px-2 hover:bg-surface-secondary transition-colors cursor-pointer"
           >
              <option value="all">Últimas</option>
              {/* <option value="draft">Rascunhos</option> */}
              <option value="ready_for_review">Revisão</option>
              <option value="posted">Registradas</option>
              <option value="reversed">Revertidas</option>
           </select>
           
           {accessState.capabilities?.includes('finance.create_drafts') && (
              <button 
                onClick={() => navigate(APP_ROUTES.transactionCreate)}
                className="h-9 flex items-center px-3 ml-2 bg-text-primary hover:bg-text-primary/90 text-sm font-medium rounded-lg text-surface-base transition-colors shrink-0"
              >
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Registrar movimentação</span>
              </button>
           )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
          {error && error !== 'FORBIDDEN' && error !== 'FINANCE_ENTITY_REQUIRED' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
              <p className="text-sm text-red-500 mb-4">{
                 error === 'INVALID_CURSOR' ? 'Não foi possível continuar a lista. Recarregue a página.' :
                 'Não foi possível carregar as movimentações.'
              }</p>
              <button 
                onClick={() => loadData(undefined, undefined, epochRef.current)} 
                className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border-subtle border-dashed p-12 text-center text-text-secondary mt-4">
              <div className="w-12 h-12 bg-surface-secondary rounded-2xl flex items-center justify-center mb-4 text-text-muted">
                 <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-base font-medium text-text-primary mb-1">Nenhuma movimentação encontrada</h3>
              <p className="text-sm text-text-muted max-w-sm">
                As entradas e saídas desta igreja aparecerão aqui.
              </p>
            </div>
          )}

          {items.map(item => (
            <button 
               key={item.id}
               onClick={() => navigate(APP_ROUTES.transactionDetail.replace(':transactionId', item.id))}
               className="bg-surface-elevated hover:bg-surface-secondary transition-colors border border-border-subtle rounded-xl p-4 text-left flex flex-col gap-3 group"
            >
               <div className="flex items-start justify-between gap-4">
                 <div className="flex items-center gap-3">
                   <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${item.direction === 'income' ? 'bg-teal-500/10 border-teal-500/20 text-teal-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                      <ArrowRight className={`w-5 h-5 ${item.direction === 'expense' ? 'rotate-45' : '-rotate-45'}`} />
                   </div>
                   <div className="flex flex-col min-w-0">
                      <h4 className="text-sm font-medium text-text-primary truncate">
                         {item.description || translateDirection(item.direction)}
                      </h4>
                      <p className="text-xs text-text-muted mt-0.5 truncate">
                         {new Date(item.occurredAt).toLocaleDateString('pt-BR')} • {translateStatus(item.status)}
                      </p>
                   </div>
                 </div>
                 <div className="shrink-0 flex flex-col items-end">
                    <span className={`text-sm font-medium ${item.direction === 'income' ? 'text-teal-500' : 'text-text-primary'}`}>
                      {formatMoney(item.amountCents, item.direction)}
                    </span>
                    {item.status === 'draft' && (
                       <span className="mt-1 text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                         Incompleto
                       </span>
                    )}
                 </div>
               </div>
            </button>
          ))}

          {loading && (
             <div className="flex flex-col gap-3 w-full">
               {[1,2,3].map(i => (
                 <div key={i} className="bg-surface-elevated border border-border-subtle rounded-xl p-4 flex gap-4 animate-pulse">
                    <div className="w-10 h-10 bg-surface-secondary rounded-lg shrink-0"></div>
                    <div className="flex-1 flex flex-col gap-2 justify-center">
                       <div className="h-4 bg-surface-secondary rounded w-1/3"></div>
                       <div className="h-3 bg-surface-secondary rounded w-1/4"></div>
                    </div>
                    <div className="w-20 h-5 bg-surface-secondary rounded self-start"></div>
                 </div>
               ))}
             </div>
          )}

          {hasMore && items.length > 0 && !loading && !error && (
            <div className="pt-4 flex justify-center">
              <button 
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 bg-surface-elevated hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium rounded-lg text-text-primary border border-border-subtle transition-colors flex items-center justify-center min-w-[140px]"
              >
                {loadingMore ? (
                   <div className="w-4 h-4 border-2 border-text-muted border-t-accent-primary rounded-full animate-spin" />
                ) : (
                   'Carregar mais'
                )}
              </button>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
