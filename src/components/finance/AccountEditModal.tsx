import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { updateAccount } from '@/src/services/accountsService';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

interface FinanceAccount {
  id: string;
  name: string;
  type: string;
  institutionName?: string;
  accountLast4?: string;
  currency: string;
  active: boolean;
  openingBalanceCents?: number;
  openingBalanceRevision?: number;
  openingBalanceDeclaration?: null | {
    status: 'not_informed' | 'pending_review' | 'confirmed';
    amountCents?: number;
    asOf?: string;
    source?: 'bank_statement' | 'cash_count' | 'prior_records' | 'other';
    sourceNote?: string;
  };
}

const OPENING_EDIT_COPY = {
  PT: { title: 'Corrigir saldo inicial informado', description: 'A correção guardará a versão anterior. Não altera saldo, extrato ou razão.', toggle: 'Preciso corrigir a abertura desta conta', unknown: 'Saldo ainda desconhecido', informed: 'Informar saldo com data e origem', amount: 'Valor na data (R$)', asOf: 'Data do saldo', source: 'Origem', bank: 'Extrato bancário', cash: 'Contagem do caixa', prior: 'Registros anteriores', other: 'Outra origem', note: 'Detalhes da origem', reason: 'Por que corrigir? (obrigatório)', example: 'Ex.: conferência do extrato pela tesouraria', invalid: 'Verifique valor, data, origem e justificativa.', conflict: 'Outra pessoa alterou esta abertura. Feche e reabra a conta antes de tentar novamente.', legacy: 'Saldo legado: a correção exige conciliação especializada e não pode ser feita aqui.', locked: 'A abertura está bloqueada para edição; solicite a revisão profissional.' },
  EN: { title: 'Correct opening balance declaration', description: 'The previous version is kept. This does not change balances, statements or the ledger.', toggle: 'I need to correct this account opening', unknown: 'Balance still unknown', informed: 'Enter amount, date and source', amount: 'Amount at date (BRL)', asOf: 'Balance date', source: 'Source', bank: 'Bank statement', cash: 'Cash count', prior: 'Previous records', other: 'Other source', note: 'Source details', reason: 'Why is this correction needed? (required)', example: 'e.g. treasury statement reconciliation', invalid: 'Check amount, date, source and reason.', conflict: 'Another person edited this opening. Close and reopen the account before retrying.', legacy: 'Legacy balance: professional reconciliation is required; it cannot be corrected here.', locked: 'This opening is locked; request professional review.' },
  ES: { title: 'Corregir declaración de saldo inicial', description: 'Se conserva la versión anterior. No altera saldos, extractos ni libro contable.', toggle: 'Necesito corregir la apertura de esta cuenta', unknown: 'Saldo todavía desconocido', informed: 'Informar importe, fecha y origen', amount: 'Importe en la fecha (BRL)', asOf: 'Fecha del saldo', source: 'Origen', bank: 'Extracto bancario', cash: 'Recuento de caja', prior: 'Registros anteriores', other: 'Otro origen', note: 'Detalles del origen', reason: '¿Por qué corregir? (obligatorio)', example: 'P. ej., conciliación del extracto por tesorería', invalid: 'Compruebe importe, fecha, origen y motivo.', conflict: 'Otra persona cambió la apertura. Cierre y vuelva a abrir la cuenta para intentarlo.', legacy: 'Saldo anterior: requiere conciliación profesional y no se puede corregir aquí.', locked: 'La apertura está bloqueada; solicite una revisión profesional.' },
} as const;

function openingAsReais(amountCents: number | undefined): string {
  if (!Number.isSafeInteger(amountCents)) return '';
  const cents = Math.abs(amountCents!);
  return (amountCents! < 0 ? '-' : '') + Math.floor(cents / 100) + ',' + String(cents % 100).padStart(2,'0');
}

interface AccountEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedAccount: FinanceAccount) => void;
  account: FinanceAccount;
}

export function AccountEditModal({ isOpen, onClose, onSuccess, account }: AccountEditModalProps) {
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const w = OPENING_EDIT_COPY[language];
  const [name, setName] = useState(account.name);
  const [institutionName, setInstitutionName] = useState(account.institutionName || '');
  const [accountLast4, setAccountLast4] = useState(account.accountLast4 || '');
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingMode, setOpeningMode] = useState<'not_informed' | 'declared'>(
    account.openingBalanceDeclaration?.status === 'pending_review' ? 'declared' : 'not_informed');
  const [openingAmount, setOpeningAmount] = useState(openingAsReais(account.openingBalanceDeclaration?.amountCents));
  const [openingDate, setOpeningDate] = useState(account.openingBalanceDeclaration?.asOf || '');
  const [openingSource, setOpeningSource] = useState<'bank_statement' | 'cash_count' | 'prior_records' | 'other'>(
    account.openingBalanceDeclaration?.source || 'bank_statement');
  const [openingSourceNote, setOpeningSourceNote] = useState(account.openingBalanceDeclaration?.sourceNote || '');
  const [openingReason, setOpeningReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(account.name);
      setInstitutionName(account.institutionName || '');
      setAccountLast4(account.accountLast4 || '');
      setEditingOpening(false);
      setOpeningMode(account.openingBalanceDeclaration?.status === 'pending_review' ? 'declared' : 'not_informed');
      setOpeningAmount(openingAsReais(account.openingBalanceDeclaration?.amountCents));
      setOpeningDate(account.openingBalanceDeclaration?.asOf || '');
      setOpeningSource(account.openingBalanceDeclaration?.source || 'bank_statement');
      setOpeningSourceNote(account.openingBalanceDeclaration?.sourceNote || '');
      setOpeningReason('');
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, account]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome da conta não pode ficar vazio.');
      return;
    }

    if (accountLast4 && accountLast4.trim() !== '') {
      if (!/^\d{4}$/.test(accountLast4.trim())) {
        setError('O final da conta deve ter exatamente 4 números.');
        return;
      }
    }

    setError('');
    setIsSubmitting(true);
    try {
      if (!activeFinanceEntityId) throw new Error('Organização financeira não selecionada.');
      const payload: Parameters<typeof updateAccount>[0] = {
        accountId: account.id,
        name: name.trim(),
        institutionName: institutionName.trim() === '' ? null : institutionName.trim(),
        accountLast4: accountLast4.trim() === '' ? null : accountLast4.trim(),
        financeEntityId: activeFinanceEntityId,
      };
      if (editingOpening) {
        if (openingReason.trim().length < 10 || openingReason.trim().length > 240) {
          throw new Error(w.invalid);
        }
        payload.expectedOpeningBalanceRevision = account.openingBalanceRevision ?? 0;
        payload.openingBalanceReason = openingReason.trim();
        if (openingMode === 'not_informed') {
          payload.openingBalanceDeclaration = { status: 'not_informed' };
        } else {
          const amount = openingAmount.trim().replace(',', '.');
          if (!/^-?\d{1,10}(?:\.\d{1,2})?$/.test(amount) || !openingDate) {
            throw new Error(w.invalid);
          }
          if (openingSource==='other' && openingSourceNote.trim().length<5) {
            throw new Error(w.invalid);
          }
          const [whole, fraction=''] = amount.split('.');
          const sign = whole.startsWith('-') ? -1 : 1;
          const cents = sign * (Math.abs(Number(whole))*100 + Number(fraction.padEnd(2,'0')));
          if (!Number.isSafeInteger(cents) || Math.abs(cents)>999_999_999_999) {
            throw new Error(w.invalid);
          }
          payload.openingBalanceDeclaration = {
            status:'declared', amountCents:cents, asOf:openingDate,
            source:openingSource, ...(openingSource==='other'?{sourceNote:openingSourceNote.trim()}:{}),
          };
        }
      }
      const response = await updateAccount(payload);
      onSuccess(response.account);
      onClose();
    } catch (err: any) {
      const code = String(err?.message || '');
      setError(code === 'OPENING_BALANCE_VERSION_CONFLICT' ? w.conflict
        : code === 'OPENING_BALANCE_LEGACY_RECONCILIATION_REQUIRED' ? w.legacy
        : code === 'OPENING_BALANCE_LOCKED' ? w.locked
        : code.startsWith('INVALID_OPENING_BALANCE_') ? w.invalid
        : err.message || 'Não foi possível atualizar a conta. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  const getTypeNameString = (type: string) => {
    switch (type) {
      case 'cash': return 'Caixa físico';
      case 'checking': return 'Conta corrente';
      case 'savings': return 'Conta poupança';
      case 'digital_wallet': return 'Carteira digital';
      default: return 'Outros';
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={isSubmitting ? undefined : onClose}
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50 pointer-events-none">
        
        {/* Mobile Bottom Sheet & Desktop Modal */}
        <div className="w-full bg-surface-default md:w-[480px] md:rounded-2xl md:shadow-lg pointer-events-auto flex flex-col md:max-h-[90vh] rounded-t-2xl shadow-2xl relative max-h-[90vh]">
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
            <h2 className="text-lg font-semibold text-text-primary">Editar Conta</h2>
            <button 
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 -mr-2 text-text-tertiary hover:text-text-primary rounded-full hover:bg-white/[0.05] transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form id="account-edit-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500 max-w-full">
                {error}
              </div>
            )}
            
            <p className="text-sm text-text-secondary">
              Você pode alterar o nome e os dados de identificação. O tipo da conta será preservado para manter o histórico correto.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium tracking-tight text-text-primary mb-1.5 ml-1">
                  Nome da conta *
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full h-11 px-3.5 bg-surface-secondary border border-border-default rounded-xl focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary text-text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Ex: Caixa Econômica, Tesouraria..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium tracking-tight text-text-primary mb-1.5 ml-1">
                  Instituição (opcional)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={institutionName}
                  onChange={e => setInstitutionName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full h-11 px-3.5 bg-surface-secondary border border-border-default rounded-xl focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary text-text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Ex: Banco do Brasil"
                />
              </div>

              <div>
                <label className="block text-sm font-medium tracking-tight text-text-primary mb-1.5 ml-1">
                  Últimos 4 números da conta (opcional)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  value={accountLast4}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setAccountLast4(val);
                  }}
                  disabled={isSubmitting}
                  className="w-full h-11 px-3.5 bg-surface-secondary border border-border-default rounded-xl focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary text-text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                  placeholder="Ex: 1234"
                />
                <p className="mt-1.5 ml-1 text-xs text-text-tertiary">
                  Use somente os quatro últimos números para facilitar a identificação.
                </p>
              </div>
              
              <div className="pt-4 space-y-4">
                <div>
                  <dt className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
                    Tipo de Conta
                  </dt>
                  <dd className="text-sm text-text-secondary">
                    {getTypeNameString(account.type)}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
                    Situação
                  </dt>
                  <dd className="text-sm text-text-secondary">
                    {account.active ? 'Ativa' : 'Arquivada'}
                  </dd>
                </div>
              </div>
              
            </div>
            
            {/* Save Area Buffer */}
            <div className="h-4" />
          </form>

          {/* Footer actions */}
          <div className="flex-none p-6 border-t border-white/[0.05] bg-surface-default md:rounded-b-2xl pb-safe">
            <button
              type="submit"
              form="account-edit-form"
              disabled={isSubmitting}
              className="w-full h-11 bg-accent-primary hover:bg-accent-secondary text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Salvar alterações'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
