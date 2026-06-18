import { createHash, randomBytes } from 'crypto';

export function normalizeFinanceName(name: string): string {
  const trimmed = name.trim();
  const compacted = trimmed.replace(/\s+/g, ' ');
  const normalized = compacted
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  if (normalized.length < 1) {
    throw new Error('INVALID_NORMALIZED_NAME');
  }
  return normalized;
}

export type FinanceEntityPrefix = 'acc' | 'fund' | 'cat';

export function generateStableId(prefix: FinanceEntityPrefix): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

export function buildUniqueKeyLogicName(
  type: 'account' | 'fund' | 'category',
  normalizedName: string,
  kind?: 'income' | 'expense'
): string {
  if (type === 'category') {
    if (!kind) throw new Error('CATEGORY_KIND_REQUIRED');
    return `category:${kind}:${normalizedName}`;
  }
  return `${type}:${normalizedName}`;
}

export function generateUniqueKeyId(logicalKey: string): string {
  const digest = createHash('sha256').update(logicalKey).digest('hex');
  return `uniq_${digest.substring(0, 32)}`;
}

export function isValidAccountId(id: string): boolean {
  return /^acc_(?:[a-f0-9]{16}|[a-f0-9]{32})$/.test(id);
}

export function isValidFundId(id: string): boolean {
  return /^fund_(?:[a-f0-9]{16}|[a-f0-9]{32})$/.test(id);
}

export function isValidCategoryId(id: string): boolean {
  return /^cat_(?:[a-f0-9]{16}|[a-f0-9]{32})$/.test(id);
}
