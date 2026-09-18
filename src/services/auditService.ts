import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { AuditListResponse } from '../../shared/finance/auditReadModel.js';

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

export const auditService = {
  async list(
    organizationId: string,
    financeEntityId: string,
  ): Promise<AuditListResponse> {
    const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=audit-list`, {
      method: 'POST',
      headers: await makeHeaders(organizationId),
      body: JSON.stringify({ financeEntityId }),
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const error = new Error(details.error || 'AUDIT_LIST_FAILED') as Error & {
        code?: string;
        status?: number;
      };
      error.code = details.error;
      error.status = response.status;
      throw error;
    }

    return response.json();
  },
};
