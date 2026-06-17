import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';

export default function SetupPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full fade-in space-y-6 max-w-2xl mx-auto py-8">
      <header className="flex items-center gap-4 mb-2">
        <button 
          onClick={() => navigate(APP_ROUTES.finance)}
          className="p-2 rounded-full hover:bg-surface-secondary text-text-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Assistente de Configuração</h1>
      </header>
      
      <div className="flex-1 flex flex-col items-center justify-center border border-border-subtle rounded-2xl bg-surface-secondary/50 p-8 min-h-[50vh]">
        <h2 className="text-base font-medium text-text-primary mb-2">Em breve</h2>
        <p className="text-sm text-text-secondary text-center max-w-md">
          A configuração funcional da base financeira será implementada na próxima fase.
        </p>
      </div>
    </div>
  );
}
