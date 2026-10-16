import type { NormalizedCountEntry } from './count.js';

/**
 * Contribution PURPOSE and RECEIPT METHOD are independent dimensions.
 * This module is deterministic and read-only. It never writes ledger entries,
 * moves money, decides a missing purpose, or changes historical Count records.
 */
export const CONTRIBUTION_PURPOSES = ['tithe', 'offering', 'other', 'unclassified'] as const;
export type ContributionPurpose = (typeof CONTRIBUTION_PURPOSES)[number];

export const CONTRIBUTION_RECEIPT_METHODS = ['cash', 'pix', 'card', 'bank_transfer', 'other'] as const;
export type ContributionReceiptMethod = (typeof CONTRIBUTION_RECEIPT_METHODS)[number];

export type ContributionClassificationSource = 'explicit' | 'legacy_unclassified';

export type ContributionAllocation = {
  purpose: ContributionPurpose;
  receiptMethod: ContributionReceiptMethod;
  amountCents: number;
  classificationSource: ContributionClassificationSource;
};

export type ContributionBreakdown = {
  totalCents: number;
  byPurpose: Record<ContributionPurpose, number>;
  byReceiptMethod: Record<ContributionReceiptMethod, number>;
  unclassifiedCents: number;
  requiresPurposeReview: boolean;
};

const MAX_LINE_CENTS = 10_000_000_000;
const MAX_TOTAL_CENTS = 20_000_000_000;
const MAX_LINES = 100;

function isPurpose(value: unknown): value is ContributionPurpose {
  return typeof value === 'string' && (CONTRIBUTION_PURPOSES as readonly string[]).includes(value);
}

function isReceiptMethod(value: unknown): value is ContributionReceiptMethod {
  return typeof value === 'string' && (CONTRIBUTION_RECEIPT_METHODS as readonly string[]).includes(value);
}

function safeAdd(left: number, right: number) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum > MAX_TOTAL_CENTS) {
    throw new Error('CONTRIBUTION_TOTAL_OUT_OF_RANGE');
  }
  return sum;
}

export function normalizeContributionAllocations(input: unknown): ContributionAllocation[] {
  if (!Array.isArray(input) || input.length > MAX_LINES) {
    throw new Error('CONTRIBUTION_INVALID_ALLOCATION_LIST');
  }
  return input.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('CONTRIBUTION_INVALID_ALLOCATION');
    }
    const raw = row as Record<string, unknown>;
    if (!isPurpose(raw.purpose) || !isReceiptMethod(raw.receiptMethod)) {
      throw new Error('CONTRIBUTION_INVALID_DIMENSIONS');
    }
    const amountCents = raw.amountCents;
    if (
      typeof amountCents !== 'number' ||
      !Number.isSafeInteger(amountCents) ||
      amountCents < 0 ||
      amountCents > MAX_LINE_CENTS
    ) {
      throw new Error('CONTRIBUTION_INVALID_AMOUNT');
    }
    if (raw.classificationSource !== 'explicit' && raw.classificationSource !== 'legacy_unclassified') {
      throw new Error('CONTRIBUTION_INVALID_CLASSIFICATION_SOURCE');
    }
    if (raw.classificationSource === 'legacy_unclassified' && raw.purpose !== 'unclassified') {
      throw new Error('CONTRIBUTION_LEGACY_PURPOSE_NOT_VERIFIED');
    }
    return {
      purpose: raw.purpose,
      receiptMethod: raw.receiptMethod,
      amountCents,
      classificationSource: raw.classificationSource,
    };
  });
}

export function summarizeContributions(input: unknown): ContributionBreakdown {
  const allocations = normalizeContributionAllocations(input);
  const byPurpose: Record<ContributionPurpose, number> = {
    tithe: 0, offering: 0, other: 0, unclassified: 0,
  };
  const byReceiptMethod: Record<ContributionReceiptMethod, number> = {
    cash: 0, pix: 0, card: 0, bank_transfer: 0, other: 0,
  };

  let totalCents = 0;
  for (const item of allocations) {
    totalCents = safeAdd(totalCents, item.amountCents);
    byPurpose[item.purpose] = safeAdd(byPurpose[item.purpose], item.amountCents);
    byReceiptMethod[item.receiptMethod] = safeAdd(byReceiptMethod[item.receiptMethod], item.amountCents);
  }

  const purposeTotal = Object.values(byPurpose).reduce(safeAdd, 0);
  const methodTotal = Object.values(byReceiptMethod).reduce(safeAdd, 0);
  if (purposeTotal !== totalCents || methodTotal !== totalCents) {
    throw new Error('CONTRIBUTION_DIMENSION_TOTAL_MISMATCH');
  }

  return {
    totalCents,
    byPurpose,
    byReceiptMethod,
    unclassifiedCents: byPurpose.unclassified,
    requiresPurposeReview: byPurpose.unclassified > 0,
  };
}

/**
 * Decode legacy Count without guessing the purpose of Pix receipts.
 * Old cash totals have known purposes, while old Pix totals have only a
 * known receipt method. Original values remain untouched.
 */
export function legacyCountToContributionAllocations(
  entries: NormalizedCountEntry[],
): ContributionAllocation[] {
  if (!Array.isArray(entries)) throw new Error('CONTRIBUTION_INVALID_LEGACY_COUNT');
  const converted = entries.map((entry) => {
    if (!entry || !Number.isSafeInteger(entry.totalCents) || entry.totalCents < 0) {
      throw new Error('CONTRIBUTION_INVALID_LEGACY_COUNT');
    }
    if (entry.type === 'pix' && entry.channel === 'pix') {
      return {
        purpose: 'unclassified' as const,
        receiptMethod: 'pix' as const,
        amountCents: entry.totalCents,
        classificationSource: 'legacy_unclassified' as const,
      };
    }
    if (entry.channel !== 'cash' || !(['tithe', 'offering', 'other'] as const).includes(
      entry.type as 'tithe' | 'offering' | 'other',
    )) {
      throw new Error('CONTRIBUTION_LEGACY_DIMENSIONS_INCONSISTENT');
    }
    return {
      purpose: entry.type as 'tithe' | 'offering' | 'other',
      receiptMethod: 'cash' as const,
      amountCents: entry.totalCents,
      classificationSource: 'explicit' as const,
    };
  });

  const summary = summarizeContributions(converted);
  const countTotal = entries.reduce((total, row) => safeAdd(total, row.totalCents), 0);
  if (summary.totalCents !== countTotal) {
    throw new Error('CONTRIBUTION_LEGACY_TOTAL_MISMATCH');
  }
  return converted;
}

export function verifyContributionTotal(input: unknown, expectedTotalCents: number): ContributionBreakdown {
  if (!Number.isSafeInteger(expectedTotalCents) || expectedTotalCents < 0 || expectedTotalCents > MAX_TOTAL_CENTS) {
    throw new Error('CONTRIBUTION_INVALID_EXPECTED_TOTAL');
  }
  const summary = summarizeContributions(input);
  if (summary.totalCents !== expectedTotalCents) {
    throw new Error('CONTRIBUTION_EXPECTED_TOTAL_MISMATCH');
  }
  return summary;
}
