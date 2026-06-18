import React, { useState, useRef, useEffect } from 'react';
import { X, Landmark, CreditCard, Wallet, PiggyBank, Building2 } from 'lucide-react';
import { firebaseAuth } from '@/src/lib/firebase';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type AccountType = 'cash' | 'checking' | 'savings' | 'digital_wallet' | 'other';

const ACCOUNT_TYPES: { id: AccountType; label: string; icon: any }[] = [
  { id: 'checking', label: 'Conta Corrente', icon: Landmark },
  { id: 'savings', label: 'Poupança', icon: PiggyBank },
  { id: 'digital_wallet', label: 'Carteira Digital', icon: CreditCard },
  { id: 'cash', label: 'Caixa (Físico)', icon: Wallet },
  { id: 'other', label: 'Outra', icon: Building2 },
];

export default function AccountFormModal({ onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [institutionName, setInstitutionName] = useState('');
  const [accountLast4, setAccountLast4] = useState('');
  
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
      
      const payload: any = {
        name: name.trim(),
        type,
      };
      
      if (institutionName.trim()) {
        payload.institutionName = institutionName.trim();
      }
      
      if (accountLast4.trim()) {
        payload.accountLast4 = accountLast4.trim();
      }

      const res = await fetch('/api/finance/accounts/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        if (res.status === 503) {
           throw new Error('A criação de contas está temporariamente desativada.');
        } else if (res.status === 409) {
           throw new Error('Já existe uma conta com este nome.');
        } else if (res.status === 413) {
           throw new Error('Dados enviados excedem o limite permitido.');
        } else if (data.error === 'INVALID_NAME') {
           throw new Error('Nome inválido (entre 2 e 80 caracteres).');
        } else if (data.error === 'INVALID_INSTITUTION_NAME') {
           throw new Error('Nome da instituição não pode passar de 80 caracteres.');
        } else if (data.error === 'INVALID_ACCOUNT_LAST4') {
           throw new Error('Últimos dígitos devem conter exatamente 4 números.');
        } else {
           throw new Error('Falha ao criar conta. Verifique os dados e tente novamente.');
        }
      }
      
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Erro inesperado.');
      setLoading(false);
    }
  };

  const handleLast4Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 4) {
      setAccountLast4(val);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        className="w-full max-w-md bg-surface-base border border-border-subtle rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-lg font-medium tracking-tight text-text-base">Adicionar Conta</h2>
          <button 
            onClick={onClose}
            disabled={loading}
            className="p-2 -mr-2 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-5">
          {error && (
             <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
               <p className="text-red-500 text-sm">{error}</p>
             </div>
          )}
          
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-text-base flex items-center justify-between">
              Nome da conta *
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
              placeholder="Ex: Conta Principal do Ministério, Caixinha..."
              className="w-full h-11 px-3 bg-surface-elevated border border-border-default rounded-lg text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-base">Tipo de conta *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((accType) => {
                const Icon = accType.icon;
                const isSelected = type === accType.id;
                return (
                  <button
                    key={accType.id}
                    type="button"
                    onClick={() => setType(accType.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                      isSelected 
                        ? "border-accent-primary bg-accent-primary/5 text-accent-primary" 
                        : "border-border-default bg-surface-elevated text-text-base hover:border-border-hover hover:bg-surface-hover"
                    }`}
                    disabled={loading}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? "text-accent-primary" : "text-text-muted"}`} />
                    <span className="text-sm font-medium">{accType.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="institutionName" className="text-sm font-medium text-text-base flex items-center justify-between">
              Nome da Instituição (Opcional)
              <span className="text-xs font-normal text-text-muted">{institutionName.length}/80</span>
            </label>
            <input
              id="institutionName"
              type="text"
              maxLength={80}
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="Ex: Banco do Brasil, Nubank..."
              className="w-full h-11 px-3 bg-surface-elevated border border-border-default rounded-lg text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="accountLast4" className="text-sm font-medium text-text-base">
              Últimos 4 dígitos da conta (Opcional)
            </label>
            <input
              id="accountLast4"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={accountLast4}
              onChange={handleLast4Change}
              placeholder="Ex: 1234"
              className="w-full h-11 px-3 bg-surface-elevated border border-border-default rounded-lg text-text-base focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all placeholder:text-text-muted/50 font-mono tracking-widest"
              disabled={loading}
            />
            <p className="text-xs text-text-muted">Apenas para facilitar a identificação. Não insira sua agência ou conta completa.</p>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 h-11 px-5 rounded-lg border border-border-default bg-surface-elevated text-text-base font-medium hover:bg-surface-hover hover:border-border-hover transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || name.trim().length < 2}
              className="flex-1 flex items-center justify-center h-11 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Salvar Conta'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
