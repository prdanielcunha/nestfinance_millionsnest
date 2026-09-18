import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  RECONCILIATION_REVERSAL_REASON_CODES,
  RECONCILIATION_REVERSAL_SCHEMA_VERSION,
  type ReconciliationReverseResponse,
  type ReconciliationReversalReasonCode,
  type ReconciliationReversalRecord,
} from '../../../shared/finance/reconciliationReversal.js';
import {
  RECONCILIATION_LINE_LOCK_SCHEMA_VERSION,
  type ReconciliationLineLockRecord,
} from '../../../shared/finance/reconciliationLineLock.js';
import {
  isValidIdempotencyKey,
  isValidRequestId,
  isValidTransactionId,
  generateAuditId,
} from '../../../shared/finance/ledger/ids.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  buildIdempotencyKeyHash,
  executeWithIdempotency,
  hashPayload,
} from './idempotencyHelper.js';
import {
  buildReconciliationLineLockId,
  buildReconciliationReversalId,
} from './reconciliationConfirmationIds.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';
import { stageFinanceFact } from './factStream.js';

const validReconciliationId = (value: unknown): value is string =>
  typeof value === 'string' && /^rec_[a-f0-9]{64}$/.test(value);

function normalizeNote(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw { code: 'RECONCILIATION_INVALID_NOTE' };
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) return null;
  if (normalized.length > 300) throw { code: 'RECONCILIATION_INVALID_NOTE' };
  return normalized;
}

function validReason(value: unknown): value is ReconciliationReversalReasonCode {
  return (
    typeof value === 'string' &&
    (RECONCILIATION_REVERSAL_REASON_CODES as readonly string[]).includes(value)
  );
}

async function actorDisplayName(db: any, uid: string) {
  try {
    const snapshot = await db.collection('user_profiles').doc(uid).get();
    const data = snapshot.data() || {};
    return data.name || data.displayName || 'Usuário da equipe';
  } catch {
    return 'Usuário da equipe';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const {
      financeEntityId,
      transactionId,
      reconciliationId,
      reasonCode,
      note,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !isValidTransactionId(transactionId) ||
      !validReconciliationId(reconciliationId) ||
      !validReason(reasonCode) ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const normalizedNote = normalizeNote(note);
    const { db, uid, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.review');

    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'reconciliation_reverse',
      idempotencyKey,
    );
    const payloadHash = hashPayload({
      transactionId,
      reconciliationId,
      reasonCode,
      note: normalizedNote,
    });

    const idempotencySnapshot = await context.repository.getIdempotencyRef().doc(keyHash).get();
    if (idempotencySnapshot.exists) {
      const data = idempotencySnapshot.data() || {};
      if (data.payloadHash !== payloadHash) {
        return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
      }
      if (data.status === 'completed' && data.result) {
        return res.status(200).json(data.result);
      }
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }

    const transactionRef = context.repository.getTransactionsRef().doc(transactionId);
    const reconciliationRef = context.repository.getReconciliationsRef().doc(reconciliationId);
    const reversalId = buildReconciliationReversalId({
      organizationId,
      financeEntityId,
      reconciliationId,
    });
    const reversalRef = context.repository.getReconciliationReversalsRef().doc(reversalId);
    const displayName = await actorDisplayName(db, uid);

    const result = await executeWithIdempotency<ReconciliationReverseResponse>(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (t) => {
        const transactionSnapshot = await t.get(transactionRef);
        const reconciliationSnapshot = await t.get(reconciliationRef);
        const reversalSnapshot = await t.get(reversalRef);

        if (!transactionSnapshot.exists) {
          throw { code: 'RECONCILIATION_TRANSACTION_NOT_FOUND' };
        }
        const txData = transactionSnapshot.data() || {};
        context.repository.assertEntityIsolation(txData);

        if (!reconciliationSnapshot.exists) {
          throw { code: 'RECONCILIATION_CONFIRMATION_NOT_FOUND' };
        }
        const reconciliation = reconciliationSnapshot.data() || {};
        context.repository.assertEntityIsolation(reconciliation);

        if (
          reconciliation.organizationId !== organizationId ||
          reconciliation.transactionId !== transactionId ||
          reconciliation.status !== 'confirmed'
        ) {
          throw { code: 'RECONCILIATION_CONFIRMATION_MISMATCH' };
        }

        if (
          txData.reconciliationStatus !== 'reconciled' ||
          txData.reconciliationId !== reconciliationId
        ) {
          throw { code: 'RECONCILIATION_NOT_CURRENT' };
        }

        if (reversalSnapshot.exists) {
          throw { code: 'RECONCILIATION_ALREADY_REVERSED' };
        }

        const evidenceId =
          typeof reconciliation.evidenceId === 'string' ? reconciliation.evidenceId : '';
        const statementLineFingerprint =
          typeof reconciliation.statementLineFingerprint === 'string'
            ? reconciliation.statementLineFingerprint
            : '';
        if (!evidenceId || !statementLineFingerprint) {
          throw { code: 'RECONCILIATION_CONFIRMATION_CORRUPT' };
        }

        const lineLockId =
          typeof reconciliation.lineLockId === 'string' && reconciliation.lineLockId
            ? reconciliation.lineLockId
            : buildReconciliationLineLockId({
                organizationId,
                financeEntityId,
                evidenceId,
                statementLineFingerprint,
              });
        const lineLockRef = context.repository.getReconciliationLineLocksRef().doc(lineLockId);
        const lineLockSnapshot = await t.get(lineLockRef);
        const lineLock = lineLockSnapshot.data() || {};

        if (
          lineLockSnapshot.exists &&
          (
            lineLock.status !== 'active' ||
            lineLock.activeReconciliationId !== reconciliationId ||
            lineLock.activeTransactionId !== transactionId
          )
        ) {
          throw { code: 'RECONCILIATION_LINE_LOCK_MISMATCH' };
        }

        const currentVersion = Number(txData.version);
        if (!Number.isInteger(currentVersion) || currentVersion < 0) {
          throw { code: 'FINANCE_VERSION_CONFLICT' };
        }
        const newVersion = currentVersion + 1;
        const reversedAt = FieldValue.serverTimestamp();

        const reversal: ReconciliationReversalRecord = {
          reversalId,
          reconciliationId,
          lineLockId,
          organizationId,
          financeEntityId,
          accountId:
            typeof reconciliation.accountId === 'string' ? reconciliation.accountId : '',
          transactionId,
          evidenceId,
          statementLineFingerprint,
          reasonCode,
          note: normalizedNote,
          reversedByUid: uid,
          reversedAt,
          requestId,
          balanceChanged: false,
          journalChanged: false,
          schemaVersion: RECONCILIATION_REVERSAL_SCHEMA_VERSION,
        };

        const releasedLock: ReconciliationLineLockRecord = {
          lineLockId,
          organizationId,
          financeEntityId,
          evidenceId,
          statementLineFingerprint,
          status: 'released',
          activeReconciliationId: null,
          activeTransactionId: null,
          activatedByUid:
            typeof lineLock.activatedByUid === 'string'
              ? lineLock.activatedByUid
              : typeof reconciliation.confirmedByUid === 'string'
                ? reconciliation.confirmedByUid
                : null,
          activatedAt: lineLock.activatedAt || reconciliation.confirmedAt || null,
          releasedByUid: uid,
          releasedAt: reversedAt,
          releaseReversalId: reversalId,
          schemaVersion: RECONCILIATION_LINE_LOCK_SCHEMA_VERSION,
        };

        t.create(reversalRef, sanitizeFirestoreObject(reversal));
        t.set(lineLockRef, sanitizeFirestoreObject(releasedLock));

        t.update(transactionRef, sanitizeFirestoreObject({
          reconciliationStatus: 'unreconciled',
          lastReconciliationId: reconciliationId,
          lastReconciliationEvidenceId: evidenceId,
          lastReconciliationReversalId: reversalId,
          lastReconciliationReversedAt: reversedAt,
          lastReconciliationReversedByUid: uid,
          lastReconciliationReversalReason: reasonCode,
          reconciliationId: FieldValue.delete(),
          reconciliationEvidenceId: FieldValue.delete(),
          reconciliationLineFingerprint: FieldValue.delete(),
          reconciliationLineLockId: FieldValue.delete(),
          reconciledAt: FieldValue.delete(),
          reconciledByUid: FieldValue.delete(),
          updatedAt: reversedAt,
          updatedBy: uid,
          version: newVersion,
        }));

        const auditId = generateAuditId();
        const auditRef = context.repository.getAuditRef().doc(auditId);
        t.set(auditRef, sanitizeFirestoreObject({
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'reconciliation',
          action: 'transaction.reconciliation_reversed',
          requestId,
          transactionId,
          reconciliationId,
          reversalId,
          metadata: {
            evidenceId,
            reasonCode,
            note: normalizedNote,
            balanceChanged: false,
            journalChanged: false,
          },
          createdAt: reversedAt,
        }));

        stageFinanceFact(t, db, {
          organizationId,
          eventType: 'RECONCILIATION_REVERSED',
          entityType: 'finance_reconciliation_reversal',
          entityId: reversalId,
          actorUserId: uid,
          correlationId: requestId,
          payload: {
            financeEntityId,
            transactionId,
            reconciliationId,
            evidenceId,
            reasonCode,
            reconciliationStatus: 'unreconciled',
            transactionVersion: newVersion,
            balanceChanged: false,
            journalChanged: false,
          },
          sourceRefs: [
            { kind: 'record', ref: reversalRef.path, version: RECONCILIATION_REVERSAL_SCHEMA_VERSION },
            { kind: 'record', ref: reconciliationRef.path, version: Number(reconciliation.schemaVersion) || 1 },
            { kind: 'record', ref: lineLockRef.path, version: RECONCILIATION_LINE_LOCK_SCHEMA_VERSION },
            { kind: 'record', ref: transactionRef.path, version: newVersion },
            { kind: 'audit', ref: auditRef.path },
          ],
        });

        const eventId = `evt_${reversalId.slice(5, 37)}`;
        t.set(
          db
            .collection('organizations')
            .doc(organizationId)
            .collection('financeEntities')
            .doc(financeEntityId)
            .collection('events')
            .doc(eventId),
          sanitizeFirestoreObject({
            eventId,
            organizationId,
            financeEntityId,
            transactionId,
            reconciliationId,
            reversalId,
            eventType: 'reconciliation_reversed',
            actorUid: uid,
            actorDisplayNameSnapshot: displayName,
            reasonCode,
            note: normalizedNote,
            versionBefore: currentVersion,
            versionAfter: newVersion,
            requestId,
            createdAt: reversedAt,
          }),
        );

        return {
          reversalId,
          reconciliationId,
          transactionId,
          transactionVersion: newVersion,
          reconciliationStatus: 'unreconciled',
          balanceChanged: false,
          journalChanged: false,
          auditRecorded: true,
          factRecorded: true,
        };
      },
    );

    return res.status(200).json(result);
  } catch (error: any) {
    const code = String(error?.code || error?.message || '');

    if (code === 'RECONCILIATION_INVALID_NOTE') {
      return res.status(400).json({ error: code });
    }
    if (code.startsWith('RECONCILIATION_')) {
      const notFound = code.includes('NOT_FOUND');
      return res.status(notFound ? 404 : 409).json({ error: code });
    }
    if (code === 'FINANCE_VERSION_CONFLICT') {
      return res.status(409).json({ error: code });
    }
    if (code.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (
      code === 'FORBIDDEN_FINANCE_ACCESS' ||
      code === 'FINANCE_ENTITY_MISMATCH' ||
      code === 'Session not granted'
    ) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }

    console.error('Reconciliation reverse error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
