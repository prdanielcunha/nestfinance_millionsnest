import { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceTransactionAccess } from './accessHelpers.js';
import { buildIdempotencyKeyHash, hashPayload, executeWithIdempotency } from './idempotencyHelper.js';
import { generateAllocationId, generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { validateAllocation, FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { validateTransactionCore, LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { buildTransactionListQueryKeys } from '../../../shared/finance/ledger/listQueryKeys.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { 
      financeEntityId, transactionId, expectedVersion, payload, idempotencyKey, requestId 
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (typeof expectedVersion !== 'number' || expectedVersion < 1) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidIdempotencyKey(idempotencyKey)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!isValidRequestId(requestId)) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const token = authHeader.split('Bearer ')[1];
    const admin = getFirebaseAdmin();
    const db = admin.firestore;
    const decodedToken = await admin.auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!organizationId) return res.status(400).json({ error: 'MISSING_ORGANIZATION_ID' });

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    
    const context = await requireFinanceTransactionAccess({
      db, uid, organizationId, financeEntityId, sessionList,
      capability: 'finance.create_drafts'
    });

    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'update_draft', idempotencyKey);
    const payloadHash = hashPayload(payload);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      const txRef = context.repository.getTransactionsRef().doc(transactionId);
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) throw { code: 'NOT_FOUND', message: 'Transaction not found' };

      const txData = txDoc.data() as LedgerTransaction;
      if (txData.financeEntityId !== financeEntityId) throw { code: 'FORBIDDEN', message: 'Cross-entity reference' };
      if (txData.version !== expectedVersion) throw { code: 'FINANCE_VERSION_CONFLICT', message: 'Version conflict' };
      
      // Update only draft. If it's ready_for_review, it can be updated but only to return to draft!
      if (txData.status !== 'draft') {
         if (txData.status === 'ready_for_review' && payload.intent === 'return_to_draft') {
            // allow transition
         } else {
            throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Cannot edit transaction in current state' };
         }
      }

      if (txData.direction !== 'income' && txData.direction !== 'expense') {
          throw { code: 'INVALID_PARAMETERS', message: 'Only income and expense transactions can be edited in this phase' };
      }
      const direction = payload.direction || txData.direction;
      if (direction !== 'income' && direction !== 'expense') {
          throw { code: 'INVALID_PARAMETERS', message: 'Direction must be income or expense' };
      }
      
      let newStatus = txData.status;
      if (payload.intent === 'return_to_draft') {
          newStatus = 'draft';
      }

      if (payload.status !== undefined && payload.status !== newStatus) {
         throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Arbitrary status change not allowed' };
      }

      const accountId = payload.accountId || (txData as any).accountId;
      if (accountId) {
          const accountRef = context.repository.getAccountsRef().doc(accountId);
          const accountDoc = await t.get(accountRef);
          if (!accountDoc.exists || accountDoc.data()!.financeEntityId !== financeEntityId || !accountDoc.data()!.active) {
            throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Account invalid or inactive' };
          }
      }

      let newRecord: any = {
        ...txData,
        direction,
        amountCents: payload.amountCents !== undefined ? payload.amountCents : txData.amountCents,
        occurredAt: payload.occurredAt || txData.occurredAt,
        accountId,
        paymentMethod: payload.paymentMethod || txData.paymentMethod || 'unspecified',
        sourceContext: payload.sourceContext || txData.sourceContext,
        status: newStatus,
        updatedBy: uid
      };
      if (payload.description !== undefined) {
          if (payload.description === '') delete newRecord.description;
          else newRecord.description = payload.description;
      } else if (newRecord.description === undefined) {
          delete newRecord.description;
      }

      const existingAllocsQ = await t.get(context.repository.getAllocationsQuery().where('transactionId', '==', transactionId));
      const existingAllocs = existingAllocsQ.docs.map(d => ({id: d.id, ...d.data()} as FinanceAllocation));
      
      const allocRefsToSet = new Map<string, any>();
      const allocRefsToDelete = new Set<string>();
      let allocationIds: string[] = (txData as any).allocationIds && !payload.allocations ? (txData as any).allocationIds : [];

      if (Array.isArray(payload.allocations)) {
        allocationIds = [];
        const requestAllocIds = new Set(payload.allocations.map((a: any) => a.id).filter(Boolean));
        
        for (const ea of existingAllocs) {
          if (!requestAllocIds.has(ea.id)) {
            allocRefsToDelete.add(ea.id);
          }
        }

        for (let i = 0; i < payload.allocations.length; i++) {
          const a = payload.allocations[i];
          const aId = a.id || generateAllocationId();
          allocationIds.push(aId);

          if (!a.categoryId) throw { code: 'INVALID_PARAMETERS', message: 'Category required' };
          const catRef = context.repository.getCategoriesRef().doc(a.categoryId);
          const catDoc = await t.get(catRef);
          if (!catDoc.exists || catDoc.data()!.financeEntityId !== financeEntityId || !catDoc.data()!.active) {
            throw { code: 'FINANCE_CATEGORY_MISMATCH', message: 'Category invalid or inactive' };
          }
          if (catDoc.data()!.kind !== newRecord.direction) {
            throw { code: 'FINANCE_CATEGORY_MISMATCH', message: 'Category kind mismatch' };
          }

          if (a.fundId) {
            const fundRef = context.repository.getFundsRef().doc(a.fundId);
            const fundDoc = await t.get(fundRef);
            if (!fundDoc.exists || fundDoc.data()!.financeEntityId !== financeEntityId || !fundDoc.data()!.active) {
              throw { code: 'FINANCE_FUND_MISMATCH', message: 'Fund invalid or inactive' };
            }
          }

          const existingAlloc = existingAllocs.find(ea => ea.id === aId);
          const allocToSet: FinanceAllocation = {
            id: aId,
            organizationId,
            financeEntityId,
            transactionId: transactionId,
            categoryId: a.categoryId,
            amountCents: a.amountCents,
            sequence: i,
            createdAt: existingAlloc ? existingAlloc.createdAt : new Date().toISOString(),
            createdBy: existingAlloc ? existingAlloc.createdBy : uid,
            schemaVersion: 1
          };
          if (a.fundId) allocToSet.fundId = a.fundId;
          
          validateAllocation(allocToSet, financeEntityId, newRecord.direction as any);
          allocRefsToSet.set(aId, allocToSet);
        }
      }

      newRecord.allocationIds = allocationIds;

      validateTransactionCore(newRecord as LedgerTransaction);

      // detect no-op
      // extremely simple no-op detector for the demo, checking against previous hash if provided in the payload? No, we can just hash newRecord minus updatedBy/updatedAt and compare. For reliability, we will skip deep no-op detector due to time, unless requested.
      // Wait, PRD: "Detectar no-op por representação normalizada". Let's stringify.
      const removeDynamic = (obj: any) => {
         const { updatedBy, updatedAt, version, ...rest } = obj;
         return rest;
      };
      
      const oldState = removeDynamic(txData);
      const newStateVal = removeDynamic(newRecord);
      
      const oldAllocsState = existingAllocs.map(removeDynamic).sort((a,b) => a.id.localeCompare(b.id));
      const newAllocsState = Array.from(allocRefsToSet.values()).map(removeDynamic).sort((a,b) => a.id.localeCompare(b.id));

      const isNoOpTransaction = hashPayload(oldState) === hashPayload(newStateVal);
      const isNoOpAllocs = hashPayload(oldAllocsState) === hashPayload(newAllocsState) && allocRefsToDelete.size === 0;

      if (isNoOpTransaction && isNoOpAllocs) {
         return { changed: false, transactionId, version: txData.version };
      }

      const keysNeedUpdate = oldState.occurredAt !== newStateVal.occurredAt || oldState.direction !== newStateVal.direction || oldState.status !== newStateVal.status || !(txData as any).listQueryKeys;
      if (keysNeedUpdate) {
         newRecord.listQueryKeys = buildTransactionListQueryKeys(financeEntityId, transactionId, newRecord.direction, newRecord.status, newRecord.occurredAt);
      }

      newRecord.version = txData.version + 1;
      newRecord.updatedAt = FieldValue.serverTimestamp();

      t.update(txRef, newRecord);

      for (const aId of allocRefsToDelete) {
        t.delete(context.repository.getAllocationsRef().doc(aId));
      }
      for (const [aId, data] of allocRefsToSet) {
        t.set(context.repository.getAllocationsRef().doc(aId), {
           ...data,
           updatedAt: FieldValue.serverTimestamp() // Assuming allocations have updatedAt for edit
        }, { merge: true }); // using set with merge because it may be new
      }

      const auditId = generateAuditId();
      let action = 'transaction.updated';
      if (txData.status === 'ready_for_review' && newStatus === 'draft') {
          action = 'transaction.returned_to_draft';
      }

      t.set(context.repository.getAuditRef().doc(auditId), {
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'transaction',
        action,
        requestId,
        idempotencyKey,
        afterHash: payloadHash,
        createdAt: FieldValue.serverTimestamp()
      });

      return { changed: true, transactionId, version: newRecord.version };
    });

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('Update Transaction Error:', error);
    if (error.code && error.code.startsWith('FINANCE_')) {
      return res.status(400).json({ error: error.code, details: error.message });
    }
    if (error.message?.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
