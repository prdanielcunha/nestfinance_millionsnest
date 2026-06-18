import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Wallet, CreditCard, Landmark, PiggyBank, Plus, ArrowLeft } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';
import AccountFormModal from '@/src/components/finance/AccountFormModal';

interface Account {
  id: string;
  name: string;
  type: string;
  institutionName?: string;
  accountLast4?: string;
  currency: string;
  active: boolean;
}

export default function FinanceAccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Não autenticado');
      
      const token = await user.getIdToken();
      
      const res = await fetch('/api/finance/accounts/list', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        throw new Error('Falha ao carregar contas');
      }
      
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (err: any) {
      setError('Não foi possível carregar as contas financeiras. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'cash': return <Wallet className="w-5 h-5 text-emerald-500" />;
      case 'checking': return <Landmark className="w-5 h-5 text-blue-500" />;
      case 'savings': return <PiggyBank className="w-5 h-5 text-purple-500" />;
      case 'digital_wallet': return <CreditCard className="w-5 h-5 text-indigo-500" />;
      default: return <Building2 className="w-5 h-5 text-gray-500" />;
    }
  };

  const getAccountTypeName = (type: string) => {
    switch (type) {
      case 'cash': return 'Caixa (Físico)';
      case 'checking': return 'Conta Corrente';
      case 'savings': return 'Conta Poupança';
      case 'digital_wallet': return 'Carteira Digital';
      case 'other': return 'Outra';
      default: return type;
    }
  };

  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-base px-4 py-4 flex flex-col gap-4 sticky top-0 z-10 transition-colors duration-200">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(APP_ROUTES.finance)}
            className="p-1.5 -ml-1.5 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-medium tracking-tight text-text-base">Contas Financeiras</h1>
            <p className="text-sm text-text-muted mt-0.5">Gerencie os locais onde os valores ficam armazenados.</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 h-64">
             <div className="w-8 h-8 rounded-full border-4 border-surface-elevated border-t-accent-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <button 
              onClick={fetchAccounts}
              className="mt-3 text-sm text-red-500 font-medium hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 h-64 text-center bg-surface-elevated rounded-2xl border border-border-subtle border-dashed">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted">
              <Landmark className="w-6 h-6" />
            </div>
            <h3 className="text-text-base font-medium mb-2">Nenhuma conta cadastrada</h3>
            <p className="text-text-muted text-sm max-w-sm mb-6">
              Você ainda não possui contas financeiras nesta organização. Adicione uma para começar a registrar transações.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center h-11 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Conta
            </button>
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
                {accounts.length} {accounts.length === 1 ? 'Conta' : 'Contas'}
              </h2>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center justify-center py-2 px-3 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Nova Conta
              </button>
            </div>
            
            <div className="grid gap-3">
              {accounts.map((account) => (
                <div 
                  key={account.id}
                  className="bg-surface-elevated border border-border-subtle rounded-xl p-4 flex items-center gap-4 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-surface-base flex items-center justify-center shrink-0 border border-border-subtle">
                    {getAccountIcon(account.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium text-text-base truncate">
                      {account.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-sm text-text-muted">
                      <span>{getAccountTypeName(account.type)}</span>
                      {(account.institutionName || account.accountLast4) && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-border-subtle" />
                          <span className="truncate">
                            {account.institutionName} 
                            {account.institutionName && account.accountLast4 && ' • '}
                            {account.accountLast4 && `Final ${account.accountLast4}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {!account.active && (
                    <div className="shrink-0 px-2.5 py-1 rounded-md bg-surface-base border border-border-subtle text-xs font-medium text-text-muted">
                      Inativa
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {isModalOpen && (
        <AccountFormModal 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => {
            setIsModalOpen(false);
            fetchAccounts();
          }} 
        />
      )}
    </div>
  );
}
