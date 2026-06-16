/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from './hooks/useAuth';
import { config } from './config/env';
import { Shield } from 'lucide-react';

export default function App() {
  const { authState } = useAuth();
  
  // Basic routing check for handoff
  const isHandoffRoute = window.location.pathname.startsWith('/auth/handoff');
  
  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans selection:bg-cyan-900/30">
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
          
          <div className="h-16 w-16 bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-800 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <Shield className="w-8 h-8 text-cyan-500" />
          </div>
          
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight mb-1">{config.appName}</h1>
            <p className="text-sm text-gray-500 uppercase tracking-widest font-medium">Parte do ecossistema {config.platformName}</p>
          </div>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-4" />

          {authState === 'initializing' && (
            <p className="text-sm text-gray-400 animate-pulse">
              Verificando identidade segura...
            </p>
          )}

          {authState === 'unauthenticated' && !isHandoffRoute && (
            <div className="flex flex-col items-center space-y-4 w-full">
              <p className="text-gray-400 text-sm">
                Entre pelo Hub MillionsNest para acessar o NestFinance.
              </p>
              <button 
                disabled
                className="mt-4 px-6 py-2.5 bg-[#111] hover:bg-[#1a1a1a] border border-gray-800 rounded-lg text-sm font-medium transition-colors text-gray-300 w-full sm:w-auto opacity-70 cursor-not-allowed"
              >
                Voltar ao MillionsNest
              </button>
            </div>
          )}

          {authState === 'error' && (
            <p className="text-sm text-red-500">
              Ocorreu um erro ao verificar o estado de segurança.
            </p>
          )}

          {authState === 'authenticated' && !isHandoffRoute && (
            <p className="text-sm text-cyan-500">
              Autenticado com segurança. A inicialização financeira está suspensa nesta fase.
            </p>
          )}
          
          {isHandoffRoute && (
            <div className="flex flex-col items-center space-y-4">
              <p className="text-sm text-gray-400">
                Integração segura com o {config.platformName} ainda não configurada.
              </p>
              <p className="text-xs text-gray-600 font-mono">
                Aguardando contrato de handoff
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
