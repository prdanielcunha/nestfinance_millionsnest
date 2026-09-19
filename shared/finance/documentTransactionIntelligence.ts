import { isValidCnpj, normalizeCnpj } from './taxId.js';

export const DOCUMENT_TRANSACTION_ANALYSIS_VERSION = 1 as const;
export const DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS = [
  'document_type',
  'transaction_kind',
  'merchant_name',
  'issuer_tax_id',
  'recipient_tax_id',
  'total_amount',
  'occurred_at',
  'payment_method',
  'description',
  'category_id',
  'document_multiplicity',
] as const;
export const DOCUMENT_TRANSACTION_PROVIDER_STATUSES = ['recognized', 'uncertain', 'absent'] as const;
export const DOCUMENT_TRANSACTION_TYPES = ['receipt', 'payment_proof', 'invoice', 'tax_document', 'other', 'unknown'] as const;
export const DOCUMENT_TRANSACTION_KINDS = ['expense', 'income', 'unknown'] as const;
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

export type DocumentTransactionProviderFieldKey = (typeof DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS)[number];
export type DocumentTransactionProviderStatus = (typeof DOCUMENT_TRANSACTION_PROVIDER_STATUSES)[number];
export type DocumentTransactionType = (typeof DOCUMENT_TRANSACTION_TYPES)[number];
export type DocumentTransactionKind = (typeof DOCUMENT_TRANSACTION_KINDS)[number];
export type DocumentTransactionPaymentMethod = (typeof DOCUMENT_TRANSACTION_PAYMENT_METHODS)[number];
export type DocumentTransactionMultiplicity = (typeof DOCUMENT_TRANSACTION_MULTIPLICITY)[number];

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
  | 'multiple_documents';

export type DocumentTransactionAnalysis = {
  schemaVersion: typeof DOCUMENT_TRANSACTION_ANALYSIS_VERSION;
  source: 'ai_assisted';
  documentType: DocumentTransactionCandidate<DocumentTransactionType>;
  transactionKind: DocumentTransactionCandidate<DocumentTransactionKind>;
  merchantName: DocumentTransactionCandidate<string>;
  issuerTaxId: DocumentTransactionCandidate<string>;
  recipientTaxId: DocumentTransactionCandidate<string>;
  totalAmountCents: DocumentTransactionCandidate<number>;
  occurredAt: DocumentTransactionCandidate<string>;
  paymentMethod: DocumentTransactionCandidate<DocumentTransactionPaymentMethod>;
  description: DocumentTransactionCandidate<string>;
  categoryId: DocumentTransactionCandidate<string>;
  documentMultiplicity: DocumentTransactionCandidate<DocumentTransactionMultiplicity>;
  entityTaxIdCheck: DocumentTransactionEntityTaxIdCheck;
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

function stringCandidate(
  source: DocumentTransactionProviderField,
  max: number,
): DocumentTransactionCandidate<string> {
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
): DocumentTransactionCandidate<T> {
  if (source.status !== 'recognized') {
    return { state: source.status, value: null, observation: source.observation || null };
  }
  const normalized = source.observation.trim().toLowerCase();
  if (!values.includes(normalized as T)) {
    return { state: 'uncertain', value: null, observation: source.observation || null };
  }
  return { state: 'recognized', value: normalized as T, observation: source.observation || null };
}

export function parseDocumentMoneyObservation(value: string): number | null {
  const raw = value
    .replace(/\bBRL\b/giu, '')
    .replace(/R\$/giu, '')
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
    } else if (parts.every((part) => /^\d{3}$/.test(part.slice(-3))) && /^\d+$/.test(parts[0])) {
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
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
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

export function buildDocumentTransactionAnalysis(input: {
  provider: DocumentTransactionProviderResult;
  entityTaxId?: string | null;
  categories: readonly DocumentTransactionCategoryOption[];
}): DocumentTransactionAnalysis {
  const documentType = enumCandidate(field(input.provider, 'document_type'), DOCUMENT_TRANSACTION_TYPES);
  const transactionKind = enumCandidate(field(input.provider, 'transaction_kind'), DOCUMENT_TRANSACTION_KINDS);
  const merchantName = stringCandidate(field(input.provider, 'merchant_name'), 160);
  const issuerTaxId = taxIdCandidate(field(input.provider, 'issuer_tax_id'));
  const recipientTaxId = taxIdCandidate(field(input.provider, 'recipient_tax_id'));
  const totalAmountCents = moneyCandidate(field(input.provider, 'total_amount'));
  const occurredAt = dateCandidate(field(input.provider, 'occurred_at'));
  const paymentMethod = enumCandidate(field(input.provider, 'payment_method'), DOCUMENT_TRANSACTION_PAYMENT_METHODS);
  const description = stringCandidate(field(input.provider, 'description'), 180);
  const categoryId = categoryCandidate(field(input.provider, 'category_id'), input.categories);
  const documentMultiplicity = enumCandidate(field(input.provider, 'document_multiplicity'), DOCUMENT_TRANSACTION_MULTIPLICITY);

  const normalizedEntityTaxId = normalizeCnpj(input.entityTaxId || '');
  let entityTaxIdCheck: DocumentTransactionEntityTaxIdCheck;
  if (!normalizedEntityTaxId || !isValidCnpj(normalizedEntityTaxId)) {
    entityTaxIdCheck = 'entity_tax_id_not_configured';
  } else if (recipientTaxId.state === 'absent') {
    entityTaxIdCheck = 'absent';
  } else if (recipientTaxId.state !== 'recognized' || !recipientTaxId.value) {
    entityTaxIdCheck = 'uncertain';
  } else {
    entityTaxIdCheck = recipientTaxId.value === normalizedEntityTaxId ? 'match' : 'mismatch';
  }

  const category = categoryId.value
    ? input.categories.find((candidate) => candidate.id === categoryId.value) || null
    : null;

  let analysisStatus: DocumentTransactionAnalysisStatus = 'needs_review';
  if (documentMultiplicity.value === 'multiple') {
    analysisStatus = 'multiple_documents';
  } else if (entityTaxIdCheck === 'mismatch') {
    analysisStatus = 'entity_mismatch';
  } else if (
    documentMultiplicity.value === 'single' &&
    transactionKind.value &&
    transactionKind.value !== 'unknown' &&
    totalAmountCents.value !== null &&
    occurredAt.value
  ) {
    analysisStatus = 'ready_for_confirmation';
  }

  return {
    schemaVersion: DOCUMENT_TRANSACTION_ANALYSIS_VERSION,
    source: 'ai_assisted',
    documentType,
    transactionKind,
    merchantName,
    issuerTaxId,
    recipientTaxId,
    totalAmountCents,
    occurredAt,
    paymentMethod,
    description,
    categoryId,
    documentMultiplicity,
    entityTaxIdCheck,
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
