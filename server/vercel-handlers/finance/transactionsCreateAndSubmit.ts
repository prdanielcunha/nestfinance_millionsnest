import { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceTransactionAccess } from './accessHelpers.js';
import { buildIdempotencyKeyHash, hashPayload, executeWithIdempotency } from './idempotencyHelper.js';
import { generateTransactionId, generateAllocationId, generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { validateAllocation, assertAllocationsTotal, FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { validateTransactionCore, LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { buildTransactionListQueryKeys } from '../../../shared/finance/ledger/listQueryKeys.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { 
      financeEntityId, payload, idempotencyKey, requestId 
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'Invalid idempotencyKey' });
    }
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'Invalid requestId' });
    }

    const { direction, amountCents, occurredAt, accountId, paymentMethod, allocations, description, sourceContext, destinationAccountId } = payload;
    
    if (direction !== 'income' && direction !== 'expense' && direction !== 'transfer') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'Direction must be income, expense, or transfer' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const token = authHeader.split('Bearer ')[1];
    const admin = getFirebaseAdmin();
    const db = admin.firestore;
    const decodedToken = await admin.auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!organizationId) {
      return res.status(400).json({ error: 'MISSING_ORGANIZATION_ID' });
    }

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    
    // We require submit capability
    const context = await requireFinanceTransactionAccess({
      db,
      uid,
      organizationId,
      financeEntityId,
      sessionList,
      capability: 'finance.submit_for_review'
    });

    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'create_and_submit', idempotencyKey);
    const payloadHash = hashPayload(payload);

      const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      // Validations
      const accountRef = context.repository.getAccountsRef().doc(accountId);
      const accountDoc = await t.get(accountRef);
      if (!accountDoc.exists || accountDoc.data()!.financeEntityId !== financeEntityId || !accountDoc.data()!.active) {
        throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Account invalid or inactive' };
      }

      // Smart Logic Validation
      const { getCompatibility } = await import('../../../shared/finance/smartLogic.js');
      const comp = getCompatibility(accountDoc.data()!.type, paymentMethod, direction as any);
      if (comp.level === 'impossible') {
        throw { code: 'FINANCE_PAYMENT_INSTRUMENT_INCOMPATIBLE', message: comp.explanation };
      }

      let destinationAccountData = null;
      if (direction === 'transfer') {
        if (!destinationAccountId) throw { code: 'FINANCE_DESTINATION_ACCOUNT_REQUIRED', message: 'Destination account is required for transfer' };
        if (accountId === destinationAccountId) throw { code: 'FINANCE_TRANSFER_SAME_ACCOUNT', message: 'Origin and destination accounts must be different' };
        
        const destAccRef = context.repository.getAccountsRef().doc(destinationAccountId);
        const destAccDoc = await t.get(destAccRef);
        if (!destAccDoc.exists || destAccDoc.data()!.financeEntityId !== financeEntityId || !destAccDoc.data()!.active) {
          throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Destination account invalid or inactive' };
        }
        destinationAccountData = destAccDoc.data()!;
      }

      const allocsToSave: FinanceAllocation[] = [];
      const allocationIds: string[] = [];
      const txId = generateTransactionId();

      if (direction !== 'transfer') {
          if (!Array.isArray(allocations) || allocations.length === 0) {
            throw { code: 'FINANCE_INVALID_ALLOCATION', message: 'Submit requires at least one allocation for income/expense' };
          }
          for (let i = 0; i < allocations.length; i++) {
            const a = allocations[i];
            // Validate category
            if (!a.categoryId) throw { code: 'INVALID_PARAMETERS', message: 'Category required' };
            const catRef = context.repository.getCategoriesRef().doc(a.categoryId);
            const catDoc = await t.get(catRef);
            if (!catDoc.exists || catDoc.data()!.financeEntityId !== financeEntityId || !catDoc.data()!.active) {
              throw { code: 'FINANCE_CATEGORY_MISMATCH', message: 'Category invalid or inactive' };
            }
            if (catDoc.data()!.kind !== direction) {
              throw { code: 'FINANCE_CATEGORY_MISMATCH', message: 'Category kind mismatch' };
            }
            const catData = catDoc.data()!;
    
            // Validate fund
            let fundData = null;
            if (a.fundId) {
              const fundRef = context.repository.getFundsRef().doc(a.fundId);
              const fundDoc = await t.get(fundRef);
              if (!fundDoc.exists || fundDoc.data()!.financeEntityId !== financeEntityId || !fundDoc.data()!.active) {
                throw { code: 'FINANCE_FUND_MISMATCH', message: 'Fund invalid or inactive' };
              }
              fundData = fundDoc.data();
            }
    
            const alloc: FinanceAllocation = {
              id: generateAllocationId(),
              organizationId,
              financeEntityId,
              transactionId: txId,
              categoryId: a.categoryId,
              categorySnapshot: { id: a.categoryId, name: catData.name, type: catData.kind, icon: catData.icon },
              amountCents: a.amountCents,
              sequence: i,
              createdAt: new Date().toISOString(),
              createdBy: uid,
              schemaVersion: 1
            };
            if (a.fundId) {
              alloc.fundId = a.fundId;
              if (fundData) {
                alloc.fundSnapshot = { id: a.fundId, name: fundData.name };
              }
            }
            
            validateAllocation(alloc, financeEntityId, direction as 'income'|'expense');
            allocsToSave.push(alloc);
            allocationIds.push(alloc.id);
          }
    
          // throws if not closed
          assertAllocationsTotal(allocsToSave, amountCents);
      }

      const txPayload: any = {
        id: txId,
        organizationId,
        financeEntityId,
        direction,
        status: 'ready_for_review',
        amountCents,
        currency: 'BRL',
        occurredAt,
        recordedAt: new Date().toISOString(),
        paymentMethod: paymentMethod || 'unspecified',
        sourceContext: sourceContext || 'manual',
        reconciliationStatus: 'unreconciled',
        evidenceIds: [],
        accountId,
        accountSnapshot: { id: accountId, name: accountDoc.data()!.name, type: accountDoc.data()!.type },
        allocationIds,
        createdBy: uid,
        updatedBy: uid,
        version: 1,
        schemaVersion: 1
      };
      if (destinationAccountData && direction === 'transfer') {
        txPayload.sourceAccountId = accountId;
        txPayload.destinationAccountId = destinationAccountId;
        txPayload.destinationAccountSnapshot = { id: destinationAccountId, name: destinationAccountData.name, type: destinationAccountData.type };
      }
      if (description) txPayload.description = description;

      // This throws if core domain constraints fail (e.g., negative amount).
      validateTransactionCore(txPayload as LedgerTransaction);

      // Writes
      const txRef = context.repository.getTransactionsRef().doc(txId);
      const txData = {
        ...txPayload,
        listQueryKeys: buildTransactionListQueryKeys(financeEntityId, txId, direction, 'ready_for_review', occurredAt),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      
      t.set(txRef, txData);

      for (const alloc of allocsToSave) {
        const allocRef = context.repository.getAllocationsRef().doc(alloc.id);
        t.set(allocRef, {
          ...alloc,
          createdAt: FieldValue.serverTimestamp()
        });
      }

      // Audit Log
      const auditId = generateAuditId();
      const auditRef = context.repository.getAuditRef().doc(auditId);
      t.set(auditRef, {
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'transaction',
        action: 'transaction.created_and_submitted',
        requestId,
        idempotencyKey,
        afterHash: payloadHash, // Simplified
        metadata: { status: 'ready_for_review', amountCents, direction },
        createdAt: FieldValue.serverTimestamp()
      });

      return { transactionId: txId, version: 1 };
    });

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('Create and Submit Transaction Error:', error);
    if (error.code && error.code.startsWith('FINANCE_')) {
      return res.status(400).json({ error: error.code, details: error.message });
    }
    if (error.message?.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
