import { firebaseAuth } from '@/src/lib/firebase';

export type EcosystemOrganizationOverview = {
  id: string;
  name: string;
  slug: string;
  financeEntities: number;
  drafts: number;
  readyForReview: number;
  approvedForPosting: number;
  openTransactions: number;
  state: 'attention' | 'active' | 'clear' | 'unavailable';
};

export type EcosystemOverview = {
  activeOrganizationId: string;
  totals: {
    organizations: number;
    financeEntities: number;
    openTransactions: number;
    readyForReview: number;
    organizationsNeedingAttention: number;
  };
  organizations: EcosystemOrganizationOverview[];
  unavailableOrganizations: number;
  truncated: boolean;
  generatedAt: string;
};

export async function loadEcosystemOverview(): Promise<EcosystemOverview> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('NOT_AUTHENTICATED');

  const token = await user.getIdToken();
  const response = await fetch('/api/finance/ecosystem/overview', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: '{}',
    cache: 'no-store',
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    if (response.status === 403) throw new Error('ECOSYSTEM_ACCESS_FORBIDDEN');
    throw new Error(data?.error || 'ECOSYSTEM_OVERVIEW_UNAVAILABLE');
  }

  const data = await response.json();
  if (
    !data ||
    typeof data.activeOrganizationId !== 'string' ||
    !data.totals ||
    !Array.isArray(data.organizations)
  ) {
    throw new Error('INVALID_ECOSYSTEM_OVERVIEW_RESPONSE');
  }

  return data as EcosystemOverview;
}
