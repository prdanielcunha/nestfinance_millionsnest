import React from 'react';
import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';

export interface FirestoreIndexRemediationProps {
  remediation?: { type: string; url?: string };
  requestId?: string;
  onRetry: () => void;
}

export const FirestoreIndexRemediationCard: React.FC<FirestoreIndexRemediationProps> = ({ remediation, requestId, onRetry }) => {
  const hasUrl = remediation && remediation.type === 'CREATE_FIRESTORE_INDEX' && remediation.url;

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto my-12 bg-surface-elevated rounded-xl border border-border-subtle shadow-sm">
      <AlertCircle className="h-10 w-10 text-amber-500 mb-4" />
      
      {hasUrl && remediation && remediation.url ? (
        <>
          <h3 className="text-xl font-medium text-text-primary mb-2">Índice necessário</h3>
          <p className="text-sm text-text-muted mb-6">
            Esta consulta exige a criação de um índice estruturado no Firestore para retornar dados de forma eficiente e segura.
          </p>
          <div className="flex flex-col gap-3 w-full mb-6">
            <a
              href={remediation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center px-4 py-3 bg-accent-primary hover:bg-accent-primary/90 text-sm font-medium rounded-xl transition-colors text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              Criar índice no Firestore
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
            <button 
              onClick={onRetry} 
              className="flex items-center justify-center px-4 py-3 bg-surface-base text-text-primary border border-border-subtle hover:bg-surface-hover text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </button>
          </div>
          <div className="bg-surface-base rounded-lg p-3 w-full overflow-x-auto text-left border border-border-subtle mb-2">
             <p className="text-xs text-text-muted font-mono break-all whitespace-pre-wrap select-all">
               {remediation.url}
             </p>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Clique no botão acima ou copie a URL para o seu navegador, crie o índice no Console do Google, aguarde a construção e tentar novamente.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium text-text-primary mb-2">Dados indisponíveis</h3>
          <p className="text-sm text-text-muted mb-6">
            Esta consulta está temporariamente indisponível devido a infraestrutura. Tente novamente mais tarde.
          </p>
          <button 
            onClick={onRetry} 
            className="flex items-center justify-center px-4 py-3 bg-surface-base text-text-primary border border-border-subtle hover:bg-surface-hover text-sm font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary mb-4 w-full"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </button>
        </>
      )}

      {requestId && (
        <p className="text-xs text-text-muted mt-6 font-mono break-all max-w-full opacity-60">
          Req ID: {requestId}
        </p>
      )}
    </div>
  );
};

