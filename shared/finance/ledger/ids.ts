export type TransactionId = string;
export type AllocationId = string;
export type JournalEntryId = string;
export type JournalLineId = string;
export type LedgerAccountId = string;
export type EvidenceId = string;
export type IdempotencyKey = string;
export type RequestId = string;

export function isValidLedgerId(prefix: string, id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // expects prefix_ + hex string of length 16 to 64
  const regex = new RegExp(`^${prefix}_[a-f0-9]{16,64}$`);
  return regex.test(id);
}

export function generateLedgerId(prefix: string): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const array = new Uint8Array(20);
    globalThis.crypto.getRandomValues(array);
    const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${hex}`;
  } else {
    throw new Error('CRYPTO_NOT_AVAILABLE');
  }
}

export function generateTransactionId(): TransactionId {
  return generateLedgerId('tx');
}

export function generateAllocationId(): AllocationId {
  return generateLedgerId('alloc');
}

export function generateAuditId(): string {
  return generateLedgerId('audit');
}

export function isValidTransactionId(id: string): boolean {
  return isValidLedgerId('tx', id);
}

export function isValidAllocationId(id: string): boolean {
  return isValidLedgerId('alloc', id);
}

export function isValidJournalEntryId(id: string): boolean {
  return isValidLedgerId('je', id);
}

export function isValidJournalLineId(id: string): boolean {
  return isValidLedgerId('jl', id);
}

export function isValidIdempotencyKey(key: string): boolean {
  return typeof key === 'string' && key.length >= 8 && key.length <= 128;
}

export function isValidRequestId(id: string): boolean {
  return typeof id === 'string' && id.length >= 8 && id.length <= 128;
}

export function assertValidExpectedVersion(version: number): void {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new Error('FINANCE_VERSION_CONFLICT');
  }
}
