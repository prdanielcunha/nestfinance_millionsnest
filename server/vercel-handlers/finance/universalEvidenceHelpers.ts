import { randomBytes } from 'node:crypto';
import type { UniversalEvidenceMime } from '../../../shared/finance/universalEvidence.js';

export const EVIDENCE_UPLOAD_TTL_MS = 10 * 60 * 1000;
export const generateEvidenceId = () => `evd_${randomBytes(16).toString('hex')}`;
export const generateEvidenceAuditId = () => `audit_evd_${randomBytes(12).toString('hex')}`;
export function evidenceObjectPath(args: { organizationId: string; financeEntityId: string; evidenceId: string; mime: UniversalEvidenceMime }) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[args.mime];
  return `organizations/${args.organizationId}/financeEntities/${args.financeEntityId}/universalEvidence/${args.evidenceId}/original.${extension}`;
}
export function cleanFilename(value: unknown) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\\/\0-\x1f]/g, '_').trim().slice(0, 180);
  return cleaned || null;
}
