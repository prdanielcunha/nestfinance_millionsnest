export const TRANSACTION_SEARCH_SCHEMA_VERSION = 1 as const;
export const TRANSACTION_SEARCH_MIN_QUERY_LENGTH = 2 as const;
export const TRANSACTION_SEARCH_MAX_QUERY_LENGTH = 64 as const;
export const TRANSACTION_SEARCH_MAX_KEYS = 256 as const;
export const TRANSACTION_SEARCH_MAX_PREFIX_LENGTH = 24 as const;

export type TransactionSearchDocument = {
  transactionId: string;
  organizationId: string;
  financeEntityId: string;
  sourceVersion: number;
  searchKeys: string[];
  schemaVersion: typeof TRANSACTION_SEARCH_SCHEMA_VERSION;
  updatedAt?: unknown;
};

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
}

export function normalizeTransactionSearchText(value: unknown) {
  if (typeof value !== 'string') return '';
  return stripDiacritics(value)
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function transactionSearchTokens(values: unknown[]) {
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeTransactionSearchText(value);
    if (!normalized) continue;
    for (const token of normalized.split(' ')) {
      if (token.length < TRANSACTION_SEARCH_MIN_QUERY_LENGTH) continue;
      if (!output.includes(token)) output.push(token);
    }
  }
  return output;
}

export function buildTransactionSearchKeys(transaction: Record<string, any>) {
  const tokens = transactionSearchTokens([
    transaction.id,
    transaction.transactionId,
    transaction.description,
    transaction.counterparty,
    transaction.paymentMethod,
    transaction.sourceContext,
    transaction.accountId,
    transaction.sourceAccountId,
    transaction.destinationAccountId,
    transaction.liabilityAccountId,
    transaction.accountSnapshot?.name,
    transaction.liabilityAccountSnapshot?.name,
  ]);

  const keys = new Set<string>();
  for (const token of tokens) {
    const maximum = Math.min(token.length, TRANSACTION_SEARCH_MAX_PREFIX_LENGTH);
    for (
      let length = TRANSACTION_SEARCH_MIN_QUERY_LENGTH;
      length <= maximum;
      length += 1
    ) {
      keys.add(token.slice(0, length));
      if (keys.size >= TRANSACTION_SEARCH_MAX_KEYS) {
        return [...keys].sort();
      }
    }
  }
  return [...keys].sort();
}

export function normalizeTransactionSearchQuery(value: unknown) {
  const normalized = normalizeTransactionSearchText(value);
  if (
    normalized.length < TRANSACTION_SEARCH_MIN_QUERY_LENGTH ||
    normalized.length > TRANSACTION_SEARCH_MAX_QUERY_LENGTH
  ) {
    return null;
  }
  const tokens = normalized
    .split(' ')
    .filter((token) => token.length >= TRANSACTION_SEARCH_MIN_QUERY_LENGTH)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return {
    normalized,
    tokens,
    lookupKey: tokens[0].slice(0, TRANSACTION_SEARCH_MAX_PREFIX_LENGTH),
  };
}

export function transactionMatchesSearchQuery(
  transaction: Record<string, any>,
  query: string,
) {
  const normalizedQuery = normalizeTransactionSearchQuery(query);
  if (!normalizedQuery) return false;
  const candidateTokens = transactionSearchTokens([
    transaction.id,
    transaction.transactionId,
    transaction.description,
    transaction.counterparty,
    transaction.paymentMethod,
    transaction.sourceContext,
    transaction.accountId,
    transaction.sourceAccountId,
    transaction.destinationAccountId,
    transaction.liabilityAccountId,
    transaction.accountSnapshot?.name,
    transaction.liabilityAccountSnapshot?.name,
  ]);

  return normalizedQuery.tokens.every((queryToken) =>
    candidateTokens.some((candidate) => candidate.startsWith(queryToken)),
  );
}
