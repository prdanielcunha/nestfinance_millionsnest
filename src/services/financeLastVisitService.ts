import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';

const PREFIX = 'nestfinance_last_visit_v1';

function key(organizationId: string, financeEntityId: string) {
  return `${PREFIX}:${organizationId}:${financeEntityId}`;
}

async function headers(organizationId: string) {
  const result = new Headers({
    'Content-Type': 'application/json',
    'x-organization-id': organizationId,
  });
  const user = getAuth().currentUser;
  if (user) result.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return result;
}

export type SinceLastVisitSummary = {
  since: string;
  total: number;
  previewLimit: number;
  hasMoreThanPreview: boolean;
  latest: Array<{
    eventId: string;
    action: string;
    resource: string;
    occurredAt: string | null;
  }>;
  financialMutation: false;
};

export const financeLastVisitService = {
  previous(organizationId: string, financeEntityId: string) {
    try {
      const value = localStorage.getItem(key(organizationId, financeEntityId));
      if (!value || !Number.isFinite(Date.parse(value))) return null;
      return new Date(value).toISOString();
    } catch {
      return null;
    }
  },
  touch(organizationId: string, financeEntityId: string, at = new Date()) {
    try {
      localStorage.setItem(key(organizationId, financeEntityId), at.toISOString());
    } catch {
      // Last-visit memory is a convenience only.
    }
  },
  async summary(
    organizationId: string,
    financeEntityId: string,
    since: string,
  ): Promise<SinceLastVisitSummary> {
    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=since-last-visit-summary`,
      {
        method: 'POST',
        headers: await headers(organizationId),
        body: JSON.stringify({ financeEntityId, since }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'SINCE_LAST_VISIT_FAILED');
    return body as SinceLastVisitSummary;
  },
};
