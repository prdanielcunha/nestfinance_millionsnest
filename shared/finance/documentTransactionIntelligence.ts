import { isValidCnpj, normalizeCnpj } from './taxId.js';

export const DOCUMENT_TRANSACTION_ANALYSIS_VERSION = 2 as const;
export const DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS = [
  'document_type',
  'transaction_kind',
  'counterparty_name',
  'issuer_tax_id',
  'recipient_tax_id',
  'payer_tax_id',
  'payee_tax_id',
  'document_number',
  'total_amount',
  'currency',
  'occurred_at',
  'due_date',
  'settlement_state',
  'payment_method',
  'description',
  'category_id',
  'document_multiplicity',
] as const;
export const DOCUMENT_TRANSACTION_PROVIDER_STATUSES = ['recognized', 'uncertain', 'absent'] as const;
export const DOCUMENT_TRANSACTION_TYPES = [
  'receipt',
  'fiscal_receipt',
  'invoice',
  'service_invoice',
  'utility_bill',
  'payment_proof',
  'pix_receipt',
  'bank_transfer_receipt',
  'bank_slip',
  'card_slip',
  'donation_receipt',
  'reimbursement_receipt',
  'tax_document',
  'statement',
  'contract_charge',
  'other',
  'unknown',
] as const;
export const DOCUMENT_TRANSACTION_KINDS = ['expense', 'income', 'transfer', 'non_transaction', 'unknown'] as const;
export const DOCUMENT_TRANSACTION_SETTLEMENT_STATES = ['paid', 'unpaid', 'unknown'] as const;
export const DOCUMENT_TRANSACTION_CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'COP', 'MXN', 'other', 'unknown'] as const;
export const DOCUMENT_TRANSACTION_PAYMENT_METHODS = [
  'cash',
  'pix',
  'bank_transfer',
  'bank_deposit',
  'debit_card',
  'credit_card',
  'prepaid_card',
  'bank_slip',
  'check',
  'automatic_debit',
  'other',
  'unknown',
] as const;
export const DOCUMENT_TRANSACTION_MULTIPLICITY = ['single', 'multiple', 'uncertain'] as const;
export const DOCUMENT_ENTITY_TAX_ID_ROLES = ['issuer', 'recipient', 'payer', 'payee'] as const;

export type DocumentTransactionProviderFieldKey = (typeof DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS)[number];
export type DocumentTransactionProviderStatus = (typeof DOCUMENT_TRANSACTION_PROVIDER_STATUSES)[number];
export type DocumentTransactionType = (typeof DOCUMENT_TRANSACTION_TYPES)[number];
export type DocumentTransactionKind = (typeof DOCUMENT_TRANSACTION_KINDS)[number];
export type DocumentTransactionSettlementState = (typeof DOCUMENT_TRANSACTION_SETTLEMENT_STATES)[number];
export type DocumentTransactionCurrency = (typeof DOCUMENT_TRANSACTION_CURRENCIES)[number];
export type DocumentTransactionPaymentMethod = (typeof DOCUMENT_TRANSACTION_PAYMENT_METHODS)[number];
export type DocumentTransactionMultiplicity = (typeof DOCUMENT_TRANSACTION_MULTIPLICITY)[number];
export type DocumentEntityTaxIdRole = (typeof DOCUMENT_ENTITY_TAX_ID_ROLES)[number];

export type DocumentTransactionProviderField = {
  key: DocumentTransactionProviderFieldKey;
  status: DocumentTransactionProviderStatus;
  observation: string;
};
export type DocumentTransactionProviderResult = { fields: DocumentTransactionProviderField[] };

export type DocumentTransactionCategoryOption = {
  id: string;
  name: string;
  kind: 'income' | 'expense';
};

export type DocumentTransactionCandidate<T> = {
  state: DocumentTransactionProviderStatus;
  value: T | null;
  observation: string | null;
};

export type DocumentTransactionEntityTaxIdCheck =
  | 'match'
  | 'mismatch'
  | 'absent'
  | 'uncertain'
  | 'entity_tax_id_not_configured';

export type DocumentTransactionAnalysisStatus =
  | 'ready_for_confirmation'
  | 'needs_review'
  | 'entity_mismatch'
  | 'multiple_documents'
  | 'not_settled'
  | 'unsupported_currency'
  | 'unsupported_transaction_kind';

export type DocumentTransactionAnalysis = {
  schemaVersion: typeof DOCUMENT_TRANSACTION_ANALYSIS_VERSION;
  source: 'ai_assisted';
  documentType: DocumentTransactionCandidate<DocumentTransactionType>;
  transactionKind: DocumentTransactionCandidate<DocumentTransactionKind>;
  counterpartyName: DocumentTransactionCandidate<string>;
  issuerTaxId: DocumentTransactionCandidate<string>;
  recipientTaxId: DocumentTransactionCandidate<string>;
  payerTaxId: DocumentTransactionCandidate<string>;
  payeeTaxId: DocumentTransactionCandidate<string>;
  documentNumber: DocumentTransactionCandidate<string>;
  totalAmountCents: DocumentTransactionCandidate<number>;
  currency: DocumentTransactionCandidate<DocumentTransactionCurrency>;
  occurredAt: DocumentTransactionCandidate<string>;
  dueDate: DocumentTransactionCandidate<string>;
  settlementState: DocumentTransactionCandidate<DocumentTransactionSettlementState>;
  paymentMethod: DocumentTransactionCandidate<DocumentTransactionPaymentMethod>;
  description: DocumentTransactionCandidate<string>;
  categoryId: DocumentTransactionCandidate<string>;
  documentMultiplicity: DocumentTransactionCandidate<DocumentTransactionMultiplicity>;
  entityTaxIdCheck: DocumentTransactionEntityTaxIdCheck;
  entityTaxIdRole: DocumentEntityTaxIdRole | null;
  analysisStatus: DocumentTransactionAnalysisStatus;
  suggestedCategoryName: string | null;
  authority: {
    humanConfirmationRequired: true;
    createsTransaction: false;
    submitsForReview: false;
    postsTransaction: false;
    changesBalance: false;
  };
};

const MAX_OBSERVATION = 240;

function exactObjectKeys(record: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

export function validateDocumentTransactionProviderResult(raw: unknown): DocumentTransactionProviderResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
  const record = raw as Record<string, unknown>;
  if (!exactObjectKeys(record, ['fields']) || !Array.isArray(record.fields) || record.fields.length !== DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS.length) {
    throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
  }
  const seen = new Set<string>();
  const fields = record.fields.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
    const field = item as Record<string, unknown>;
    if (!exactObjectKeys(field, ['key', 'observation', 'status'])) throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
    const key = String(field.key || '');
    const status = String(field.status || '');
    const observation = typeof field.observation === 'string' ? field.observation.trim() : '';
    if (!DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS.includes(key as DocumentTransactionProviderFieldKey) || seen.has(key)) {
      throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
    }
    if (!DOCUMENT_TRANSACTION_PROVIDER_STATUSES.includes(status as DocumentTransactionProviderStatus)) {
      throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
    }
    if (observation.length > MAX_OBSERVATION) throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
    if (status !== 'recognized' && observation.length > 120) throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
    seen.add(key);
    return {
      key: key as DocumentTransactionProviderFieldKey,
      status: status as DocumentTransactionProviderStatus,
      observation,
    };
  });
  if (DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS.some((key) => !seen.has(key))) {
    throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
  }
  return { fields };
}

function field(result: DocumentTransactionProviderResult, key: DocumentTransactionProviderFieldKey) {
  const current = result.fields.find((candidate) => candidate.key === key);
  if (!current) throw new Error('DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT');
  return current;
}

function cleanText(value: string, max: number) {
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized ? normalized.slice(0, max) : null;
}

function stringCandidate(source: DocumentTransactionProviderField, max: number): DocumentTransactionCandidate<string> {
  if (source.status !== 'recognized') {
    return { state: source.status, value: null, observation: source.observation || null };
  }
  const value = cleanText(source.observation, max);
  return value
    ? { state: 'recognized', value, observation: source.observation || null }
    : { state: 'uncertain', value: null, observation: source.observation || null };
}

function enumCandidate<T extends string>(
  source: DocumentTransactionProviderField,
  values: readonly T[],
  normalize?: (value: string) => string,
): DocumentTransactionCandidate<T> {
  if (source.status !== 'recognized') {
    return { state: source.status, value: null, observation: source.observation || null };
  }
  const normalized = normalize ? normalize(source.observation.trim()) : source.observation.trim().toLowerCase();
  const exact = values.find((candidate) => candidate.toLowerCase() === normalized.toLowerCase());
  if (!exact) return { state: 'uncertain', value: null, observation: source.observation || null };
  return { state: 'recognized', value: exact, observation: source.observation || null };
}

export function parseDocumentMoneyObservation(value: string): number | null {
  const raw = value
    .replace(/\b(?:BRL|USD|EUR|GBP|ARS|CLP|COP|MXN)\b/giu, '')
    .replace(/R\$|US\$|€|£/giu, '')
    .replace(/\s+/gu, '')
    .replace(/[^\d,.-]/gu, '');
  if (!raw || raw.startsWith('-')) return null;

  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  let normalized = raw;

  if (comma >= 0 && dot >= 0) {
    const decimalIndex = Math.max(comma, dot);
    const integer = raw.slice(0, decimalIndex).replace(/[.,]/gu, '');
    const decimals = raw.slice(decimalIndex + 1).replace(/[.,]/gu, '');
    if (!/^\d+$/.test(integer) || !/^\d{1,2}$/.test(decimals)) return null;
    normalized = integer + '.' + decimals.padEnd(2, '0');
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? ',' : '.';
    const parts = raw.split(separator);
    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
      normalized = parts[0] + '.' + parts[1].padEnd(2, '0');
    } else if (parts.length > 1 && /^\d+$/.test(parts[0]) && parts.slice(1).every((part) => /^\d{3}$/.test(part))) {
      normalized = parts.join('');
    } else {
      return null;
    }
  }

  if (!/^\d+(?:\.\d{2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 99_999_999_999 ? cents : null;
}

function moneyCandidate(source: DocumentTransactionProviderField): DocumentTransactionCandidate<number> {
  if (source.status !== 'recognized') {
    return { state: source.status, value: null, observation: source.observation || null };
  }
  const value = parseDocumentMoneyObservation(source.observation);
  return value === null
    ? { state: 'uncertain', value: null, observation: source.observation || null }
    : { state: 'recognized', value, observation: source.observation || null };
}

function isoDate(value: string): string | null {
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(trimmed);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateCandidate(source: DocumentTransactionProviderField): DocumentTransactionCandidate<string> {
  if (source.status !== 'recognized') {
    return { state: source.status, value: null, observation: source.observation || null };
  }
  const value = isoDate(source.observation);
  return value
    ? { state: 'recognized', value, observation: source.observation || null }
    : { state: 'uncertain', value: null, observation: source.observation || null };
}

function taxIdCandidate(source: DocumentTransactionProviderField): DocumentTransactionCandidate<string> {
  if (source.status !== 'recognized') {
    return { state: source.status, value: null, observation: source.observation || null };
  }
  const normalized = normalizeCnpj(source.observation);
  if (!isValidCnpj(normalized)) {
    return { state: 'uncertain', value: null, observation: source.observation || null };
  }
  return { state: 'recognized', value: normalized, observation: source.observation || null };
}

function categoryCandidate(
  source: DocumentTransactionProviderField,
  categories: readonly DocumentTransactionCategoryOption[],
): DocumentTransactionCandidate<string> {
  if (source.status !== 'recognized') {
    return { state: source.status, value: null, observation: source.observation || null };
  }
  const value = source.observation.trim();
  return categories.some((category) => category.id === value)
    ? { state: 'recognized', value, observation: source.observation || null }
    : { state: 'uncertain', value: null, observation: source.observation || null };
}

function roleCandidates(input: {
  transactionKind: DocumentTransactionCandidate<DocumentTransactionKind>;
  issuerTaxId: DocumentTransactionCandidate<string>;
  recipientTaxId: DocumentTransactionCandidate<string>;
  payerTaxId: DocumentTransactionCandidate<string>;
  payeeTaxId: DocumentTransactionCandidate<string>;
}) {
  const all = [
    ['issuer', input.issuerTaxId],
    ['recipient', input.recipientTaxId],
    ['payer', input.payerTaxId],
    ['payee', input.payeeTaxId],
  ] as const;

  if (input.transactionKind.value === 'expense') {
    return all.filter(([role]) => role === 'recipient' || role === 'payer');
  }
  if (input.transactionKind.value === 'income') {
    return all.filter(([role]) => role === 'recipient' || role === 'payee' || role === 'issuer');
  }
  if (input.transactionKind.value === 'transfer') {
    return all.filter(([role]) => role === 'payer' || role === 'payee');
  }
  return all;
}

function resolveEntityTaxIdCheck(input: {
  entityTaxId?: string | null;
  transactionKind: DocumentTransactionCandidate<DocumentTransactionKind>;
  issuerTaxId: DocumentTransactionCandidate<string>;
  recipientTaxId: DocumentTransactionCandidate<string>;
  payerTaxId: DocumentTransactionCandidate<string>;
  payeeTaxId: DocumentTransactionCandidate<string>;
}): { check: DocumentTransactionEntityTaxIdCheck; role: DocumentEntityTaxIdRole | null } {
  const normalizedEntityTaxId = normalizeCnpj(input.entityTaxId || '');
  if (!normalizedEntityTaxId || !isValidCnpj(normalizedEntityTaxId)) {
    return { check: 'entity_tax_id_not_configured', role: null };
  }

  const relevant = roleCandidates(input);
  for (const [role, candidate] of relevant) {
    if (candidate.state === 'recognized' && candidate.value === normalizedEntityTaxId) {
      return { check: 'match', role };
    }
  }

  const recognized = relevant.filter(([, candidate]) => candidate.state === 'recognized' && candidate.value);
  if (recognized.length > 0) {
    if (input.transactionKind.value === 'expense' || input.transactionKind.value === 'income' || input.transactionKind.value === 'transfer') {
      return { check: 'mismatch', role: recognized[0][0] };
    }
    return { check: 'uncertain', role: recognized[0][0] };
  }

  if (relevant.some(([, candidate]) => candidate.state === 'uncertain')) {
    return { check: 'uncertain', role: null };
  }
  if (relevant.every(([, candidate]) => candidate.state === 'absent')) {
    return { check: 'absent', role: null };
  }
  return { check: 'uncertain', role: null };
}

export function buildDocumentTransactionAnalysis(input: {
  provider: DocumentTransactionProviderResult;
  entityTaxId?: string | null;
  categories: readonly DocumentTransactionCategoryOption[];
}): DocumentTransactionAnalysis {
  const documentType = enumCandidate(field(input.provider, 'document_type'), DOCUMENT_TRANSACTION_TYPES);
  const transactionKind = enumCandidate(field(input.provider, 'transaction_kind'), DOCUMENT_TRANSACTION_KINDS);
  const counterpartyName = stringCandidate(field(input.provider, 'counterparty_name'), 160);
  const issuerTaxId = taxIdCandidate(field(input.provider, 'issuer_tax_id'));
  const recipientTaxId = taxIdCandidate(field(input.provider, 'recipient_tax_id'));
  const payerTaxId = taxIdCandidate(field(input.provider, 'payer_tax_id'));
  const payeeTaxId = taxIdCandidate(field(input.provider, 'payee_tax_id'));
  const documentNumber = stringCandidate(field(input.provider, 'document_number'), 100);
  const totalAmountCents = moneyCandidate(field(input.provider, 'total_amount'));
  const currency = enumCandidate(field(input.provider, 'currency'), DOCUMENT_TRANSACTION_CURRENCIES, (value) => value.toUpperCase());
  const occurredAt = dateCandidate(field(input.provider, 'occurred_at'));
  const dueDate = dateCandidate(field(input.provider, 'due_date'));
  const settlementState = enumCandidate(field(input.provider, 'settlement_state'), DOCUMENT_TRANSACTION_SETTLEMENT_STATES);
  const paymentMethod = enumCandidate(field(input.provider, 'payment_method'), DOCUMENT_TRANSACTION_PAYMENT_METHODS);
  const description = stringCandidate(field(input.provider, 'description'), 180);
  let categoryId = categoryCandidate(field(input.provider, 'category_id'), input.categories);
  const documentMultiplicity = enumCandidate(field(input.provider, 'document_multiplicity'), DOCUMENT_TRANSACTION_MULTIPLICITY);

  const selectedCategory = categoryId.value
    ? input.categories.find((candidate) => candidate.id === categoryId.value) || null
    : null;
  if (
    selectedCategory &&
    (transactionKind.value === 'income' || transactionKind.value === 'expense') &&
    selectedCategory.kind !== transactionKind.value
  ) {
    categoryId = { state: 'uncertain', value: null, observation: categoryId.observation };
  }
  if (transactionKind.value !== 'income' && transactionKind.value !== 'expense') {
    categoryId = { state: categoryId.state === 'absent' ? 'absent' : 'uncertain', value: null, observation: categoryId.observation };
  }

  const entityTax = resolveEntityTaxIdCheck({
    entityTaxId: input.entityTaxId,
    transactionKind,
    issuerTaxId,
    recipientTaxId,
    payerTaxId,
    payeeTaxId,
  });

  const category = categoryId.value
    ? input.categories.find((candidate) => candidate.id === categoryId.value) || null
    : null;

  let analysisStatus: DocumentTransactionAnalysisStatus = 'needs_review';
  if (documentMultiplicity.value === 'multiple') {
    analysisStatus = 'multiple_documents';
  } else if (entityTax.check === 'mismatch') {
    analysisStatus = 'entity_mismatch';
  } else if (currency.value && !['BRL', 'unknown'].includes(currency.value)) {
    analysisStatus = 'unsupported_currency';
  } else if (transactionKind.value === 'transfer' || transactionKind.value === 'non_transaction') {
    analysisStatus = 'unsupported_transaction_kind';
  } else if (settlementState.value === 'unpaid') {
    analysisStatus = 'not_settled';
  } else if (
    documentMultiplicity.value === 'single' &&
    (transactionKind.value === 'income' || transactionKind.value === 'expense') &&
    totalAmountCents.value !== null &&
    currency.value === 'BRL' &&
    occurredAt.value &&
    settlementState.value === 'paid'
  ) {
    analysisStatus = 'ready_for_confirmation';
  }

  return {
    schemaVersion: DOCUMENT_TRANSACTION_ANALYSIS_VERSION,
    source: 'ai_assisted',
    documentType,
    transactionKind,
    counterpartyName,
    issuerTaxId,
    recipientTaxId,
    payerTaxId,
    payeeTaxId,
    documentNumber,
    totalAmountCents,
    currency,
    occurredAt,
    dueDate,
    settlementState,
    paymentMethod,
    description,
    categoryId,
    documentMultiplicity,
    entityTaxIdCheck: entityTax.check,
    entityTaxIdRole: entityTax.role,
    analysisStatus,
    suggestedCategoryName: category?.name || null,
    authority: {
      humanConfirmationRequired: true,
      createsTransaction: false,
      submitsForReview: false,
      postsTransaction: false,
      changesBalance: false,
    },
  };
}
