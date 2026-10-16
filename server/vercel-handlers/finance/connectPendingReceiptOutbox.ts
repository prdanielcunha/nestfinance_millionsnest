import { randomUUID } from 'node:crypto';
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { publishCanonicalFinancePendingEvent } from './connectPendingEventPublisher.js';

/** Lives in the existing private financeIdempotency receipt, never in the public evidence. */
export type FinanceConnectReceiptOutbox = {
  schemaVersion: 1;
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  version: number;
  state: 'pending' | 'processing' | 'complete' | 'needs_review';
  attempts: number;
  leaseToken?: string;
  leaseUntil?: string;
  retryAt?: string;
  resultCode?: string;
};

const safe = (s: unknown): s is string => typeof s === 'string' && s.trim() === s &&
  s.length > 0 && s.length <= 180 && !/[\\/\u0000-\u001f\u007f]/.test(s);

export function financeConnectReceiptExtension(input: {
  enabled: boolean; organizationId: string; financeEntityId: string; evidenceId: string; version: number;
}): { connectOutbox?: FinanceConnectReceiptOutbox } {
  if (!input.enabled) return {};
  if (![input.organizationId, input.financeEntityId, input.evidenceId].every(safe) ||
      !Number.isSafeInteger(input.version) || input.version < 3) throw Error('FINANCE_CONNECT_RECEIPT_INVALID');
  return { connectOutbox: {
    schemaVersion: 1, organizationId: input.organizationId, financeEntityId: input.financeEntityId,
    evidenceId: input.evidenceId, version: input.version, state: 'pending', attempts: 0,
  } };
}

export function isFinanceConnectMarker(raw: unknown): raw is FinanceConnectReceiptOutbox {
  const m = raw as FinanceConnectReceiptOutbox;
  return !!m && m.schemaVersion === 1 &&
    [m.organizationId, m.financeEntityId, m.evidenceId].every(safe) &&
    Number.isSafeInteger(m.version) && m.version >= 3 &&
    ['pending', 'processing', 'complete', 'needs_review'].includes(m.state) &&
    Number.isInteger(m.attempts) && m.attempts >= 0 && m.attempts <= 3;
}

/**
 * Recover exactly one canonical request's idempotency receipt, with tenancy and
 * entity authority established by the existing finance request resolver.
 * No cross-entity scan, no new collection/index, no image, amount, PII or Meta send.
 * Only a server-side 202 from Connect can mark this opaque event complete.
 */
export async function recoverFinanceConnectReceipt(input: {
  db: Firestore; idempotencyRef: CollectionReference;
  receiptKey: string; organizationId: string; financeEntityId: string;
  enabled: boolean; signingSecret?: string; operatorTargetsJson?: string;
  now?: () => number; fetchImpl?: typeof fetch;
}): Promise<'disabled' | 'deferred' | 'complete' | 'needs_review' | 'pending'> {
  if (!input.enabled || !safe(input.organizationId) || !safe(input.financeEntityId) ||
      !/^[a-f0-9]{64}$/.test(input.receiptKey) ||
      !input.signingSecret || input.signingSecret.length < 32 ||
      !input.operatorTargetsJson) return 'disabled';

  const clock = input.now ?? Date.now;
  const ref = input.idempotencyRef.doc(input.receiptKey);
  const token = randomUUID();
  const now = clock();
  const claimed = await input.db.runTransaction(async t => {
    const snapshot = await t.get(ref);
    const record = snapshot.data();
    const marker: unknown = record?.connectOutbox;
    if (!snapshot.exists || record?.status !== 'completed' || !isFinanceConnectMarker(marker) ||
        marker.organizationId !== input.organizationId ||
        marker.financeEntityId !== input.financeEntityId ||
        record?.result?.evidenceId !== marker.evidenceId ||
        record?.result?.version !== marker.version) return null;
    if (marker.state === 'complete' || marker.state === 'needs_review') return null;
    if (marker.state === 'processing' && Date.parse(marker.leaseUntil ?? '') > now ||
        Date.parse(marker.retryAt ?? '') > now) return null;
    if (marker.attempts >= 3) {
      t.update(ref, { 'connectOutbox.state': 'needs_review', 'connectOutbox.resultCode': 'retry_limit' });
      return 'needs_review' as const;
    }
    t.update(ref, {
      'connectOutbox.state': 'processing', 'connectOutbox.leaseToken': token,
      'connectOutbox.leaseUntil': new Date(now + 30000).toISOString(),
      'connectOutbox.attempts': marker.attempts + 1,
    });
    return { ...marker, attempts: marker.attempts + 1 };
  });
  if (claimed === 'needs_review') return claimed;
  if (!claimed) return 'deferred';

  let outcome: 'accepted' | 'duplicate' | 'not_pending' | 'not_configured' | 'disabled' = 'not_pending';
  try {
    outcome = await publishCanonicalFinancePendingEvent({
      enabled: true, organizationId: input.organizationId, financeEntityId: input.financeEntityId,
      evidenceId: claimed.evidenceId, version: claimed.version, signingSecret: input.signingSecret,
      operatorTargetsJson: input.operatorTargetsJson, now: clock, fetchImpl: input.fetchImpl,
      loadOfficialPendingReview: async () => {
        const doc = await input.db
          .collection('organizations').doc(input.organizationId)
          .collection('financeEntities').doc(input.financeEntityId)
          .collection('universalEvidence').doc(claimed.evidenceId).get();
        if (!doc.exists) return null;
        const value = doc.data() || {};
        return {
          organizationId: value.organizationId, financeEntityId: value.financeEntityId,
          evidenceId: value.evidenceId, version: value.version,
          reviewStatus: value.review?.status, occurredAt: value.updatedAt?.toDate?.(),
        };
      },
    });
  } catch {
    // A timed-out 202 can be replayed safely: Connect's stable event ID dedupes.
    outcome = 'not_configured';
  }
  const updated = await input.db.runTransaction(async t => {
    const current = await t.get(ref);
    const marker: unknown = current.data()?.connectOutbox;
    if (!isFinanceConnectMarker(marker) || marker.state !== 'processing' ||
        marker.leaseToken !== token) return null;
    const complete = outcome === 'accepted' || outcome === 'duplicate';
    const review = !complete && (outcome === 'not_pending' || claimed.attempts >= 3);
    const state = complete ? 'complete' : review ? 'needs_review' : 'pending';
    t.update(ref, {
      'connectOutbox.state': state,
      'connectOutbox.leaseToken': '', 'connectOutbox.leaseUntil': '',
      'connectOutbox.retryAt': !complete && !review
        ? new Date(clock() + Math.min(3600000, 30000 * 2 ** claimed.attempts)).toISOString() : '',
      'connectOutbox.resultCode': complete ? 'accepted_by_connect' :
        review ? 'review_required' : 'transport_unconfirmed',
    });
    return state;
  });
  return updated ?? 'deferred';
}
