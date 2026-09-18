import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { ReconciliationReadiness } from '../../shared/finance/reconciliation.js';
import type { ReconciliationStatementPreparationResponse } from '../../shared/finance/reconciliationStatementPreparation.js';
import type { ReconciliationMatchPreviewResponse } from '../../shared/finance/reconciliationMatchPreviewApi.js';
import type {
  ReconciliationConfirmRequest,
  ReconciliationConfirmResponse,
} from '../../shared/finance/reconciliationConfirmation.js';
import type {
  ReconciliationReverseRequest,
  ReconciliationReverseResponse,
} from '../../shared/finance/reconciliationReversal.js';
import type { ReconciliationProgressResponse } from '../../shared/finance/reconciliationProgress.js';

async function buildHeaders(organizationId: string) {
  const auth = getAuth();
  const headers = new Headers();
  if (auth.currentUser) {
    headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  }
  headers.set('Content-Type', 'application/json');
  headers.set('x-organization-id', organizationId);
  return headers;
}

async function parseError(response: Response, fallback: string) {
  const details = await response.json().catch(() => ({}));
  const error = new Error(details.error || fallback) as Error & {
    code?: string;
    status?: number;
    details?: any;
  };
  error.code = details.error;
  error.status = response.status;
  error.details = details;
  return error;
}

export const reconciliationService = {
  async readiness(
    organizationId: string,
    financeEntityId: string,
  ): Promise<ReconciliationReadiness> {
    const headers = await buildHeaders(organizationId);

    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=reconciliation-readiness`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ financeEntityId }),
      },
    );

    if (!response.ok) {
      throw await parseError(response, 'RECONCILIATION_READINESS_FAILED');
    }

    return response.json();
  },

  async prepareStatement(
    organizationId: string,
    financeEntityId: string,
    evidenceId: string,
    accountId: string,
  ): Promise<ReconciliationStatementPreparationResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=reconciliation-statement-prepare`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ financeEntityId, evidenceId, accountId }),
      },
    );

    if (!response.ok) {
      throw await parseError(response, 'RECONCILIATION_STATEMENT_PREPARE_FAILED');
    }

    return response.json();
  },

  async previewMatches(
    organizationId: string,
    financeEntityId: string,
    evidenceId: string,
    accountId: string,
  ): Promise<ReconciliationMatchPreviewResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=reconciliation-match-preview`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ financeEntityId, evidenceId, accountId }),
      },
    );

    if (!response.ok) {
      throw await parseError(response, 'RECONCILIATION_MATCH_PREVIEW_FAILED');
    }

    return response.json();
  },

  async confirmMatch(
    organizationId: string,
    request: ReconciliationConfirmRequest,
  ): Promise<ReconciliationConfirmResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=reconciliation-confirm`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      throw await parseError(response, 'RECONCILIATION_CONFIRM_FAILED');
    }

    return response.json();
  },

  async reverseMatch(
    organizationId: string,
    request: ReconciliationReverseRequest,
  ): Promise<ReconciliationReverseResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=reconciliation-reverse`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      throw await parseError(response, 'RECONCILIATION_REVERSE_FAILED');
    }

    return response.json();
  },

  async progress(
    organizationId: string,
    financeEntityId: string,
    evidenceId: string,
    accountId: string,
  ): Promise<ReconciliationProgressResponse> {
    const headers = await buildHeaders(organizationId);
    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=reconciliation-progress`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ financeEntityId, evidenceId, accountId }),
      },
    );

    if (!response.ok) {
      throw await parseError(response, 'RECONCILIATION_PROGRESS_FAILED');
    }

    return response.json();
  },
};
