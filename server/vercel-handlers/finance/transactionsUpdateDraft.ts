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
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';

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

    const actorDisplayName = await getActorDisplayName(db, uid);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      const txRef = context.repository.getTransactionsRef().doc(transactionId);
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) throw { code: 'NOT_FOUND', message: 'Transaction not found' };

      const txData = txDoc.data() as LedgerTransaction;
      if (txData.financeEntityId !== financeEntityId) throw { code: 'FORBIDDEN', message: 'Cross-entity reference' };
      if (txData.version !== expectedVersion) throw { code: 'FINANCE_VERSION_CONFLICT', message: 'Version conflict' };
      
      // Update only draft.
      if (txData.status !== 'draft') {
          throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Cannot edit transaction in current state' };
      }

      const existingKind = txData.transactionKind || txData.direction;
      if (!['income', 'expense', 'transfer', 'liability_settlement'].includes(existingKind)) {
          throw { code: 'INVALID_PARAMETERS', message: 'Only income, expense, transfer or liability_settlement transactions can be edited in this phase' };
      }
      const transactionKind = payload.transactionKind || payload.direction || existingKind;
      if (!['income', 'expense', 'transfer', 'liability_settlement'].includes(transactionKind)) {
          throw { code: 'INVALID_PARAMETERS', message: 'transactionKind must be income, expense, transfer, or liability_settlement' };
      }
      
      // Precedence of transactionKind over legacy direction
      if (payload.direction && payload.direction !== transactionKind) {
        throw { code: 'FINANCE_TRANSACTION_KIND_DIRECTION_CONFLICT', message: 'transactionKind and legacy direction conflict' };
      }
      
      if (payload.status !== undefined && payload.status !== txData.status) {
         throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Arbitrary status change not allowed' };
      }

      const mergedPayload = {
        ...txData,
        ...payload,
        transactionKind,
        direction: transactionKind, // legacy
        amountCents: payload.amountCents !== undefined ? payload.amountCents : txData.amountCents,
        occurredAt: payload.occurredAt || txData.occurredAt,
        accountId: payload.accountId !== undefined ? payload.accountId : (txData as any).accountId,
        paymentMethod: payload.paymentMethod || txData.paymentMethod || 'unspecified'
      };

      const { validateDraftMinimum, validateAccountMetadata, validateCategoryMetadata, validateFundMetadata, deriveCashFlowDirection } = await import('../../../shared/finance/smartLogic.js');
      const draftValidation = validateDraftMinimum(mergedPayload, financeEntityId);
      if (!draftValidation.valid) {
        throw { code: 'INVALID_PARAMETERS', message: draftValidation.errors.join('. ') };
      }

      let accountData = null;
      let accountSnapshot = undefined;
      let validationIssues: any[] = [];

      if (mergedPayload.accountId) {
          const accountRef = context.repository.getAccountsRef().doc(mergedPayload.accountId);
          const accountDoc = await t.get(accountRef);
          if (!accountDoc.exists || accountDoc.data()!.financeEntityId !== financeEntityId || !accountDoc.data()!.active) {
            throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Account invalid or inactive' };
          }
          accountData = accountDoc.data()!;
          const accMeta = validateAccountMetadata(accountData);
          if (!accMeta.valid) {
            validationIssues.push({
              code: 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE',
              field: 'accountId'
            });
          } else {
            accountSnapshot = {
              id: mergedPayload.accountId,
              name: accMeta.name!,
              type: accMeta.type!,
              nature: accMeta.nature!
            };
          }
          mergedPayload.accountSnapshot = accountSnapshot || { type: accountData.type || 'other' };
      } else {
         validationIssues.push({
           code: 'FINANCE_ACCOUNT_REQUIRED',
           field: 'accountId'
         });
      }

      const draftValidationWithSnapshots = validateDraftMinimum(mergedPayload, financeEntityId);
      if (!draftValidationWithSnapshots.valid) {
        throw { code: 'FINANCE_PAYMENT_INSTRUMENT_INCOMPATIBLE', message: draftValidationWithSnapshots.errors.join('. ') };
      }

      let destinationAccountData = null;
      let destinationAccountSnapshot = undefined;
      if (transactionKind === 'transfer' && mergedPayload.destinationAccountId) {
          const destAccRef = context.repository.getAccountsRef().doc(mergedPayload.destinationAccountId);
          const destAccDoc = await t.get(destAccRef);
          if (!destAccDoc.exists || destAccDoc.data()!.financeEntityId !== financeEntityId || !destAccDoc.data()!.active) {
            throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Destination account invalid or inactive' };
          }
          destinationAccountData = destAccDoc.data()!;
          const destMeta = validateAccountMetadata(destinationAccountData);
          if (!destMeta.valid) {
            validationIssues.push({
              code: 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE',
              field: 'destinationAccountId'
            });
          } else {
            destinationAccountSnapshot = {
              id: mergedPayload.destinationAccountId,
              name: destMeta.name!,
              type: destMeta.type!,
              nature: destMeta.nature!
            };
          }
      }

      let liabilityAccountData = null;
      let liabilityAccountSnapshot = undefined;
      if (transactionKind === 'liability_settlement' && mergedPayload.liabilityAccountId) {
          const liabAccRef = context.repository.getAccountsRef().doc(mergedPayload.liabilityAccountId);
          const liabAccDoc = await t.get(liabAccRef);
          if (!liabAccDoc.exists || liabAccDoc.data()!.financeEntityId !== financeEntityId || !liabAccDoc.data()!.active) {
            throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Liability account invalid or inactive' };
          }
          liabilityAccountData = liabAccDoc.data()!;
          const liabMeta = validateAccountMetadata(liabilityAccountData);
          if (!liabMeta.valid) {
            validationIssues.push({
              code: 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE',
              field: 'liabilityAccountId'
            });
          } else {
            liabilityAccountSnapshot = {
              id: mergedPayload.liabilityAccountId,
              name: liabMeta.name!,
              type: liabMeta.type!,
              nature: liabMeta.nature!
            };
          }
      }

      const cashFlowDirection = deriveCashFlowDirection({
        transactionKind,
        accountSnapshot,
        liabilityAccountSnapshot,
        sourceAccountSnapshot: accountSnapshot,
        destinationAccountSnapshot,
        paymentMethod: mergedPayload.paymentMethod,
        reimbursement: mergedPayload.reimbursement
      });

      let newRecord: any = {
        ...txData,
        transactionKind,
        direction: transactionKind, // legacy fallback
        cashFlowDirection,
        amountCents: mergedPayload.amountCents,
        occurredAt: mergedPayload.occurredAt,
        competenceDate: payload.competenceDate !== undefined ? payload.competenceDate : txData.competenceDate,
        accountId: mergedPayload.accountId,
        paymentMethod: mergedPayload.paymentMethod,
        counterparty: payload.counterparty !== undefined ? payload.counterparty : txData.counterparty,
        evidenceIds: payload.evidenceIds !== undefined ? payload.evidenceIds : txData.evidenceIds || [],
        evidenceJustification: payload.evidenceJustification !== undefined ? payload.evidenceJustification : txData.evidenceJustification,
        description: payload.description !== undefined ? payload.description : txData.description,
        sourceContext: mergedPayload.sourceContext || txData.sourceContext,
        status: txData.status,
        updatedBy: uid,
        accountSnapshot,
        validationIssues
      };
      
      if (destinationAccountSnapshot && transactionKind === 'transfer') {
          newRecord.sourceAccountId = mergedPayload.accountId;
          newRecord.destinationAccountId = mergedPayload.destinationAccountId;
          newRecord.destinationAccountSnapshot = destinationAccountSnapshot;
      } else {
          delete newRecord.sourceAccountId;
          delete newRecord.destinationAccountId;
          delete newRecord.destinationAccountSnapshot;
      }

      if (liabilityAccountSnapshot && transactionKind === 'liability_settlement') {
        newRecord.sourceAccountId = mergedPayload.accountId;
        newRecord.liabilityAccountId = mergedPayload.liabilityAccountId;
        newRecord.liabilityAccountSnapshot = liabilityAccountSnapshot;
        newRecord.settlementType = mergedPayload.settlementType || (txData as any).settlementType;
      } else {
        delete newRecord.liabilityAccountId;
        delete newRecord.liabilityAccountSnapshot;
        delete newRecord.settlementType;
      }

      if (mergedPayload.reimbursement !== undefined) {
        newRecord.reimbursement = mergedPayload.reimbursement;
      }

      if (payload.description !== undefined) {
          if (payload.description === '') delete newRecord.description;
          else newRecord.description = payload.description;
      } else if (newRecord.description === undefined) {
          delete newRecord.description;
      }

      if (payload.competenceDate !== undefined) {
          if (payload.competenceDate === '') delete newRecord.competenceDate;
          else newRecord.competenceDate = payload.competenceDate;
      } else if (newRecord.competenceDate === undefined) {
          delete newRecord.competenceDate;
      }
      
      if (payload.counterparty !== undefined) {
          if (payload.counterparty === '') delete newRecord.counterparty;
          else newRecord.counterparty = payload.counterparty;
      } else if (newRecord.counterparty === undefined) {
          delete newRecord.counterparty;
      }

      if (payload.evidenceJustification !== undefined) {
          if (payload.evidenceJustification === '') delete newRecord.evidenceJustification;
          else newRecord.evidenceJustification = payload.evidenceJustification;
      } else if (newRecord.evidenceJustification === undefined) {
          delete newRecord.evidenceJustification;
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
          if (newRecord.transactionKind !== 'transfer' && catDoc.data()!.kind !== newRecord.transactionKind) {
            throw { code: 'FINANCE_CATEGORY_MISMATCH', message: 'Category kind mismatch' };
          }
          const catData = catDoc.data()!;
          const catMeta = validateCategoryMetadata(catData);
          if (!catMeta.valid) {
            validationIssues.push({
              code: 'FINANCE_CATEGORY_CONFIGURATION_INCOMPLETE',
              field: `allocations[${i}].categoryId`
            });
          }

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
              validationIssues.push({
                code: 'FINANCE_FUND_CONFIGURATION_INCOMPLETE',
                field: `allocations[${i}].fundId`
              });
            }
          }

          const existingAlloc = existingAllocs.find(ea => ea.id === aId);
          const allocToSet: FinanceAllocation = {
            id: aId,
            organizationId,
            financeEntityId,
            transactionId: transactionId,
            categoryId: a.categoryId,
            categorySnapshot: catMeta.valid ? { id: a.categoryId, name: catMeta.name!, type: catMeta.kind!, icon: catMeta.icon } : undefined as any,
            amountCents: a.amountCents,
            sequence: i,
            createdAt: existingAlloc ? existingAlloc.createdAt : new Date().toISOString(),
            createdBy: existingAlloc ? existingAlloc.createdBy : uid,
            schemaVersion: 1
          };
          if (a.fundId) {
            allocToSet.fundId = a.fundId;
            if (fundData && fundData.name) {
              allocToSet.fundSnapshot = { id: a.fundId, name: fundData.name };
            }
          }
          if (a.costCenterId) {
            allocToSet.costCenterId = a.costCenterId;
          }
          
          validateAllocation(allocToSet, financeEntityId, newRecord.transactionKind as any);
          allocRefsToSet.set(aId, allocToSet);
        }
      }

      newRecord.allocationIds = allocationIds;

      validateTransactionCore(newRecord as LedgerTransaction);

      // detect no-op
      // extremely simple no-op detector for the demo, checking against previous hash if provided in the payload? No, we can just hash newRecord minus updatedBy/updatedAt and compare. For reliability, we will skip deep no-op detector due to time, unless requested.
      // Wait, PRD: "Detectar no-op por representação normalizada". Let's stringify.
      const cleanUndefined = (val: any): any => {
        if (val === null || val === undefined) return undefined;
        if (Array.isArray(val)) return val.map(cleanUndefined);
        if (typeof val === 'object') {
          const clean: any = {};
          for (const key of Object.keys(val)) {
            const v = cleanUndefined(val[key]);
            if (v !== undefined) {
              clean[key] = v;
            }
          }
          return clean;
        }
        return val;
      };

      const removeDynamic = (obj: any) => {
         const { updatedBy, updatedAt, version, listQueryKeys, createdAt, validationIssues, ...rest } = obj;
         const cleanedRest = cleanUndefined(rest);
         const clean: any = { ...cleanedRest };
         if (validationIssues && Array.isArray(validationIssues) && validationIssues.length === 0) {
           // treat empty validationIssues as equivalent to missing
         } else if (validationIssues) {
           clean.validationIssues = validationIssues;
         }
         return clean;
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

      const keysNeedUpdate = oldState.occurredAt !== newStateVal.occurredAt || oldState.transactionKind !== newStateVal.transactionKind || oldState.status !== newStateVal.status || !(txData as any).listQueryKeys;
      if (keysNeedUpdate) {
         newRecord.listQueryKeys = buildTransactionListQueryKeys(financeEntityId, transactionId, newRecord.transactionKind, newRecord.status, newRecord.occurredAt);
      }

      newRecord.version = txData.version + 1;
      newRecord.contentVersion = (txData.contentVersion || txData.version) + 1;
      newRecord.updatedAt = FieldValue.serverTimestamp();

      const sanitizedRecord = sanitizeFirestoreObject(newRecord);

      t.update(txRef, sanitizedRecord);

      for (const aId of allocRefsToDelete) {
        t.delete(context.repository.getAllocationsRef().doc(aId));
      }
      for (const [aId, data] of allocRefsToSet) {
        t.set(context.repository.getAllocationsRef().doc(aId), sanitizeFirestoreObject({
           ...data,
           updatedAt: FieldValue.serverTimestamp()
        }), { merge: true });
      }

      const auditId = generateAuditId();
      let action = 'transaction.updated';
      let eventType = 'draft_updated';

      t.set(context.repository.getAuditRef().doc(auditId), sanitizeFirestoreObject({
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
      }));

      // Internal Event
      const eventId = idempotencyKey ? `evt_${idempotencyKey}` : generateAuditId();
      t.set(db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('events').doc(eventId), sanitizeFirestoreObject({
        eventId,
        organizationId,
        financeEntityId,
        transactionId,
        eventType,
        actorUid: uid,
        actorDisplayNameSnapshot: actorDisplayName,
        versionBefore: txData.version,
        versionAfter: newRecord.version,
        requestId,
        createdAt: FieldValue.serverTimestamp()
      }));

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
