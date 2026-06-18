import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Archive, RefreshCw } from 'lucide-react';
import { archiveAccount, reactivateAccount } from '@/src/services/accountsService';

interface Account {
  id: string;
  name: string;
  type: string;
  institutionName?: string;
  accountLast4?: string;
  currency: string;
  active: boolean;
}

interface Props {
  account: Account;
  onSuccess: () => void;
  onError: (msg: string) => void;
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  onEdit: (account: Account) => void;
}

export default function AccountActionMenu({ account, onSuccess, onError, isOpen, onToggle, onEdit }: Props) {
  const [loading, setLoading] = useState(false);
  const [showConfirmArchive, setShowConfirmArchive] = useState(false);
  const [showConfirmReactivate, setShowConfirmReactivate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const prevIsOpenRef = useRef(isOpen);

  useEffect(() => {
    if (!isOpen && prevIsOpenRef.current) {
      // Menu just closed, return focus
      buttonRef.current?.focus();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onToggle(false);
      }
    }
    
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onToggle(false);
        setShowConfirmArchive(false);
        setShowConfirmReactivate(false);
      }
    }

    if (isOpen || showConfirmArchive || showConfirmReactivate) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, showConfirmArchive, showConfirmReactivate, onToggle]);

  const handleArchive = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await archiveAccount(account.id);
      onSuccess();
      onToggle(false);
      setShowConfirmArchive(false);
    } catch (err: any) {
      onError(err.message || 'Não foi possível atualizar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await reactivateAccount(account.id);
      onSuccess();
      onToggle(false);
      setShowConfirmReactivate(false);
    } catch (err: any) {
      onError(err.message || 'Não foi possível atualizar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getAccountTypeName = (type: string) => {
    switch(type) {
      case 'cash': return 'Caixa físico';
      case 'checking': return 'Conta corrente';
      case 'savings': return 'Conta poupança';
      case 'digital_wallet': return 'Carteira digital';
      default: return 'Outro';
    }
  };

  return (
    <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!isOpen);
        }}
        disabled={loading}
        className="p-2 text-text-muted hover:text-text-base rounded-lg hover:bg-surface-elevated transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-1 focus:ring-offset-surface-base"
        aria-label={`Ações de ${account.name}`}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" onClick={() => onToggle(false)} />
          <div className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1 w-full sm:w-48 bg-surface-base sm:bg-surface-elevated border-t sm:border border-border-subtle rounded-t-2xl sm:rounded-xl shadow-2xl sm:shadow-xl z-50 py-4 sm:py-1 font-sans animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95 duration-200">
            <button
              onClick={() => {
                onToggle(false);
                onEdit(account);
              }}
              className="w-full text-left px-6 sm:px-4 py-4 sm:py-2.5 text-base sm:text-sm text-text-base hover:bg-surface-secondary flex items-center gap-3 sm:gap-2 transition-colors min-h-[56px] sm:min-h-[44px]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-4 sm:h-4 text-text-muted"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Editar
            </button>
            {account.active ? (
              <button
                onClick={() => {
                  onToggle(false);
                  setShowConfirmArchive(true);
                }}
                className="w-full text-left px-6 sm:px-4 py-4 sm:py-2.5 text-base sm:text-sm text-text-base hover:bg-surface-secondary flex items-center gap-3 sm:gap-2 transition-colors min-h-[56px] sm:min-h-[44px]"
              >
                <Archive className="w-5 h-5 sm:w-4 sm:h-4 text-text-muted" />
                Arquivar
              </button>
            ) : (
              <button
                onClick={() => {
                  onToggle(false);
                  setShowConfirmReactivate(true);
                }}
                className="w-full text-left px-6 sm:px-4 py-4 sm:py-2.5 text-base sm:text-sm text-text-base hover:bg-surface-secondary flex items-center gap-3 sm:gap-2 transition-colors min-h-[56px] sm:min-h-[44px]"
              >
                <RefreshCw className="w-5 h-5 sm:w-4 sm:h-4 text-text-muted" />
                Reativar
              </button>
            )}
          </div>
        </>
      )}

      {(showConfirmArchive || showConfirmReactivate) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full sm:max-w-sm bg-surface-base sm:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-medium text-text-primary mb-2">
                {showConfirmArchive ? 'Arquivar conta?' : 'Reativar conta?'}
              </h3>
              <p className="text-sm text-text-muted mb-6 leading-relaxed">
                {showConfirmArchive 
                  ? 'Ela deixará de aparecer para novos lançamentos, mas continuará disponível no histórico.'
                  : 'Ela voltará a aparecer nas opções para novos lançamentos.'}
              </p>
              
              <div className="bg-surface-elevated rounded-xl p-4 border border-border-subtle mb-6">
                <div className="text-sm font-medium text-text-base mb-1">
                  Conta: {account.name}
                </div>
                <div className="text-sm text-text-muted">
                  Tipo: {getAccountTypeName(account.type)}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmArchive(false);
                    setShowConfirmReactivate(false);
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-3 sm:py-2.5 border border-border-subtle hover:bg-surface-elevated text-text-base rounded-xl font-medium transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={showConfirmArchive ? handleArchive : handleReactivate}
                  disabled={loading}
                  className="flex-1 px-4 py-3 sm:py-2.5 bg-accent-primary hover:bg-accent-hover text-white rounded-xl font-medium transition-colors flex items-center justify-center disabled:opacity-50 min-h-[44px]"
                >
                  {loading ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : showConfirmArchive ? 'Arquivar' : 'Reativar'}
                </button>
              </div>
            </div>
            {/* Safe area padding for mobile */}
            <div className="h-[env(safe-area-inset-bottom,0)] bg-surface-base" />
          </div>
        </div>
      )}
    </div>
  );
}
