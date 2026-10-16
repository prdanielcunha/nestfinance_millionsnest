import {
  legacyCountToContributionAllocations,
  normalizeContributionAllocations,
  summarizeContributions,
  type ContributionAllocation,
  type ContributionPurpose,
  type ContributionReceiptMethod,
} from './contributionBreakdown.js';
import type { NormalizedCountEntry } from './count.js';

/**
 * Independent dimensions for all NEW Count receipts:
 * - purpose: where the church classified the contribution
 * - receipt method: how the money arrived
 *
 * Never treat "Pix" as a purpose or classify legacy unknown-purpose Pix
 * automatically as offerings/tithes. No persistence, posting, or balance
 * changes occur inside this pure contract.
 */
export type CountV3ClassifiedReceipt = {
  purpose: Exclude<ContributionPurpose, 'unclassified'>;
  receiptMethod: ContributionReceiptMethod;
  amountCents: number;
  classificationSource: 'explicit';
};

export type CountV3ReceiptValidation = {
  lines: CountV3ClassifiedReceipt[];
  totalCents: number;
  controlTotalCents: number | null;
  controlTotalMatches: boolean | null;
  byPurpose: Record<ContributionPurpose, number>;
  byReceiptMethod: Record<ContributionReceiptMethod, number>;
};

function controlTotal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 20_000_000_000) {
    throw new Error('COUNT_V3_CONTROL_TOTAL_INVALID');
  }
  return value;
}

export function validateCountV3ReceiptLines(
  value: unknown,
  writtenControlTotalCents: unknown = null,
): CountV3ReceiptValidation {
  const lines = normalizeContributionAllocations(value);
  if (!lines.length) throw new Error('COUNT_V3_RECEIPTS_EMPTY');
  if (lines.some(line => line.purpose === 'unclassified' || line.classificationSource !== 'explicit')) {
    throw new Error('COUNT_V3_PURPOSE_REQUIRED');
  }
  const summary = summarizeContributions(lines);
  const controlTotalCents = controlTotal(writtenControlTotalCents);
  const controlTotalMatches = controlTotalCents === null ? null : summary.totalCents === controlTotalCents;
  if (controlTotalMatches === false) throw new Error('COUNT_V3_CONTROL_TOTAL_MISMATCH');
  return {
    lines: lines as CountV3ClassifiedReceipt[],
    totalCents: summary.totalCents,
    controlTotalCents,
    controlTotalMatches,
    byPurpose: summary.byPurpose,
    byReceiptMethod: summary.byReceiptMethod,
  };
}

export type CountV3PurposeMethodDifference = {
  purpose: Exclude<ContributionPurpose, 'unclassified'>;
  receiptMethod: ContributionReceiptMethod;
  firstCents: number;
  secondCents: number;
  deltaCents: number;
};

function grouped(lines: CountV3ClassifiedReceipt[]): Map<string, number> {
  const map = new Map<string,number>();
  for(const line of lines) {
    const key = line.purpose + '|' + line.receiptMethod;
    const next = (map.get(key) || 0) + line.amountCents;
    if (!Number.isSafeInteger(next) || next > 20_000_000_000) {
      throw new Error('COUNT_V3_TOTAL_OUT_OF_RANGE');
    }
    map.set(key, next);
  }
  return map;
}

export function compareCountV3ReceiptLines(
  first: unknown,
  second: unknown,
) {
  const a = validateCountV3ReceiptLines(first);
  const b = validateCountV3ReceiptLines(second);
  const left = grouped(a.lines);
  const right = grouped(b.lines);
  const keys = [...new Set([...left.keys(),...right.keys()])].sort();
  const differences: CountV3PurposeMethodDifference[] = keys.flatMap(key => {
    const firstCents = left.get(key) || 0;
    const secondCents = right.get(key) || 0;
    if (firstCents === secondCents) return [];
    const [purpose,receiptMethod] = key.split('|') as [CountV3PurposeMethodDifference['purpose'],ContributionReceiptMethod];
    return [{purpose,receiptMethod,firstCents,secondCents,deltaCents:secondCents-firstCents}];
  });
  return {
    matched: a.totalCents === b.totalCents && differences.length === 0,
    firstTotalCents: a.totalCents,
    secondTotalCents: b.totalCents,
    totalDeltaCents: b.totalCents-a.totalCents,
    differences,
  };
}

/**
 * Historical receipts that only recorded "Pix" are deliberately left with an
 * unclassified PURPOSE. Treasury must classify them explicitly; they cannot
 * be silently upgraded into new validated contributions.
 */
export function inspectLegacyCountV3Classification(entries: NormalizedCountEntry[]): {
  allocations: ContributionAllocation[];
  unclassifiedCents: number;
  requiresHumanClassification: boolean;
} {
  const allocations = legacyCountToContributionAllocations(entries);
  const summary = summarizeContributions(allocations);
  return {
    allocations,
    unclassifiedCents: summary.unclassifiedCents,
    requiresHumanClassification: summary.requiresPurposeReview,
  };
}
