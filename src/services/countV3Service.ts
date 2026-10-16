import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { CountEntryDraft } from '../../shared/finance/count.js';
import type { CountV3ClassifiedReceipt } from '../../shared/finance/countV3PurposeReceipt.js';
import type { CountV3TreasuryReviewPacket } from '../../shared/finance/countV3TreasuryReview.js';

export type CountV3Status = 'pending' | 'matched' | 'divergent' | 'requires_treasury_review';
export type CountV3Session = {
  id: string;
  serviceLabel: string;
  serviceDate: string;
  status: CountV3Status;
  version: number;
  recountCycle: number;
  policySnapshot: {
    minimumIndependentConfirmations: number;
    maximumParticipants: number;
    allowAssisted: boolean;
  };
  participantCount: number;
  canManageInvite: boolean;
  confirmationCount: number;
  independentConfirmed: number;
  assistedRecorded: number;
  materialHidden: boolean;
  ownConfirmations: Array<{
    verificationId: string;
    mode: 'independent' | 'assisted';
    operatorUid: string;
    physicalCounterLabel?: string | null;
    entries?: CountEntryDraft[];
    lines?: CountV3ClassifiedReceipt[];
    controlTotalCents?: number | null;
  }>;
  confirmedTotalCents: number | null;
};

export type CountV3Policy = {
  policyVersion: 3;
  minimumIndependentConfirmations: number;
  maximumParticipants: number;
  allowAssisted: boolean;
  singleCounterRequiresTreasuryReview: true;
};
export type CountV3PolicyRecord = {
  financeEntityId: string;
  policy: CountV3Policy;
  revision: number;
};

export type CountV3ApiError = Error & { status?: number; code?: string };

const MUTATIONS = new Set(['count-verifications-create', 'count-verifications-join', 'count-verifications-submit', 'count-verifications-refresh-invite']);
export const COUNT_V3_UI_ENABLED = import.meta.env.VITE_NESTFINANCE_COUNT_V3_ENABLED === 'true';

function token(prefix: string) {
  if (typeof crypto?.randomUUID !== 'function') {
    throw new Error('COUNT_SECURE_RANDOM_UNAVAILABLE');
  }
  return prefix + '_' + crypto.randomUUID();
}

async function call<T>(
  organizationId: string,
  operation: string,
  body: Record<string, unknown>,
): Promise<T> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error('UNAUTHORIZED');
  const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=${encodeURIComponent(operation)}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + await auth.currentUser.getIdToken(),
      'Content-Type': 'application/json',
      'x-organization-id': organizationId,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    const error = new Error(String(problem.error || 'COUNT_REQUEST_FAILED')) as CountV3ApiError;
    error.status = response.status;
    error.code = problem.error;
    throw error;
  }
  return response.json() as Promise<T>;
}

function withMutationIds<T extends Record<string, unknown>>(body: T, idempotencyKey?: string) {
  return { ...body, idempotencyKey: idempotencyKey || token('idcountv3'), requestId: token('req') };
}

export const countV3Service = {
  list: (org: string, entity: string) =>
    call<{items: CountV3Session[]}>(org, 'count-verifications-list', { financeEntityId: entity }),
  detail: (org: string, entity: string, id: string) =>
    call<{session: CountV3Session}>(org, 'count-verifications-detail', { financeEntityId: entity, countSessionId: id }),
  create: (org: string, entity: string, label: string, date: string, idempotencyKey?: string) =>
    call<{countSessionId:string;version:number;joinCode:string;expiresAt:string}>(
      org, 'count-verifications-create',
      withMutationIds({ financeEntityId: entity, serviceLabel: label, serviceDate: date }, idempotencyKey),
    ),
  join: (org: string, entity: string, joinCode: string, idempotencyKey?: string) =>
    call<{countSessionId:string;version:number;alreadyJoined:boolean}>(
      org, 'count-verifications-join', withMutationIds({ financeEntityId: entity, joinCode }, idempotencyKey),
    ),
  refreshInvite: (org: string, entity: string, countSessionId: string, expectedVersion: number, idempotencyKey?: string) =>
    call<{ countSessionId: string; version: number; joinCode: string; expiresAt: string }>(
      org, 'count-verifications-refresh-invite',
      withMutationIds({ financeEntityId: entity, countSessionId, expectedVersion }, idempotencyKey),
    ),
  submit: (org: string, entity: string, input: {
    countSessionId: string;
    expectedVersion: number;
    mode: 'independent' | 'assisted';
    physicalCounterLabel?: string;
    entries?: CountEntryDraft[];
    lines?: CountV3ClassifiedReceipt[];
    controlTotalCents?: number | null;
  }, idempotencyKey?: string) =>
    call<{countSessionId:string;version:number;status:CountV3Status}>(
      org, 'count-verifications-submit', withMutationIds({ financeEntityId: entity, ...input }, idempotencyKey),
    ),
  reopen: (org: string, entity: string, input: {
    countSessionId: string; expectedVersion: number; reason: string;
  }, idempotencyKey?: string) =>
    call<{ countSessionId: string; status: CountV3Status; version: number; recountCycle: number }>(
      org, 'count-verifications-reopen',
      withMutationIds({ financeEntityId: entity, ...input }, idempotencyKey),
    ),
  acceptTreasuryReview: (org: string, entity: string, input: {
    countSessionId: string; expectedVersion: number; note?: string;
  }, idempotencyKey?: string) =>
    call<{countSessionId:string;version:number;reviewStatus:'accepted';sourceVersion:number;financialMutation:false}>(
      org, 'count-verifications-accept-treasury-review',
      withMutationIds({financeEntityId:entity,...input},idempotencyKey),
    ),
  treasuryPreview: (org: string, entity: string, countSessionId: string) =>
    call<{preview: CountV3TreasuryReviewPacket}>(
      org, 'count-verifications-treasury-preview',
      { financeEntityId: entity, countSessionId },
    ),
  getPolicy: (org: string, entity: string) =>
    call<CountV3PolicyRecord>(org, 'count-verifications-policy-get', { financeEntityId: entity }),
  updatePolicy: (org: string, entity: string, policy: CountV3Policy, expectedRevision: number, idempotencyKey?: string) =>
    call<CountV3PolicyRecord>(org, 'count-verifications-policy-update',
      withMutationIds({ financeEntityId: entity, policy, expectedRevision }, idempotencyKey)),
  isMutation: (operation: string) => MUTATIONS.has(operation),
};
