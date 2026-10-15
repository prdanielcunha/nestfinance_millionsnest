import {
  CONTRIBUTION_PURPOSES,
  CONTRIBUTION_RECEIPT_METHODS,
  legacyCountToContributionAllocations,
  normalizeContributionAllocations,
  summarizeContributions,
  type ContributionAllocation,
  type ContributionPurpose,
  type ContributionReceiptMethod,
} from './contributionBreakdown.js';
import type { NormalizedCountEntry } from './count.js';

/**
 * Proposed Count v2 contract, read-only and additive. This module does not
 * authorize access, create Count sessions, post ledger entries or migrate data.
 * Ownership/permissions must be checked again by canonical server handlers.
 */
export type CountVerificationMode = 'independent' | 'assisted';

export type CountV2Line = {
  lineId: string;
  purpose: ContributionPurpose;
  paymentMethod: ContributionReceiptMethod;
  amountCents: number;
  evidenceId?: string;
  sourceRegion?: { page: number; x: number; y: number; width: number; height: number };
  accountId?: string;
  classificationSource: 'explicit' | 'legacy_unclassified';
};

export type CountV2Snapshot = {
  schemaVersion: 2;
  financeEntityId: string;
  sessionId: string;
  version: number;
  verificationMode: CountVerificationMode;
  operatorId: string;
  countedBy?: string;
  lines: CountV2Line[];
  controlTotalCents: number | null;
};

export type CountV2Validation = {
  snapshot: CountV2Snapshot;
  totalCents: number;
  purposeUnclassifiedCents: number;
  controlTotalMatches: boolean | null;
  canSendForReview: boolean;
  blockers: Array<'UNKNOWN_PURPOSE' | 'CONTROL_TOTAL_MISMATCH'>;
};

const MAX_LINES = 100;
const MAX_CENTS = 20_000_000_000;

function requiredId(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || !/^[a-zA-Z0-9_:.\-]+$/.test(value)) {
    throw new Error(`COUNT_V2_INVALID_${field}`);
  }
  return value;
}

function nonnegativeCents(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) {
    throw new Error(`COUNT_V2_INVALID_${field}`);
  }
  return value;
}

function sourceRegion(value: unknown): CountV2Line['sourceRegion'] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('COUNT_V2_INVALID_REGION');
  const r = value as Record<string, unknown>;
  if (!Number.isInteger(r.page) || (r.page as number) < 1 || (r.page as number) > 100) {
    throw new Error('COUNT_V2_INVALID_REGION');
  }
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const n = r[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) {
      throw new Error('COUNT_V2_INVALID_REGION');
    }
  }
  if ((r.x as number) + (r.width as number) > 1 || (r.y as number) + (r.height as number) > 1) {
    throw new Error('COUNT_V2_INVALID_REGION');
  }
  return { page: r.page as number, x: r.x as number, y: r.y as number, width: r.width as number, height: r.height as number };
}

export function validateCountV2Snapshot(value: unknown): CountV2Validation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('COUNT_V2_INVALID_SNAPSHOT');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 2) throw new Error('COUNT_V2_INVALID_VERSION');
  const verificationMode = raw.verificationMode;
  if (verificationMode !== 'independent' && verificationMode !== 'assisted') {
    throw new Error('COUNT_V2_INVALID_VERIFICATION_MODE');
  }
  const financeEntityId = requiredId(raw.financeEntityId, 'FINANCE_ENTITY_ID');
  const sessionId = requiredId(raw.sessionId, 'SESSION_ID');
  const operatorId = requiredId(raw.operatorId, 'OPERATOR_ID');
  const version = raw.version;
  if (!Number.isSafeInteger(version) || (version as number) < 1) throw new Error('COUNT_V2_INVALID_VERSION');
  if (!Array.isArray(raw.lines) || raw.lines.length > MAX_LINES) throw new Error('COUNT_V2_INVALID_LINES');
  const seen = new Set<string>();
  const lines = raw.lines.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('COUNT_V2_INVALID_LINE');
    const row = item as Record<string, unknown>;
    const lineId = requiredId(row.lineId, 'LINE_ID');
    if (seen.has(lineId)) throw new Error('COUNT_V2_DUPLICATE_LINE');
    seen.add(lineId);
    if (!CONTRIBUTION_PURPOSES.includes(row.purpose as ContributionPurpose) ||
        !CONTRIBUTION_RECEIPT_METHODS.includes(row.paymentMethod as ContributionReceiptMethod)) {
      throw new Error('COUNT_V2_INVALID_DIMENSIONS');
    }
    const classificationSource = row.classificationSource;
    const allocation = normalizeContributionAllocations([{
      purpose: row.purpose,
      receiptMethod: row.paymentMethod,
      amountCents: row.amountCents,
      classificationSource,
    }])[0];
    const evidenceId = row.evidenceId === undefined ? undefined : requiredId(row.evidenceId, 'EVIDENCE_ID');
    const accountId = row.accountId === undefined ? undefined : requiredId(row.accountId, 'ACCOUNT_ID');
    const region = sourceRegion(row.sourceRegion);
    return {
      lineId,
      purpose: allocation.purpose,
      paymentMethod: allocation.receiptMethod,
      amountCents: allocation.amountCents,
      classificationSource: allocation.classificationSource,
      ...(evidenceId ? { evidenceId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(region ? { sourceRegion: region } : {}),
    };
  });
  const countTotal = raw.controlTotalCents === null ? null : nonnegativeCents(raw.controlTotalCents, 'CONTROL_TOTAL');
  const countedBy = raw.countedBy;
  if (countedBy !== undefined && (typeof countedBy !== 'string' || countedBy.trim().length < 1 || countedBy.length > 160)) {
    throw new Error('COUNT_V2_INVALID_COUNTED_BY');
  }
  const allocations: ContributionAllocation[] = lines.map((line) => ({
    purpose: line.purpose,
    receiptMethod: line.paymentMethod,
    amountCents: line.amountCents,
    classificationSource: line.classificationSource,
  }));
  const summary = summarizeContributions(allocations);
  const controlTotalMatches = countTotal === null ? null : summary.totalCents === countTotal;
  const blockers: CountV2Validation['blockers'] = [];
  if (summary.unclassifiedCents > 0) blockers.push('UNKNOWN_PURPOSE');
  if (controlTotalMatches === false) blockers.push('CONTROL_TOTAL_MISMATCH');
  return {
    snapshot: {
      schemaVersion: 2,
      financeEntityId,
      sessionId,
      version: version as number,
      verificationMode,
      operatorId,
      ...(typeof countedBy === 'string' ? { countedBy: countedBy.trim() } : {}),
      lines,
      controlTotalCents: countTotal,
    },
    totalCents: summary.totalCents,
    purposeUnclassifiedCents: summary.unclassifiedCents,
    controlTotalMatches,
    canSendForReview: blockers.length === 0,
    blockers,
  };
}

/** Returns dimensions that differ even when the grand totals are equal. */
export function compareCountV2Snapshots(first: unknown, second: unknown) {
  const a = validateCountV2Snapshot(first);
  const b = validateCountV2Snapshot(second);
  if (a.snapshot.financeEntityId !== b.snapshot.financeEntityId || a.snapshot.sessionId !== b.snapshot.sessionId) {
    throw new Error('COUNT_V2_CONTEXT_MISMATCH');
  }
  if (a.snapshot.verificationMode !== 'independent' || b.snapshot.verificationMode !== 'independent') {
    throw new Error('COUNT_V2_NOT_INDEPENDENT');
  }
  if (a.snapshot.operatorId === b.snapshot.operatorId) {
    throw new Error('COUNT_V2_DISTINCT_COUNTER_REQUIRED');
  }
  const group = (rows: CountV2Line[]) => {
    const map = new Map<string, number>();
    for (const line of rows) {
      const key = `${line.purpose}|${line.paymentMethod}`;
      map.set(key, (map.get(key) || 0) + line.amountCents);
    }
    return map;
  };
  const aa = group(a.snapshot.lines);
  const bb = group(b.snapshot.lines);
  const keys = [...new Set([...aa.keys(), ...bb.keys()])].sort();
  const differences = keys.flatMap((key) => {
    const firstCents = aa.get(key) || 0;
    const secondCents = bb.get(key) || 0;
    return firstCents === secondCents ? [] : [{ key, firstCents, secondCents, deltaCents: secondCents - firstCents }];
  });
  return {
    matched: differences.length === 0 && a.totalCents === b.totalCents,
    firstTotalCents: a.totalCents,
    secondTotalCents: b.totalCents,
    differences,
  };
}

/**
 * Read-only legacy adapter. Missing evidence, participant and purpose
 * are never invented. The caller supplies a trusted canonical operator.
 */
export function legacyCountToV2(input: {
  financeEntityId: string;
  sessionId: string;
  version: number;
  operatorId: string;
  entries: NormalizedCountEntry[];
}): CountV2Validation {
  const allocations = legacyCountToContributionAllocations(input.entries);
  return validateCountV2Snapshot({
    schemaVersion: 2,
    financeEntityId: input.financeEntityId,
    sessionId: input.sessionId,
    version: input.version,
    verificationMode: 'independent',
    operatorId: input.operatorId,
    lines: allocations.map((line, i) => ({
      lineId: `legacy_${i}`,
      purpose: line.purpose,
      paymentMethod: line.receiptMethod,
      amountCents: line.amountCents,
      classificationSource: line.classificationSource,
    })),
    controlTotalCents: null,
  });
}
