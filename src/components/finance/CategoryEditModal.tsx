import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { updateCategory } from '@/src/services/categoriesService';

interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  accountingCode?: string;
  active: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
  category: Category;
}

export default function CategoryEditModal({ isOpen, onClose, onSuccess, onError, category }: Props) {
  const [name, setName] = useState(category.name);
  const [accountingCode, setAccountingCode] = useState(category.accountingCode || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(category.name);
      setAccountingCode(category.accountingCode || '');
      setLoading(false);
    }
  }, [isOpen, category]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      onError('O nome deve ter no mínimo 2 caracteres.');
      return;
    }

    if (loading) return;

    try {
      setLoading(true);
      await updateCategory({
        categoryId: category.id,
        name: trimmedName,
        accountingCode: accountingCode.trim() || null
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      onError(err.message || 'Erro ao atualizar categoria.');
    } finally {
      setLoading(false);
    }
  };

  const kindText = category.kind === 'income' ? 'Entrada' : 'Saída';
  const statusText = category.active ? 'Ativa' : 'Arquivada';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full sm:max-w-md bg-surface-base sm:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface-base shrink-0">
          <h2 className="text-lg font-medium text-text-primary pl-2">Editar categoria</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-2 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-6">
            <p className="text-sm text-text-muted leading-relaxed">
              Você pode alterar o nome e o código contábil. O tipo Entrada ou Saída será preservado para manter o histórico correto.
            </p>

            <div className="bg-surface-elevated rounded-xl p-4 border border-border-subtle space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-muted">Tipo:</span>
                <span className="font-medium text-text-base">{kindText}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-muted">Status:</span>
                <span className="font-medium text-text-base">{statusText}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="edit-cat-name" className="block text-sm font-medium text-text-base mb-1.5 ml-1">
                  Nome da Categoria *
                </label>
                <input
                  id="edit-cat-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3 text-text-base placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all disabled:opacity-50"
                  placeholder="Ex: Refeições"
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="edit-cat-code" className="block text-sm font-medium text-text-base mb-1.5 ml-1">
                  Código Contábil <span className="text-text-muted font-normal">(Opcional)</span>
                </label>
                <input
                  id="edit-cat-code"
                  type="text"
                  value={accountingCode}
                  onChange={(e) => setAccountingCode(e.target.value)}
                  disabled={loading}
                  className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-4 py-3 text-text-base placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all uppercase disabled:opacity-50"
                  placeholder="Ex: 3.1.2.04"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-border-subtle bg-surface-base shrink-0 mb-[env(safe-area-inset-bottom,0)]">
            <button
              type="submit"
              disabled={loading || name.trim().length < 2}
              className="w-full flex items-center justify-center bg-accent-primary hover:bg-accent-hover active:bg-accent-pressed text-white rounded-xl py-3.5 font-medium transition-colors min-h-[44px] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                'Salvar modificações'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
