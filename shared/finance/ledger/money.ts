export function assertAmountCents(amount: number): void {
  if (typeof amount !== 'number') {
    throw new Error('AMOUNT_MUST_BE_NUMBER');
  }
  if (!Number.isInteger(amount)) {
    throw new Error('AMOUNT_MUST_BE_INTEGER');
  }
  if (amount < 0) {
    throw new Error('AMOUNT_MUST_BE_POSITIVE');
  }
  if (!Number.isSafeInteger(amount)) {
    throw new Error('AMOUNT_EXCEEDS_SAFE_INTEGER');
  }
}

export function sumAmountCents(amounts: number[]): number {
  let total = 0;
  for (const amt of amounts) {
    assertAmountCents(amt);
    total += amt;
    if (!Number.isSafeInteger(total)) {
      throw new Error('TOTAL_EXCEEDS_SAFE_INTEGER');
    }
  }
  return total;
}

export function compareAmountCents(a: number, b: number): number {
  assertAmountCents(a);
  assertAmountCents(b);
  return a - b;
}

export function validateAllocationTotal(allocations: number[], expectedTotal: number): void {
  assertAmountCents(expectedTotal);
  if (expectedTotal === 0) {
    throw new Error('FINANCE_INVALID_AMOUNT');
  }
  const total = sumAmountCents(allocations);
  if (total !== expectedTotal) {
    throw new Error('FINANCE_ALLOCATION_TOTAL_MISMATCH');
  }
}
