export const UNIVERSAL_EVIDENCE_DOCUMENT_TYPES = [
  'receipt',
  'payment_proof',
  'invoice',
  'bank_statement',
  'tax_document',
  'other',
] as const;

export type UniversalEvidenceDocumentType =
  (typeof UNIVERSAL_EVIDENCE_DOCUMENT_TYPES)[number];

export type UniversalEvidenceClassification = {
  documentType: UniversalEvidenceDocumentType;
  source: 'human';
  confirmedByUid: string;
  confirmedAt: unknown;
};

export type UniversalEvidenceReviewStatus = 'pending' | 'reviewed';

export type UniversalEvidenceReview = {
  status: UniversalEvidenceReviewStatus;
  reviewedByUid: string | null;
  reviewedAt: unknown | null;
  note: string | null;
};

export function isUniversalEvidenceDocumentType(
  value: unknown,
): value is UniversalEvidenceDocumentType {
  return (
    typeof value === 'string' &&
    (UNIVERSAL_EVIDENCE_DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeUniversalEvidenceReviewNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('EVIDENCE_INVALID_REVIEW_NOTE');

  const normalized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (normalized.length > 500) throw new Error('EVIDENCE_INVALID_REVIEW_NOTE');
  return normalized || null;
}
