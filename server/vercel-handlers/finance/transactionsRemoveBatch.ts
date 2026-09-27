import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId, isValidTransactionId } from '../../../shared/finance/ledger/ids.js';
import { transactionRemovalBlocker } from '../../../shared/finance/transactionPermanentRemoval.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { getTransactionSearchIndexRef } from './transactionSearchIndex.js';

const MAX_ITEMS = 10;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, items, idempotencyKey, requestId } = req.body || {};
    if (
      typeof financeEntityId !== 'string' || !financeEntityId.trim() ||
      !Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS ||
      items.some((item: any) => !item || !isValidTransactionId(item.transactionId) || !Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 1) ||
      new Set(items.map((item: any) => item.transactionId)).size !== items.length ||
      !isValidIdempotencyKey(idempotencyKey) || !isValidRequestId(requestId)
    ) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, uid, actorLabel, organizationId, sessionList, context } = await resolveFinanceRequestContext(req, 'finance.manage');
    const role = String(sessionList.organizationRole || '').toLowerCase();
    if (!sessionList.isGlobalAccess && role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const payloadHash = hashPayload({ items });
    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'remove_transactions', idempotencyKey),
      payloadHash,
      async (transaction) => {
        // Read and validate the whole selection before staging any write: all or nothing.
        const records = [];
        for (const { transactionId, expectedVersion } of items) {
          const ref = context.repository.getTransactionsRef().doc(transactionId);
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists) throw { code: 'NOT_FOUND' };
          const data = snapshot.data() || {};
          if (data.financeEntityId !== financeEntityId) throw { code: 'FORBIDDEN' };
          if (data.version !== expectedVersion) throw { code: 'FINANCE_VERSION_CONFLICT' };
          const blocker = transactionRemovalBlocker(data);
          if (blocker) throw { code: 'FINANCE_REMOVAL_BLOCKED', details: blocker };

          const allocationDocs = await transaction.get(context.repository.getAllocationsQuery().where('transactionId', '==', transactionId).limit(21));
          const approvals = await transaction.get(ref.collection('approvals').limit(21));
          if (allocationDocs.size > 20 || approvals.size > 20) throw { code: 'FINANCE_REMOVAL_BLOCKED', details: 'TOO_MANY_LINKS' };
          const recordedAllocationIds = Array.isArray(data.allocationIds) ? data.allocationIds : [];
          if (recordedAllocationIds.length !== allocationDocs.size ||
              allocationDocs.docs.some((doc) => !recordedAllocationIds.includes(doc.id) || doc.data().financeEntityId !== financeEntityId)) {
            throw { code: 'FINANCE_REMOVAL_BLOCKED', details: 'UNRESOLVED_LINKS' };
          }
          records.push({ ref, data, allocationDocs, approvals, transactionId });
        }

        for (const { ref, data, allocationDocs, approvals, transactionId } of records) {
          allocationDocs.docs.forEach((doc) => transaction.delete(doc.ref));
          approvals.docs.forEach((doc) => transaction.delete(doc.ref));
          transaction.delete(getTransactionSearchIndexRef(db, organizationId, financeEntityId).doc(transactionId));
          transaction.delete(ref);

          const auditId = generateAuditId();
          stageCanonicalAuditRecord(transaction, db, context.repository.getAuditRef().doc(auditId), {
            eventId: auditId,
            organizationId,
            financeEntityId,
            actor: uid,
            resource: 'transaction',
            resourceId: transactionId,
            action: 'transaction.permanently_removed',
            requestId,
            idempotencyKey,
            beforeHash: hashPayload({ transactionId, version: data.version, status: data.status, amountCents: data.amountCents }),
            metadata: { status: data.status, versionBefore: data.version, allocationCount: allocationDocs.size },
            createdAt: FieldValue.serverTimestamp(),
          });
          const eventId = `evt_remove_${auditId}`;
          transaction.set(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('events').doc(eventId), {
            eventId, organizationId, financeEntityId, transactionId,
            eventType: 'permanently_removed', actorUid: uid, actorDisplayNameSnapshot: actorLabel,
            versionBefore: data.version, versionAfter: null, requestId,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        return { deleted: records.length, transactionIds: records.map((record) => record.transactionId) };
      },
    );
    return res.status(200).json(result);
  } catch (error: any) {
    const code = String(error?.code || '');
    if (code === 'FINANCE_VERSION_CONFLICT' || code === 'FINANCE_REMOVAL_BLOCKED') {
      return res.status(409).json({ error: code, details: error.details || null });
    }
    if (String(error?.message || '').includes('FINANCE_IDEMPOTENCY_CONFLICT')) return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    if (code === 'NOT_FOUND') return res.status(404).json({ error: code });
    if (code === 'FORBIDDEN' || error?.message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error?.status === 401 || error?.status === 403 || error?.status === 400) return res.status(error.status).json({ error: error.error || 'FORBIDDEN' });
    console.error('Remove Transactions Error:', code || 'UNEXPECTED_ERROR');
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
