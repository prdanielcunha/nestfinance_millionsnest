import { createHash, randomBytes } from 'node:crypto';
import type { VercelResponse } from '@vercel/node';
import {
  normalizeCountVerificationPolicy,
  type CountVerificationPolicy,
  type CountVerificationEvidence,
} from '../../../shared/finance/countVerificationPolicy.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';

export const V3_INVITE_TTL_MS = 4 * 60 * 60 * 1000;
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function assertCountV3Enabled(): void {
  if (process.env.NESTFINANCE_COUNT_V3_ENABLED !== 'true') {
    throw { status: 404, error: 'COUNT_V3_NOT_ENABLED' };
  }
}

export function countV3PolicyFromEntity(entity: Record<string, any>): CountVerificationPolicy {
  return normalizeCountVerificationPolicy(entity.countVerificationPolicy);
}

export function generateCountV3JoinCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, value => ALPHABET[value % ALPHABET.length]).join('');
}

export function normalizeCountV3JoinCode(value: unknown): string {
  const code = typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/.test(code)) {
    throw new Error('COUNT_INVALID_JOIN_CODE');
  }
  return code;
}

export function countV3InviteHash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function assertV3Session(session: Record<string, any>, orgId: string, entityId: string): void {
  if (session.organizationId !== orgId || session.financeEntityId !== entityId) {
    throw new Error('COUNT_SESSION_NOT_FOUND');
  }
}

export function v3IsParticipant(session: Record<string, any>, uid: string): boolean {
  return Array.isArray(session.participants) && session.participants.includes(uid);
}

export function assertV3CanRead(session: Record<string, any>, uid: string, countOnly: boolean): void {
  if (countOnly && !v3IsParticipant(session, uid)) {
    throw { status: 403, error: 'COUNT_SESSION_NOT_ASSIGNED' };
  }
}

export function v3IsValidSessionId(id: unknown): id is string {
  return isValidCountSessionId(id);
}

/** Respond without user-entered financial material and without invitation secrets.
 * Draft evidence of other operators must never escape during a blind count. */
export function serializeV3Session(session: Record<string, any>, uid: string, _privileged: boolean) {
  const confirmed = Array.isArray(session.confirmations)
    ? session.confirmations as CountVerificationEvidence[]
    : [];
  const status = String(session.status || 'pending');
  const blind = status === 'pending' || status === 'divergent';
  const mine = confirmed.filter(c => c.operatorUid === uid);
  // Blindness applies even to a second counter with a separate treasury role.
  // Financial authority must not weaken independence during verification.
  const visible = blind ? mine : confirmed;
  return {
    id: session.id,
    serviceLabel: session.serviceLabel,
    serviceDate: session.serviceDate,
    status,
    version: Number(session.version || 0),
    policySnapshot: session.policySnapshot,
    participantCount: Array.isArray(session.participants) ? session.participants.length : 0,
    canManageInvite: session.createdByUid === uid && session.status === 'pending',
    confirmationCount: confirmed.length,
    independentConfirmed: confirmed.filter(c => c.mode === 'independent').length,
    assistedRecorded: confirmed.filter(c => c.mode === 'assisted').length,
    materialHidden: blind,
    ownConfirmations: visible.map(c => ({
      verificationId: c.verificationId,
      mode: c.mode,
      operatorUid: c.operatorUid,
      physicalCounterLabel: c.physicalCounterLabel || null,
      entries: c.entries,
    })),
    // Monetary totals are deliberately absent from list and blind session views.
    confirmedTotalCents: !blind && status === 'matched'
      ? Number(session.evaluation?.totalCents ?? 0) : null,
  };
}

export function sendCountV3Error(res: VercelResponse, error: any): void {
  const message = String(error?.message || '');
  if (error?.status === 401 || error?.status === 403 || error?.status === 404) {
    res.status(error.status).json({ error: error.error || 'FORBIDDEN' });
    return;
  }
  if (message === 'COUNT_SESSION_NOT_FOUND' || message === 'COUNT_JOIN_CODE_NOT_FOUND') {
    res.status(404).json({ error: message });
    return;
  }
  if (message.startsWith('FINANCE_IDEMPOTENCY_CONFLICT') ||
    ['COUNT_VERSION_CONFLICT', 'COUNT_INVALID_STATE', 'COUNT_TEAM_CAPACITY_EXCEEDED',
      'COUNT_DUPLICATE_VERIFICATION', 'COUNT_INDEPENDENT_COUNTER_ALREADY_RECORDED',
      'COUNT_JOIN_CODE_EXPIRED'].includes(message)) {
    res.status(409).json({ error: message.startsWith('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : message });
    return;
  }
  if (message.startsWith('COUNT_')) {
    res.status(400).json({ error: message });
    return;
  }
  if (message === 'FORBIDDEN_FINANCE_ACCESS') {
    res.status(403).json({ error: 'FORBIDDEN' });
    return;
  }
  if (['auth/id-token-revoked', 'auth/id-token-expired', 'auth/invalid-id-token'].includes(error?.code)) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  console.error('Count V3 Error', { type: error?.name || 'unknown', message: 'UNEXPECTED_ERROR' });
  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
}
