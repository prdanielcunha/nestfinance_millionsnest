import {
  COUNT_CAPTURE_FIELD_KEYS,
  isValidCountCaptureSha256,
  type CountCaptureCandidateField,
  type CountCaptureFieldKey,
  type CountCaptureRegion,
} from './countCapture.js';

export const COUNT_CAPTURE_EXTRACTION_SCHEMA_VERSION = 1 as const;
export const COUNT_CAPTURE_EXTRACTION_FIELD_KEYS = [...COUNT_CAPTURE_FIELD_KEYS] as const;
export const COUNT_CAPTURE_EXTRACTION_PROVIDER_STATUSES = ['recognized', 'uncertain', 'unreadable', 'blank'] as const;
export const COUNT_CAPTURE_EXTRACTION_MAX_OBSERVATION_CHARS = 64;
export const COUNT_CAPTURE_EXTRACTION_MAX_REGION_BYTES = 320 * 1024;
export const COUNT_CAPTURE_EXTRACTION_MAX_TOTAL_BYTES = 1100 * 1024;
export const COUNT_CAPTURE_EXTRACTION_LEASE_MS = 30_000;
export const COUNT_CAPTURE_EXTRACTION_TIMEOUT_MS = 15_000;

export type CountCaptureExtractionProviderStatus = (typeof COUNT_CAPTURE_EXTRACTION_PROVIDER_STATUSES)[number];
export type CountCaptureProviderFieldObservation = {
  key: CountCaptureFieldKey;
  status: CountCaptureExtractionProviderStatus;
  observation: string;
};
export type CountCaptureProviderResult = { fields: CountCaptureProviderFieldObservation[] };
export type CountCaptureExtractionRegionInput = {
  key: CountCaptureFieldKey;
  mimeType: 'image/jpeg';
  dataBase64: string;
  sha256: string;
};
export type CountCaptureMoneyParseResult =
  | { kind: 'recognized'; valueCents: number }
  | { kind: 'ambiguous' | 'invalid' | 'blank'; valueCents: null };

const MAX_VALUE_CENTS = 99_999_999_999;
const MAX_REGION_BASE64_CHARS = Math.ceil(COUNT_CAPTURE_EXTRACTION_MAX_REGION_BYTES / 3) * 4 + 4;

function recognized(valueCents: number): CountCaptureMoneyParseResult {
  if (!Number.isSafeInteger(valueCents) || valueCents < 0 || valueCents > MAX_VALUE_CENTS) return { kind: 'invalid', valueCents: null };
  return { kind: 'recognized', valueCents };
}

function parseIntegerDigits(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validThousandsGroups(value: string, separator: string) {
  const escaped = separator === '.' ? '\\.' : ',';
  return new RegExp(`^\\d{1,3}(?:${escaped}\\d{3})+$`).test(value);
}

export function parseCountCaptureMoneyObservation(raw: unknown): CountCaptureMoneyParseResult {
  if (typeof raw !== 'string') return { kind: 'invalid', valueCents: null };
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'blank', valueCents: null };

  const text = trimmed.replace(/\u00a0/g, ' ').replace(/\bBRL\b/gi, '').replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!text || !/^[0-9.,]+$/.test(text) || !/\d/.test(text)) return { kind: 'invalid', valueCents: null };
  const commaCount = (text.match(/,/g) || []).length;
  const dotCount = (text.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    if ((decimalSeparator === ',' ? commaCount : dotCount) !== 1) return { kind: 'invalid', valueCents: null };
    const decimalIndex = text.lastIndexOf(decimalSeparator);
    const integerPart = text.slice(0, decimalIndex);
    const decimalPart = text.slice(decimalIndex + 1);
    if (!/^\d{1,2}$/.test(decimalPart)) return { kind: 'invalid', valueCents: null };
    if (integerPart.includes(thousandsSeparator) && !validThousandsGroups(integerPart, thousandsSeparator)) return { kind: 'invalid', valueCents: null };
    const integer = parseIntegerDigits(integerPart.split(thousandsSeparator).join(''));
    if (integer === null) return { kind: 'invalid', valueCents: null };
    return recognized(integer * 100 + Number(decimalPart.padEnd(2, '0')));
  }

  const separator = commaCount > 0 ? ',' : dotCount > 0 ? '.' : null;
  if (!separator) {
    const integer = parseIntegerDigits(text);
    return integer === null ? { kind: 'invalid', valueCents: null } : recognized(integer * 100);
  }

  const occurrences = separator === ',' ? commaCount : dotCount;
  if (occurrences === 1) {
    const index = text.indexOf(separator);
    const integerPart = text.slice(0, index);
    const tail = text.slice(index + 1);
    if (!/^\d+$/.test(integerPart) || !/^\d+$/.test(tail)) return { kind: 'invalid', valueCents: null };
    if (tail.length === 3) return { kind: 'ambiguous', valueCents: null };
    if (tail.length < 1 || tail.length > 2) return { kind: 'invalid', valueCents: null };
    const integer = parseIntegerDigits(integerPart);
    if (integer === null) return { kind: 'invalid', valueCents: null };
    return recognized(integer * 100 + Number(tail.padEnd(2, '0')));
  }

  if (!validThousandsGroups(text, separator)) return { kind: 'invalid', valueCents: null };
  const integer = parseIntegerDigits(text.split(separator).join(''));
  return integer === null ? { kind: 'invalid', valueCents: null } : recognized(integer * 100);
}

function exactKeys(record: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

export function validateCountCaptureExtractionRegionInputs(raw: unknown): CountCaptureExtractionRegionInput[] {
  if (!Array.isArray(raw) || raw.length !== COUNT_CAPTURE_EXTRACTION_FIELD_KEYS.length) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
  const seen = new Set<string>();
  const regions = raw.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
    const region = item as Record<string, unknown>;
    if (!exactKeys(region, ['key', 'mimeType', 'dataBase64', 'sha256'])) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
    if (typeof region.key !== 'string' || !COUNT_CAPTURE_EXTRACTION_FIELD_KEYS.includes(region.key as CountCaptureFieldKey) || seen.has(region.key)) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
    if (region.mimeType !== 'image/jpeg') throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
    if (typeof region.dataBase64 !== 'string' || region.dataBase64.length < 4 || region.dataBase64.length > MAX_REGION_BASE64_CHARS || region.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(region.dataBase64)) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
    if (!isValidCountCaptureSha256(region.sha256)) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
    seen.add(region.key);
    return { key: region.key as CountCaptureFieldKey, mimeType: 'image/jpeg' as const, dataBase64: region.dataBase64, sha256: region.sha256 };
  });
  if (COUNT_CAPTURE_EXTRACTION_FIELD_KEYS.some((key) => !seen.has(key))) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_REGIONS');
  return regions;
}

export function validateCountCaptureProviderResult(raw: unknown): CountCaptureProviderResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
  const record = raw as Record<string, unknown>;
  if (!exactKeys(record, ['fields']) || !Array.isArray(record.fields) || record.fields.length !== COUNT_CAPTURE_EXTRACTION_FIELD_KEYS.length) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
  const seen = new Set<string>();
  const fields = record.fields.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
    const field = item as Record<string, unknown>;
    if (!exactKeys(field, ['key', 'status', 'observation'])) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
    if (typeof field.key !== 'string' || !COUNT_CAPTURE_EXTRACTION_FIELD_KEYS.includes(field.key as CountCaptureFieldKey) || seen.has(field.key)) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
    if (typeof field.status !== 'string' || !COUNT_CAPTURE_EXTRACTION_PROVIDER_STATUSES.includes(field.status as CountCaptureExtractionProviderStatus)) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
    if (typeof field.observation !== 'string' || field.observation.length > COUNT_CAPTURE_EXTRACTION_MAX_OBSERVATION_CHARS) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
    seen.add(field.key);
    return { key: field.key as CountCaptureFieldKey, status: field.status as CountCaptureExtractionProviderStatus, observation: field.observation.trim() };
  });
  if (COUNT_CAPTURE_EXTRACTION_FIELD_KEYS.some((key) => !seen.has(key))) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
  return { fields };
}

export function buildCountCaptureCandidatesFromProvider(input: { provider: CountCaptureProviderResult; regions: Partial<Record<CountCaptureFieldKey, CountCaptureRegion | null>> }): CountCaptureCandidateField[] {
  return COUNT_CAPTURE_EXTRACTION_FIELD_KEYS.map((key) => {
    const field = input.provider.fields.find((candidate) => candidate.key === key);
    if (!field) throw new Error('COUNT_CAPTURE_EXTRACTION_INVALID_PROVIDER_OUTPUT');
    const region = input.regions[key] || null;
    if (field.status === 'blank' || field.status === 'unreadable') return { key, state: 'unresolved', valueCents: null, confidence: null, source: 'vision', region };
    if (field.status === 'uncertain') return { key, state: 'uncertain', valueCents: null, confidence: null, source: 'vision', region };
    const parsed = parseCountCaptureMoneyObservation(field.observation);
    if (parsed.kind !== 'recognized') return { key, state: parsed.kind === 'blank' ? 'unresolved' : 'uncertain', valueCents: null, confidence: null, source: 'vision', region };
    return { key, state: 'recognized', valueCents: parsed.valueCents, confidence: null, source: 'vision', region };
  });
}

export function hasActiveCountCaptureExtractionLease(session: any, nowMs = Date.now()): boolean {
  const lease = session?.captureExtractionLease;
  return Boolean(lease && typeof lease === 'object' && Number.isFinite(Number(lease.expiresAtEpochMs)) && Number(lease.expiresAtEpochMs) > nowMs);
}
