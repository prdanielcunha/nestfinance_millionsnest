import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { CountEntryDraft } from '../../shared/finance/count.js';

export type CountV3Status = 'pending' | 'matched' | 'divergent' | 'requires_treasury_review';
export type CountV3Session = {
  id: string;
  serviceLabel: string;
  serviceDate: string;
  status: CountV3Status;
  version: number;
  policySnapshot: {
    minimumIndependentConfirmations: number;
    maximumParticipants: number;
    allowAssisted: boolean;
  };
  participantCount: number;
  confirmationCount: number;
  independentConfirmed: number;
  assistedRecorded: number;
  materialHidden: boolean;
  ownConfirmations: Array<{
    verificationId: string;
    mode: 'independent' | 'assisted';
    operatorUid: string;
    physicalCounterLabel?: string | null;
    entries: CountEntryDraft[];
  }>;
  confirmedTotalCents: number | null;
};

export type CountV3ApiError = Error & { status?: number; code?: string };

const MUTATIONS = new Set(['count-verifications-create', 'count-verifications-join', 'count-verifications-submit']);
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
  submit: (org: string, entity: string, input: {
    countSessionId: string;
    expectedVersion: number;
    mode: 'independent' | 'assisted';
    physicalCounterLabel?: string;
    entries: CountEntryDraft[];
  }, idempotencyKey?: string) =>
    call<{countSessionId:string;version:number;status:CountV3Status}>(
      org, 'count-verifications-submit', withMutationIds({ financeEntityId: entity, ...input }, idempotencyKey),
    ),
  isMutation: (operation: string) => MUTATIONS.has(operation),
};
