/**
 * An opening balance declaration is NOT a posting, journal entry or confirmed balance.
 * It preserves the source information required for a subsequent human review.
 * Older accounts without this field remain unknown; never infer zero.
 */
export type OpeningBalanceSource = 'bank_statement' | 'cash_count' | 'prior_records' | 'other';
export type OpeningBalanceInput = {
  status: 'not_informed' | 'declared';
  amountCents?: number;
  asOf?: string;
  source?: OpeningBalanceSource;
  sourceNote?: string;
};
export type OpeningBalanceDeclaration =
  | { status: 'not_informed' }
  | { status: 'pending_review'; amountCents: number; asOf: string; source: OpeningBalanceSource; sourceNote: string };

const SOURCES = new Set<OpeningBalanceSource>(['bank_statement', 'cash_count', 'prior_records', 'other']);

export function parseOpeningBalanceDeclaration(input: unknown): OpeningBalanceDeclaration {
  if (input === undefined || input === null) return { status: 'not_informed' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('INVALID_OPENING_BALANCE_DECLARATION');
  }
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['status', 'amountCents', 'asOf', 'source', 'sourceNote'].includes(key))) {
    throw new Error('INVALID_OPENING_BALANCE_DECLARATION');
  }
  if (raw.status === 'not_informed') {
    if (Object.keys(raw).length !== 1) throw new Error('INVALID_OPENING_BALANCE_DECLARATION');
    return { status: 'not_informed' };
  }
  if (raw.status !== 'declared') throw new Error('INVALID_OPENING_BALANCE_DECLARATION');
  if (typeof raw.amountCents !== 'number' || !Number.isSafeInteger(raw.amountCents) || Math.abs(raw.amountCents) > 999_999_999_999) {
    throw new Error('INVALID_OPENING_BALANCE_AMOUNT');
  }
  if (typeof raw.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.asOf)) {
    throw new Error('INVALID_OPENING_BALANCE_DATE');
  }
  const [year, month, day] = raw.asOf.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.toISOString().slice(0, 10) !== raw.asOf) {
    throw new Error('INVALID_OPENING_BALANCE_DATE');
  }
  if (!SOURCES.has(raw.source as OpeningBalanceSource)) {
    throw new Error('INVALID_OPENING_BALANCE_SOURCE');
  }
  const sourceNote = raw.sourceNote === undefined ? '' : raw.sourceNote;
  if (typeof sourceNote !== 'string' || sourceNote.length > 240 || /[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(sourceNote)) {
    throw new Error('INVALID_OPENING_BALANCE_SOURCE_NOTE');
  }
  if (raw.source === 'other' && sourceNote.trim().length < 5) {
    throw new Error('INVALID_OPENING_BALANCE_SOURCE_NOTE');
  }
  return {
    status: 'pending_review',
    amountCents: raw.amountCents as number,
    asOf: raw.asOf,
    source: raw.source as OpeningBalanceSource,
    sourceNote: sourceNote.trim(),
  };
}
