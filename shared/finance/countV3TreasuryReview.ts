import {
  evaluateCountVerifications,
  normalizeCountVerificationPolicy,
  type CountVerificationEvidence,
  type CountVerificationResult,
} from './countVerificationPolicy.js';
import { normalizeCountEntries } from './count.js';
import {
  legacyCountToContributionAllocations,
  summarizeContributions,
  type ContributionAllocation,
} from './contributionBreakdown.js';
import { validateCountV3ReceiptLines } from './countV3PurposeReceipt.js';

/**
 * Read-only source-backed review packet. No transaction is ever posted here.
 * The counter's original evidence, its locked quorum policy and its matching
 * evaluation must agree before any financial figures are presented.
 */
export type CountV3TreasuryReviewPacket = {
  sessionId: string;
  serviceLabel: string;
  serviceDate: string;
  status: 'matched' | 'requires_treasury_review';
  snapshotVersion: number;
  recountCycle: number;
  independentConfirmed: number;
  requiredIndependentConfirmations: number;
  assistedRecorded: number;
  countedTotalCents: number;
  allocations: ContributionAllocation[];
  summary: ReturnType<typeof summarizeContributions>;
  requiresPurposeClassification: boolean;
  requiresExplicitTreasuryReview: boolean;
  /** False until a separately authorized review-and-draft workflow exists. */
  draftCreationAvailable: false;
};

export function buildCountV3TreasuryReviewPacket(session: Record<string, any>): CountV3TreasuryReviewPacket {
  const sessionId = typeof session.id === 'string' ? session.id : '';
  const serviceLabel = typeof session.serviceLabel === 'string' ? session.serviceLabel.trim() : '';
  const serviceDate = typeof session.serviceDate === 'string' ? session.serviceDate : '';
  const snapshotVersion = Number(session.version);
  if (!sessionId || !serviceLabel || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ||
      !Number.isSafeInteger(snapshotVersion) || snapshotVersion < 1) {
    throw new Error('COUNT_REVIEW_INVALID_SESSION');
  }
  const storedStatus = String(session.status || '');
  if (storedStatus === 'pending' || storedStatus === 'divergent') {
    throw new Error('COUNT_REVIEW_NOT_READY');
  }
  if (storedStatus !== 'matched' && storedStatus !== 'requires_treasury_review') {
    throw new Error('COUNT_REVIEW_INVALID_STATE');
  }
  const evidence: CountVerificationEvidence[] = Array.isArray(session.confirmations) ? session.confirmations : [];
  const policy = normalizeCountVerificationPolicy(session.policySnapshot);
  const evaluation = evaluateCountVerifications(evidence, policy);
  if (evaluation.status !== storedStatus) throw new Error('COUNT_REVIEW_STATUS_MISMATCH');
  const independent = evidence.filter(item => item.mode === 'independent');
  if (!independent.length) throw new Error('COUNT_REVIEW_MISSING_INDEPENDENT_SOURCE');
  const source = independent[0];
  let allocations: ContributionAllocation[];
  if (Array.isArray(source.lines)) {
    allocations = validateCountV3ReceiptLines(source.lines, source.controlTotalCents ?? null).lines;
  } else if (Array.isArray(source.entries)) {
    // The historical Count transport only identifies Pix as a receipt method.
    // Never infer that it was tithe or offering.
    allocations = legacyCountToContributionAllocations(normalizeCountEntries(source.entries));
  } else {
    throw new Error('COUNT_REVIEW_MISSING_CLASSIFICATION');
  }
  const summary = summarizeContributions(allocations);
  if (evaluation.totalCents !== summary.totalCents) {
    throw new Error('COUNT_REVIEW_TOTAL_MISMATCH');
  }
  const cycles = Number(session.recountCycle || 0);
  if (!Number.isSafeInteger(cycles) || cycles < 0 || cycles > 10) {
    throw new Error('COUNT_REVIEW_INVALID_CYCLE');
  }
  return {
    sessionId,
    serviceLabel,
    serviceDate,
    status: storedStatus,
    snapshotVersion,
    recountCycle: cycles,
    independentConfirmed: evaluation.independentConfirmed,
    requiredIndependentConfirmations: evaluation.requiredIndependentConfirmations,
    assistedRecorded: evaluation.assistedRecorded,
    countedTotalCents: summary.totalCents,
    allocations,
    summary,
    requiresPurposeClassification: summary.requiresPurposeReview,
    requiresExplicitTreasuryReview: storedStatus === 'requires_treasury_review' ||
      summary.requiresPurposeReview,
    draftCreationAvailable: false,
  };
}
