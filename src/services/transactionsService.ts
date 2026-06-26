import { getAuth } from 'firebase/auth';
import type { LedgerTransaction } from '../../shared/finance/ledger/transaction.js';
import { FINANCE_GATEWAY_PATH } from '../config/api';

export interface TransactionsListResponse {
  items: LedgerTransaction[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface TransactionDetailResponse {
  transaction: LedgerTransaction;
  allocations: any[];
  reviewReadiness?: {
    ready: boolean;
    blockers: any[];
    warnings: any[];
    confirmations: any[];
  };
  accountingEffect?: string;
  capabilities: { canEdit: boolean };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export const transactionsService = {
  async list(organizationId: string, financeEntityId: string, filters?: any, cursor?: string, pageSize?: number): Promise<TransactionsListResponse> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, filters, cursor, pageSize })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const throwErr: any = new Error(err.message || err.error || 'Failed to list transactions');
      throwErr.details = err;
      throw throwErr;
    }

    return res.json();
  },

  async detail(organizationId: string, financeEntityId: string, transactionId: string): Promise<TransactionDetailResponse> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-detail`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, transactionId })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch transaction detail');
    }

    return res.json();
  },

  async createDraft(organizationId: string, financeEntityId: string, payload: any, idempotencyKey: string, requestId: string): Promise<{ transactionId: string, version: number }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-create-draft`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        financeEntityId, 
        payload, 
        idempotencyKey,
        requestId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'Failed to create transaction draft');
    }

    return res.json();
  },

  async createAndSubmit(organizationId: string, financeEntityId: string, payload: any, idempotencyKey: string, requestId: string): Promise<{ transactionId: string, version: number }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-create-and-submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        financeEntityId, 
        payload, 
        idempotencyKey,
        requestId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'Failed to create and submit transaction');
    }

    return res.json();
  },

  async updateDraft(organizationId: string, financeEntityId: string, transactionId: string, expectedVersion: number, payload: any, idempotencyKey: string, requestId: string): Promise<{ changed: boolean, transactionId: string, version: number }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-update-draft`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        financeEntityId, 
        transactionId, 
        expectedVersion, 
        payload,
        idempotencyKey, 
        requestId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'Failed to update transaction draft');
    }

    return res.json();
  },

  async submitForReview(organizationId: string, financeEntityId: string, transactionId: string, expectedVersion: number, idempotencyKey: string, requestId: string): Promise<{ transactionId: string, version: number }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-submit-review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        financeEntityId, 
        transactionId, 
        expectedVersion,
        idempotencyKey, 
        requestId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'Failed to submit transaction');
    }

    return res.json();
  },

  async returnToDraft(organizationId: string, financeEntityId: string, transactionId: string, expectedVersion: number, reasonCode: string, comment: string | undefined, idempotencyKey: string, requestId: string): Promise<{ transactionId: string, version: number }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-return-to-draft`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        financeEntityId, 
        transactionId, 
        expectedVersion,
        reasonCode,
        comment,
        idempotencyKey, 
        requestId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'Failed to return transaction to draft');
    }

    return res.json();
  },

  async approveForPosting(organizationId: string, financeEntityId: string, transactionId: string, expectedVersion: number, comment: string | undefined, approvalIdempotencyKey: string, requestId: string): Promise<{ transactionId: string, version: number, approvalStatus: string, approvedVersion: number, sourceHash: string }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-approve-for-posting`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        financeEntityId, 
        transactionId, 
        expectedVersion,
        comment,
        approvalIdempotencyKey, 
        requestId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'Failed to approve transaction for posting');
    }

    return res.json();
  },

  async invalidateApproval(organizationId: string, financeEntityId: string, transactionId: string, expectedVersion: number, expectedApprovalSourceHash: string, reasonCode: string, comment: string | undefined, idempotencyKey: string, requestId: string): Promise<{ transactionId: string, status: string, approvalStatus: string, version: number, requestId: string }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-invalidate-approval`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        financeEntityId, 
        transactionId, 
        expectedVersion,
        expectedApprovalSourceHash,
        reasonCode,
        comment,
        idempotencyKey, 
        requestId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'Failed to invalidate approval');
    }

    return res.json();
  },

  async getPostingPlanPreview(organizationId: string, financeEntityId: string, transactionId: string): Promise<{ plan: any }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-posting-plan-preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        financeEntityId,
        transactionId
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || 'Failed to get posting plan preview');
    }

    return res.json();
  }
};
