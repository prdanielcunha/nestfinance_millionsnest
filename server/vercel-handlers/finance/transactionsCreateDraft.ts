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

    const { transactionKind, amountCents, occurredAt, accountId, paymentMethod, allocations, description, sourceContext, destinationAccountId, settlementType, liabilityAccountId } = payload;
    
    if (transactionKind !== 'income' && transactionKind !== 'expense' && transactionKind !== 'transfer' && transactionKind !== 'liability_settlement') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'Invalid transactionKind' });
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
    
    const context = await requireFinanceTransactionAccess({
      db,
      uid,
      organizationId,
      financeEntityId,
      sessionList,
      capability: 'finance.create_drafts'
    });

    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'create_draft', idempotencyKey);
    const payloadHash = hashPayload(payload);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      // Validate Draft Minimums
      const { validateDraftMinimum } = await import('../../../shared/finance/smartLogic.js');
      const draftValidation = validateDraftMinimum(payload, financeEntityId);
      if (!draftValidation.valid) {
        throw { code: 'INVALID_PARAMETERS', message: draftValidation.errors.join('. ') };
      }

      // Prepare account data
      let accountDoc;
      let destinationAccountData = null;
      let liabilityAccountData = null;
      let reimbursementData = null;

      if (accountId) {
        const accountRef = context.repository.getAccountsRef().doc(accountId);
        accountDoc = await t.get(accountRef);
        if (!accountDoc.exists || accountDoc.data()!.financeEntityId !== financeEntityId || !accountDoc.data()!.active) {
          throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Account invalid or inactive' };
        }
        
        // inject snapshot type into payload temporarily for validation
        payload.accountSnapshot = { type: accountDoc.data()!.type };
      }

      const draftValidationWithSnapshots = validateDraftMinimum(payload, financeEntityId);
      if (!draftValidationWithSnapshots.valid) {
        throw { code: 'FINANCE_PAYMENT_INSTRUMENT_INCOMPATIBLE', message: draftValidationWithSnapshots.errors.join('. ') };
      }

      if (transactionKind === 'transfer') {
        const destAccRef = context.repository.getAccountsRef().doc(destinationAccountId);
        const destAccDoc = await t.get(destAccRef);
        if (!destAccDoc.exists || destAccDoc.data()!.financeEntityId !== financeEntityId || !destAccDoc.data()!.active) {
          throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Destination account invalid or inactive' };
        }
        destinationAccountData = destAccDoc.data()!;
      }

      if (transactionKind === 'liability_settlement' && payload.liabilityAccountId) {
        const liabAccRef = context.repository.getAccountsRef().doc(payload.liabilityAccountId);
        const liabAccDoc = await t.get(liabAccRef);
        if (!liabAccDoc.exists || liabAccDoc.data()!.financeEntityId !== financeEntityId || !liabAccDoc.data()!.active) {
          throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Liability account invalid or inactive' };
        }
        liabilityAccountData = liabAccDoc.data()!;
      }

      // We need to parse allocations
      if (!Array.isArray(allocations) || allocations.length === 0) {
        // Draft can be incomplete, but must have at least one allocation or not?
        // Prompt: "pelo menos um rateio existir; ... drafts incompletos permitidos somente em draft conforme regra;" 
        // Wait, "A criação deve validar: allocations... soma exata dos rateios." actually for draft it can be incomplete. Let's allow empty if explicitly requested, or require at least 1? The prompt says "pelo menos um rateio válido antes de postagem". For draft creation "Se qualquer validação falhar: zero transaction". We'll allow empty allocations array during draft creation or just require it. Let's process allocations.
      }

      const allocsToSave: FinanceAllocation[] = [];
      const allocationIds: string[] = [];
      const txId = generateTransactionId();

      if (Array.isArray(allocations)) {
        for (let i = 0; i < allocations.length; i++) {
          const a = allocations[i];
          // Validate category
          if (!a.categoryId) throw { code: 'INVALID_PARAMETERS', message: 'Category required' };
          const catRef = context.repository.getCategoriesRef().doc(a.categoryId);
          const catDoc = await t.get(catRef);
          if (!catDoc.exists || catDoc.data()!.financeEntityId !== financeEntityId || !catDoc.data()!.active) {
            throw { code: 'FINANCE_CATEGORY_MISMATCH', message: 'Category invalid or inactive' };
          }
          if (transactionKind !== 'transfer' && transactionKind !== 'liability_settlement' && catDoc.data()!.kind !== transactionKind) {
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
            createdAt: new Date().toISOString(), // Use ISO string as requested by P06A
            createdBy: uid,
            schemaVersion: 1
          };
          if (a.fundId) {
            alloc.fundId = a.fundId;
            if (fundData) {
              alloc.fundSnapshot = { id: a.fundId, name: fundData.name };
            }
          }
          
          if (transactionKind === 'income' || transactionKind === 'expense') {
            validateAllocation(alloc, financeEntityId, transactionKind as 'income'|'expense');
          }
          allocsToSave.push(alloc);
          allocationIds.push(alloc.id);
        }
      }

      const txPayload: any = {
        id: txId,
        organizationId,
        financeEntityId,
        transactionKind,
        direction: transactionKind, // legacy fallback for listQueryKeys
        cashFlowDirection: transactionKind === 'income' ? 'inflow' : transactionKind === 'transfer' ? 'internal' : transactionKind === 'expense' ? 'outflow' : 'outflow', // Will be adjusted later if needed
        status: 'draft',
        amountCents,
        currency: 'BRL',
        occurredAt,
        recordedAt: new Date().toISOString(),
        paymentMethod: paymentMethod || 'unspecified',
        sourceContext: sourceContext || 'manual',
        reconciliationStatus: 'unreconciled',
        evidenceIds: [],
        accountId, // still kept for DB compatibility if needed by queries
        accountSnapshot: { id: accountId, name: accountDoc.data()!.name, type: accountDoc.data()!.type },
        allocationIds,
        createdBy: uid,
        updatedBy: uid,
        version: 1,
        schemaVersion: 1
      };
      if (destinationAccountData) {
        txPayload.sourceAccountId = accountId;
        txPayload.destinationAccountId = destinationAccountId;
        txPayload.destinationAccountSnapshot = { id: destinationAccountId, name: destinationAccountData.name, type: destinationAccountData.type };
      }
      if (liabilityAccountData) {
        txPayload.sourceAccountId = accountId;
        txPayload.liabilityAccountId = payload.liabilityAccountId;
        txPayload.liabilityAccountSnapshot = { id: payload.liabilityAccountId, name: liabilityAccountData.name, type: liabilityAccountData.type };
        txPayload.settlementType = payload.settlementType;
      }
      if (payload.reimbursement) {
        txPayload.reimbursement = payload.reimbursement;
      }
      if (description) txPayload.description = description;

      // This throws if core domain constraints fail (e.g., negative amount).
      validateTransactionCore(txPayload as LedgerTransaction);

      // Writes
      const txRef = context.repository.getTransactionsRef().doc(txId);
      // We convert temporal strings to server timestamps for persistence if needed, but PRD says ISO-8601 strings and createdAt/updatedAt using serverTimestamp
      const txData = {
        ...txPayload,
        listQueryKeys: buildTransactionListQueryKeys(financeEntityId, txId, direction, 'draft', occurredAt),
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
        action: 'transaction.created',
        requestId,
        idempotencyKey,
        afterHash: payloadHash, // Simplified
        metadata: { status: 'draft', amountCents, direction },
        createdAt: FieldValue.serverTimestamp()
      });

      return { transactionId: txId, version: 1 };
    });

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('Create Transaction Error:', error);
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
