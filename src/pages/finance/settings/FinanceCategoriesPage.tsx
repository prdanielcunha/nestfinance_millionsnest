import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, AlertCircle, Bookmark, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';
import CategoryFormModal from '@/src/components/finance/CategoryFormModal';

interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  accountingCode?: string;
  active: boolean;
}

type TabType = 'all' | 'income' | 'expense';

export default function FinanceCategoriesPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Não autenticado');

      const token = await user.getIdToken();

      const res = await fetch('/api/finance/categories/list', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Falha ao carregar categorias');
      }

      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err: any) {
      setError('Não foi possível carregar as categorias financeiras. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const incomeCategories = categories.filter(c => c.kind === 'income');
  const expenseCategories = categories.filter(c => c.kind === 'expense');

  const filteredCategories = categories.filter(c => {
    if (activeTab === 'income') return c.kind === 'income';
    if (activeTab === 'expense') return c.kind === 'expense';
    return true;
  });

  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-base px-4 py-4 flex flex-col gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(APP_ROUTES.finance)}
            className="p-1.5 -ml-1.5 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-medium tracking-tight text-text-base">Categorias Financeiras</h1>
            <p className="text-sm text-text-muted mt-0.5">Defina a classificação de entradas e saídas da sua organização.</p>
          </div>
        </div>
      </header>

      {/* Difference helper Banner */}
      <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20 text-xs md:text-sm text-blue-400 flex gap-2.5 items-start">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong className="text-white block font-medium mb-0.5 font-sans">Diferença Conceitual no NestFinance:</strong>
          <ul className="list-disc pl-4 space-y-1 mt-1 text-xs text-text-muted">
            <li><strong className="text-blue-300">Contas:</strong> Onde o dinheiro está guardado (ex: Caixas físicos, Contas Bancárias).</li>
            <li><strong className="text-blue-300">Fundos:</strong> A finalidade/destinação do dinheiro (ex: Geral, Missões, Construção).</li>
            <li><strong className="text-blue-300">Categorias:</strong> A natureza de cada entrada (ex: Dízimos, Ofertas) ou saída (ex: Energia, Água).</li>
          </ul>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6 font-sans">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 h-64">
            <div className="w-8 h-8 rounded-full border-4 border-surface-elevated border-t-accent-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center max-w-md mx-auto">
            <p className="text-red-500 text-sm">{error}</p>
            <button 
              onClick={fetchCategories}
              className="mt-3 text-sm text-red-500 font-medium hover:underline min-h-[44px] px-4"
            >
              Tentar novamente
            </button>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 h-64 text-center bg-surface-elevated rounded-2xl border border-border-subtle border-dashed max-w-md mx-auto mt-6">
            <div className="w-12 h-12 bg-surface-base rounded-full flex items-center justify-center mb-4 text-text-muted border border-border-subtle">
              <Bookmark className="w-6 h-6" />
            </div>
            <h3 className="text-text-base font-medium mb-2">Cadastre as primeiras categorias</h3>
            <p className="text-text-muted text-sm max-w-sm mb-6 leading-relaxed">
              Categorias identificam a natureza das entradas e saídas, como Dízimos, Ofertas, Energia e Manutenção.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center h-11 px-5 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-hover transition-colors active:scale-[0.98] min-h-[44px]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Categoria
            </button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Quick Stats Counter Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-elevated border border-border-subtle rounded-xl p-3 md:p-4 text-center">
                <span className="text-xs text-text-muted block uppercase tracking-wider font-semibold">Total</span>
                <span className="text-xl md:text-2xl font-bold text-text-base mt-1 block">{categories.length}</span>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 md:p-4 text-center">
                <span className="text-xs text-emerald-500/70 block uppercase tracking-wider font-semibold">Entradas</span>
                <span className="text-xl md:text-2xl font-bold text-emerald-400 mt-1 block">{incomeCategories.length}</span>
              </div>
              <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-3 md:p-4 text-center">
                <span className="text-xs text-rose-500/70 block uppercase tracking-wider font-semibold">Saídas</span>
                <span className="text-xl md:text-2xl font-bold text-rose-400 mt-1 block">{expenseCategories.length}</span>
              </div>
            </div>

            {/* Segmented view controls & Nova Categoria Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
              {/* Segmented Tabs (Min touch targets 44px) */}
              <div className="flex bg-surface-elevated p-1 rounded-xl border border-border-subtle self-start">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all min-h-[44px] ${
                    activeTab === 'all'
                      ? 'bg-surface-base text-text-base shadow-sm border border-border-subtle'
                      : 'text-text-muted hover:text-text-base border border-transparent'
                  }`}
                >
                  Todas ({categories.length})
                </button>
                <button
                  onClick={() => setActiveTab('income')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all min-h-[44px] ${
                    activeTab === 'income'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-text-muted hover:text-text-base border border-transparent'
                  }`}
                >
                  Entradas ({incomeCategories.length})
                </button>
                <button
                  onClick={() => setActiveTab('expense')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all min-h-[44px] ${
                    activeTab === 'expense'
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : 'text-text-muted hover:text-text-base border border-transparent'
                  }`}
                >
                  Saídas ({expenseCategories.length})
                </button>
              </div>

              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center justify-center h-11 px-4 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-hover transition-colors active:scale-[0.98] min-h-[44px]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nova Categoria
              </button>
            </div>

            {/* List with styled cards */}
            <div className="grid gap-3">
              {filteredCategories.length === 0 ? (
                <div className="text-center p-8 bg-surface-elevated rounded-xl border border-border-subtle text-text-muted text-sm">
                  Nenhuma categoria cadastrada nessa natureza.
                </div>
              ) : (
                filteredCategories.map((category) => {
                  const isIncome = category.kind === 'income';
                  return (
                    <div 
                      key={category.id}
                      className="bg-surface-elevated border border-border-subtle rounded-xl p-4 flex items-center justify-between gap-4 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                          isIncome 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                          {isIncome ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-base font-medium text-text-base truncate">
                            {category.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5 text-xs">
                            <span className={`font-medium ${isIncome ? 'text-emerald-500/90' : 'text-rose-500/90'}`}>
                              {isIncome ? 'Entrada / Receita' : 'Saída / Despesa'}
                            </span>
                            {category.accountingCode && (
                              <>
                                <span className="text-border-strong">•</span>
                                <span className="font-mono text-text-muted bg-surface-base px-1.5 py-0.5 rounded border border-border-subtle" title="Código Contábil">
                                  {category.accountingCode}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quiet active indicator */}
                      <span className="text-xs font-mono font-medium text-text-muted bg-surface-base px-2 py-1 rounded-full border border-border-subtle">
                        {category.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {isModalOpen && (
        <CategoryFormModal 
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchCategories();
          }}
        />
      )}
    </div>
  );
}
