import React from 'react';
import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';

export interface FirestoreIndexRemediationProps {
  remediation?: { type: string; url?: string };
  requestId?: string;
  onRetry: () => void;
}

export const FirestoreIndexRemediationCard: React.FC<FirestoreIndexRemediationProps> = ({ remediation, requestId, onRetry }) => {
  const isGlobalAdmin = remediation && remediation.type === 'CREATE_FIRESTORE_INDEX' && remediation.url;

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto my-12 bg-gray-50 rounded-lg border border-gray-200">
      <AlertCircle className="h-10 w-10 text-orange-500 mb-4" />
      
      {isGlobalAdmin && remediation.url ? (
        <>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Índice necessário</h3>
          <p className="text-sm text-gray-600 mb-6">
            Esta consulta precisa de um índice do Firestore para funcionar com rapidez e segurança.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center mb-4">
            <button
              onClick={() => window.open(remediation.url, '_blank', 'noopener,noreferrer')}
              className="flex items-center justify-center px-4 py-2 bg-text-primary text-surface-base hover:bg-text-primary/90 text-sm font-medium rounded-lg transition-colors w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              Criar índice no Firebase
              <ExternalLink className="ml-2 h-4 w-4" />
            </button>
            <button 
              onClick={onRetry} 
              className="flex items-center justify-center px-4 py-2 bg-surface-base text-text-primary border border-border-subtle hover:bg-surface-elevated text-sm font-medium rounded-lg transition-colors w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Depois de criar o índice, aguarde a conclusão da construção e tente novamente.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Dados indisponíveis</h3>
          <p className="text-sm text-gray-600 mb-6">
            Esta consulta está temporariamente indisponível. A equipe responsável pode corrigir a configuração.
          </p>
          <button 
            onClick={onRetry} 
            className="flex items-center justify-center px-4 py-2 bg-surface-base text-text-primary border border-border-subtle hover:bg-surface-elevated text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary mb-4"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </button>
        </>
      )}

      {requestId && (
        <p className="text-xs text-gray-400 mt-4 font-mono break-all max-w-full">
          Código de suporte: {requestId}
        </p>
      )}
    </div>
  );
};
