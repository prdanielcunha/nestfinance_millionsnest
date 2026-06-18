import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Wallet, CreditCard, Landmark, PiggyBank, Plus, ArrowLeft } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';
import AccountFormModal from '@/src/components/finance/AccountFormModal';
import AccountActionMenu from '@/src/components/finance/AccountActionMenu';

interface Account {
  id: string;
  name: string;
  type: string;
  institutionName?: string;
  accountLast4?: string;
  currency: string;
  active: boolean;
}

type TabType = 'active' | 'archived';

export default function FinanceAccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

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
      case 'cash': return 'Caixa físico';
      case 'checking': return 'Conta corrente';
      case 'savings': return 'Conta poupança';
      case 'digital_wallet': return 'Carteira digital';
      case 'other': return 'Outro';
      default: return type;
    }
  };

  const activeAccounts = accounts.filter(a => a.active);
  const archivedAccounts = accounts.filter(a => !a.active);
  const displayedAccounts = activeTab === 'active' ? activeAccounts : archivedAccounts;

  const handleActionSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
    fetchAccounts();
  };

  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0 relative">
      {/* Success Toast */}
      {successMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-surface-elevated text-text-base border border-border-subtle shadow-xl rounded-xl py-3 px-6 flex items-center justify-center animate-in slide-in-from-top-4 fade-in duration-200">
          <p className="font-medium text-sm">{successMsg}</p>
        </div>
      )}

      {/* Header */}
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-base px-4 py-4 flex flex-col gap-4 sticky top-0 z-10 transition-colors duration-200">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(APP_ROUTES.financeSettings)}
            className="p-1.5 -ml-1.5 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="hidden md:flex items-center text-xs text-text-muted mb-1 font-medium tracking-wide">
              <span>Finance</span>
              <span className="mx-1.5 opacity-50">/</span>
              <span>Organização financeira</span>
              <span className="mx-1.5 opacity-50">/</span>
              <span className="text-text-primary">Contas</span>
            </div>
            <h1 className="text-xl font-medium tracking-tight text-text-base md:text-lg">Contas Financeiras</h1>
            <p className="text-sm text-text-muted mt-0.5 md:hidden">Gerencie os locais onde os valores ficam armazenados.</p>
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
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center max-w-2xl mx-auto">
            <p className="text-red-500 text-sm">{error}</p>
            <button 
              onClick={fetchAccounts}
              className="mt-3 text-sm text-red-500 font-medium hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 h-64 text-center bg-surface-elevated rounded-2xl border border-border-subtle border-dashed max-w-2xl mx-auto">
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
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex bg-surface-elevated p-1 rounded-xl border border-border-subtle inline-flex">
                <button
                  onClick={() => setActiveTab('active')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'active' 
                      ? 'bg-surface-base border border-border-subtle shadow-sm text-text-base' 
                      : 'text-text-muted hover:text-text-base'
                  }`}
                >
                  Ativas <span className="ml-1 opacity-60 text-xs">({activeAccounts.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('archived')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'archived' 
                      ? 'bg-surface-base border border-border-subtle shadow-sm text-text-base' 
                      : 'text-text-muted hover:text-text-base'
                  }`}
                >
                  Arquivadas <span className="ml-1 opacity-60 text-xs">({archivedAccounts.length})</span>
                </button>
              </div>

              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center justify-center py-2 px-3 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Nova Conta
              </button>
            </div>
            
            {displayedAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 py-16 text-center bg-surface-elevated rounded-2xl border border-border-subtle border-dashed">
                <p className="text-text-muted text-sm">
                  {activeTab === 'active' ? 'Nenhuma conta ativa.' : 'Nenhuma conta arquivada.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {displayedAccounts.map((account) => (
                  <div 
                    key={account.id}
                    onClick={() => {
                      // Only on small screens
                      if (window.innerWidth < 640) {
                        setSelectedAccountId(selectedAccountId === account.id ? null : account.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="bg-surface-elevated border border-border-subtle rounded-xl p-4 flex items-center gap-4 transition-colors relative cursor-pointer sm:cursor-default hover:bg-surface-secondary sm:hover:bg-surface-elevated active:bg-surface-base sm:active:bg-surface-elevated"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (window.innerWidth < 640) {
                          setSelectedAccountId(selectedAccountId === account.id ? null : account.id);
                        }
                      }
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-surface-base flex items-center justify-center shrink-0 border border-border-subtle">
                      {getAccountIcon(account.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-medium text-text-base truncate flex items-center gap-2">
                        {account.name}
                        {!account.active && (
                          <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-500 uppercase tracking-wide">
                            Arquivada
                          </span>
                        )}
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
                    
                    <div className="shrink-0 flex items-center justify-end">
                       <AccountActionMenu 
                        account={account}
                        isOpen={selectedAccountId === account.id}
                        onToggle={(isOpen) => setSelectedAccountId(isOpen ? account.id : null)}
                        onSuccess={() => handleActionSuccess(account.active ? 'Conta arquivada.' : 'Conta reativada.')}
                        onError={(msg) => setError(msg)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
