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

async function getActorDisplayName(db: any, uid: string): Promise<string> {
  try {
    const uDoc = await db.collection('user_profiles').doc(uid).get();
    if (uDoc.exists) {
      return uDoc.data()?.name || uDoc.data()?.displayName || 'Usuário da equipe';
    }
  } catch (e) {
    // ignore
  }
  return 'Usuário da equipe';
}

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

    const transactionKind = payload.transactionKind || payload.direction;
    const { amountCents, occurredAt, accountId, paymentMethod, allocations, description, sourceContext, destinationAccountId, settlementType, liabilityAccountId } = payload;
    
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

    const actorDisplayName = await getActorDisplayName(db, uid);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      // Validate Draft Minimums and precedence
      const { 
        validateDraftMinimum, validateSubmissionReadiness, validateAccountMetadata, validateCategoryMetadata, validateFundMetadata, deriveCashFlowDirection 
      } = await import('../../../shared/finance/smartLogic.js');

      // Precedence of transactionKind over legacy direction
      if (payload.direction && payload.direction !== transactionKind) {
        throw { code: 'FINANCE_TRANSACTION_KIND_DIRECTION_CONFLICT', message: 'transactionKind and legacy direction conflict' };
      }

      payload.direction = transactionKind;

      const draftValidation = validateDraftMinimum(payload, financeEntityId);
      if (!draftValidation.valid) {
        throw { code: 'INVALID_PARAMETERS', message: draftValidation.errors.join('. ') };
      }

      // Prepare account data
      let accountDoc;
      let destinationAccountData = null;
      let liabilityAccountData = null;

      let accountSnapshot = undefined;
      if (accountId) {
        const accountRef = context.repository.getAccountsRef().doc(accountId);
        accountDoc = await t.get(accountRef);
        if (!accountDoc.exists || accountDoc.data()!.financeEntityId !== financeEntityId || !accountDoc.data()!.active) {
          throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Account invalid or inactive' };
        }
        
        const accountData = accountDoc.data()!;
        const accMeta = validateAccountMetadata(accountData);
        if (!accMeta.valid) {
          throw { code: 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE', message: accMeta.errors!.join('. ') };
        }
        accountSnapshot = {
          id: accountId,
          name: accMeta.name!,
          type: accMeta.type!,
          nature: accMeta.nature!
        };
        // inject snapshot temporarily for validation
        payload.accountSnapshot = accountSnapshot;
      }

      const draftValidationWithSnapshots = validateDraftMinimum(payload, financeEntityId);
      if (!draftValidationWithSnapshots.valid) {
        throw { code: 'FINANCE_PAYMENT_INSTRUMENT_INCOMPATIBLE', message: draftValidationWithSnapshots.errors.join('. ') };
      }

      // Submission Readiness Validation
      const readiness = validateSubmissionReadiness(payload);
      if (!readiness.ready) {
        throw { code: 'FINANCE_NOT_READY_FOR_SUBMISSION', message: readiness.errors.join('. ') };
      }

      let destinationAccountSnapshot = undefined;
      if (transactionKind === 'transfer') {
        const destAccRef = context.repository.getAccountsRef().doc(destinationAccountId);
        const destAccDoc = await t.get(destAccRef);
        if (!destAccDoc.exists || destAccDoc.data()!.financeEntityId !== financeEntityId || !destAccDoc.data()!.active) {
          throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Destination account invalid or inactive' };
        }
        destinationAccountData = destAccDoc.data()!;
        const destMeta = validateAccountMetadata(destinationAccountData);
        if (!destMeta.valid) {
          throw { code: 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE', message: destMeta.errors!.join('. ') };
        }
        destinationAccountSnapshot = {
          id: destinationAccountId,
          name: destMeta.name!,
          type: destMeta.type!,
          nature: destMeta.nature!
        };
      }

      let liabilityAccountSnapshot = undefined;
      if (transactionKind === 'liability_settlement' && payload.liabilityAccountId) {
        const liabAccRef = context.repository.getAccountsRef().doc(payload.liabilityAccountId);
        const liabAccDoc = await t.get(liabAccRef);
        if (!liabAccDoc.exists || liabAccDoc.data()!.financeEntityId !== financeEntityId || !liabAccDoc.data()!.active) {
          throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Liability account invalid or inactive' };
        }
        liabilityAccountData = liabAccDoc.data()!;
        const liabMeta = validateAccountMetadata(liabilityAccountData);
        if (!liabMeta.valid) {
          throw { code: 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE', message: liabMeta.errors!.join('. ') };
        }
        liabilityAccountSnapshot = {
          id: payload.liabilityAccountId,
          name: liabMeta.name!,
          type: liabMeta.type!,
          nature: liabMeta.nature!
        };
      }

      const allocsToSave: FinanceAllocation[] = [];
      const allocationIds: string[] = [];
      const txId = generateTransactionId();

      if (transactionKind !== 'transfer' && transactionKind !== 'liability_settlement') {
          for (let i = 0; i < allocations.length; i++) {
            const a = allocations[i];
            // Validate category
            if (!a.categoryId) throw { code: 'INVALID_PARAMETERS', message: 'Category required' };
            const catRef = context.repository.getCategoriesRef().doc(a.categoryId);
            const catDoc = await t.get(catRef);
            if (!catDoc.exists || catDoc.data()!.financeEntityId !== financeEntityId || !catDoc.data()!.active) {
              throw { code: 'FINANCE_CATEGORY_MISMATCH', message: 'Category invalid or inactive' };
            }
            if (catDoc.data()!.kind !== transactionKind) {
              throw { code: 'FINANCE_CATEGORY_MISMATCH', message: 'Category kind mismatch' };
            }
            const catData = catDoc.data()!;
            const catMeta = validateCategoryMetadata(catData);
            if (!catMeta.valid) {
              throw { code: 'FINANCE_CATEGORY_CONFIGURATION_INCOMPLETE', message: catMeta.errors!.join('. ') };
            }
     
            // Validate fund
            let fundData = null;
            if (a.fundId) {
              const fundRef = context.repository.getFundsRef().doc(a.fundId);
              const fundDoc = await t.get(fundRef);
              if (!fundDoc.exists || fundDoc.data()!.financeEntityId !== financeEntityId || !fundDoc.data()!.active) {
                throw { code: 'FINANCE_FUND_MISMATCH', message: 'Fund invalid or inactive' };
              }
              fundData = fundDoc.data()!;
              const fundMeta = validateFundMetadata(fundData);
              if (!fundMeta.valid) {
                throw { code: 'FINANCE_FUND_CONFIGURATION_INCOMPLETE', message: fundMeta.errors!.join('. ') };
              }
            }
     
            const alloc: FinanceAllocation = {
              id: generateAllocationId(),
              organizationId,
              financeEntityId,
              transactionId: txId,
              categoryId: a.categoryId,
              categorySnapshot: { id: a.categoryId, name: catMeta.name!, type: catMeta.kind!, icon: catMeta.icon },
              amountCents: a.amountCents,
              sequence: i,
              createdAt: new Date().toISOString(),
              createdBy: uid,
              schemaVersion: 1
            };
            if (a.fundId) {
              alloc.fundId = a.fundId;
              if (fundData && fundData.name) {
                alloc.fundSnapshot = { id: a.fundId, name: fundData.name };
              }
            }
            if (a.costCenterId) {
              alloc.costCenterId = a.costCenterId;
            }
            
            validateAllocation(alloc, financeEntityId, transactionKind as 'income'|'expense');
            allocsToSave.push(alloc);
            allocationIds.push(alloc.id);
          }
     
          // throws if not closed
          assertAllocationsTotal(allocsToSave, amountCents);
      }

      const cashFlowDirection = deriveCashFlowDirection({
        transactionKind,
        accountSnapshot,
        liabilityAccountSnapshot,
        sourceAccountSnapshot: accountSnapshot,
        destinationAccountSnapshot,
        paymentMethod,
        reimbursement: payload.reimbursement
      });

      const txPayload: any = {
        id: txId,
        organizationId,
        financeEntityId,
        transactionKind,
        direction: transactionKind, // legacy fallback
        cashFlowDirection,
        status: 'ready_for_review',
        amountCents,
        currency: 'BRL',
        occurredAt,
        recordedAt: new Date().toISOString(),
        paymentMethod: paymentMethod || 'unspecified',
        sourceContext: sourceContext || 'manual',
        reconciliationStatus: 'unreconciled',
        evidenceIds: payload.evidenceIds || [],
        accountId,
        accountSnapshot,
        allocationIds,
        createdBy: uid,
        updatedBy: uid,
        version: 1,
        schemaVersion: 1
      };
      if (payload.description) txPayload.description = payload.description;
      if (payload.counterparty) txPayload.counterparty = payload.counterparty;
      if (payload.evidenceJustification) txPayload.evidenceJustification = payload.evidenceJustification;
      if (destinationAccountSnapshot && transactionKind === 'transfer') {
        txPayload.sourceAccountId = accountId;
        txPayload.destinationAccountId = destinationAccountId;
        txPayload.destinationAccountSnapshot = destinationAccountSnapshot;
      }
      if (liabilityAccountSnapshot && transactionKind === 'liability_settlement') {
        txPayload.sourceAccountId = accountId;
        txPayload.liabilityAccountId = payload.liabilityAccountId;
        txPayload.liabilityAccountSnapshot = liabilityAccountSnapshot;
        txPayload.settlementType = payload.settlementType;
      }
      if (payload.reimbursement) {
        txPayload.reimbursement = payload.reimbursement;
      }
      if (description) txPayload.description = description;

      // This throws if core domain constraints fail (e.g., negative amount).
      validateTransactionCore(txPayload as LedgerTransaction);

      // Writes
      const { sanitizeFirestoreObject } = await import('./sanitizeFirestoreObject.js');
      const txRef = context.repository.getTransactionsRef().doc(txId);
      const txData = sanitizeFirestoreObject({
        ...txPayload,
        listQueryKeys: buildTransactionListQueryKeys(financeEntityId, txId, transactionKind, 'ready_for_review', occurredAt),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      
      t.set(txRef, txData);

      for (const alloc of allocsToSave) {
        const allocRef = context.repository.getAllocationsRef().doc(alloc.id);
        t.set(allocRef, sanitizeFirestoreObject({
          ...alloc,
          createdAt: FieldValue.serverTimestamp()
        }));
      }

      // Audit Log
      const auditId = generateAuditId();
      const auditRef = context.repository.getAuditRef().doc(auditId);
      t.set(auditRef, sanitizeFirestoreObject({
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'transaction',
        action: 'transaction.created_and_submitted',
        requestId,
        idempotencyKey,
        afterHash: payloadHash, // Simplified
        metadata: { status: 'ready_for_review', amountCents, transactionKind },
        createdAt: FieldValue.serverTimestamp()
      }));

      // Internal Events (sequential: created then submitted_for_review)
      const baseEvtId = idempotencyKey ? `evt_${idempotencyKey}` : generateAuditId();
      
      // Event 1: created
      t.set(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('events').doc(`${baseEvtId}_1`), sanitizeFirestoreObject({
        eventId: `${baseEvtId}_1`,
        organizationId,
        financeEntityId,
        transactionId: txId,
        eventType: 'created',
        actorUid: uid,
        actorDisplayNameSnapshot: actorDisplayName,
        versionBefore: null,
        versionAfter: 1,
        requestId,
        createdAt: FieldValue.serverTimestamp()
      }));

      // Event 2: submitted_for_review
      t.set(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('events').doc(`${baseEvtId}_2`), sanitizeFirestoreObject({
        eventId: `${baseEvtId}_2`,
        organizationId,
        financeEntityId,
        transactionId: txId,
        eventType: 'submitted_for_review',
        actorUid: uid,
        actorDisplayNameSnapshot: actorDisplayName,
        versionBefore: 1,
        versionAfter: 1,
        requestId,
        createdAt: FieldValue.serverTimestamp()
      }));

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
