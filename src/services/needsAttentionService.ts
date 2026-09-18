import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type {
  NeedsAttentionSignalDetail,
  NeedsAttentionSignalSummary,
} from '../../shared/intelligence/needsAttention.js';

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
    const error = new Error(details.error || 'NEEDS_ATTENTION_REQUEST_FAILED') as Error & {
      code?: string;
      status?: number;
    };
    error.code = details.error;
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const needsAttentionService = {
  async summary(
    organizationId: string,
    financeEntityId: string,
  ): Promise<NeedsAttentionSignalSummary> {
    return post(organizationId, 'intelligence-signals-summary', { financeEntityId });
  },

  async detail(
    organizationId: string,
    financeEntityId: string,
    signalId: string,
  ): Promise<NeedsAttentionSignalDetail> {
    return post(organizationId, 'intelligence-signals-detail', {
      financeEntityId,
      signalId,
    });
  },
};
