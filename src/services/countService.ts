import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { CountEntryDraft, NormalizedCountEntry } from '../../shared/finance/count.js';

export type CountSessionListItem = {
  id: string;
  serviceLabel: string;
  serviceDate: string;
  status: 'counting_a';
  version: number;
  firstCountTotalCents: number;
  firstCountEntryTypes: string[];
  doubleCountRequired: boolean;
  updatedAt?: string | null;
};

export type CountSessionDetail = {
  id: string;
  serviceLabel: string;
  serviceDate: string;
  status: 'counting_a';
  version: number;
  policySnapshot: {
    doubleCountRequired?: boolean;
    policyVersion?: number;
    source?: string;
  };
  countA: {
    entries: NormalizedCountEntry[];
    totalCents: number;
    countedByUid?: string | null;
    enteredByUid?: string | null;
    savedAt?: string | null;
  };
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
    return post<{
      countSessionId: string;
      version: number;
      status: 'counting_a';
      totalCents: number;
      entries: NormalizedCountEntry[];
      requestId?: string;
    }>(organizationId, 'count-sessions-save-first-count', {
      financeEntityId,
      ...input,
    });
  },
};
