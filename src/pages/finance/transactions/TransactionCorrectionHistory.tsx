import { Surface } from '@/src/components/foundation';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { formatReviewMoney } from './transactionReviewModel';
import { PAYMENT_METHOD_LABELS } from './transactionCreateCopy';
import type { transactionCorrectionSnapshot } from '@/shared/finance/transactionCorrection';

type Snapshot = ReturnType<typeof transactionCorrectionSnapshot>;
type Correction = { id: string; actorLabel: string; reason: string | null; changedAt: string | null;
  versionBefore: number; versionAfter: number; before: Snapshot; after: Snapshot };
export const CORRECTION_COPY = {
  PT: { title: 'Histórico de alterações', before: 'Original', after: 'Final', reason: 'Motivo da alteração',
    hint: 'Explique o que mudou e por quê (10 a 500 caracteres). O original será preservado.',
    required: 'Esta movimentação já passou por conferência. Informe o motivo para salvar a correção.',
    optional: 'Opcional enquanto o rascunho ainda não passou por conferência.', missing: 'Não informado',
    recent: 'Mostrando as 20 alterações mais recentes. Os registros anteriores permanecem preservados.',
    fields: { amountCents: 'Valor', transactionKind: 'Tipo', occurredAt: 'Data do recebimento ou pagamento', competenceDate: 'Competência',
      account: 'Conta', destinationAccount: 'Conta de destino', liabilityAccount: 'Conta da obrigação', paymentMethod: 'Forma de pagamento',
      description: 'Descrição', counterparty: 'Pessoa ou empresa', evidenceJustification: 'Justificativa do comprovante', evidenceCount: 'Comprovantes', allocations: 'Categorias e fundos' },
    kinds: { income: 'Entrada', expense: 'Despesa', transfer: 'Transferência', liability_settlement: 'Pagamento de obrigação' } },
  EN: { title: 'Change history', before: 'Original', after: 'Final', reason: 'Reason for change',
    hint: 'Explain what changed and why (10–500 characters). The original will be retained.',
    required: 'This transaction has already been reviewed. Give a reason to save the correction.',
    optional: 'Optional while the draft has not been reviewed.', missing: 'Not provided',
    recent: 'Showing the 20 most recent changes. Earlier records remain preserved.',
    fields: { amountCents: 'Amount', transactionKind: 'Type', occurredAt: 'Receipt or payment date', competenceDate: 'Accounting period',
      account: 'Account', destinationAccount: 'Destination account', liabilityAccount: 'Liability account', paymentMethod: 'Payment method',
      description: 'Description', counterparty: 'Person or business', evidenceJustification: 'Evidence explanation', evidenceCount: 'Evidence files', allocations: 'Categories and funds' },
    kinds: { income: 'Income', expense: 'Expense', transfer: 'Transfer', liability_settlement: 'Liability payment' } },
  ES: { title: 'Historial de cambios', before: 'Original', after: 'Final', reason: 'Motivo del cambio',
    hint: 'Explica qué cambió y por qué (10–500 caracteres). Se conservará el original.',
    required: 'Este movimiento ya fue revisado. Informa el motivo para guardar la corrección.',
    optional: 'Opcional mientras el borrador no haya sido revisado.', missing: 'No informado',
    recent: 'Se muestran los 20 cambios más recientes. Los registros anteriores siguen conservados.',
    fields: { amountCents: 'Importe', transactionKind: 'Tipo', occurredAt: 'Fecha de recepción o pago', competenceDate: 'Competencia',
      account: 'Cuenta', destinationAccount: 'Cuenta de destino', liabilityAccount: 'Cuenta de la obligación', paymentMethod: 'Forma de pago',
      description: 'Descripción', counterparty: 'Persona o empresa', evidenceJustification: 'Justificación del comprobante', evidenceCount: 'Comprobantes', allocations: 'Categorías y fondos' },
    kinds: { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', liability_settlement: 'Pago de obligación' } },
} as const;

export function TransactionCorrectionReasonField({ value, onChange, required, disabled }: {
  value: string; onChange: (value: string) => void; required: boolean; disabled: boolean;
}) {
  const { language } = useLanguage(); const copy = CORRECTION_COPY[language];
  return <label className="block text-base font-semibold text-text-primary">
    {copy.reason}
    <span className="mt-1 block text-sm font-normal text-text-muted">{required ? copy.required : copy.optional}</span>
    <textarea value={value} onChange={event => onChange(event.target.value)} required={required}
      disabled={disabled} minLength={10} maxLength={500}
      className="mt-3 min-h-28 w-full rounded-xl border border-border-subtle bg-surface-base p-3 text-base font-normal text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary" />
    <span className="mt-1 block text-sm font-normal text-text-muted">{copy.hint}</span>
  </label>;
}

export function TransactionCorrectionHistory({ items, truncated = false }: { items: Correction[]; truncated?: boolean }) {
  const { language } = useLanguage(); const copy = CORRECTION_COPY[language];
  const locale = language === 'EN' ? 'en-US' : language === 'ES' ? 'es-ES' : 'pt-BR';
  if (!items?.length) return null;
  const renderValue = (snapshot: Snapshot, key: keyof typeof copy.fields): string => {
    const value = snapshot[key];
    if (key === 'amountCents') return formatReviewMoney(snapshot.amountCents, language, snapshot.currency || 'BRL');
    if (key === 'allocations') return snapshot.allocations.map(item =>
      `${[item.category || copy.missing, item.fund, item.costCenter].filter(Boolean).join(' · ')}: ${formatReviewMoney(item.amountCents, language, snapshot.currency || 'BRL')}`).join('\n') || copy.missing;
    if (key === 'transactionKind') return copy.kinds[String(value) as keyof typeof copy.kinds] || copy.missing;
    if (key === 'paymentMethod') return PAYMENT_METHOD_LABELS[language][String(value) as keyof typeof PAYMENT_METHOD_LABELS.PT] || copy.missing;
    if (key === 'occurredAt' || key === 'competenceDate') {
      const date = typeof value === 'string' ? new Date(value) : null;
      return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale, { timeZone: 'UTC' }) : copy.missing;
    }
    return value === null || value === '' ? copy.missing : String(value);
  };
  return <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
    <h2 className="text-lg font-semibold text-text-primary">{copy.title}</h2>
    <ol className="mt-4 space-y-4">{items.map(item => <li key={item.id} className="rounded-xl border border-border-subtle p-4">
      <p className="font-semibold text-text-primary">{item.actorLabel} · v{item.versionBefore} → v{item.versionAfter}</p>
      <time className="mt-1 block text-sm text-text-muted" dateTime={item.changedAt || undefined}>
        {item.changedAt ? new Date(item.changedAt).toLocaleString(locale) : copy.missing}
      </time>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text-primary">{copy.reason}: {item.reason || copy.missing}</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm text-text-primary">
        <caption className="sr-only">{copy.title}</caption><thead><tr><th scope="col" className="py-2">{copy.title}</th><th scope="col" className="p-2">{copy.before}</th><th scope="col" className="p-2">{copy.after}</th></tr></thead>
        <tbody>{(Object.keys(copy.fields) as Array<keyof typeof copy.fields>).filter(key => key === 'amountCents' || JSON.stringify(item.before[key]) !== JSON.stringify(item.after[key])).map(key =>
          <tr key={key} className="border-t border-border-subtle"><th scope="row" className="py-2 pr-2 font-normal">{copy.fields[key]}</th>
            <td className="whitespace-pre-wrap break-words p-2 tabular-nums">{renderValue(item.before, key)}</td><td className="whitespace-pre-wrap break-words p-2 tabular-nums">{renderValue(item.after, key)}</td></tr>)}
        </tbody></table></div>
    </li>)}</ol>
    {truncated ? <p className="mt-4 text-sm text-text-muted">{copy.recent}</p> : null}
  </Surface>;
}
