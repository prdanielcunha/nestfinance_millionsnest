import { useAuth } from '@/src/hooks/useAuth';
import { ArrowRight, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';

export default function FinancePage() {
  const { accessState } = useAuth();
  const navigate = useNavigate();
  
  const setupStatus = accessState.financeSetup?.status;

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
        <h2 className="text-base font-medium text-text-primary mb-2">NestFinance configurado</h2>
        <p className="text-sm text-text-secondary text-center max-w-md">
          Os indicadores aparecerão conforme as movimentações e fechamentos forem registrados.
        </p>
      </div>
    </div>
  );
}
