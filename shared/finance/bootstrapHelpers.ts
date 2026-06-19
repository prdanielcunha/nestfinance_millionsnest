import { createHash } from 'crypto';

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .trim();
}

export function buildAccountUniqKey(financeEntityId: string, name: string): string {
  const logicalKey = `account:${financeEntityId}:${normalizeName(name)}`;
  const hash = createHash('sha256').update(logicalKey).digest('hex');
  return `uniq_${hash}`;
}

export function buildFundUniqKey(financeEntityId: string, name: string): string {
  const logicalKey = `fund:${financeEntityId}:${normalizeName(name)}`;
  const hash = createHash('sha256').update(logicalKey).digest('hex');
  return `uniq_${hash}`;
}

export function buildCategoryUniqKey(financeEntityId: string, kind: 'income' | 'expense', name: string): string {
  const logicalKey = `category:${financeEntityId}:${kind}:${normalizeName(name)}`;
  const hash = createHash('sha256').update(logicalKey).digest('hex');
  return `uniq_${hash}`;
}
