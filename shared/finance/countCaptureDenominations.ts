import {
  COUNT_CASH_ENTRY_TYPES,
  COUNT_DENOMINATIONS_CENTS,
  calculateDenominationTotalCents,
  type CountCashEntryType,
  type CountDenominationCents,
} from './count.js';
import type { CountCaptureCandidateState, CountCaptureRegion } from './countCapture.js';

export const COUNT_CAPTURE_DENOMINATION_SCHEMA_VERSION = 1 as const;
export const COUNT_CAPTURE_DENOMINATION_PROVIDER_STATUSES = ['recognized', 'uncertain', 'unreadable', 'blank'] as const;
export const COUNT_CAPTURE_DENOMINATION_MAX_OBSERVATION_CHARS = 16;
export const COUNT_CAPTURE_DENOMINATION_MAX_REGION_BYTES = 96 * 1024;
export const COUNT_CAPTURE_DENOMINATION_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
export const COUNT_CAPTURE_DENOMINATION_TIMEOUT_MS = 15_000;
export const COUNT_CAPTURE_DENOMINATION_MAX_QUANTITY = 1_000_000;

export type CountCaptureDenominationProviderStatus = (typeof COUNT_CAPTURE_DENOMINATION_PROVIDER_STATUSES)[number];
export type CountCaptureDenominationDecision = 'confirmed' | 'corrected' | 'blank' | 'unreadable';
export type CountCaptureDenominationCellKey = `${CountCashEntryType}:${CountDenominationCents}`;
export type CountCaptureDenominationCandidate = {
  cellKey: CountCaptureDenominationCellKey;
  entryType: CountCashEntryType;
  denominationCents: CountDenominationCents;
  state: CountCaptureCandidateState;
  quantity: number | null;
  confidence: number | null;
  source: 'none' | 'vision';
  region: CountCaptureRegion | null;
};
export type CountCaptureDenominationReviewInput = {
  cellKey: CountCaptureDenominationCellKey;
  decision: CountCaptureDenominationDecision;
  quantity: number | null;
};
export type CountCaptureReviewedDenomination = CountCaptureDenominationReviewInput & {
  candidateQuantity: number | null;
  candidateState: CountCaptureCandidateState;
  entryType: CountCashEntryType;
  denominationCents: CountDenominationCents;
};
export type CountCaptureDenominationProviderField = {
  cellKey: CountCaptureDenominationCellKey;
  status: CountCaptureDenominationProviderStatus;
  observation: string;
};
export type CountCaptureDenominationProviderResult = { fields: CountCaptureDenominationProviderField[] };
export type CountCaptureDenominationRegionInput = {
  cellKey: CountCaptureDenominationCellKey;
  mimeType: 'image/jpeg';
  dataBase64: string;
  sha256: string;
};

const CELL_KEYS = COUNT_CASH_ENTRY_TYPES.flatMap((entryType) =>
  COUNT_DENOMINATIONS_CENTS.map((denominationCents) => `${entryType}:${denominationCents}` as CountCaptureDenominationCellKey),
);
export const COUNT_CAPTURE_DENOMINATION_CELL_KEYS = Object.freeze([...CELL_KEYS]);
const MAX_REGION_BASE64_CHARS = Math.ceil(COUNT_CAPTURE_DENOMINATION_MAX_REGION_BYTES / 3) * 4 + 4;

export function parseCountCaptureDenominationCellKey(value: unknown): { entryType: CountCashEntryType; denominationCents: CountDenominationCents } | null {
  if (typeof value !== 'string') return null;
  const [entryType, denominationRaw, extra] = value.split(':');
  const denominationCents = Number(denominationRaw);
  if (extra !== undefined || !COUNT_CASH_ENTRY_TYPES.includes(entryType as CountCashEntryType) || !COUNT_DENOMINATIONS_CENTS.includes(denominationCents as CountDenominationCents)) return null;
  return { entryType: entryType as CountCashEntryType, denominationCents: denominationCents as CountDenominationCents };
}

export function getCountCaptureDenominationRegion(templateVersion: number, entryType: CountCashEntryType, denominationCents: CountDenominationCents): CountCaptureRegion | null {
  if (templateVersion !== 1) return null;
  const rowIndex = COUNT_DENOMINATIONS_CENTS.indexOf(denominationCents);
  const columnIndex = COUNT_CASH_ENTRY_TYPES.indexOf(entryType);
  if (rowIndex < 0 || columnIndex < 0) return null;
  const tableX = 0.015;
  const tableY = 0.345;
  const tableWidth = 0.97;
  const tableHeight = 0.365;
  const headerHeight = 0.031;
  const bodyHeight = tableHeight - headerHeight;
  const rowHeight = bodyHeight / COUNT_DENOMINATIONS_CENTS.length;
  const labelFraction = 1.1 / 4.1;
  const quantityFraction = 1 / 4.1;
  const columnX = tableX + tableWidth * (labelFraction + columnIndex * quantityFraction);
  const columnWidth = tableWidth * quantityFraction;
  const insetX = 0.006;
  const insetY = 0.0025;
  return {
    x: columnX + insetX,
    y: tableY + headerHeight + rowIndex * rowHeight + insetY,
    width: columnWidth - insetX * 2,
    height: rowHeight - insetY * 2,
  };
}

export function buildUnresolvedCountCaptureDenominationCandidates(templateVersion = 1): CountCaptureDenominationCandidate[] {
  return COUNT_CASH_ENTRY_TYPES.flatMap((entryType) =>
    COUNT_DENOMINATIONS_CENTS.map((denominationCents) => ({
      cellKey: `${entryType}:${denominationCents}` as CountCaptureDenominationCellKey,
      entryType,
      denominationCents,
      state: 'unresolved' as const,
      quantity: null,
      confidence: null,
      source: 'none' as const,
      region: getCountCaptureDenominationRegion(templateVersion, entryType, denominationCents),
    })),
  );
}

export function parseCountCaptureQuantityObservation(raw: unknown): { kind: 'recognized'; quantity: number } | { kind: 'blank' | 'ambiguous' | 'invalid'; quantity: null } {
  if (typeof raw !== 'string') return { kind: 'invalid', quantity: null };
  const text = raw.trim();
  if (!text) return { kind: 'blank', quantity: null };
  if (!/^\d+$/.test(text)) return { kind: /\d/.test(text) ? 'ambiguous' : 'invalid', quantity: null };
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > COUNT_CAPTURE_DENOMINATION_MAX_QUANTITY) return { kind: 'invalid', quantity: null };
  return { kind: 'recognized', quantity };
}

function exactKeys(record: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

export function validateCountCaptureDenominationRegionInputs(raw: unknown): CountCaptureDenominationRegionInput[] {
  if (!Array.isArray(raw) || raw.length !== COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
  const seen = new Set<string>();
  const regions = raw.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
    const region = item as Record<string, unknown>;
    if (!exactKeys(region, ['cellKey', 'mimeType', 'dataBase64', 'sha256'])) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
    if (typeof region.cellKey !== 'string' || !COUNT_CAPTURE_DENOMINATION_CELL_KEYS.includes(region.cellKey as CountCaptureDenominationCellKey) || seen.has(region.cellKey)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
    if (region.mimeType !== 'image/jpeg') throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
    if (typeof region.dataBase64 !== 'string' || region.dataBase64.length < 4 || region.dataBase64.length > MAX_REGION_BASE64_CHARS || region.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(region.dataBase64)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
    if (typeof region.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(region.sha256)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
    seen.add(region.cellKey);
    return { cellKey: region.cellKey as CountCaptureDenominationCellKey, mimeType: 'image/jpeg' as const, dataBase64: region.dataBase64, sha256: region.sha256 };
  });
  if (COUNT_CAPTURE_DENOMINATION_CELL_KEYS.some((key) => !seen.has(key))) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REGIONS');
  return regions;
}

export function validateCountCaptureDenominationProviderResult(raw: unknown): CountCaptureDenominationProviderResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
  const record = raw as Record<string, unknown>;
  if (!exactKeys(record, ['fields']) || !Array.isArray(record.fields) || record.fields.length !== COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
  const seen = new Set<string>();
  const fields = record.fields.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
    const field = item as Record<string, unknown>;
    if (!exactKeys(field, ['cellKey', 'status', 'observation'])) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
    if (typeof field.cellKey !== 'string' || !COUNT_CAPTURE_DENOMINATION_CELL_KEYS.includes(field.cellKey as CountCaptureDenominationCellKey) || seen.has(field.cellKey)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
    if (typeof field.status !== 'string' || !COUNT_CAPTURE_DENOMINATION_PROVIDER_STATUSES.includes(field.status as CountCaptureDenominationProviderStatus)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
    if (typeof field.observation !== 'string' || field.observation.length > COUNT_CAPTURE_DENOMINATION_MAX_OBSERVATION_CHARS) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
    seen.add(field.cellKey);
    return { cellKey: field.cellKey as CountCaptureDenominationCellKey, status: field.status as CountCaptureDenominationProviderStatus, observation: field.observation.trim() };
  });
  if (COUNT_CAPTURE_DENOMINATION_CELL_KEYS.some((key) => !seen.has(key))) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
  return { fields };
}

export function buildCountCaptureDenominationCandidatesFromProvider(input: {
  provider: CountCaptureDenominationProviderResult;
  regions: Partial<Record<CountCaptureDenominationCellKey, CountCaptureRegion | null>>;
}): CountCaptureDenominationCandidate[] {
  return COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey) => {
    const identity = parseCountCaptureDenominationCellKey(cellKey)!;
    const field = input.provider.fields.find((candidate) => candidate.cellKey === cellKey);
    if (!field) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_PROVIDER_OUTPUT');
    const region = input.regions[cellKey] || null;
    if (field.status === 'blank' || field.status === 'unreadable') return { cellKey, ...identity, state: 'unresolved', quantity: null, confidence: null, source: 'vision', region };
    if (field.status === 'uncertain') return { cellKey, ...identity, state: 'uncertain', quantity: null, confidence: null, source: 'vision', region };
    const parsed = parseCountCaptureQuantityObservation(field.observation);
    if (parsed.kind !== 'recognized') return { cellKey, ...identity, state: parsed.kind === 'blank' ? 'unresolved' : 'uncertain', quantity: null, confidence: null, source: 'vision', region };
    return { cellKey, ...identity, state: 'recognized', quantity: parsed.quantity, confidence: null, source: 'vision', region };
  });
}

export function validateCountCaptureDenominationReview(value: unknown): CountCaptureDenominationReviewInput[] {
  if (!Array.isArray(value) || value.length !== COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REVIEW');
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REVIEW');
    const input = item as Record<string, unknown>;
    const identity = parseCountCaptureDenominationCellKey(input.cellKey);
    if (!identity || seen.has(String(input.cellKey))) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REVIEW');
    const decision = String(input.decision || '');
    if (!['confirmed', 'corrected', 'blank', 'unreadable'].includes(decision)) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REVIEW');
    const quantity = input.quantity;
    if (decision === 'blank' || decision === 'unreadable') {
      if (quantity !== null) throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REVIEW');
    } else if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0 || quantity > COUNT_CAPTURE_DENOMINATION_MAX_QUANTITY) {
      throw new Error('COUNT_CAPTURE_DENOMINATION_INVALID_REVIEW');
    }
    seen.add(String(input.cellKey));
    return { cellKey: input.cellKey as CountCaptureDenominationCellKey, decision: decision as CountCaptureDenominationDecision, quantity: quantity as number | null };
  });
}

export function calculateReviewedDenominationSubtotals(reviewed: CountCaptureReviewedDenomination[]): Record<CountCashEntryType, number | null> {
  return Object.fromEntries(COUNT_CASH_ENTRY_TYPES.map((entryType) => {
    const rows = reviewed.filter((row) => row.entryType === entryType);
    if (rows.length !== COUNT_DENOMINATIONS_CENTS.length || rows.some((row) => row.decision === 'unreadable')) return [entryType, null];
    const quantities: Record<string, number> = {};
    for (const row of rows) if (row.decision !== 'blank' && row.quantity !== null) quantities[String(row.denominationCents)] = row.quantity;
    return [entryType, calculateDenominationTotalCents(quantities)];
  })) as Record<CountCashEntryType, number | null>;
}
