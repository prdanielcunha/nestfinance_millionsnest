import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderHeart, Plus, ArrowLeft, AlertCircle } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';
import FundFormModal from '@/src/components/finance/FundFormModal';

interface Fund {
  id: string;
  name: string;
  restricted: boolean;
  colorToken: 'slate' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose';
  active: boolean;
}

export default function FinanceFundsPage() {
  const navigate = useNavigate();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchFunds();
  }, []);

  const fetchFunds = async () => {
    try {
      setLoading(true);
      setError(null);
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Não autenticado');

      const token = await user.getIdToken();

      const res = await fetch('/api/finance/funds/list', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Falha ao carregar fundos');
      }

      const data = await res.json();
      setFunds(data.funds || []);
    } catch (err: any) {
      setError('Não foi possível carregar os fundos financeiros. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return {
          bg: 'bg-blue-500/10',
          text: 'text-blue-500',
          border: 'border-blue-500/20',
          indicator: 'bg-blue-500'
        };
      case 'emerald':
        return {
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-500',
          border: 'border-emerald-500/20',
          indicator: 'bg-emerald-500'
        };
      case 'amber':
        return {
          bg: 'bg-amber-500/10',
          text: 'text-amber-500',
          border: 'border-amber-500/20',
          indicator: 'bg-amber-500'
        };
      case 'violet':
        return {
          bg: 'bg-violet-500/10',
          text: 'text-violet-500',
          border: 'border-violet-500/20',
          indicator: 'bg-violet-500'
        };
      case 'rose':
        return {
          bg: 'bg-rose-500/10',
          text: 'text-rose-500',
          border: 'border-rose-500/20',
          indicator: 'bg-rose-500'
        };
      default:
        return {
          bg: 'bg-zinc-500/10',
          text: 'text-zinc-400',
          border: 'border-zinc-800',
          indicator: 'bg-zinc-500'
        };
    }
  };

  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-base px-4 py-4 flex flex-col gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(APP_ROUTES.finance)}
            className="p-1.5 -ml-1.5 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-medium tracking-tight text-text-base">Fundos Financeiros</h1>
            <p className="text-sm text-text-muted mt-0.5">Defina as finalidades e restrições dos destinos dos recursos.</p>
          </div>
        </div>
      </header>

      {/* Difference helper Banner */}
      <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20 text-xs md:text-sm text-blue-400 flex gap-2.5 items-start">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong className="text-white block font-medium mb-0.5">Diferença entre Conta e Fundo:</strong>
          Uma <strong>conta</strong> representa onde o dinheiro está fisicamente guardado (ex: Caixas físicos, Contas Bancárias), enquanto um <strong>fundo</strong> representa a qual finalidade ou restrição aquele dinheiro se destina (ex: Caixa Geral, Missões, Construção). Não confunda um com o outro!
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 h-64">
            <div className="w-8 h-8 rounded-full border-4 border-surface-elevated border-t-accent-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center max-w-md mx-auto">
            <p className="text-red-500 text-sm">{error}</p>
            <button 
              onClick={fetchFunds}
              className="mt-3 text-sm text-red-500 font-medium hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : funds.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 h-64 text-center bg-surface-elevated rounded-2xl border border-border-subtle border-dashed max-w-md mx-auto mt-6">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted">
              <FolderHeart className="w-6 h-6" />
            </div>
            <h3 className="text-text-base font-medium mb-2">Cadastre o primeiro fundo</h3>
            <p className="text-text-muted text-sm max-w-sm mb-6">
              Fundos ajudam a separar recursos livres de valores destinados a finalidades específicas.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center h-11 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Fundo
            </button>
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
                {funds.length} {funds.length === 1 ? 'Fundo' : 'Fundos'}
              </h2>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center justify-center py-2 px-3 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover transition-colors active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Novo Fundo
              </button>
            </div>

            <div className="grid gap-3">
              {funds.map((fund) => {
                const colors = getColorClasses(fund.colorToken);
                return (
                  <div 
                    key={fund.id}
                    className="bg-surface-elevated border border-border-subtle rounded-xl p-4 flex items-center gap-4 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-full ${colors.bg} ${colors.border} flex items-center justify-center shrink-0 border`}>
                      <FolderHeart className={`w-5 h-5 ${colors.text}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-medium text-text-base truncate">
                          {fund.name}
                        </h3>
                        <span className={`w-2 h-2 rounded-full ${colors.indicator}`} title={`Cor: ${fund.colorToken}`} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-sm text-text-muted">
                        <span>{fund.restricted ? 'Destinado (Restrito)' : 'Livre'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {isModalOpen && (
        <FundFormModal 
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchFunds();
          }}
        />
      )}
    </div>
  );
}
