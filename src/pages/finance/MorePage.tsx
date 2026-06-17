import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { FileText, ShieldCheck } from 'lucide-react';

export default function MorePage() {
  return (
    <div className="flex flex-col h-full fade-in space-y-4">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Mais Opções</h1>
        <p className="text-text-secondary mt-1">Navegação adicional do sistema corporativo.</p>
      </header>
      
      <div className="flex flex-col gap-3">
        <Link 
          to={APP_ROUTES.reports}
          className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
        >
          <div className="p-2 bg-surface-elevated rounded-lg mr-4">
            <FileText className="w-5 h-5 text-text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Reports</p>
            <p className="text-xs text-text-secondary mt-0.5">Relatórios e prestações de contas.</p>
          </div>
        </Link>
        <Link 
          to={APP_ROUTES.audit}
          className="flex items-center p-4 bg-surface-secondary border border-border-strong rounded-xl hover:bg-surface-elevated transition-colors press-fx"
        >
          <div className="p-2 bg-surface-elevated rounded-lg mr-4">
            <ShieldCheck className="w-5 h-5 text-text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Audit</p>
            <p className="text-xs text-text-secondary mt-0.5">Histórico e trilha de auditoria.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
