import { firebaseAuth } from '@/src/lib/firebase';
import { FINANCE_GATEWAY_PATH } from '@/src/config/api';

export type OpeningDeclarationHistory = {
  status: 'not_informed' | 'pending_review' | 'confirmed';
  amountCents?: number | null;
  asOf?: string | null;
  source?: string | null;
  sourceNote?: string;
};
export type OpeningHistoryItem = {
  revision: number;
  previous: OpeningDeclarationHistory | null;
  current: OpeningDeclarationHistory | null;
  reason: string;
  createdAt: string | null;
  actorRecorded: boolean;
};
export type OpeningHistoryPage = {
  accountId: string;
  openingBalanceRevision: number;
  legacyUnverified: boolean;
  items: OpeningHistoryItem[];
  hasMore: boolean;
  nextCursor: number | null;
  postingPerformed: false;
};

export async function fetchAccountOpeningHistory(args: {
  organizationId: string;
  financeEntityId: string;
  accountId: string;
  beforeRevision?: number;
}): Promise<OpeningHistoryPage> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('UNAUTHORIZED');
  if (!args.organizationId || !args.financeEntityId || !args.accountId) {
    throw new Error('INVALID_PARAMETERS');
  }
  const response = await fetch(
    `${FINANCE_GATEWAY_PATH}?operation=accounts-opening-history`, {
      method:'POST', cache:'no-store',
      headers:{
        Authorization:'Bearer '+await user.getIdToken(),
        'Content-Type':'application/json',
        'x-organization-id':args.organizationId,
      },
      body:JSON.stringify({
        financeEntityId:args.financeEntityId,
        accountId:args.accountId,
        ...(args.beforeRevision!==undefined?{beforeRevision:args.beforeRevision}:{}),
      }),
    }
  );
  if(!response.ok) {
    const data = await response.json().catch(()=>({}));
    throw new Error(typeof data.error==='string' ? data.error : 'HISTORY_REQUEST_FAILED');
  }
  return response.json() as Promise<OpeningHistoryPage>;
}
