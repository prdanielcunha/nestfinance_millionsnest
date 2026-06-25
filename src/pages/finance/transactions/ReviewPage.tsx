import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Filter, ArrowLeft, ArrowRight, ShieldX, Clock, FileWarning, HelpCircle } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useTransactions } from '@/src/hooks/finance/useTransactions';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { FinanceEntityContextBar } from '@/src/components/finance/FinanceEntityContextBar';
import { hasEffectiveCapability } from '@/src/lib/permissions';

import { FirestoreIndexRemediationCard } from '@/src/components/finance/FirestoreIndexRemediationCard';

export default function ReviewPage() {
  const { accessState } = useAuth();
  
  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') {
    return null;
  }

  if (!hasEffectiveCapability(accessState, 'finance.review')) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-base border-t border-border-subtle">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 text-red-500 border border-red-500/20">
          <ShieldX className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">Acesso Negado</h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">
           Você não tem permissão para revisar movimentações.
        </p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <ReviewContent />
    </FinanceContextGuard>
  );
}

function ReviewContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { listTransactions } = useTransactions();
  
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const directionFilter = searchParams.get('direction') || 'all';
  const orderFilter = searchParams.get('order') || 'oldest';

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
  }, [activeFinanceEntityId, directionFilter, orderFilter]);

  const loadData = async (cursor?: string, signal?: AbortSignal, currentEpoch?: number) => {
    if (!cursor) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    setErrorDetails(null);

    try {
      const filters: any = {
        status: 'ready_for_review',
        order: orderFilter
      };
      if (directionFilter !== 'all') filters.direction = directionFilter;

      const res = await listTransactions(filters, cursor, 25);
      
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      
      setItems(prev => cursor ? [...prev, ...res.items] : res.items);
      setNextCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      setError(err.message || 'Falha ao carregar a fila de revisão.');
      setErrorDetails(err.details || null);
    } finally {
      if (signal?.aborted || (currentEpoch && currentEpoch !== epochRef.current)) return;
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleDirectionFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'all') {
      searchParams.delete('direction');
    } else {
      searchParams.set('direction', val);
    }
    setSearchParams(searchParams);
  };

  const handleOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'oldest') {
      searchParams.delete('order');
    } else {
      searchParams.set('order', val);
    }
    setSearchParams(searchParams);
  };

  const loadMore = () => {
    if (!loadingMore && hasMore && nextCursor) {
      loadData(nextCursor, undefined, epochRef.current);
    }
  };

  const getTransactionLabel = (tx: any) => {
    if (tx.transactionKind === 'income') return 'Entrada';
    if (tx.transactionKind === 'expense') return 'Saída';
    if (tx.transactionKind === 'transfer') return 'Transf.';
    if (tx.transactionKind === 'liability_settlement') return 'Acerto';
    return 'Outro';
  };

  const getStatusBadge = (tx: any) => {
    if (tx.status === 'ready_for_review') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">Aguardando</span>;
    }
    return null;
  };

  const formatMoney = (cents: number, currency: string) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' });
  };

  // Dedicated human-friendly error state with action controls
  if (error && items.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-surface-base pb-24 md:pb-8">
        <FinanceEntityContextBar />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex items-center justify-center">
          <div className="max-w-md w-full bg-surface-elevated border border-border-subtle rounded-2xl p-6 shadow-sm text-center">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 border border-red-500/20">
              <FileWarning className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-2">
              Não foi possível carregar as revisões
            </h3>
            <p className="text-sm text-text-muted mb-6 leading-relaxed">
              Tivemos uma falha ao buscar as movimentações desta igreja. Tente novamente.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                onClick={() => loadData(undefined, undefined, epochRef.current)}
                className="w-full sm:w-auto h-11 px-5 rounded-lg bg-accent-primary hover:bg-accent-hover text-white text-sm font-medium shadow-sm transition-colors cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                Tentar novamente
              </button>
              <button
                onClick={() => navigate(APP_ROUTES.finance)}
                className="w-full sm:w-auto h-11 px-5 rounded-lg bg-surface-base border border-border-subtle hover:bg-surface-elevated text-text-primary text-sm font-medium transition-colors cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                Voltar para Finance
              </button>
            </div>

            {errorDetails?.remediation?.type === 'CREATE_FIRESTORE_INDEX' && errorDetails?.remediation?.url && (
             <FirestoreIndexRemediationCard 
                indexCreateUrl={errorDetails.remediation.url} 
                onRetry={() => loadData(undefined, undefined, epochRef.current)} 
             />
            )}

            {errorDetails?.requestId && (
              <p className="mt-6 text-[10px] font-mono text-text-muted select-all">
                ID da transação: {errorDetails.requestId}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-base pb-24 md:pb-8">
      <FinanceEntityContextBar />
      
      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-600 border border-amber-500/20 flex-shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-medium text-text-primary">Central de Revisão</h1>
                <p className="text-sm text-text-muted">Aprovação de movimentações prontas para lançamento</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
              <select
                value={orderFilter}
                onChange={handleOrderChange}
                className="h-11 md:h-9 px-3 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary w-full sm:w-auto font-medium"
                style={{ minHeight: '44px' }}
              >
                <option value="oldest">Mais Antigas Primeiro</option>
                <option value="newest">Mais Recentes Primeiro</option>
              </select>

              <div className="relative w-full sm:w-auto">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <select
                  value={directionFilter}
                  onChange={handleDirectionFilterChange}
                  className="h-11 md:h-9 pl-9 pr-8 bg-surface-elevated border border-border-subtle rounded-md text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary appearance-none w-full sm:min-w-[150px] font-medium"
                  style={{ minHeight: '44px' }}
                >
                  <option value="all">Todos os tipos</option>
                  <option value="income">Entradas</option>
                  <option value="expense">Saídas</option>
                  <option value="transfer">Transferências</option>
                  <option value="liability_settlement">Acertos/Repasses</option>
                </select>
              </div>
            </div>
          </div>

          {/* Desktop Table View (hidden on smaller screens) */}
          <div className="hidden md:block bg-surface-elevated border border-border-subtle rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface-base/50 text-text-muted font-medium border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Conta Principal</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {loading && items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="w-8 h-8 border-4 border-surface-base border-t-accent-primary rounded-full animate-spin" />
                          <p>Carregando fila...</p>
                        </div>
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                        Nenhuma movimentação aguardando revisão nesta entidade.
                      </td>
                    </tr>
                  ) : (
                    items.map((tx) => (
                      <tr 
                        key={tx.id} 
                        className="hover:bg-surface-base/30 transition-colors group cursor-pointer"
                        onClick={() => navigate(APP_ROUTES.transactionDetail.replace(':transactionId', tx.id) + '?reviewMode=true')}
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-text-primary">{getTransactionLabel(tx)}</span>
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          {tx.occurredAt && !isNaN(new Date(tx.occurredAt).getTime()) ? new Date(tx.occurredAt).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-4 py-3 text-text-primary truncate max-w-[200px]">
                          {tx.description || <span className="text-text-muted italic">Sem descrição</span>}
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          {tx.accountSnapshot?.name || <span className="text-text-muted">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary">
                          {formatMoney(tx.amountCents, tx.currency || 'BRL')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getStatusBadge(tx)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            className="text-accent-primary hover:text-accent-hover font-medium text-sm transition-colors opacity-0 group-hover:opacity-100 min-h-[44px] flex items-center justify-end w-full"
                          >
                            Revisar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View (hidden on medium screens and up) */}
          <div className="block md:hidden space-y-4">
            {loading && items.length === 0 ? (
              <div className="py-12 text-center text-text-muted">
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-8 h-8 border-4 border-surface-base border-t-accent-primary rounded-full animate-spin" />
                  <p>Carregando fila...</p>
                </div>
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-sm bg-surface-elevated border border-border-subtle rounded-xl">
                Nenhuma movimentação aguardando revisão nesta entidade.
              </div>
            ) : (
              items.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => navigate(APP_ROUTES.transactionDetail.replace(':transactionId', tx.id) + '?reviewMode=true')}
                  className="p-4 bg-surface-elevated border border-border-subtle rounded-xl hover:bg-surface-base/30 active:bg-surface-base/50 transition-all cursor-pointer shadow-sm relative flex flex-col justify-between"
                  style={{ minHeight: '44px' }}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                        {getTransactionLabel(tx)}
                      </span>
                      <span className="text-xs text-text-secondary font-medium">
                        {tx.occurredAt && !isNaN(new Date(tx.occurredAt).getTime()) ? new Date(tx.occurredAt).toLocaleDateString('pt-BR') : '-'}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-text-primary">
                        {formatMoney(tx.amountCents, tx.currency || 'BRL')}
                      </span>
                      {getStatusBadge(tx)}
                    </div>
                  </div>

                  <div className="mt-2.5 text-sm text-text-primary break-words whitespace-normal leading-relaxed">
                    {tx.description || <span className="text-text-muted italic text-xs">Sem descrição</span>}
                  </div>

                  <div className="mt-3.5 pt-2.5 border-t border-border-subtle/50 flex justify-between items-center text-xs text-text-muted">
                    <span>Conta: <strong className="text-text-secondary">{tx.accountSnapshot?.name || '-'}</strong></span>
                    <span className="text-accent-primary font-medium flex items-center gap-1 min-h-[44px]">
                      Revisar <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {items.length > 0 && hasMore && (
            <div className="p-4 bg-surface-elevated border border-border-subtle rounded-xl flex justify-center shadow-sm">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 text-sm font-medium text-text-primary bg-surface-elevated border border-border-subtle rounded-lg hover:bg-surface-base hover:border-border-strong disabled:opacity-50 transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
              >
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
