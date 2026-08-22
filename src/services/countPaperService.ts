import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type {
  CountPaperFormDetail,
  CountPaperLocale,
  CountPaperStage,
} from '../../shared/finance/countPaper.js';

export type CountPaperApiError = Error & {
  code?: string;
  details?: any;
  status?: number;
};

async function request<T>(
  organizationId: string,
  operation: string,
  body: Record<string, unknown>,
): Promise<T> {
  const auth = getAuth();
  const headers = new Headers({ 'Content-Type': 'application/json', 'x-organization-id': organizationId });
  if (auth.currentUser) headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);

  const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=${operation}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const error = new Error(details.error || 'COUNT_PAPER_REQUEST_FAILED') as CountPaperApiError;
    error.code = details.error;
    error.details = details;
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export const countPaperService = {
  generate(
    organizationId: string,
    financeEntityId: string,
    input: {
      countSessionId: string;
      stage: CountPaperStage;
      locale: CountPaperLocale;
      idempotencyKey: string;
      requestId: string;
    },
  ) {
    return request<{
      formId: string;
      stage: CountPaperStage;
      templateVersion: number;
      checksum: string;
      requestId?: string;
    }>(organizationId, 'count-paper-forms-generate', { financeEntityId, ...input });
  },

  detail(organizationId: string, financeEntityId: string, formId: string) {
    return request<{ form: CountPaperFormDetail; requestId?: string }>(
      organizationId,
      'count-paper-forms-detail',
      { financeEntityId, formId },
    );
  },
};
