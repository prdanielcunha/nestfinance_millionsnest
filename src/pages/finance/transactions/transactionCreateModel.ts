import type { Language } from '@/src/contexts/LanguageContext';

export type TransactionCreateDirection =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'liability_settlement';

export const TRANSACTION_CREATE_DIRECTIONS: readonly TransactionCreateDirection[] = [
  'income',
  'expense',
  'transfer',
  'liability_settlement',
] as const;

export function normalizeTransactionCreateDirection(
  value: string | null | undefined,
): TransactionCreateDirection {
  return TRANSACTION_CREATE_DIRECTIONS.includes(value as TransactionCreateDirection)
    ? (value as TransactionCreateDirection)
    : 'expense';
}

const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  PT: 'pt-BR',
  EN: 'en-US',
  ES: 'es-ES',
};

export function getTransactionCreateLocale(language: Language): string {
  return LOCALE_BY_LANGUAGE[language];
}

export function formatTransactionInputAmount(
  cents: number | string | null | undefined,
  language: Language,
): string {
  const numeric = typeof cents === 'number' ? cents : Number.parseInt(String(cents || '0'), 10);
  const safeCents = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat(getTransactionCreateLocale(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

export function formatTransactionCurrency(
  cents: number,
  language: Language,
): string {
  const safeCents = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat(getTransactionCreateLocale(language), {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

export function buildTransactionCreateMaterialFingerprint(payload: any): string {
  const allocations = Array.isArray(payload?.allocations)
    ? payload.allocations
        .map((allocation: any) => ({
          categoryId: allocation?.categoryId || '',
          fundId: allocation?.fundId || '',
          costCenterId: allocation?.costCenterId || '',
          amountCents: Number(allocation?.amountCents || 0),
        }))
        .sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : [];

  const evidenceIds = Array.isArray(payload?.evidenceIds)
    ? [...payload.evidenceIds].map(String).sort()
    : [];

  return JSON.stringify({
    direction: payload?.direction || '',
    amountCents: Number(payload?.amountCents || 0),
    occurredAt: payload?.occurredAt || '',
    accountId: payload?.accountId || '',
    destinationAccountId: payload?.destinationAccountId || '',
    paymentMethod: payload?.paymentMethod || '',
    description: payload?.description || '',
    counterparty: payload?.counterparty || '',
    evidenceIds,
    evidenceJustification: payload?.evidenceJustification || '',
    settlementType: payload?.settlementType || '',
    liabilityAccountId: payload?.liabilityAccountId || '',
    allocations,
  });
}
