import { useState, useRef, useEffect } from 'react';
import { archiveFund, reactivateFund } from '@/src/services/fundsService';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';

interface Fund {
  id: string;
  name: string;
  restricted: boolean;
  colorToken: string;
  active: boolean;
}

interface Props {
  fund: Fund;
  onSuccess: (updatedFund: Fund, msg: string) => void;
  onError: (msg: string) => void;
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
}

export default function FundActionMenu({ fund, onSuccess, onError, isOpen, onToggle }: Props) {
  const { activeFinanceEntityId } = useFinanceEntity();
  const [loading, setLoading] = useState(false);
  const [showConfirmArchive, setShowConfirmArchive] = useState(false);
  const [showConfirmReactivate, setShowConfirmReactivate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onToggle(false);
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onToggle]);

  useEffect(() => {
    if (!isOpen) {
      setShowConfirmArchive(false);
      setShowConfirmReactivate(false);
    }
  }, [isOpen]);

  const handleArchive = async () => {
    try {
      if (!activeFinanceEntityId) throw new Error('Organizacao nao selecionada');
      setLoading(true);
      const res = await archiveFund(fund.id, activeFinanceEntityId);
      onToggle(false);
      onSuccess(res.fund, 'Fundo arquivado.');
    } catch (err: any) {
      onError(err.message || 'Não foi possível atualizar o fundo. Tente novamente.');
      setShowConfirmArchive(false);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    try {
      if (!activeFinanceEntityId) throw new Error('Organizacao nao selecionada');
      setLoading(true);
      const res = await reactivateFund(fund.id, activeFinanceEntityId);
      onToggle(false);
      onSuccess(res.fund, 'Fundo reativado.');
    } catch (err: any) {
      onError(err.message || 'Não foi possível atualizar o fundo. Tente novamente.');
      setShowConfirmReactivate(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!isOpen);
        }}
        disabled={loading}
        className="w-11 h-11 flex items-center justify-center text-text-muted hover:text-text-base rounded-full hover:bg-surface-secondary transition-colors"
        aria-label={`Ações de ${fund.name}`}
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-text-muted border-t-text-base rounded-full animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        )}
      </button>

      {isOpen && !showConfirmArchive && !showConfirmReactivate && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" onClick={() => onToggle(false)} />
          <div className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1 w-full sm:w-48 bg-surface-base sm:bg-surface-elevated border-t sm:border border-border-subtle rounded-t-2xl sm:rounded-xl shadow-2xl sm:shadow-xl z-50 py-4 sm:py-1 font-sans animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95 duration-200">
            {fund.active ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmArchive(true);
                }}
                className="w-full text-left px-6 sm:px-4 py-4 sm:py-2.5 text-base sm:text-sm text-amber-500 hover:bg-amber-500/10 flex items-center gap-3 sm:gap-2 transition-colors min-h-[56px] sm:min-h-[44px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-4 sm:h-4"><rect width="20" height="5" x="2" y="4" rx="2"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>
                Arquivar fundo
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmReactivate(true);
                }}
                className="w-full text-left px-6 sm:px-4 py-4 sm:py-2.5 text-base sm:text-sm text-text-base hover:bg-surface-secondary flex items-center gap-3 sm:gap-2 transition-colors min-h-[56px] sm:min-h-[44px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-4 sm:h-4 text-text-muted"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                Reativar fundo
              </button>
            )}
            <div className="h-safe sm:hidden" />
          </div>
        </>
      )}

      {(showConfirmArchive || showConfirmReactivate) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 font-sans animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => onToggle(false)} />
          <div className="w-full sm:w-[400px] bg-surface-elevated rounded-t-2xl sm:rounded-2xl shadow-2xl relative animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            <div className="p-6">
              <h3 className="text-xl sm:text-lg font-semibold text-text-primary mb-2 text-center sm:text-left">
                {showConfirmArchive ? 'Arquivar fundo?' : 'Reativar fundo?'}
              </h3>
              <p className="text-sm text-text-secondary text-center sm:text-left mb-6">
                {showConfirmArchive 
                  ? 'Ele deixará de aparecer nas opções de novos lançamentos, mas continuará disponível no histórico.'
                  : 'Ele voltará a aparecer nas opções para novos lançamentos.'}
              </p>
              
              <div className="bg-surface-secondary rounded-xl p-4 mb-6 border border-border-subtle">
                <div className="text-sm font-medium text-text-primary truncate mb-1">Fundo: {fund.name}</div>
                <div className="text-xs text-text-secondary">Tipo: {fund.restricted ? 'Fundo destinado' : 'Fundo livre'}</div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  onClick={() => onToggle(false)}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-xl bg-surface-base text-text-primary font-medium border border-border-subtle hover:bg-surface-secondary active:scale-[0.98] transition-all min-h-[48px] sm:min-h-[40px]"
                >
                  Cancelar
                </button>
                <button
                  onClick={showConfirmArchive ? handleArchive : handleReactivate}
                  disabled={loading}
                  className={`w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-xl text-white font-medium active:scale-[0.98] transition-all min-h-[48px] sm:min-h-[40px] flex items-center justify-center ${
                    showConfirmArchive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-accent-primary hover:bg-accent-hover'
                  }`}
                >
                  {loading ? (
                     <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : showConfirmArchive ? 'Arquivar' : 'Reativar'}
                </button>
              </div>
            </div>
            <div className="h-safe sm:hidden" />
          </div>
        </div>
      )}
    </div>
  );
}
