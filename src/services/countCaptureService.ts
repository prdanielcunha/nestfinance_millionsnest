import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { CountCaptureNormalization, CountCaptureRegion, CountCaptureReviewInputField } from '../../shared/finance/countCapture.js';

async function makeHeaders(organizationId: string) {
  const headers = new Headers();
  const user = getAuth().currentUser;
  if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  headers.set('Content-Type', 'application/json');
  headers.set('x-organization-id', organizationId);
  return headers;
}

async function post<T>(organizationId: string, operation: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${FINANCE_GATEWAY_PATH}?operation=${operation}`, { method: 'POST', headers: await makeHeaders(organizationId), body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || 'COUNT_CAPTURE_REQUEST_FAILED') as Error & { code?: string; status?: number };
    error.code = payload.error; error.status = response.status; throw error;
  }
  return response.json();
}

export type CountCaptureDetail = {
  id: string;
  status: 'awaiting_upload' | 'captured' | 'duplicate' | 'reviewed';
  version: number;
  formId: string;
  countSessionId: string;
  stage: 'count_a' | 'count_b';
  templateVersion?: number;
  materialHidden: boolean;
  duplicateOfCaptureId?: string | null;
  normalization?: CountCaptureNormalization | null;
  candidates: Array<{ key: string; state: string; valueCents: number | null; confidence: number | null; region?: CountCaptureRegion | null }> | null;
  review: { fields?: Array<{ key: string; decision: string; valueCents: number | null }> } | null;
  originalUrl: string | null;
  normalizedUrl: string | null;
};

type UploadGrant = { url: string; contentType: string; requiredHeaders?: Record<string, string> };

export const countCaptureService = {
  async start(organizationId: string, financeEntityId: string, input: {
    formId?: string;
    qrPayload?: string;
    originalContentType: string;
    originalSize: number;
    originalSha256: string;
    normalizedContentType: string;
    normalizedSize: number;
    normalizedSha256: string;
    idempotencyKey: string;
    requestId: string;
  }) {
    return post<{ captureId: string; version: number; status: 'awaiting_upload'; originalUpload: UploadGrant; normalizedUpload: UploadGrant; expiresInMs: number }>(organizationId, 'count-captures-start', { financeEntityId, ...input });
  },

  async upload(grant: UploadGrant, body: Blob) {
    const headers = new Headers(grant.requiredHeaders || {});
    headers.set('Content-Type', grant.contentType);
    const response = await fetch(grant.url, { method: 'PUT', headers, body });
    // A 412 from the write-once precondition means this exact capture object path
    // already contains an upload from an earlier ambiguous attempt. Finalize will
    // hash the stored object and reject it unless it matches the declared SHA-256.
    if (!response.ok && response.status !== 412) throw new Error('COUNT_CAPTURE_UPLOAD_FAILED');
  },

  async finalize(organizationId: string, financeEntityId: string, input: { captureId: string; expectedVersion: number; normalization: CountCaptureNormalization; idempotencyKey: string; requestId: string }) {
    return post<{ captureId: string; canonicalCaptureId: string; version: number; status: 'captured' | 'duplicate'; duplicate: boolean }>(organizationId, 'count-captures-finalize', { financeEntityId, ...input });
  },

  async detail(organizationId: string, financeEntityId: string, captureId: string) {
    return post<{ capture: CountCaptureDetail }>(organizationId, 'count-captures-detail', { financeEntityId, captureId });
  },

  async saveReview(organizationId: string, financeEntityId: string, input: { captureId: string; expectedVersion: number; fields: CountCaptureReviewInputField[]; idempotencyKey: string; requestId: string }) {
    return post<{ captureId: string; version: number; status: 'reviewed' }>(organizationId, 'count-captures-save-review', { financeEntityId, ...input });
  },
};
