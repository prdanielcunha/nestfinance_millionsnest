import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { FinanceEditPresenceResult } from '../../shared/finance/financeEditPresence';

async function headers(organizationId: string) {
  const result = new Headers({
    'Content-Type': 'application/json',
    'x-organization-id': organizationId,
  });
  const user = getAuth().currentUser;
  if (user) result.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return result;
}

async function post(
  organizationId: string,
  operation: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=${operation}`, {
    method: 'POST',
    headers: await headers(organizationId),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error: any = new Error(payload.error || 'EDIT_PRESENCE_FAILED');
    error.code = payload.error;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const financeEditPresenceService = {
  heartbeat(
    organizationId: string,
    financeEntityId: string,
    transactionId: string,
    sessionId: string,
  ): Promise<FinanceEditPresenceResult> {
    return post(organizationId, 'transaction-edit-presence-heartbeat', {
      financeEntityId,
      transactionId,
      sessionId,
    });
  },
  release(
    organizationId: string,
    financeEntityId: string,
    transactionId: string,
    sessionId: string,
  ): Promise<{ released: boolean; financialMutation: false }> {
    return post(organizationId, 'transaction-edit-presence-release', {
      financeEntityId,
      transactionId,
      sessionId,
    });
  },
};
