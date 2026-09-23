import type {
  DocumentTransactionAnalysis,
  DocumentTransactionProviderFieldKey,
  DocumentTransactionProviderResult,
} from './documentTransactionIntelligence';

export const DOCUMENT_INTELLIGENCE_GOVERNANCE_VERSION = 1 as const;
export const DOCUMENT_INTELLIGENCE_PROMPT_REVISION = 'document-finance-v3-governed';

export type IntelligenceConfidenceBand = 'high' | 'medium' | 'low';
export type IntelligenceFieldGovernance = {
  confidence: number;
  band: IntelligenceConfidenceBand;
  provenance: ('ai_observation' | 'deterministic_normalization' | 'deterministic_validation' | 'human_memory_hint')[];
  providerStatus: 'recognized' | 'uncertain' | 'absent';
};
export type IntelligenceCorrectionHint = {
  correctionId: string;
  fieldKey: 'transaction_kind' | 'payment_method' | 'category_id';
  correctedValue: string;
};
export type DocumentIntelligenceGovernance = {
  schemaVersion: typeof DOCUMENT_INTELLIGENCE_GOVERNANCE_VERSION;
  promptRevision: typeof DOCUMENT_INTELLIGENCE_PROMPT_REVISION;
  cacheKey: string;
  cacheHit: boolean;
  latencyMs: number;
  fields: Record<DocumentTransactionProviderFieldKey, IntelligenceFieldGovernance>;
  correctionHints: IntelligenceCorrectionHint[];
};

const ANALYSIS_FIELD: Record<DocumentTransactionProviderFieldKey, keyof DocumentTransactionAnalysis> = {
  document_type: 'documentType',
  transaction_kind: 'transactionKind',
  counterparty_name: 'counterpartyName',
  issuer_tax_id: 'issuerTaxId',
  recipient_tax_id: 'recipientTaxId',
  payer_tax_id: 'payerTaxId',
  payee_tax_id: 'payeeTaxId',
  document_number: 'documentNumber',
  total_amount: 'totalAmountCents',
  currency: 'currency',
  occurred_at: 'occurredAt',
  due_date: 'dueDate',
  settlement_state: 'settlementState',
  payment_method: 'paymentMethod',
  description: 'description',
  category_id: 'categoryId',
  document_multiplicity: 'documentMultiplicity',
};

function normalizedValue(analysis: DocumentTransactionAnalysis, key: DocumentTransactionProviderFieldKey) {
  const candidate = analysis[ANALYSIS_FIELD[key]] as any;
  return candidate && typeof candidate === 'object' && 'value' in candidate ? candidate.value : null;
}

export function buildDocumentIntelligenceGovernance(input: {
  provider: DocumentTransactionProviderResult;
  analysis: DocumentTransactionAnalysis;
  cacheKey: string;
  cacheHit: boolean;
  latencyMs: number;
  correctionHints?: IntelligenceCorrectionHint[];
}): DocumentIntelligenceGovernance {
  const fields = {} as Record<DocumentTransactionProviderFieldKey, IntelligenceFieldGovernance>;
  for (const providerField of input.provider.fields) {
    const normalized = normalizedValue(input.analysis, providerField.key);
    const accepted = normalized !== null && normalized !== '';
    const confidence = providerField.status === 'recognized'
      ? accepted ? 0.9 : 0.35
      : providerField.status === 'uncertain'
        ? 0.4
        : 0.1;
    fields[providerField.key] = {
      confidence,
      band: confidence >= 0.8 ? 'high' : confidence >= 0.45 ? 'medium' : 'low',
      providerStatus: providerField.status,
      provenance: providerField.status === 'absent'
        ? ['ai_observation', 'deterministic_validation']
        : ['ai_observation', 'deterministic_normalization', 'deterministic_validation'],
    };
  }
  for (const hint of input.correctionHints || []) {
    const field = fields[hint.fieldKey];
    if (field && !field.provenance.includes('human_memory_hint')) field.provenance.push('human_memory_hint');
  }
  return {
    schemaVersion: DOCUMENT_INTELLIGENCE_GOVERNANCE_VERSION,
    promptRevision: DOCUMENT_INTELLIGENCE_PROMPT_REVISION,
    cacheKey: input.cacheKey,
    cacheHit: input.cacheHit,
    latencyMs: Math.max(0, Math.min(120_000, Math.round(input.latencyMs))),
    fields,
    correctionHints: input.correctionHints || [],
  };
}

export const INTELLIGENCE_CORRECTION_FIELDS = ['transaction_kind', 'payment_method', 'category_id'] as const;
export type IntelligenceCorrectionField = typeof INTELLIGENCE_CORRECTION_FIELDS[number];

export function isIntelligenceCorrectionField(value: unknown): value is IntelligenceCorrectionField {
  return typeof value === 'string' && INTELLIGENCE_CORRECTION_FIELDS.includes(value as IntelligenceCorrectionField);
}
export function normalizeCorrectionValue(value: unknown) {
  if (typeof value !== 'string') return '';
  const clean = value.trim().slice(0, 100);
  return /^[\p{L}\p{N}_ .:/+-]+$/u.test(clean) ? clean : '';
}
