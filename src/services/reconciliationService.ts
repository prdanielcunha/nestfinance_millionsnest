import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { ReconciliationReadiness } from '../../shared/finance/reconciliation.js';

export const reconciliationService = {
  async readiness(
    organizationId: string,
    financeEntityId: string,
  ): Promise<ReconciliationReadiness> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=reconciliation-readiness`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ financeEntityId }),
      },
    );

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const error = new Error(details.error || 'RECONCILIATION_READINESS_FAILED') as Error & {
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
