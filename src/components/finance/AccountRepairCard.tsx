import React, { useState } from 'react';
import { AlertCircle, Wrench, CheckCircle } from 'lucide-react';
import { firebaseAuth } from '@/src/lib/firebase';

interface Props {
  account: {
    id: string;
    name: string;
    templateKey?: string | null;
    type?: string;
    nature?: string;
    configurationStatus?: string;
  };
  financeEntityId: string;
  onRepaired: (repairedAccount: any) => void;
}

export default function AccountRepairCard({ account, financeEntityId, onRepaired }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isIncomplete = account.configurationStatus !== 'complete' || !account.type || !account.nature;

  if (!isIncomplete) return null;

  const CANONICAL_TEMPLATES: Record<string, { type: string; nature: string; typeLabel: string; natureLabel: string }> = {
    'church.account.cash': {
      type: 'cash',
      nature: 'asset',
      typeLabel: 'Caixa (Físico)',
      natureLabel: 'Ativo'
    },
    'church.account.checking': {
      type: 'bank_checking',
      nature: 'asset',
      typeLabel: 'Conta Corrente',
      natureLabel: 'Ativo'
    },
    'church.account.savings': {
      type: 'bank_savings',
      nature: 'asset',
      typeLabel: 'Poupança',
      natureLabel: 'Ativo'
    },
    'church.account.digital_wallet': {
      type: 'payment_account',
      nature: 'asset',
      typeLabel: 'Carteira Digital',
      natureLabel: 'Ativo'
    }
  };

  const isCanonical = !!account.templateKey && !!CANONICAL_TEMPLATES[account.templateKey];
  const suggested = account.templateKey ? CANONICAL_TEMPLATES[account.templateKey] : null;

  const handleRepair = async () => {
    if (loading) return;
    try {
      setLoading(true);
      setError(null);

      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Não autenticado');
      const token = await user.getIdToken();

      const res = await fetch('/api/finance-gateway?operation=accounts-repair-canonical', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          financeEntityId,
          accountIds: [account.id]
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Erro ao reparar conta');
      }

      const data = await res.json();
      const repairResult = data.results?.[0];

      if (repairResult && repairResult.status === 'repaired' && suggested) {
        setSuccess(true);
        setTimeout(() => {
          onRepaired({
            ...account,
            type: suggested.type,
            nature: suggested.nature,
            configurationStatus: 'complete'
          });
        }, 800);
      } else if (repairResult && repairResult.status === 'already_complete' && suggested) {
        setSuccess(true);
        setTimeout(() => {
          onRepaired({
            ...account,
            type: suggested.type,
            nature: suggested.nature,
            configurationStatus: 'complete'
          });
        }, 800);
      } else {
        throw new Error('Falha ao aplicar reparo automático');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2.5 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col gap-3">
      <div className="flex items-start gap-2.5 text-amber-500">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-text-primary">
            {account.name} <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-medium ml-1">Pendente de Configuração</span>
          </h4>
          <p className="text-xs text-text-muted mt-1">
            Esta conta é de um modelo padrão do sistema, mas não foi totalmente configurada. Ela precisa de um Tipo e Natureza para processar transações.
          </p>
        </div>
      </div>

      {isCanonical && suggested ? (
        <div className="bg-surface-elevated/40 border border-border-subtle/50 rounded-lg p-3 text-xs flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 text-text-muted">
            <div>
              <span className="font-semibold text-text-primary block mb-0.5">Valores Atuais</span>
              Tipo: <span className="text-text-secondary">{account.type || 'Não definido'}</span> <br />
              Natureza: <span className="text-text-secondary">{account.nature || 'Não definido'}</span>
            </div>
            <div>
              <span className="font-semibold text-text-primary block mb-0.5">Valores Recomendados</span>
              Tipo: <span className="text-text-secondary">{suggested.typeLabel}</span> <br />
              Natureza: <span className="text-text-secondary">{suggested.natureLabel}</span>
            </div>
          </div>

          {error && (
            <p className="text-red-500 font-medium">{error}</p>
          )}

          {success ? (
            <div className="flex items-center gap-1.5 text-green-500 font-medium mt-1">
              <CheckCircle className="w-4 h-4" /> Conta configurada com sucesso!
            </div>
          ) : (
            <button
              type="button"
              onClick={handleRepair}
              disabled={loading}
              className="mt-1 self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Wrench className="w-3.5 h-3.5" />
              {loading ? 'Configurando...' : 'Apenas Corrigir e Concluir'}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface-elevated/40 border border-border-subtle/50 rounded-lg p-3 text-xs flex flex-col gap-1.5">
          <p className="text-text-muted">
            Esta é uma conta personalizada e requer configuração manual. Vá até a lista de contas para definir o Tipo e Natureza.
          </p>
        </div>
      )}
    </div>
  );
}
