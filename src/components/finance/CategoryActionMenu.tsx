import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Archive, RefreshCw, Edit2 } from 'lucide-react';
import { archiveCategory, reactivateCategory } from '@/src/services/categoriesService';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';

interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  accountingCode?: string;
  active: boolean;
}

interface Props {
  category: Category;
  onEdit: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export default function CategoryActionMenu({ category, onEdit, onSuccess, onError }: Props) {
  const { activeFinanceEntityId } = useFinanceEntity();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showConfirmArchive, setShowConfirmArchive] = useState(false);
  const [showConfirmReactivate, setShowConfirmReactivate] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowConfirmArchive(false);
        setShowConfirmReactivate(false);
      }
    }

    if (isOpen || showConfirmArchive || showConfirmReactivate) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, showConfirmArchive, showConfirmReactivate]);

  const handleArchive = async () => {
    if (loading) return;
    try {
      if (!activeFinanceEntityId) throw new Error('Organização não selecionada');
      setLoading(true);
      await archiveCategory(category.id, activeFinanceEntityId);
      setShowConfirmArchive(false);
      setIsOpen(false);
      onSuccess(); // Should trigger a fetch and success message
    } catch (err: any) {
      onError(err.message || 'Não foi possível arquivar a categoria. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (loading) return;
    try {
      if (!activeFinanceEntityId) throw new Error('Organização não selecionada');
      setLoading(true);
      await reactivateCategory(category.id, activeFinanceEntityId);
      setShowConfirmReactivate(false);
      setIsOpen(false);
      onSuccess();
    } catch (err: any) {
      onError(err.message || 'Não foi possível reativar a categoria. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const kindText = category.kind === 'income' ? 'Entrada' : 'Saída';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="p-2 text-text-muted hover:text-text-base rounded-full hover:bg-surface-base transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
        aria-label={`Ações de ${category.name}`}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm sm:hidden" onClick={() => setIsOpen(false)} />
          
          <div 
            ref={menuRef}
            className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1 w-full sm:w-48 bg-surface-base sm:bg-surface-elevated border-t sm:border border-border-subtle rounded-t-2xl sm:rounded-xl shadow-2xl sm:shadow-xl z-50 py-4 sm:py-1 font-sans animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95 duration-200"
          >
            <button
              onClick={() => {
                setIsOpen(false);
                onEdit();
              }}
              className="w-full text-left px-6 sm:px-4 py-4 sm:py-2.5 text-base sm:text-sm text-text-base hover:bg-surface-secondary flex items-center gap-3 sm:gap-2 transition-colors min-h-[56px] sm:min-h-[44px]"
            >
              <Edit2 className="w-5 h-5 sm:w-4 sm:h-4 text-text-muted" />
              Editar
            </button>
            {category.active ? (
              <button
                onClick={() => {
                  setShowConfirmArchive(true);
                  setIsOpen(false);
                }}
                className="w-full text-left px-6 sm:px-4 py-4 sm:py-2.5 text-base sm:text-sm text-text-base hover:bg-surface-secondary flex items-center gap-3 sm:gap-2 transition-colors min-h-[56px] sm:min-h-[44px]"
              >
                <Archive className="w-5 h-5 sm:w-4 sm:h-4 text-text-muted" />
                Arquivar
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowConfirmReactivate(true);
                  setIsOpen(false);
                }}
                className="w-full text-left px-6 sm:px-4 py-4 sm:py-2.5 text-base sm:text-sm text-text-base hover:bg-surface-secondary flex items-center gap-3 sm:gap-2 transition-colors min-h-[56px] sm:min-h-[44px]"
              >
                <RefreshCw className="w-5 h-5 sm:w-4 sm:h-4 text-text-muted" />
                Reativar
              </button>
            )}
            <div className="pb-safe" />
          </div>
        </>
      )}

      {/* Confirmation Modals - Using fixed to cover the screen properly */}
      {(showConfirmArchive || showConfirmReactivate) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-surface-base border border-border-default rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5">
              <h3 className="text-lg font-medium text-text-primary mb-2">
                {showConfirmArchive ? 'Arquivar categoria?' : 'Reativar categoria?'}
              </h3>
              <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                {showConfirmArchive 
                  ? 'Ela deixará de aparecer em novos lançamentos, mas continuará disponível no histórico.'
                  : 'Ela voltará a aparecer nas opções para novos lançamentos.'}
              </p>
              
              <div className="bg-surface-elevated rounded-lg p-3 mb-6 border border-border-subtle">
                <p className="text-sm">
                  <span className="text-text-muted">Nome: </span>
                  <span className="font-medium text-text-base">{category.name}</span>
                </p>
                <p className="text-sm mt-1">
                  <span className="text-text-muted">Tipo: </span>
                  <span className="font-medium text-text-base">{kindText}</span>
                </p>
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button
                  disabled={loading}
                  onClick={() => {
                    setShowConfirmArchive(false);
                    setShowConfirmReactivate(false);
                    if (buttonRef.current) buttonRef.current.focus();
                  }}
                  className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-base bg-surface-elevated rounded-lg hover:bg-surface-secondary transition-colors min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  disabled={loading}
                  onClick={showConfirmArchive ? handleArchive : handleReactivate}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent-primary hover:bg-accent-hover rounded-lg transition-colors flex items-center justify-center min-h-[44px] min-w-[100px] disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : showConfirmArchive ? 'Arquivar' : 'Reativar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
