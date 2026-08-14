import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type {
  CountComparison,
  CountEntryDraft,
  CountSessionStatus,
  NormalizedCountEntry,
} from '../../shared/finance/count.js';

export type CountRecord = {
  entries: NormalizedCountEntry[];
  totalCents: number;
  countedByUid?: string | null;
  enteredByUid?: string | null;
  savedAt?: string | null;
  sealedAt?: string | null;
};

export type CountRecountAttempt = CountRecord & {
  attemptNumber: number;
  matchesA: boolean;
  matchesB: boolean;
};

export type CountSessionListItem = {
  id: string;
  serviceLabel: string;
  serviceDate: string;
  status: CountSessionStatus;
  version: number;
  materialHidden: boolean;
  firstCountTotalCents: number | null;
  firstCountEntryTypes: string[];
  comparisonMatched?: boolean | null;
  recountAttemptCount: number;
  doubleCountRequired: boolean;
  updatedAt?: string | null;
};

export type CountSessionDetail = {
  id: string;
  serviceLabel: string;
  serviceDate: string;
  status: CountSessionStatus;
  version: number;
  policySnapshot: {
    doubleCountRequired?: boolean;
    policyVersion?: number;
    source?: string;
  };
  materialHidden: boolean;
  countA: CountRecord | null;
  countB: CountRecord | null;
  comparison: (CountComparison & { resolvedBy?: string | null; sealedAt?: string | null }) | null;
  resolution?: {
    matched?: boolean;
    resolvedBy?: string | null;
    recountAttemptNumber?: number | null;
  } | null;
  recountAttempts: CountRecountAttempt[];
  recountAttemptCount: number;
  activeRecountAttemptNumber?: number | null;
};

export type CountApiError = Error & {
  code?: string;
  details?: any;
  status?: number;
};

async function makeHeaders(organizationId: string) {
  const auth = getAuth();
  const headers = new Headers();
  if (auth.currentUser) {
    headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  }
  headers.set('Content-Type', 'application/json');
  headers.set('x-organization-id', organizationId);
  return headers;
}

async function post<T>(
  organizationId: string,
  operation: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=${operation}`, {
    method: 'POST',
    headers: await makeHeaders(organizationId),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const error = new Error(details.error || 'COUNT_REQUEST_FAILED') as CountApiError;
    error.code = details.error;
    error.details = details;
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const countService = {
  async list(organizationId: string, financeEntityId: string) {
    return post<{ items: CountSessionListItem[]; requestId?: string }>(
      organizationId,
      'count-sessions-list',
      { financeEntityId },
    );
  },

  async create(
    organizationId: string,
    financeEntityId: string,
    input: {
      serviceLabel: string;
      serviceDate: string;
      idempotencyKey: string;
      requestId: string;
    },
  ) {
    return post<{ sessionId: string; version: number; status: 'counting_a'; requestId?: string }>(
      organizationId,
      'count-sessions-create',
      { financeEntityId, ...input },
    );
  },

  async detail(
    organizationId: string,
    financeEntityId: string,
    countSessionId: string,
  ) {
    return post<{ session: CountSessionDetail; requestId?: string }>(
      organizationId,
      'count-sessions-detail',
      { financeEntityId, countSessionId },
    );
  },

  async saveFirstCount(
    organizationId: string,
    financeEntityId: string,
    input: {
      countSessionId: string;
      expectedVersion: number;
      entries: CountEntryDraft[];
      idempotencyKey: string;
      requestId: string;
    },
  ) {
    const result = await post<{
      countSessionId: string;
      version: number;
      status: 'counting_a';
      requestId?: string;
    }>(organizationId, 'count-sessions-save-first-count', {
      financeEntityId,
      ...input,
    });

    // The mutation's idempotency record is material-free so it cannot become a
    // blind-stage side channel. While still in Count A, fetch the canonical
    // detail separately to refresh the editing UI.
    const detailResult = await post<{ session: CountSessionDetail; requestId?: string }>(
      organizationId,
      'count-sessions-detail',
      { financeEntityId, countSessionId: input.countSessionId },
    );
    if (detailResult.session.materialHidden || !detailResult.session.countA) {
      const error = new Error('COUNT_MATERIAL_HIDDEN') as CountApiError;
      error.code = 'COUNT_MATERIAL_HIDDEN';
      throw error;
    }

    return {
      ...result,
      totalCents: detailResult.session.countA.totalCents,
      entries: detailResult.session.countA.entries,
    };
  },

  async startSecondCount(
    organizationId: string,
    financeEntityId: string,
    input: {
      countSessionId: string;
      expectedVersion: number;
      idempotencyKey: string;
      requestId: string;
    },
  ) {
    return post<{
      countSessionId: string;
      version: number;
      status: 'counting_b';
      requestId?: string;
    }>(organizationId, 'count-sessions-start-second-count', { financeEntityId, ...input });
  },

  async submitSecondCount(
    organizationId: string,
    financeEntityId: string,
    input: {
      countSessionId: string;
      expectedVersion: number;
      entries: CountEntryDraft[];
      idempotencyKey: string;
      requestId: string;
    },
  ) {
    return post<{
      countSessionId: string;
      version: number;
      status: 'matched' | 'divergent';
      matched: boolean;
      requestId?: string;
    }>(organizationId, 'count-sessions-submit-second-count', { financeEntityId, ...input });
  },

  async startRecount(
    organizationId: string,
    financeEntityId: string,
    input: {
      countSessionId: string;
      expectedVersion: number;
      idempotencyKey: string;
      requestId: string;
    },
  ) {
    return post<{
      countSessionId: string;
      version: number;
      status: 'recounting';
      attemptNumber: number;
      requestId?: string;
    }>(organizationId, 'count-sessions-start-recount', { financeEntityId, ...input });
  },

  async submitRecount(
    organizationId: string,
    financeEntityId: string,
    input: {
      countSessionId: string;
      expectedVersion: number;
      entries: CountEntryDraft[];
      idempotencyKey: string;
      requestId: string;
    },
  ) {
    return post<{
      countSessionId: string;
      version: number;
      status: 'matched' | 'divergent';
      attemptNumber: number;
      matched: boolean;
      resolvedBy: string | null;
      requestId?: string;
    }>(organizationId, 'count-sessions-submit-recount', { financeEntityId, ...input });
  },
};
