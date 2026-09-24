import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  buildIdempotencyKeyHash,
  executeWithIdempotency,
  hashPayload,
} from './idempotencyHelper.js';
import {
  generateAuditId,
  isValidIdempotencyKey,
  isValidRequestId,
} from '../../../shared/finance/ledger/ids.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { getTransactionSearchIndexRef } from './transactionSearchIndex.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const {
      financeEntityId,
      transactionId,
      expectedVersion,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      typeof transactionId !== 'string' ||
      !transactionId.trim() ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const {
      db,
      uid,
      actorLabel,
      organizationId,
      context,
    } = await resolveFinanceRequestContext(req, 'finance.create_drafts');

    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'discard_draft',
      idempotencyKey,
    );
    const payloadHash = hashPayload({ transactionId, expectedVersion });

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const transactionRef = context.repository.getTransactionsRef().doc(transactionId);
        const snapshot = await transaction.get(transactionRef);

        if (!snapshot.exists) {
          throw { code: 'NOT_FOUND', message: 'Transaction not found' };
        }

        const transactionData = snapshot.data() || {};
        if (transactionData.financeEntityId !== financeEntityId) {
          throw { code: 'FORBIDDEN', message: 'Cross-entity reference' };
        }
        if (Number(transactionData.version) !== expectedVersion) {
          throw { code: 'FINANCE_VERSION_CONFLICT', message: 'Version conflict' };
        }
        if (transactionData.status !== 'draft') {
          throw {
            code: 'FINANCE_INVALID_STATE_TRANSITION',
            message: 'Only draft transactions can be discarded',
          };
        }

        const allocationIds = Array.isArray(transactionData.allocationIds)
          ? transactionData.allocationIds.filter(
              (value: unknown): value is string =>
                typeof value === 'string' && value.trim().length > 0,
            )
          : [];

        const auditId = generateAuditId();
        const auditRef = context.repository.getAuditRef().doc(auditId);
        const beforeHash = hashPayload({
          transactionId,
          status: transactionData.status,
          version: transactionData.version,
          transactionKind: transactionData.transactionKind || transactionData.direction,
          amountCents: transactionData.amountCents,
          occurredAt: transactionData.occurredAt,
          accountId: transactionData.accountId,
          allocationIds,
          description: transactionData.description,
        });

        for (const allocationId of allocationIds) {
          transaction.delete(context.repository.getAllocationsRef().doc(allocationId));
        }

        transaction.delete(
          getTransactionSearchIndexRef(db, organizationId, financeEntityId).doc(transactionId),
        );
        transaction.delete(transactionRef);

        stageCanonicalAuditRecord(transaction, db, auditRef, {
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'transaction',
          resourceId: transactionId,
          action: 'transaction.draft_discarded',
          requestId,
          idempotencyKey,
          beforeHash,
          metadata: {
            status: 'draft',
            versionBefore: transactionData.version,
            allocationCount: allocationIds.length,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        const eventId = `evt_discard_${idempotencyKey}`;
        transaction.set(
          db
            .collection('organizations')
            .doc(organizationId)
            .collection('financeEntities')
            .doc(financeEntityId)
            .collection('events')
            .doc(eventId),
          {
            eventId,
            organizationId,
            financeEntityId,
            transactionId,
            eventType: 'draft_discarded',
            actorUid: uid,
            actorDisplayNameSnapshot: actorLabel,
            versionBefore: transactionData.version,
            versionAfter: null,
            requestId,
            createdAt: FieldValue.serverTimestamp(),
          },
        );

        return { deleted: true, transactionId };
      },
    );

    return res.status(200).json(result);
  } catch (error: any) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');

    if (code === 'FINANCE_VERSION_CONFLICT') {
      return res.status(409).json({ error: code, details: message });
    }
    if (code === 'FINANCE_INVALID_STATE_TRANSITION') {
      return res.status(409).json({ error: code, details: message });
    }
    if (message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status === 401 || error?.status === 403 || error?.status === 400) {
      return res.status(error.status).json({
        error: error.error || (error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN'),
      });
    }

    console.error(
      'Discard Transaction Draft Error:',
      code.startsWith('FINANCE_') ? code : 'UNEXPECTED_ERROR',
    );
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
