import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { firebaseAuth } from '@/src/lib/firebase';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CategoryFormModal({ onClose, onSuccess }: Props) {
  const { activeFinanceEntityId } = useFinanceEntity();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('income');
  const [accountingCode, setAccountingCode] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);

  // Close with Esc or backdrop click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    try {
      setLoading(true);
      setError(null);

      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Não autenticado');

      const token = await user.getIdToken();

      const payload: any = {
        name: name.trim(),
        kind,
        financeEntityId: activeFinanceEntityId
      };

      if (accountingCode.trim() !== '') {
        const trimmedCode = accountingCode.trim();
        // Validation check
        const accountingCodeRegex = /^[A-Za-z0-9._/-]{1,32}$/;
        if (!accountingCodeRegex.test(trimmedCode)) {
          throw new Error('Código contábil inválido. Use apenas letras, números, ponto, hífen, barra e sublinhado (sem espaços).');
        }
        payload.accountingCode = trimmedCode;
      }

      const res = await fetch('/api/finance/categories/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 503) {
          throw new Error('A criação de categorias está temporariamente desativada ou você não tem permissão.');
        } else if (res.status === 409) {
          const kindText = kind === 'income' ? 'entrada' : 'saída';
          throw new Error(`Já existe uma categoria de ${kindText} com esse nome.`);
        } else if (res.status === 413) {
          throw new Error('O tamanho dos dados enviados excedeu o limite máximo.');
        } else if (data.error === 'INVALID_NAME') {
          throw new Error('Nome da categoria inválido (deve conter entre 2 e 80 caracteres).');
        } else if (data.error === 'INVALID_ACCOUNTING_CODE') {
          throw new Error('Código contábil inválido (máximo 32 caracteres contendo letras, números, ponto, hífen, barra ou sublinhado).');
        } else {
          throw new Error(data.error || 'Falha ao registrar categoria. Verifique os dados ou as permissões de acesso global.');
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Erro inesperado.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        className="w-full max-w-lg bg-surface-base border border-border-subtle rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-lg font-medium tracking-tight text-text-base">Adicionar Categoria Financeira</h2>
          <button 
            onClick={onClose}
            disabled={loading}
            className="p-2 -mr-2 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-red-500 text-sm leading-relaxed">{error}</p>
            </div>
          )}

          {/* Kind Select Segmented Control with Touch Target min 44px */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-base">Natureza da categoria *</label>
            <div className="grid grid-cols-2 gap-2 bg-surface-elevated p-1 rounded-xl border border-border-subtle">
              <button
                type="button"
                disabled={loading}
                onClick={() => setKind('income')}
                className={`py-2 px-4 rounded-lg text-sm font-medium transition-all focus:outline-none min-h-[44px] flex items-center justify-center ${
                  kind === 'income'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm'
                    : 'text-text-muted hover:text-text-base border border-transparent'
                }`}
              >
                Entrada (Receita)
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => setKind('expense')}
                className={`py-2 px-4 rounded-lg text-sm font-medium transition-all focus:outline-none min-h-[44px] flex items-center justify-center ${
                  kind === 'expense'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm'
                    : 'text-text-muted hover:text-text-base border border-transparent'
                }`}
              >
                Saída (Despesa)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-text-base flex items-center justify-between">
              Nome da categoria *
              <span className="text-xs font-normal text-text-muted">{name.length}/80</span>
            </label>
            <input
              id="name"
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'income' ? 'Ex: Dízimos, Ofertas, Doações...' : 'Ex: Energia, Manutenção, Materiais...'}
              className="w-full h-11 px-3 bg-surface-elevated border border-border-default rounded-lg text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all placeholder:text-text-muted/60"
              disabled={loading}
            />
            <p className="text-xs text-text-muted mt-1 leading-normal">
              {kind === 'income' 
                ? 'Exemplos comuns de entradas: Dízimos, Ofertas, Doações, Campanhas.' 
                : 'Exemplos comuns de saídas: Energia elétrica, Água, Manutenção de templo, Material didático.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="accountingCode" className="text-sm font-medium text-text-base">
              Código contábil (opcional)
            </label>
            <input
              id="accountingCode"
              type="text"
              maxLength={32}
              value={accountingCode}
              onChange={(e) => setAccountingCode(e.target.value.replace(/\s+/g, ''))}
              placeholder="Ex: 1.1.01.001"
              className="w-full h-11 px-3 bg-surface-elevated border border-border-default rounded-lg text-text-base font-mono focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all placeholder:text-text-muted/60 uppercase"
              disabled={loading}
            />
            <p className="text-xs text-text-muted mt-1 leading-normal">
              Use somente quando sua contabilidade já possuir um código específico para esta categoria. Use apenas letras, números, ponto, hífen, barra ou sublinhado.
            </p>
          </div>

          <div className="pt-4 border-t border-border-subtle flex items-center justify-end gap-3 font-sans">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-base bg-surface-elevated rounded-lg hover:bg-surface-secondary transition-colors min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center min-h-[44px] px-5 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                'Salvar Categoria'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
