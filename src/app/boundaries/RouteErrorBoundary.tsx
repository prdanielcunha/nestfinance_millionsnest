import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { APP_ROUTES } from '../router/routes';
import { ShieldAlert } from 'lucide-react';

export function RouteErrorBoundary() {
  const error = useRouteError();

  let title = "Ocorreu um problema";
  let message = "Não foi possível carregar esta parte do aplicativo.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Página não encontrada";
      message = "O endereço que você tentou acessar não existe.";
    }
  }

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-12 h-12 bg-surface-elevated border border-border-strong rounded-full flex items-center justify-center text-text-muted mb-2">
        <ShieldAlert className="w-6 h-6" />
      </div>
      <h1 className="text-lg font-medium text-text-primary">{title}</h1>
      <p className="text-sm text-text-secondary">{message}</p>
      
      <div className="pt-4">
        <Link
          to={APP_ROUTES.root}
          className="inline-flex items-center px-4 py-2 bg-surface-elevated hover:bg-surface-secondary border border-border-strong rounded-lg text-sm text-text-primary transition-colors press-fx"
        >
          Voltar ao Início
        </Link>
      </div>
    </div>
  );
}
