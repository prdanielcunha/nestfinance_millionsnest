export const COUNT_ENTRY_TYPES = ['tithe', 'offering', 'other', 'pix'] as const;
export type CountEntryType = (typeof COUNT_ENTRY_TYPES)[number];

export const COUNT_CASH_ENTRY_TYPES = ['tithe', 'offering', 'other'] as const;
export type CountCashEntryType = (typeof COUNT_CASH_ENTRY_TYPES)[number];

export type CountEntryMethod = 'denominations' | 'total';

export const COUNT_DENOMINATIONS_CENTS = [
  10000,
  5000,
  2000,
  1000,
  500,
  200,
  100,
  50,
  25,
  10,
  5,
] as const;

export type CountDenominationCents = (typeof COUNT_DENOMINATIONS_CENTS)[number];

export type CountDenominationQuantities = Record<string, number>;

export type CountEntryDraft = {
  type: CountEntryType;
  method: CountEntryMethod;
  totalCents?: number;
  denominations?: CountDenominationQuantities;
};

export type NormalizedCountEntry = {
  type: CountEntryType;
  channel: 'cash' | 'pix';
  method: CountEntryMethod;
  totalCents: number;
  denominations: CountDenominationQuantities;
};

export function isCountEntryType(value: unknown): value is CountEntryType {
  return typeof value === 'string' && COUNT_ENTRY_TYPES.includes(value as CountEntryType);
}

export function isCashCountEntryType(value: CountEntryType): value is CountCashEntryType {
  return (COUNT_CASH_ENTRY_TYPES as readonly string[]).includes(value);
}

export function calculateDenominationTotalCents(
  quantities: CountDenominationQuantities | null | undefined,
): number {
  if (!quantities || typeof quantities !== 'object') return 0;

  let total = 0;
  for (const denomination of COUNT_DENOMINATIONS_CENTS) {
    const raw = quantities[String(denomination)] ?? 0;
    if (!Number.isInteger(raw) || raw < 0 || raw > 1_000_000) {
      throw new Error('COUNT_INVALID_DENOMINATION_QUANTITY');
    }
    total += denomination * raw;
    if (!Number.isSafeInteger(total) || total > 10_000_000_000) {
      throw new Error('COUNT_TOTAL_OUT_OF_RANGE');
    }
  }
  return total;
}

export function normalizeCountEntry(entry: CountEntryDraft): NormalizedCountEntry {
  if (!entry || !isCountEntryType(entry.type)) {
    throw new Error('COUNT_INVALID_ENTRY_TYPE');
  }

  if (entry.type === 'pix') {
    if (entry.method !== 'total') throw new Error('COUNT_PIX_REQUIRES_TOTAL');
    const totalCents = Number(entry.totalCents);
    if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 10_000_000_000) {
      throw new Error('COUNT_INVALID_TOTAL');
    }
    return {
      type: entry.type,
      channel: 'pix',
      method: 'total',
      totalCents,
      denominations: {},
    };
  }

  if (entry.method === 'denominations') {
    const normalizedQuantities: CountDenominationQuantities = {};
    for (const denomination of COUNT_DENOMINATIONS_CENTS) {
      const quantity = entry.denominations?.[String(denomination)] ?? 0;
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) {
        throw new Error('COUNT_INVALID_DENOMINATION_QUANTITY');
      }
      if (quantity > 0) normalizedQuantities[String(denomination)] = quantity;
    }
    return {
      type: entry.type,
      channel: 'cash',
      method: 'denominations',
      totalCents: calculateDenominationTotalCents(normalizedQuantities),
      denominations: normalizedQuantities,
    };
  }

  if (entry.method === 'total') {
    const totalCents = Number(entry.totalCents);
    if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 10_000_000_000) {
      throw new Error('COUNT_INVALID_TOTAL');
    }
    return {
      type: entry.type,
      channel: 'cash',
      method: 'total',
      totalCents,
      denominations: {},
    };
  }

  throw new Error('COUNT_INVALID_ENTRY_METHOD');
}

export function normalizeCountEntries(
  entries: CountEntryDraft[] | null | undefined,
): NormalizedCountEntry[] {
  if (!Array.isArray(entries)) return [];
  if (entries.length > COUNT_ENTRY_TYPES.length) throw new Error('COUNT_TOO_MANY_ENTRIES');

  const seen = new Set<string>();
  const normalized = entries.map((entry) => {
    const value = normalizeCountEntry(entry);
    if (seen.has(value.type)) throw new Error('COUNT_DUPLICATE_ENTRY_TYPE');
    seen.add(value.type);
    return value;
  });

  return normalized.sort(
    (a, b) => COUNT_ENTRY_TYPES.indexOf(a.type) - COUNT_ENTRY_TYPES.indexOf(b.type),
  );
}

export function calculateCountEntriesTotalCents(entries: NormalizedCountEntry[]): number {
  return entries.reduce((total, entry) => {
    const next = total + entry.totalCents;
    if (!Number.isSafeInteger(next) || next > 20_000_000_000) {
      throw new Error('COUNT_TOTAL_OUT_OF_RANGE');
    }
    return next;
  }, 0);
}

export function buildCountMaterialFingerprint(input: {
  serviceLabel?: string;
  serviceDate?: string;
  entries?: CountEntryDraft[];
}): string {
  const normalized = {
    serviceLabel: String(input.serviceLabel || '').trim(),
    serviceDate: String(input.serviceDate || ''),
    entries: normalizeCountEntries(input.entries || []),
  };

  // This value is only an in-memory material identity for retry reuse. Returning
  // the canonical JSON itself avoids hash collisions and keeps this shared
  // domain module browser-safe. Server idempotency still uses SHA-256.
  return JSON.stringify(normalized);
}

export function generateCountSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('COUNT_SECURE_RANDOM_UNAVAILABLE');
  }
  return `cnt_${globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

export function isValidCountSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^cnt_[a-f0-9]{24}$/.test(value);
}

export function validateCountServiceLabel(value: unknown): string {
  const label = typeof value === 'string' ? value.trim() : '';
  if (!label || label.length > 120) throw new Error('COUNT_INVALID_SERVICE_LABEL');
  return label;
}

export function validateCountServiceDate(value: unknown): string {
  const date = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('COUNT_INVALID_SERVICE_DATE');
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('COUNT_INVALID_SERVICE_DATE');
  }
  return date;
}
