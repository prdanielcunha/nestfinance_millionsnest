import type { Firestore } from 'firebase-admin/firestore';
import type { NestFinanceSignalType } from '../../../shared/intelligence/canonicalSignal.js';

type CurrentSignalStateInput = {
  db: Firestore;
  organizationId: string;
  financeEntityId: string;
  signalType: NestFinanceSignalType;
  entityType: string;
  entityId: string;
};

/**
 * Confirms that an open projection still matches authoritative current state.
 *
 * Facts explain why a signal was opened. This check answers a different
 * question: does the underlying domain record still require that action now?
 * The helper is read-only and never repairs or mutates projection state.
 */
export async function isFinanceSignalCurrent({
  db,
  organizationId,
  financeEntityId,
  signalType,
  entityType,
  entityId,
}: CurrentSignalStateInput): Promise<boolean> {
  if (signalType === 'TRANSACTION_REVIEW_REQUIRED') {
    if (entityType !== 'finance_transaction') return false;
    const snapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeTransactions')
      .doc(entityId)
      .get();
    const data = snapshot.data() || {};
    return (
      snapshot.exists &&
      data.financeEntityId === financeEntityId &&
      data.status === 'ready_for_review'
    );
  }

  if (signalType === 'TRANSACTION_CORRECTION_REQUIRED') {
    if (entityType !== 'finance_transaction') return false;
    const snapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeTransactions')
      .doc(entityId)
      .get();
    const data = snapshot.data() || {};
    return (
      snapshot.exists &&
      data.financeEntityId === financeEntityId &&
      data.status === 'draft' &&
      Boolean(
        data.returnedToDraftAt ||
          data.returnedToDraftReason ||
          data.returnedToDraftComment ||
          data.approvalStatus === 'invalidated' ||
          data.invalidatedAt,
      )
    );
  }

  if (
    signalType === 'INBOX_IDENTIFICATION_REQUIRED' ||
    signalType === 'INBOX_REVIEW_REQUIRED'
  ) {
    if (entityType !== 'universal_evidence') return false;
    const snapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('universalEvidence')
      .doc(entityId)
      .get();
    const data = snapshot.data() || {};
    if (
      !snapshot.exists ||
      data.organizationId !== organizationId ||
      data.financeEntityId !== financeEntityId ||
      data.processingState !== 'accepted' ||
      data.duplicate === true
    ) {
      return false;
    }

    const classified = Boolean(data.classification?.documentType);
    if (signalType === 'INBOX_IDENTIFICATION_REQUIRED') {
      return !classified;
    }

    return classified && data.review?.status !== 'reviewed';
  }

  if (signalType === 'COUNT_DIVERGENCE_REVIEW_REQUIRED') {
    if (entityType !== 'count_session') return false;
    const snapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('countSessions')
      .doc(entityId)
      .get();
    const data = snapshot.data() || {};
    return (
      snapshot.exists &&
      data.organizationId === organizationId &&
      data.financeEntityId === financeEntityId &&
      (data.status === 'divergent' || data.status === 'recounting')
    );
  }

  return false;
}
