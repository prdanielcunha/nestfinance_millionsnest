import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { PeriodCloseReadinessResponse } from '../../shared/finance/periodCloseReadiness.js';

async function headers(organizationId: string) {
  const auth = getAuth();
  const value = new Headers();
  if (auth.currentUser) value.set('Authorization', 'Bearer ' + await auth.currentUser.getIdToken());
  value.set('Content-Type', 'application/json');
  value.set('x-organization-id', organizationId);
  return value;
}

export const periodCloseService = {
  async readiness(
    organizationId: string,
    financeEntityId: string,
    period: string,
  ): Promise<PeriodCloseReadinessResponse> {
    const response = await fetch(FINANCE_GATEWAY_PATH + '?operation=period-close-readiness', {
      method: 'POST',
      headers: await headers(organizationId),
      body: JSON.stringify({ financeEntityId, period }),
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const error = new Error(details.error || 'PERIOD_CLOSE_READINESS_FAILED') as Error & {
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
