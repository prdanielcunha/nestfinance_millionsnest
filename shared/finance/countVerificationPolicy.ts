import {
  calculateCountEntriesTotalCents,
  compareCountEntries,
  normalizeCountEntries,
  type CountEntryDraft,
} from './count.js';

/**
 * Proposed Count v2 domain contract; NOT wired to the production Count v1
 * gateway. Only the verified server may choose a policy for an entity.
 *
 * The authentication layer must bind operatorUid to the verified session.
 * A typed name or a paper/QR code is participation evidence, not an identity
 * proof and never qualifies as an independent authenticated confirmation.
 */
export type CountVerificationMode = 'independent' | 'assisted';
export type CountVerificationResult =
  | 'pending'
  | 'matched'
  | 'divergent'
  | 'requires_treasury_review';

export type CountVerificationPolicy = {
  policyVersion: 3;
  minimumIndependentConfirmations: number;
  maximumParticipants: number;
  allowAssisted: boolean;
  singleCounterRequiresTreasuryReview: true;
};

export type CountVerificationEvidence = {
  verificationId: string;
  mode: CountVerificationMode;
  operatorUid: string;
  /** Authenticated counter is required for independent confirmation. */
  independentCounterUid?: string | null;
  physicalCounterLabel?: string | null;
  entries: CountEntryDraft[];
};

export type CountVerificationEvaluation = {
  status: CountVerificationResult;
  independentConfirmed: number;
  assistedRecorded: number;
  requiredIndependentConfirmations: number;
  totalCents: number | null;
  differencesFound: boolean;
};

/**
 * Default is two separate authenticated counters; no new tenant gets weaker
 * verification merely because configuration is absent.
 *
 * An explicit one-person church policy still cannot self-certify a count:
 * its result is always 'requires_treasury_review', never 'matched'.
 */
export function normalizeCountVerificationPolicy(
  input: unknown,
): CountVerificationPolicy {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const minimum = source.minimumIndependentConfirmations === undefined
    ? 2
    : source.minimumIndependentConfirmations;
  const maximum = source.maximumParticipants === undefined
    ? 20
    : source.maximumParticipants;
  if (typeof minimum !== 'number' || !Number.isInteger(minimum) || minimum < 1 || minimum > 20) {
    throw new Error('COUNT_INVALID_CONFIRMATION_QUORUM');
  }
  if (typeof maximum !== 'number' || !Number.isInteger(maximum) || maximum < 1 || maximum > 20 ||
      maximum < (minimum as number)) {
    throw new Error('COUNT_INVALID_TEAM_CAPACITY');
  }
  if (source.allowAssisted !== undefined && typeof source.allowAssisted !== 'boolean') {
    throw new Error('COUNT_INVALID_ASSISTED_POLICY');
  }
  return {
    policyVersion: 3,
    minimumIndependentConfirmations: minimum as number,
    maximumParticipants: maximum as number,
    allowAssisted: source.allowAssisted === true,
    singleCounterRequiresTreasuryReview: true,
  };
}

function validatedEvidence(
  evidence: CountVerificationEvidence,
  policy: CountVerificationPolicy,
) {
  if (!evidence || typeof evidence !== 'object' ||
      typeof evidence.verificationId !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,80}$/.test(evidence.verificationId) ||
      typeof evidence.operatorUid !== 'string' || !evidence.operatorUid.trim()) {
    throw new Error('COUNT_INVALID_VERIFICATION_EVIDENCE');
  }
  if (evidence.mode !== 'independent' && evidence.mode !== 'assisted') {
    throw new Error('COUNT_INVALID_VERIFICATION_MODE');
  }
  if (evidence.mode === 'assisted' && !policy.allowAssisted) {
    throw new Error('COUNT_ASSISTED_NOT_ALLOWED');
  }
  if (evidence.mode === 'independent' &&
      (!evidence.independentCounterUid ||
        evidence.independentCounterUid !== evidence.operatorUid)) {
    throw new Error('COUNT_INDEPENDENCE_NOT_AUTHENTICATED');
  }
  const entries = normalizeCountEntries(evidence.entries);
  if (entries.length === 0) throw new Error('COUNT_EMPTY_VERIFICATION');
  return { ...evidence, entries };
}

/**
 * Pure, side-effect-free comparison. Never updates a ledger or settles
 * divergent money automatically; all Count-to-finance actions remain separate
 * reviewed, idempotent transactions.
 */
export function evaluateCountVerifications(
  input: CountVerificationEvidence[],
  policy: CountVerificationPolicy,
): CountVerificationEvaluation {
  const normalizedPolicy = normalizeCountVerificationPolicy(policy);
  if (!Array.isArray(input) || input.length > normalizedPolicy.maximumParticipants) {
    throw new Error('COUNT_TEAM_CAPACITY_EXCEEDED');
  }

  const uniqueIds = new Set<string>();
  const uniqueIndependentCounters = new Set<string>();
  const accepted = input.map(item => {
    const evidence = validatedEvidence(item, normalizedPolicy);
    if (uniqueIds.has(evidence.verificationId)) throw new Error('COUNT_DUPLICATE_VERIFICATION');
    uniqueIds.add(evidence.verificationId);
    if (evidence.mode === 'independent') {
      if (uniqueIndependentCounters.has(evidence.operatorUid)) {
        throw new Error('COUNT_INDEPENDENT_COUNTER_ALREADY_RECORDED');
      }
      uniqueIndependentCounters.add(evidence.operatorUid);
    }
    return evidence;
  });

  const independentlyVerified = accepted.filter(item => item.mode === 'independent');
  const assistedRecorded = accepted.length - independentlyVerified.length;
  const requiredIndependentConfirmations = normalizedPolicy.minimumIndependentConfirmations;
  const reference = independentlyVerified[0] ?? null;
  const differencesFound = independentlyVerified.some((evidence, index) =>
    index > 0 && reference !== null &&
    !compareCountEntries(reference.entries, evidence.entries).matched);
  const totalCents = reference === null
    ? null
    : calculateCountEntriesTotalCents(normalizeCountEntries(reference.entries));

  let status: CountVerificationResult = 'pending';
  if (differencesFound) {
    status = 'divergent';
  } else if (independentlyVerified.length >= requiredIndependentConfirmations) {
    status = requiredIndependentConfirmations === 1
      ? 'requires_treasury_review'
      : 'matched';
  }
  return {
    status,
    independentConfirmed: independentlyVerified.length,
    assistedRecorded,
    requiredIndependentConfirmations,
    totalCents,
    differencesFound,
  };
}
