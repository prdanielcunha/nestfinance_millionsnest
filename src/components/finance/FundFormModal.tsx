import React, { useState, useEffect, useRef } from 'react';
import { X, FolderHeart } from 'lucide-react';
import { firebaseAuth } from '@/src/lib/firebase';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type ColorToken = 'slate' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose';

const COLOR_OPTIONS = [
  { id: 'slate', name: 'Cinza / Geral', bgClass: 'bg-zinc-500 border-zinc-400' },
  { id: 'blue', name: 'Azul', bgClass: 'bg-blue-500 border-blue-400' },
  { id: 'emerald', name: 'Verde', bgClass: 'bg-emerald-500 border-emerald-400' },
  { id: 'amber', name: 'Laranja', bgClass: 'bg-amber-500 border-amber-400' },
  { id: 'violet', name: 'Roxo', bgClass: 'bg-violet-500 border-violet-400' },
  { id: 'rose', name: 'Rosa', bgClass: 'bg-rose-500 border-rose-400' },
] as const;

export default function FundFormModal({ onClose, onSuccess }: Props) {
  const { activeFinanceEntityId } = useFinanceEntity();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [restricted, setRestricted] = useState<boolean>(false);
  const [colorToken, setColorToken] = useState<ColorToken>('slate');

  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and escape key
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

      const payload = {
        name: name.trim(),
        restricted,
        colorToken,
        financeEntityId: activeFinanceEntityId
      };

      const res = await fetch('/api/finance/funds/create', {
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
          throw new Error('A criação de fundos está temporariamente desativada ou você não tem permissão.');
        } else if (res.status === 409) {
          throw new Error('Já existe um fundo com esse nome.');
        } else if (res.status === 413) {
          throw new Error('O tamanho dos dados enviados excedeu o limite máximo.');
        } else if (data.error === 'INVALID_NAME') {
          throw new Error('Nome do fundo inválido (deve conter entre 2 e 80 caracteres).');
        } else {
          throw new Error('Falha ao registrar fundo. Verifique as permissões de acesso global ou dados informados.');
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
          <h2 className="text-lg font-medium tracking-tight text-text-base">Adicionar Fundo Financeiro</h2>
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
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-text-base flex items-center justify-between">
              Nome do fundo *
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
              placeholder="Ex: Geral, Missões, Construção..."
              className="w-full h-11 px-3 bg-surface-elevated border border-border-default rounded-lg text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-base">Classificação do recurso *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => setRestricted(false)}
                className={`flex flex-col text-left p-4 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-accent-primary ${
                  !restricted
                    ? 'border-accent-primary bg-accent-primary/5 text-text-base'
                    : 'border-border-subtle bg-surface-elevated text-text-muted hover:border-border-strong opacity-70'
                }`}
              >
                <span className="font-semibold text-sm text-text-base">Livre</span>
                <span className="text-xs text-text-muted mt-1 leading-normal">
                  Pode ser utilizado para finalidades gerais da organização, respeitando as futuras aprovações.
                </span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setRestricted(true)}
                className={`flex flex-col text-left p-4 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-accent-primary ${
                  restricted
                    ? 'border-accent-primary bg-accent-primary/5 text-text-base'
                    : 'border-border-subtle bg-surface-elevated text-text-muted hover:border-border-strong opacity-70'
                }`}
              >
                <span className="font-semibold text-sm text-text-base">Destinado</span>
                <span className="text-xs text-text-muted mt-1 leading-normal">
                  Use quando o dinheiro foi recebido ou separado para uma finalidade específica.
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-text-base block">Cor identificadora (opcional)</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  disabled={loading}
                  onClick={() => setColorToken(col.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-surface-base ${
                    colorToken === col.id
                      ? 'border-accent-primary bg-accent-primary/10 text-white'
                      : 'border-border-default bg-surface-elevated text-text-muted hover:text-text-base hover:border-border-strong'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${col.bgClass}`} />
                  <span>{col.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-border-subtle flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-base bg-surface-elevated rounded-lg hover:bg-surface-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center h-10 px-5 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                'Salvar Fundo'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
