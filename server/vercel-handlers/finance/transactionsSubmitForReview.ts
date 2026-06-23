import { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceTransactionAccess } from './accessHelpers.js';
import { buildIdempotencyKeyHash, hashPayload, executeWithIdempotency } from './idempotencyHelper.js';
import { generateAuditId, isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { assertAllocationsTotal, FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { buildTransactionListQueryKeys } from '../../../shared/finance/ledger/listQueryKeys.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { 
      financeEntityId, transactionId, expectedVersion, idempotencyKey, requestId 
    } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (typeof expectedVersion !== 'number' || expectedVersion < 1) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
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

    const payload = { financeEntityId, transactionId, expectedVersion }; // simplified payload for hash
    const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, uid, 'submit_review', idempotencyKey);
    const payloadHash = hashPayload(payload);

    const result = await executeWithIdempotency(db, context.repository.getIdempotencyRef(), keyHash, payloadHash, async (t) => {
      const txRef = context.repository.getTransactionsRef().doc(transactionId);
      const txDoc = await t.get(txRef);
      if (!txDoc.exists) throw { code: 'NOT_FOUND', message: 'Transaction not found' };

      const txData = txDoc.data() as LedgerTransaction;
      if (txData.financeEntityId !== financeEntityId) throw { code: 'FORBIDDEN', message: 'Cross-entity reference' };
      if (txData.version !== expectedVersion) throw { code: 'FINANCE_VERSION_CONFLICT', message: 'Version conflict' };
      
      if (txData.status !== 'draft') {
         // idempotency handles retries, so if it's already ready_for_review from another request, expectedVersion would differ.
         // if expectedVersion matches but status isn't draft, state is invalid for submission.
         throw { code: 'FINANCE_INVALID_STATE_TRANSITION', message: 'Cannot submit transaction not in draft' };
      }

      // Validations: must be fully valid and allocations complete
      const existingAllocsQ = await t.get(context.repository.getAllocationsQuery().where('transactionId', '==', transactionId));
      const existingAllocs = existingAllocsQ.docs.map(d => ({id: d.id, ...d.data()} as FinanceAllocation));

      const payloadForReadiness = { ...txData, allocations: existingAllocs };

      const { validateSubmissionReadiness } = await import('../../../shared/finance/smartLogic.js');
      const readiness = validateSubmissionReadiness(payloadForReadiness);
      if (!readiness.ready) {
        throw { code: 'FINANCE_NOT_READY_FOR_SUBMISSION', message: readiness.errors.join('. ') };
      }

      const transactionKind = txData.transactionKind || txData.direction;

      if (transactionKind !== 'transfer' && transactionKind !== 'liability_settlement') {
        // throws if not closed
        assertAllocationsTotal(existingAllocs, txData.amountCents);
      }

      // Verify active account
      if (transactionKind === 'income' || transactionKind === 'expense') {
          const accountRef = context.repository.getAccountsRef().doc((txData as any).accountId);
          const accountDoc = await t.get(accountRef);
          if (!accountDoc.exists || accountDoc.data()!.financeEntityId !== financeEntityId || !accountDoc.data()!.active) {
            throw { code: 'FINANCE_ACCOUNT_MISMATCH', message: 'Account invalid or inactive' };
          }
      }

      const newVersion = txData.version + 1;
      const listQueryKeys = buildTransactionListQueryKeys(financeEntityId, transactionId, transactionKind, 'ready_for_review', txData.occurredAt);
      
      t.update(txRef, {
        status: 'ready_for_review',
        listQueryKeys,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
        version: newVersion
      });

      const auditId = generateAuditId();
      t.set(context.repository.getAuditRef().doc(auditId), {
        eventId: auditId,
        organizationId,
        financeEntityId,
        actor: uid,
        resource: 'transaction',
        action: 'transaction.submitted',
        requestId,
        idempotencyKey,
        afterHash: payloadHash,
        createdAt: FieldValue.serverTimestamp()
      });

      return { transactionId, version: newVersion };
    });

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('Submit Transaction Error:', error);
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
