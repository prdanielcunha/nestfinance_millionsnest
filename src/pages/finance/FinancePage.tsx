import { useEffect, useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { ArrowRight, Settings, Landmark, Plus, FolderHeart, Bookmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';

export default function FinancePage() {
  const { accessState } = useAuth();
  const navigate = useNavigate();
  const [loadingOnboarding, setLoadingOnboarding] = useState(true);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [hasFunds, setHasFunds] = useState(false);
  const [hasCategories, setHasCategories] = useState(false);
  const [apiError, setApiError] = useState(false);
  
  const setupStatus = accessState.financeSetup?.status;

  useEffect(() => {
    if (setupStatus === 'configured') {
      fetchOnboardingData();
    } else {
      setLoadingOnboarding(false);
    }
  }, [setupStatus]);

    const fetchOnboardingData = async () => {
    try {
      setLoadingOnboarding(true);
      setApiError(false);
      const user = firebaseAuth.currentUser;
      if (!user) return;
      
      const token = await user.getIdToken();
      
      const [accountsRes, fundsRes, categoriesRes] = await Promise.all([
        fetch('/api/finance/accounts/list', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/finance/funds/list', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/finance/categories/list', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      
      if (!accountsRes.ok || !fundsRes.ok || !categoriesRes.ok) {
        throw new Error('API_LOAD_FAIL');
      }
      
      const accountsData = await accountsRes.json();
      const fundsData = await fundsRes.json();
      const categoriesData = await categoriesRes.json();
      
      const activeAccountsCount = accountsData.accounts
        ? accountsData.accounts.filter((a: any) => a.active !== false).length
        : 0;
      setHasAccounts(activeAccountsCount > 0);

      setHasFunds(fundsData.funds && fundsData.funds.length > 0);
      
      const activeCategoriesCount = categoriesData.categories 
        ? categoriesData.categories.filter((c: any) => c.active !== false).length 
        : 0;
      setHasCategories(activeCategoriesCount > 0);
    } catch (err) {
      setApiError(true);
    } finally {
      setLoadingOnboarding(false);
    }
  };

  if (setupStatus === 'not_configured') {
    return (
      <div className="flex flex-col items-center h-full fade-in max-w-xl mx-auto py-12 px-4 sm:px-0">
        <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center mb-6">
          <Settings className="w-8 h-8 text-text-secondary" />
        </div>
        
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight">Vamos preparar o NestFinance</h1>
          <p className="text-text-secondary">
            Configure a estrutura financeira da organização antes de começar os lançamentos e fechamentos.
          </p>
        </div>
        
        <div className="w-full bg-surface-secondary border border-border-subtle rounded-2xl p-6 space-y-4 mb-8">
          <h2 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Próximas etapas</h2>
          <ol className="list-decimal list-inside space-y-3 text-sm text-text-secondary">
            <li>Configurações gerais</li>
            <li>Contas financeiras</li>
            <li>Fundos</li>
            <li>Categorias</li>
            <li>Plano de contas inicial</li>
          </ol>
        </div>
        
        <button 
          onClick={() => navigate(APP_ROUTES.financeSetup)}
          className="flex items-center gap-2 bg-text-primary text-background-base px-6 py-3 rounded-full text-sm font-medium transition-transform hover:scale-105 active:scale-95"
        >
          Iniciar configuração
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full fade-in space-y-4">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Finance</h1>
      </header>
      
      <div className="flex-1 flex flex-col items-center justify-center border border-border-subtle rounded-2xl bg-surface-secondary/50 p-6 min-h-[40vh]">
        {loadingOnboarding ? (
          <div className="w-8 h-8 border-4 border-surface-elevated border-t-accent-primary rounded-full animate-spin" />
        ) : apiError ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm">
            <p className="text-red-500 text-sm mb-4">Falha ao verificar os dados financeiros da organização.</p>
            <button
              onClick={fetchOnboardingData}
              className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        ) : !hasAccounts ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm font-sans">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted border border-border-subtle">
              <Landmark className="w-6 h-6" />
            </div>
            <h2 className="text-base font-medium text-text-primary mb-2">Cadastre a primeira conta financeira</h2>
            <p className="text-sm text-text-secondary mb-6">
              O NestFinance precisa de pelo menos uma conta para registrar suas transações.
            </p>
            <button
              onClick={() => navigate(APP_ROUTES.financeSettingsAccounts)}
              className="flex items-center justify-center h-10 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Conta
            </button>
          </div>
        ) : !hasFunds ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm font-sans">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted border border-border-subtle">
              <FolderHeart className="w-6 h-6 text-rose-500" />
            </div>
            <h2 className="text-base font-medium text-text-primary mb-2">Cadastre o primeiro fundo</h2>
            <p className="text-sm text-text-secondary mb-6">
              Fundos ajudam a separar recursos livres de valores destinados a finalidades específicas.
            </p>
            <button
              onClick={() => navigate(APP_ROUTES.financeSettingsFunds)}
              className="flex items-center justify-center h-10 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Fundo
            </button>
          </div>
        ) : !hasCategories ? (
          <div className="flex flex-col items-center justify-center text-center max-w-sm font-sans">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted border border-border-subtle">
              <Bookmark className="w-6 h-6 text-amber-500" />
            </div>
            <h2 className="text-base font-medium text-text-primary mb-2">Cadastre as categorias financeiras</h2>
            <p className="text-sm text-text-secondary mb-6">
              Categorias identificam a natureza das entradas e saídas, como Dízimos, Ofertas, Energia e Manutenção.
            </p>
            <button
              onClick={() => navigate(APP_ROUTES.financeSettingsCategories)}
              className="flex items-center justify-center h-10 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Categoria
            </button>
          </div>
        ) : (
          <div className="flex flex-col w-full max-w-3xl justify-start self-start">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Organização financeira</h2>
                <p className="text-sm text-text-secondary">Estrutura de contas, fundos e categorias ativas</p>
              </div>
              <button
                onClick={() => navigate(APP_ROUTES.financeSettings)}
                className="hidden sm:flex items-center px-4 py-2 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors"
              >
                <Settings className="w-4 h-4 mr-2" />
                Organizar finanças
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                onClick={() => navigate(APP_ROUTES.financeSettingsAccounts)}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-xl p-5 text-left transition-colors flex flex-col group"
              >
                <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center border border-border-subtle mb-3 group-hover:scale-105 transition-transform text-text-base">
                  <Landmark className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-medium text-text-primary mb-1">Contas</h3>
                <p className="text-xs text-text-secondary">Onde o dinheiro fica.</p>
              </button>

              <button
                onClick={() => navigate(APP_ROUTES.financeSettingsFunds)}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-xl p-5 text-left transition-colors flex flex-col group"
              >
                <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center border border-border-subtle mb-3 group-hover:scale-105 transition-transform text-text-base">
                  <FolderHeart className="w-5 h-5 text-rose-500/70 group-hover:text-rose-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-text-primary mb-1">Fundos</h3>
                <p className="text-xs text-text-secondary">Para que ele foi separado.</p>
              </button>

              <button
                onClick={() => navigate(APP_ROUTES.financeSettingsCategories)}
                className="bg-surface-base hover:bg-surface-elevated border border-border-subtle rounded-xl p-5 text-left transition-colors flex flex-col group"
              >
                <div className="w-10 h-10 bg-surface-elevated rounded-lg flex items-center justify-center border border-border-subtle mb-3 group-hover:scale-105 transition-transform text-text-base">
                  <Bookmark className="w-5 h-5 text-amber-500/70 group-hover:text-amber-500 transition-colors" />
                </div>
                <h3 className="text-sm font-medium text-text-primary mb-1">Categorias</h3>
                <p className="text-xs text-text-secondary">Por que entrou ou saiu.</p>
              </button>
            </div>
            
            <button
              onClick={() => navigate(APP_ROUTES.financeSettings)}
              className="sm:hidden mt-4 w-full flex items-center justify-center px-4 py-3 bg-surface-elevated hover:bg-surface-secondary text-sm font-medium rounded-lg text-text-base border border-border-subtle transition-colors min-h-[44px]"
            >
              <Settings className="w-4 h-4 mr-2" />
              Organizar finanças
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

