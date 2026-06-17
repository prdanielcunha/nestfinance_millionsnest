import React, { useState } from 'react';
import { ArrowLeft, Save, Calendar, FileText, CheckCircle2, Shield, AlertCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { firebaseAuth } from '@/src/lib/firebase';

export default function SetupPage() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [fiscalMonthStartDay, setFiscalMonthStartDay] = useState(1);
  
  const [contributionEntryMode, setContributionEntryMode] = useState<'aggregate' | 'anonymous_items' | 'identified_items' | 'mixed'>('aggregate');
  const [identifiedContributionsEnabled, setIdentifiedContributionsEnabled] = useState(false);
  
  const [requireTwoCounters, setRequireTwoCounters] = useState(true);
  const [requireDistinctCounters, setRequireDistinctCounters] = useState(true);
  const [requireIndependentCount, setRequireIndependentCount] = useState(true);
  
  const [requireClosingApproval, setRequireClosingApproval] = useState(true);
  const [allowAssistedEntry, setAllowAssistedEntry] = useState(true);
  const [prohibitSelfApproval, setProhibitSelfApproval] = useState(true);

  const handleEntryModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const validMode = e.target.value as typeof contributionEntryMode;
    setContributionEntryMode(validMode);
    if (validMode === 'aggregate' || validMode === 'anonymous_items') {
      setIdentifiedContributionsEnabled(false);
    }
  };

  const isIdentifiedDisabled = contributionEntryMode === 'aggregate' || contributionEntryMode === 'anonymous_items';

  const handleSubmit = async () => {
    if (loading || success) return;
    setError(null);
    setLoading(true);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Acesso não autenticado');

      const token = await user.getIdToken(true);

      const payload = {
        timezone,
        fiscalYearStartMonth,
        fiscalMonthStartDay,
        contributionEntryMode,
        identifiedContributionsEnabled,
        requireTwoCounters,
        requireDistinctCounters,
        requireIndependentCount,
        requireClosingApproval,
        allowAssistedEntry,
        prohibitSelfApproval
      };

      const res = await fetch('/api/finance/setup/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 201 || res.status === 409) {
        setSuccess(true);
        // Force full page reload to re-run session resolution and redirect to finance
        window.location.assign(APP_ROUTES.finance);
        return;
      }
      
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Erro de comunicação: ${res.status}`);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Falha ao salvar configuração.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full fade-in max-w-2xl mx-auto py-8 px-4 sm:px-0">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(APP_ROUTES.finance)}
            disabled={loading}
            className="p-2 rounded-full hover:bg-surface-secondary text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight">Assistente de Configuração</h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || success}
          className="flex items-center justify-center gap-2 bg-text-primary text-background-base px-5 py-2.5 rounded-full text-sm font-medium transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 min-w-[140px]"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-background-base border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              Confirmar
            </>
          )}
        </button>
      </header>

      {error ? (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-500 font-medium">{error}</p>
        </div>
      ) : null}
      
      <div className="flex-1 space-y-6 pb-20">
        
        {/* 1. Calendário e período */}
        <section className="bg-surface-secondary border border-border-subtle rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
            <div className="p-2 bg-surface-elevated rounded-lg">
              <Calendar className="w-5 h-5 text-text-secondary" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">1. Calendário e período</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5 flex flex-col">
              <label className="text-sm font-medium text-text-primary">Fuso Horário</label>
              <select 
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={loading}
                className="w-full bg-surface-base border border-border-subtle rounded-xl px-4 py-3 h-[44px] text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary/20 appearance-none"
              >
                <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                <option value="America/Manaus">America/Manaus (AMT)</option>
                <option value="America/Bahia">America/Bahia (BRT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            
            <div className="space-y-1.5 flex flex-col">
              <label className="text-sm font-medium text-text-primary">Mês de início do ano fiscal</label>
              <select 
                value={fiscalYearStartMonth}
                onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
                disabled={loading}
                className="w-full bg-surface-base border border-border-subtle rounded-xl px-4 py-3 h-[44px] text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary/20 appearance-none"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>Mês {num}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 flex flex-col">
              <label className="text-sm font-medium text-text-primary">Dia de início do mês fiscal</label>
              <input 
                type="number"
                min="1"
                max="28"
                value={fiscalMonthStartDay}
                onChange={(e) => setFiscalMonthStartDay(Number(e.target.value))}
                disabled={loading}
                className="w-full bg-surface-base border border-border-subtle rounded-xl px-4 py-3 h-[44px] text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary/20"
              />
            </div>
          </div>
        </section>

        {/* 2. Registro de contribuições */}
        <section className="bg-surface-secondary border border-border-subtle rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
            <div className="p-2 bg-surface-elevated rounded-lg">
              <FileText className="w-5 h-5 text-text-secondary" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">2. Registro de contribuições</h2>
          </div>
          
          <div className="space-y-5">
            <div className="space-y-1.5 flex flex-col">
              <label className="text-sm font-medium text-text-primary">Modo de registro de entrada</label>
              <select 
                value={contributionEntryMode}
                onChange={handleEntryModeChange}
                disabled={loading}
                className="w-full bg-surface-base border border-border-subtle rounded-xl px-4 py-3 h-[44px] text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-text-primary/20 appearance-none"
              >
                <option value="aggregate">Agregado (apenas totais)</option>
                <option value="anonymous_items">Itens anônimos (valores avulsos sem nome)</option>
                <option value="identified_items">Itens identificados (valores vinculados a pessoas)</option>
                <option value="mixed">Misto</option>
              </select>
            </div>

            <label className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${loading ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'} border-border-subtle`}>
              <div className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={identifiedContributionsEnabled}
                  onChange={(e) => setIdentifiedContributionsEnabled(e.target.checked)}
                  disabled={loading || isIdentifiedDisabled}
                  className="h-5 w-5 rounded border-border-subtle text-text-primary focus:ring-text-primary/20 bg-surface-base"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">Ativar perfis rastreáveis</span>
                <span className="text-xs text-text-secondary mt-0.5">Permite vincular doadores e manter histórico nominal. Bloqueado em modos anônimos.</span>
              </div>
            </label>
          </div>
        </section>

        {/* 3. Política de contagem */}
        <section className="bg-surface-secondary border border-border-subtle rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
            <div className="p-2 bg-surface-elevated rounded-lg">
              <Users className="w-5 h-5 text-text-secondary" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">3. Política de contagem</h2>
          </div>
          
          <div className="space-y-3">
            <label className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${loading ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'} border-border-subtle`}>
              <div className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={requireTwoCounters}
                  onChange={(e) => setRequireTwoCounters(e.target.checked)}
                  disabled={loading}
                  className="h-5 w-5 rounded border-border-subtle text-text-primary focus:ring-text-primary/20 bg-surface-base"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">Exigir dois contadores</span>
                <span className="text-xs text-text-secondary mt-0.5">O processo de contagem financeira exigirá a participação de duas pessoas.</span>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${loading ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'} border-border-subtle`}>
              <div className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={requireDistinctCounters}
                  onChange={(e) => setRequireDistinctCounters(e.target.checked)}
                  disabled={loading || !requireTwoCounters}
                  className="h-5 w-5 rounded border-border-subtle text-text-primary focus:ring-text-primary/20 bg-surface-base"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">Contadores distintos obrigatórios</span>
                <span className="text-xs text-text-secondary mt-0.5">Não permite que a mesma pessoa atue nas duas etapas (conferência 1 e 2).</span>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${loading ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'} border-border-subtle`}>
              <div className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={requireIndependentCount}
                  onChange={(e) => setRequireIndependentCount(e.target.checked)}
                  disabled={loading || !requireTwoCounters}
                  className="h-5 w-5 rounded border-border-subtle text-text-primary focus:ring-text-primary/20 bg-surface-base"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">Contagem cega (independente)</span>
                <span className="text-xs text-text-secondary mt-0.5">O segundo contador não vê os resultados do primeiro antes de confirmar.</span>
              </div>
            </label>
          </div>
        </section>

        {/* 4. Aprovação */}
        <section className="bg-surface-secondary border border-border-subtle rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
            <div className="p-2 bg-surface-elevated rounded-lg">
              <Shield className="w-5 h-5 text-text-secondary" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">4. Aprovação e auditoria</h2>
          </div>
          
          <div className="space-y-3">
            <label className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${loading ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'} border-border-subtle`}>
              <div className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={requireClosingApproval}
                  onChange={(e) => setRequireClosingApproval(e.target.checked)}
                  disabled={loading}
                  className="h-5 w-5 rounded border-border-subtle text-text-primary focus:ring-text-primary/20 bg-surface-base"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">Aprovação de fechamento exigida</span>
                <span className="text-xs text-text-secondary mt-0.5">Lotes de fechamento precisam de um aval de um gestor financeiro ou supervisor.</span>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${loading ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'} border-border-subtle`}>
              <div className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={allowAssistedEntry}
                  onChange={(e) => setAllowAssistedEntry(e.target.checked)}
                  disabled={loading}
                  className="h-5 w-5 rounded border-border-subtle text-text-primary focus:ring-text-primary/20 bg-surface-base"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">Permitir entrada assistida (lançamento retroativo)</span>
                <span className="text-xs text-text-secondary mt-0.5">Administradores podem lançar registros passados sem afetar estritamente o caixa corrente de forma atômica imediata.</span>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${loading ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'} border-border-subtle`}>
              <div className="flex h-6 items-center">
                <input
                  type="checkbox"
                  checked={prohibitSelfApproval}
                  onChange={(e) => setProhibitSelfApproval(e.target.checked)}
                  disabled={loading}
                  className="h-5 w-5 rounded border-border-subtle text-text-primary focus:ring-text-primary/20 bg-surface-base"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">Proibir auto-aprovação</span>
                <span className="text-xs text-text-secondary mt-0.5">O autor do fechamento não pode aprovar seu próprio lote, mesmo tendo permissão gerencial.</span>
              </div>
            </label>
          </div>
        </section>

      </div>
    </div>
  );
}
