import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type { UniversalEvidenceSourceKind } from '../../shared/finance/universalEvidence';

const token = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
async function headers(organizationId: string) {
  const result = new Headers({ 'Content-Type': 'application/json', 'x-organization-id': organizationId });
  const user = getAuth().currentUser;
  if (user) result.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return result;
}
async function json(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error: any = new Error(body.error || 'EVIDENCE_REQUEST_FAILED'); error.code = body.error; error.status = response.status; throw error; }
  return body;
}
export async function sha256File(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export const universalCaptureService = {
  token,
  async accept(organizationId: string, financeEntityId: string, file: File, sourceKind: UniversalEvidenceSourceKind, keys: { start: string; finalize: string }) {
    const originalSha256 = await sha256File(file);
    const start = await fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-start`, { method: 'POST', headers: await headers(organizationId), body: JSON.stringify({ financeEntityId, originalFilename: file.name, declaredMimeType: file.type, byteSize: file.size, originalSha256, sourceKind, idempotencyKey: keys.start, requestId: token('req') }) }).then(json);
    const uploadHeaders = new Headers(start.upload.requiredHeaders || {}); uploadHeaders.set('Content-Type', start.upload.contentType);
    const upload = await fetch(start.upload.url, { method: 'PUT', headers: uploadHeaders, body: file });
    if (!upload.ok) throw Object.assign(new Error('EVIDENCE_UPLOAD_FAILED'), { code: 'EVIDENCE_UPLOAD_FAILED' });
    return fetch(`${FINANCE_GATEWAY_PATH}?operation=universal-evidence-finalize`, { method: 'POST', headers: await headers(organizationId), body: JSON.stringify({ financeEntityId, evidenceId: start.evidenceId, expectedVersion: 1, idempotencyKey: keys.finalize, requestId: token('req') }) }).then(json);
  },
};
