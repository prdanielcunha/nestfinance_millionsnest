import { getAuth } from 'firebase/auth';
import type { LedgerTransaction } from '../../shared/finance/ledger/transaction.js';
import type {
  TransactionWorkspaceFilters,
  TransactionWorkspaceView,
} from '../../shared/finance/transactionWorkspaceView.js';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { TodayOperationalSnapshot } from '../../shared/finance/todayOperationalSummary.js';
import { notifyFinanceDataChanged } from './financeFreshness';

export interface TransactionsListResponse {
  items: LedgerTransaction[];
  nextCursor?: string;
  hasMore: boolean;
  sourceTruncated?: boolean;
  scannedCount?: number;
  dateBase?: 'occurred' | 'competence' | 'recorded';
}

export interface TransactionsActionSummary {
  returnedCorrections: number;
  simpleDrafts: number;
  readyForReview: number;
  approvedForPosting: number;
  totalOpen: number;
}

export interface TransactionsSummaryResponse {
  summary: TransactionsActionSummary;
  operational: TodayOperationalSnapshot;
  requestId?: string;
}

export interface TransactionSearchResponse {
  items: any[];
  query: string;
  searchMode: 'index' | 'canonical_fallback';
  indexCertified: boolean;
  sourceTruncated: boolean;
  resultTruncated: boolean;
  limit: number;
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

function localDayRequest(now = new Date()) {
  const localStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const localEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const localDate = [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return {
    localDate,
    dayStartIso: localStart.toISOString(),
    dayEndIso: localEnd.toISOString(),
  };
}

async function parseFinanceMutation<T>(
  response: Response,
  organizationId: string,
  financeEntityId: string,
): Promise<T> {
  const result = await response.json() as T;
  notifyFinanceDataChanged({ organizationId, financeEntityId, area: 'transactions' });
  return result;
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
      const errText = await res.text().catch(() => '');
      let err: any = {};
      try {
        err = JSON.parse(errText);
      } catch (e) {
        err = { message: errText || `HTTP ${res.status}` };
      }
      const throwErr: any = new Error(err.message || err.error || 'Failed to list transactions');
      throwErr.details = err;
      throw throwErr;
    }

    return res.json();
  },

  async search(
    organizationId: string,
    financeEntityId: string,
    query: string,
    filters?: Record<string, unknown>,
    limit = 50,
  ): Promise<TransactionSearchResponse> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transaction-search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, query, filters, limit }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let err: any = {};
      try {
        err = JSON.parse(errText);
      } catch {
        err = { message: errText || `HTTP ${res.status}` };
      }
      const thrown: any = new Error(err.message || err.error || 'Failed to search transactions');
      thrown.details = err;
      throw thrown;
    }

    return res.json();
  },

  async summary(organizationId: string, financeEntityId: string): Promise<TransactionsSummaryResponse> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-summary`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, requestId: `req_${generateId()}`, ...localDayRequest() })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch transaction summary');
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

    return parseFinanceMutation(res, organizationId, financeEntityId);
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

    return parseFinanceMutation(res, organizationId, financeEntityId);
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

    return parseFinanceMutation(res, organizationId, financeEntityId);
  },

  async discardDraft(
    organizationId: string,
    financeEntityId: string,
    transactionId: string,
    expectedVersion: number,
    idempotencyKey: string,
    requestId: string,
  ): Promise<{ deleted: boolean; transactionId: string }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transactions-discard-draft`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        financeEntityId,
        transactionId,
        expectedVersion,
        idempotencyKey,
        requestId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const thrown: any = new Error(err.details || err.error || 'Failed to discard transaction draft');
      thrown.details = err;
      throw thrown;
    }

    return parseFinanceMutation(res, organizationId, financeEntityId);
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

    return parseFinanceMutation(res, organizationId, financeEntityId);
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

    return parseFinanceMutation(res, organizationId, financeEntityId);
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

    return parseFinanceMutation(res, organizationId, financeEntityId);
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

    return parseFinanceMutation(res, organizationId, financeEntityId);
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
  },

  async listWorkspaceViews(
    organizationId: string,
    financeEntityId: string,
  ): Promise<{ items: TransactionWorkspaceView[]; limit: number }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transaction-workspace-views-list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to list workspace views');
    }

    return res.json();
  },

  async saveWorkspaceView(
    organizationId: string,
    financeEntityId: string,
    input: {
      viewId?: string;
      name: string;
      filters: TransactionWorkspaceFilters;
    },
  ): Promise<{
    viewId: string;
    name: string;
    filters: TransactionWorkspaceFilters;
    schemaVersion: number;
  }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transaction-workspace-views-save`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, ...input }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save workspace view');
    }

    return res.json();
  },

  async deleteWorkspaceView(
    organizationId: string,
    financeEntityId: string,
    viewId: string,
  ): Promise<{ deleted: boolean; viewId?: string }> {
    const auth = getAuth();
    const headers = new Headers();
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('x-organization-id', organizationId);

    const res = await fetch(`${FINANCE_GATEWAY_PATH}?operation=transaction-workspace-views-delete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ financeEntityId, viewId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete workspace view');
    }

    return res.json();
  }
};
