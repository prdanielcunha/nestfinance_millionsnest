import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { updateAccount } from '@/src/services/accountsService';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { fetchAccountOpeningHistory, type OpeningHistoryItem } from '@/src/services/accountOpeningHistoryService';

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
const HISTORY_COPY = {
  PT: { view:'Ver histórico da abertura', hide:'Fechar histórico', title:'Histórico de correções', loading:'Carregando histórico…', error:'Não foi possível consultar o histórico. Tente novamente.', retry:'Tentar novamente', empty:'Não existem revisões registradas nesta conta. Valores antigos podem não ter histórico.', more:'Carregar revisões anteriores', remaining:'Existem revisões anteriores que ainda não foram carregadas.', change:'Revisão', previous:'Anterior', current:'Novo registro', unknown:'Não informado', amount:'Valor declarado (não lançado)', date:'Data-base', reason:'Motivo', created:'Registrado em', source:'Origem', bank:'Extrato bancário', cash:'Contagem do caixa', prior:'Registros anteriores', other:'Outra origem', pending:'Pendente de conferência', confirmed:'Conferido', recorded:'Autoria registrada na auditoria' },
  EN: { view:'View opening history', hide:'Close history', title:'Correction history', loading:'Loading history…', error:'Could not load history. Please retry.', retry:'Retry', empty:'No opening revisions are recorded for this account. Older values may have no history.', more:'Load earlier revisions', remaining:'Older revisions have not been loaded yet.', change:'Revision', previous:'Previous', current:'New record', unknown:'Not informed', amount:'Declared amount (not posted)', date:'As of', reason:'Reason', created:'Recorded at', source:'Source', bank:'Bank statement', cash:'Cash count', prior:'Previous records', other:'Other source', pending:'Awaiting review', confirmed:'Confirmed', recorded:'Authorship logged for auditing' },
  ES: { view:'Ver historial de apertura', hide:'Cerrar historial', title:'Historial de correcciones', loading:'Cargando historial…', error:'No fue posible cargar el historial. Vuelva a intentar.', retry:'Reintentar', empty:'No hay revisiones registradas de esta cuenta. Los valores antiguos pueden no tener historial.', more:'Cargar revisiones anteriores', remaining:'Hay revisiones anteriores que todavía no se cargaron.', change:'Revisión', previous:'Anterior', current:'Nuevo registro', unknown:'No informado', amount:'Importe declarado (no contabilizado)', date:'Fecha', reason:'Motivo', created:'Registrado el', source:'Origen', bank:'Extracto bancario', cash:'Recuento de caja', prior:'Registros anteriores', other:'Otro origen', pending:'Pendiente de revisión', confirmed:'Confirmado', recorded:'Autoría registrada para auditoría' },
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
  const { accessState } = useAuth();
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const w = OPENING_EDIT_COPY[language];
  const hw = HISTORY_COPY[language];
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
  const [historyOpen,setHistoryOpen] = useState(false);
  const [historyItems,setHistoryItems] = useState<OpeningHistoryItem[]>([]);
  const [historyCursor,setHistoryCursor] = useState<number|null>(null);
  const [historyHasMore,setHistoryHasMore] = useState(false);
  const [historyLoading,setHistoryLoading] = useState(false);
  const [historyError,setHistoryError] = useState(false);
  const [historyFetched,setHistoryFetched] = useState(false);
  const historyEpoch = useRef(0);

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
      historyEpoch.current++;
      setHistoryOpen(false);
      setHistoryItems([]);
      setHistoryCursor(null);
      setHistoryHasMore(false);
      setHistoryLoading(false);
      setHistoryError(false);
      setHistoryFetched(false);
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, account]);

  const loadHistory = async (cursor?:number) => {
    if (historyLoading || !activeFinanceEntityId || !organizationId) return;
    const epoch = ++historyEpoch.current;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const page=await fetchAccountOpeningHistory({
        organizationId, financeEntityId:activeFinanceEntityId, accountId:account.id,
        ...(cursor===undefined?{}:{beforeRevision:cursor}),
      });
      if(epoch!==historyEpoch.current)return;
      setHistoryItems(prev=>cursor===undefined?page.items:[...prev,...page.items]);
      setHistoryHasMore(page.hasMore);
      setHistoryCursor(page.nextCursor);
      setHistoryFetched(true);
    } catch {
      if(epoch===historyEpoch.current)setHistoryError(true);
    } finally {
      if(epoch===historyEpoch.current)setHistoryLoading(false);
    }
  };
  const formatHistoryMoney = (cents:number) => new Intl.NumberFormat(
    language==='PT'?'pt-BR':language==='EN'?'en-US':'es-ES',
    {style:'currency',currency:'BRL'},
  ).format(cents/100);
  const historySourceLabel = (key?:string|null) =>
    key==='bank_statement'?hw.bank:key==='cash_count'?hw.cash:
    key==='prior_records'?hw.prior:key==='other'?hw.other:hw.unknown;

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
            
            <fieldset className="space-y-3 rounded-xl border border-border-default p-4">
              <legend className="px-1 text-base font-semibold text-text-primary">{w.title}</legend>
              <p className="text-sm leading-relaxed text-text-secondary">{w.description}</p>
              {typeof account.openingBalanceCents==='number' && !account.openingBalanceDeclaration ? (
                <p role="status" className="text-sm text-text-secondary">{w.legacy}</p>
              ) : account.openingBalanceDeclaration?.status === 'confirmed' ? (
                <p role="status" className="text-sm text-text-secondary">{w.locked}</p>
              ) : <>
                <label className="flex min-h-12 items-center gap-3 text-sm font-medium text-text-primary">
                  <input type="checkbox" checked={editingOpening}
                    onChange={e=>setEditingOpening(e.target.checked)} disabled={isSubmitting} />
                  {w.toggle}
                </label>
                {editingOpening && <div className="space-y-3">
                  <label className="flex min-h-12 items-center gap-3 text-sm text-text-primary">
                    <input type="radio" checked={openingMode==='not_informed'} name="edit-opening-mode"
                      onChange={()=>setOpeningMode('not_informed')} disabled={isSubmitting} />{w.unknown}
                  </label>
                  <label className="flex min-h-12 items-center gap-3 text-sm text-text-primary">
                    <input type="radio" checked={openingMode==='declared'} name="edit-opening-mode"
                      onChange={()=>setOpeningMode('declared')} disabled={isSubmitting} />{w.informed}
                  </label>
                  {openingMode==='declared'&&<>
                    <label htmlFor="correct-opening-amount" className="block text-sm font-medium text-text-primary">{w.amount}</label>
                    <input id="correct-opening-amount" type="text" inputMode="decimal" required maxLength={14}
                      value={openingAmount} onChange={e=>setOpeningAmount(e.target.value)} disabled={isSubmitting}
                      className="min-h-12 w-full rounded-lg border border-border-default bg-surface-secondary px-3 text-base text-text-primary" />
                    <label htmlFor="correct-opening-date" className="block text-sm font-medium text-text-primary">{w.asOf}</label>
                    <input id="correct-opening-date" type="date" required min="1900-01-01" max="2100-12-31"
                      value={openingDate} onChange={e=>setOpeningDate(e.target.value)} disabled={isSubmitting}
                      className="min-h-12 w-full rounded-lg border border-border-default bg-surface-secondary px-3 text-base text-text-primary" />
                    <label htmlFor="correct-opening-source" className="block text-sm font-medium text-text-primary">{w.source}</label>
                    <select id="correct-opening-source" value={openingSource}
                      onChange={e=>setOpeningSource(e.target.value as typeof openingSource)} disabled={isSubmitting}
                      className="min-h-12 w-full rounded-lg border border-border-default bg-surface-secondary px-3 text-base text-text-primary">
                      <option value="bank_statement">{w.bank}</option>
                      <option value="cash_count">{w.cash}</option>
                      <option value="prior_records">{w.prior}</option>
                      <option value="other">{w.other}</option>
                    </select>
                    {openingSource==='other' && <>
                      <label htmlFor="correct-opening-source-note" className="block text-sm font-medium text-text-primary">{w.note}</label>
                      <input id="correct-opening-source-note" type="text" required minLength={5} maxLength={240}
                        value={openingSourceNote} onChange={e=>setOpeningSourceNote(e.target.value)} disabled={isSubmitting}
                        className="min-h-12 w-full rounded-lg border border-border-default bg-surface-secondary px-3 text-base text-text-primary" />
                    </>}
                  </>}
                  <label htmlFor="correct-opening-reason" className="block text-sm font-medium text-text-primary">{w.reason}</label>
                  <textarea id="correct-opening-reason" required minLength={10} maxLength={240} rows={3}
                    value={openingReason} onChange={e=>setOpeningReason(e.target.value)} disabled={isSubmitting}
                    placeholder={w.example} className="w-full rounded-lg border border-border-default bg-surface-secondary px-3 py-3 text-base text-text-primary" />
                </div>}
              </>}
            </fieldset>

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
