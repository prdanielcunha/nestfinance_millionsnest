import { useMemo, useState } from 'react';
import { CalendarRange, ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import { getTransactionStatusCopy } from '@/src/components/finance/TransactionStatusSignal';
import type { Language } from '@/src/contexts/LanguageContext';
import { PAYMENT_METHODS } from '../../../../shared/finance/paymentMethods';

type CatalogOption = {
  id: string;
  name: string;
  active?: boolean;
};

export type TransactionHistoryFilterValues = {
  direction: string;
  status: string;
  from: string;
  to: string;
  order: 'newest' | 'oldest';
  dateBase: 'occurred' | 'competence' | 'recorded';
  categoryId: string;
  accountId: string;
  fundId: string;
  costCenterId: string;
  paymentMethod: string;
  origin: string;
  evidence: string;
  quality: string;
  amountMinCents: number | null;
  amountMaxCents: number | null;
};

type Copy = {
  filters: string;
  close: string;
  period: string;
  allHistory: string;
  thisMonth: string;
  previousMonth: string;
  chooseMonth: string;
  dateBase: string;
  occurred: string;
  competence: string;
  recorded: string;
  type: string;
  allTypes: string;
  income: string;
  expense: string;
  transfer: string;
  other: string;
  stage: string;
  allStages: string;
  advanced: string;
  category: string;
  allCategories: string;
  account: string;
  allAccounts: string;
  fund: string;
  allFunds: string;
  paymentMethod: string;
  allPayments: string;
  origin: string;
  allOrigins: string;
  manual: string;
  count: string;
  evidenceOrigin: string;
  imported: string;
  unknown: string;
  evidence: string;
  allEvidence: string;
  withEvidence: string;
  withoutEvidence: string;
  quality: string;
  allQuality: string;
  missingDescription: string;
  missingCategory: string;
  unreconciled: string;
  costCenter: string;
  costCenterHint: string;
  minValue: string;
  maxValue: string;
  newest: string;
  oldest: string;
  order: string;
  from: string;
  to: string;
  clear: string;
  quick: string;
  archived: string;
};

const COPY: Record<Language, Copy> = {
  PT: {
    filters: 'Filtrar movimentações',
    close: 'Fechar filtros',
    period: 'Período',
    allHistory: 'Todo o histórico',
    thisMonth: 'Este mês',
    previousMonth: 'Mês passado',
    chooseMonth: 'Escolher mês',
    dateBase: 'Qual data usar?',
    occurred: 'Quando aconteceu',
    competence: 'Competência',
    recorded: 'Quando foi registrado',
    type: 'Tipo',
    allTypes: 'Tudo',
    income: 'Entradas',
    expense: 'Saídas',
    transfer: 'Transferências',
    other: 'Outras',
    stage: 'Etapa',
    allStages: 'Todas',
    advanced: 'Mais filtros',
    category: 'Categoria',
    allCategories: 'Todas as categorias',
    account: 'Conta',
    allAccounts: 'Todas as contas',
    fund: 'Fundo',
    allFunds: 'Todos os fundos',
    paymentMethod: 'Forma',
    allPayments: 'Todas as formas',
    origin: 'Origem',
    allOrigins: 'Todas as origens',
    manual: 'Manual',
    count: 'Contagem',
    evidenceOrigin: 'Comprovante',
    imported: 'Importado',
    unknown: 'Não identificada',
    evidence: 'Comprovante',
    allEvidence: 'Com ou sem comprovante',
    withEvidence: 'Com comprovante',
    withoutEvidence: 'Sem comprovante',
    quality: 'Precisa de atenção',
    allQuality: 'Qualquer qualidade',
    missingDescription: 'Sem descrição',
    missingCategory: 'Sem categoria',
    unreconciled: 'Ainda não conferida com o banco',
    costCenter: 'Centro de custo',
    costCenterHint: 'Código do centro de custo, quando a entidade usa esse controle.',
    minValue: 'Valor mínimo',
    maxValue: 'Valor máximo',
    newest: 'Mais recentes',
    oldest: 'Mais antigas',
    order: 'Ordem',
    from: 'De',
    to: 'Até',
    clear: 'Limpar filtros',
    quick: 'Atalhos da entidade',
    archived: 'arquivada',
  },
  EN: {
    filters: 'Filter transactions',
    close: 'Close filters',
    period: 'Period',
    allHistory: 'All history',
    thisMonth: 'This month',
    previousMonth: 'Previous month',
    chooseMonth: 'Choose month',
    dateBase: 'Which date should be used?',
    occurred: 'When it happened',
    competence: 'Accounting period',
    recorded: 'When it was recorded',
    type: 'Type',
    allTypes: 'All',
    income: 'Income',
    expense: 'Expenses',
    transfer: 'Transfers',
    other: 'Other',
    stage: 'Stage',
    allStages: 'All',
    advanced: 'More filters',
    category: 'Category',
    allCategories: 'All categories',
    account: 'Account',
    allAccounts: 'All accounts',
    fund: 'Fund',
    allFunds: 'All funds',
    paymentMethod: 'Method',
    allPayments: 'All methods',
    origin: 'Origin',
    allOrigins: 'All origins',
    manual: 'Manual',
    count: 'Count',
    evidenceOrigin: 'Receipt',
    imported: 'Imported',
    unknown: 'Not identified',
    evidence: 'Evidence',
    allEvidence: 'With or without evidence',
    withEvidence: 'With evidence',
    withoutEvidence: 'Without evidence',
    quality: 'Needs attention',
    allQuality: 'Any quality',
    missingDescription: 'Missing description',
    missingCategory: 'Missing category',
    unreconciled: 'Not matched with the bank yet',
    costCenter: 'Cost center',
    costCenterHint: 'Cost-center code when this entity uses that control.',
    minValue: 'Minimum amount',
    maxValue: 'Maximum amount',
    newest: 'Newest first',
    oldest: 'Oldest first',
    order: 'Order',
    from: 'From',
    to: 'To',
    clear: 'Clear filters',
    quick: 'Entity shortcuts',
    archived: 'archived',
  },
  ES: {
    filters: 'Filtrar movimientos',
    close: 'Cerrar filtros',
    period: 'Período',
    allHistory: 'Todo el historial',
    thisMonth: 'Este mes',
    previousMonth: 'Mes pasado',
    chooseMonth: 'Elegir mes',
    dateBase: '¿Qué fecha usar?',
    occurred: 'Cuándo ocurrió',
    competence: 'Competencia',
    recorded: 'Cuándo fue registrado',
    type: 'Tipo',
    allTypes: 'Todo',
    income: 'Ingresos',
    expense: 'Egresos',
    transfer: 'Transferencias',
    other: 'Otros',
    stage: 'Etapa',
    allStages: 'Todas',
    advanced: 'Más filtros',
    category: 'Categoría',
    allCategories: 'Todas las categorías',
    account: 'Cuenta',
    allAccounts: 'Todas las cuentas',
    fund: 'Fondo',
    allFunds: 'Todos los fondos',
    paymentMethod: 'Forma',
    allPayments: 'Todas las formas',
    origin: 'Origen',
    allOrigins: 'Todos los orígenes',
    manual: 'Manual',
    count: 'Conteo',
    evidenceOrigin: 'Comprobante',
    imported: 'Importado',
    unknown: 'No identificado',
    evidence: 'Comprobante',
    allEvidence: 'Con o sin comprobante',
    withEvidence: 'Con comprobante',
    withoutEvidence: 'Sin comprobante',
    quality: 'Necesita atención',
    allQuality: 'Cualquier calidad',
    missingDescription: 'Sin descripción',
    missingCategory: 'Sin categoría',
    unreconciled: 'Aún no comparado con el banco',
    costCenter: 'Centro de costo',
    costCenterHint: 'Código del centro de costo cuando la entidad utiliza ese control.',
    minValue: 'Valor mínimo',
    maxValue: 'Valor máximo',
    newest: 'Más recientes',
    oldest: 'Más antiguos',
    order: 'Orden',
    from: 'Desde',
    to: 'Hasta',
    clear: 'Limpiar filtros',
    quick: 'Atajos de la entidad',
    archived: 'archivada',
  },
};

function paymentMethodLabel(code: string, fallback: string, language: Language) {
  const labels: Record<Language, Record<string, string>> = {
    PT: {
      cash: 'Dinheiro',
      pix: 'Pix',
      bank_transfer: 'Transferência bancária',
      bank_deposit: 'Depósito bancário',
      debit_card: 'Cartão de débito',
      credit_card: 'Cartão de crédito',
      prepaid_card: 'Cartão pré-pago',
      bank_slip: 'Boleto',
      check: 'Cheque',
      automatic_debit: 'Débito automático',
      other: 'Outro',
    },
    EN: {
      cash: 'Cash',
      pix: 'Pix',
      bank_transfer: 'Bank transfer',
      bank_deposit: 'Bank deposit',
      debit_card: 'Debit card',
      credit_card: 'Credit card',
      prepaid_card: 'Prepaid card',
      bank_slip: 'Bank slip',
      check: 'Check',
      automatic_debit: 'Automatic debit',
      other: 'Other',
    },
    ES: {
      cash: 'Efectivo',
      pix: 'Pix',
      bank_transfer: 'Transferencia bancaria',
      bank_deposit: 'Depósito bancario',
      debit_card: 'Tarjeta de débito',
      credit_card: 'Tarjeta de crédito',
      prepaid_card: 'Tarjeta prepaga',
      bank_slip: 'Boleto',
      check: 'Cheque',
      automatic_debit: 'Débito automático',
      other: 'Otro',
    },
  };
  return labels[language][code] || fallback;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function moneyInputValue(cents: number | null) {
  return cents === null ? '' : (cents / 100).toFixed(2);
}

function monthFromRange(from: string, to: string) {
  if (!/^\d{4}-\d{2}-01$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to)) return '';
  if (from.slice(0, 7) !== to.slice(0, 7)) return '';
  const [year, month] = from.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  return to === `${from.slice(0, 8)}${String(last).padStart(2, '0')}`
    ? from.slice(0, 7)
    : '';
}

export function TransactionHistoryFilters({
  language,
  values,
  categories,
  accounts,
  funds,
  onChange,
  onMonth,
  onPreset,
  onAmountChange,
  onClear,
  onClose,
}: {
  language: Language;
  values: TransactionHistoryFilterValues;
  categories: CatalogOption[];
  accounts: CatalogOption[];
  funds: CatalogOption[];
  onChange: (key: keyof TransactionHistoryFilterValues, value: string) => void;
  onMonth: (month: string) => void;
  onPreset: (preset: 'all' | 'this_month' | 'previous_month') => void;
  onAmountChange: (key: 'amountMinCents' | 'amountMaxCents', cents: number | null) => void;
  onClear: () => void;
  onClose?: () => void;
}) {
  const copy = COPY[language];
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const selectedMonth = monthFromRange(values.from, values.to);

  const quickCategories = useMemo(() => {
    const wanted = ['dizim', 'ofert', 'agua', 'energia', 'luz'];
    return categories
      .filter((category) => wanted.some((term) => normalize(category.name).includes(term)))
      .slice(0, 6);
  }, [categories]);

  const stageOptions = [
    { value: 'all', label: copy.allStages },
    { value: 'draft', label: getTransactionStatusCopy(language, 'draft').label },
    { value: 'ready_for_review', label: getTransactionStatusCopy(language, 'ready_for_review').label },
    { value: 'approved_for_posting', label: getTransactionStatusCopy(language, 'approved_for_posting').label },
    { value: 'posted', label: getTransactionStatusCopy(language, 'posted').label },
    { value: 'reversed', label: getTransactionStatusCopy(language, 'reversed').label },
  ];

  const selectClass =
    'h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3 text-sm text-text-primary outline-none transition focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/10';
  const inputClass = selectClass;

  const amountChange = (
    key: 'amountMinCents' | 'amountMaxCents',
    raw: string,
  ) => {
    if (!raw) {
      onAmountChange(key, null);
      return;
    }
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onAmountChange(key, Math.round(parsed * 100));
  };

  return (
    <Surface variant="secondary" radius="lg" className="p-4 sm:p-5" aria-label={copy.filters}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <SlidersHorizontal className="h-4 w-4 text-text-muted" aria-hidden="true" />
          {copy.filters}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="nf-interactive flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:bg-surface-elevated hover:text-text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="space-y-5">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.period}</p>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', copy.allHistory],
              ['this_month', copy.thisMonth],
              ['previous_month', copy.previousMonth],
            ] as const).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => onPreset(preset)}
                className="nf-interactive min-h-11 rounded-xl border border-border-subtle bg-surface-default px-3 text-sm font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
              >
                {label}
              </button>
            ))}
            <label className="relative min-w-[10rem] flex-1 sm:max-w-[13rem]">
              <span className="sr-only">{copy.chooseMonth}</span>
              <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => onMonth(event.target.value)}
                className={`${inputClass} pl-9`}
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.from}</span>
              <input
                type="date"
                value={values.from}
                max={values.to || undefined}
                onChange={(event) => onChange('from', event.target.value)}
                className={inputClass}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.to}</span>
              <input
                type="date"
                value={values.to}
                min={values.from || undefined}
                onChange={(event) => onChange('to', event.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.dateBase}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ['occurred', copy.occurred],
              ['competence', copy.competence],
              ['recorded', copy.recorded],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={values.dateBase === value}
                onClick={() => onChange('dateBase', value)}
                className={`nf-interactive min-h-11 rounded-xl border px-3 text-sm font-medium ${
                  values.dateBase === value
                    ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary'
                    : 'border-border-subtle bg-surface-default text-text-secondary hover:border-border-strong hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.type}</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {[
              ['all', copy.allTypes],
              ['income', copy.income],
              ['expense', copy.expense],
              ['transfer', copy.transfer],
              ['liability_settlement', copy.other],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={values.direction === value}
                onClick={() => onChange('direction', value)}
                className={`nf-interactive min-h-11 shrink-0 rounded-xl border px-4 text-sm font-medium ${
                  values.direction === value
                    ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary'
                    : 'border-border-subtle bg-surface-default text-text-secondary hover:border-border-strong hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.stage}</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {stageOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={values.status === option.value}
                onClick={() => onChange('status', option.value)}
                className={`nf-interactive min-h-11 shrink-0 rounded-xl border px-4 text-sm font-medium ${
                  values.status === option.value
                    ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary'
                    : 'border-border-subtle bg-surface-default text-text-secondary hover:border-border-strong hover:text-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {quickCategories.length > 0 ? (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{copy.quick}</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {quickCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={values.categoryId === category.id}
                  onClick={() => onChange('categoryId', values.categoryId === category.id ? '' : category.id)}
                  className={`nf-interactive min-h-11 shrink-0 rounded-xl border px-4 text-sm font-medium ${
                    values.categoryId === category.id
                      ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary'
                      : 'border-border-subtle bg-surface-default text-text-secondary hover:border-border-strong hover:text-text-primary'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
          className="nf-interactive flex min-h-11 w-full items-center justify-between rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-semibold text-text-primary"
          aria-expanded={advancedOpen}
        >
          <span>{copy.advanced}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {advancedOpen ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.category}</span>
              <select value={values.categoryId} onChange={(event) => onChange('categoryId', event.target.value)} className={selectClass}>
                <option value="">{copy.allCategories}</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.active === false ? ` · ${copy.archived}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.account}</span>
              <select value={values.accountId} onChange={(event) => onChange('accountId', event.target.value)} className={selectClass}>
                <option value="">{copy.allAccounts}</option>
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.active === false ? ` · ${copy.archived}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.fund}</span>
              <select value={values.fundId} onChange={(event) => onChange('fundId', event.target.value)} className={selectClass}>
                <option value="">{copy.allFunds}</option>
                {funds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.active === false ? ` · ${copy.archived}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.paymentMethod}</span>
              <select value={values.paymentMethod} onChange={(event) => onChange('paymentMethod', event.target.value)} className={selectClass}>
                <option value="">{copy.allPayments}</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.code} value={method.code}>{paymentMethodLabel(method.code, method.label, language)}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.origin}</span>
              <select value={values.origin} onChange={(event) => onChange('origin', event.target.value)} className={selectClass}>
                <option value="all">{copy.allOrigins}</option>
                <option value="manual">{copy.manual}</option>
                <option value="count">{copy.count}</option>
                <option value="evidence">{copy.evidenceOrigin}</option>
                <option value="imported">{copy.imported}</option>
                <option value="unknown">{copy.unknown}</option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.evidence}</span>
              <select value={values.evidence} onChange={(event) => onChange('evidence', event.target.value)} className={selectClass}>
                <option value="all">{copy.allEvidence}</option>
                <option value="with_evidence">{copy.withEvidence}</option>
                <option value="without_evidence">{copy.withoutEvidence}</option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.quality}</span>
              <select value={values.quality} onChange={(event) => onChange('quality', event.target.value)} className={selectClass}>
                <option value="all">{copy.allQuality}</option>
                <option value="missing_description">{copy.missingDescription}</option>
                <option value="missing_category">{copy.missingCategory}</option>
                <option value="unreconciled">{copy.unreconciled}</option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.costCenter}</span>
              <input
                type="text"
                value={values.costCenterId}
                maxLength={160}
                onChange={(event) => onChange('costCenterId', event.target.value)}
                placeholder={copy.costCenterHint}
                className={inputClass}
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.minValue}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={moneyInputValue(values.amountMinCents)}
                onChange={(event) => amountChange('amountMinCents', event.target.value)}
                className={inputClass}
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.maxValue}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={moneyInputValue(values.amountMaxCents)}
                onChange={(event) => amountChange('amountMaxCents', event.target.value)}
                className={inputClass}
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-text-muted">{copy.order}</span>
              <select value={values.order} onChange={(event) => onChange('order', event.target.value)} className={selectClass}>
                <option value="newest">{copy.newest}</option>
                <option value="oldest">{copy.oldest}</option>
              </select>
            </label>
          </div>
        ) : null}

        <Button
          variant="ghost"
          size="md"
          leadingIcon={<RotateCcw className="h-4 w-4" />}
          onClick={onClear}
          className="w-full sm:w-auto"
        >
          {copy.clear}
        </Button>
      </div>
    </Surface>
  );
}
