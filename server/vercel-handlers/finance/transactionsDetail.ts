import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceTransactionAccess, hasFinanceCapability } from './accessHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { financeEntityId, transactionId } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'financeEntityId is required' });
    }
    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'transactionId is required' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const token = authHeader.split('Bearer ')[1];
    const admin = getFirebaseAdmin();
    const decodedToken = await admin.auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!organizationId) {
      return res.status(400).json({ error: 'MISSING_ORGANIZATION_ID' });
    }

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    
    const context = await requireFinanceTransactionAccess({
      db: admin.firestore,
      uid,
      organizationId,
      financeEntityId,
      sessionList,
      capability: 'finance.view'
    });

    const txDoc = await context.repository.getTransactionsRef().doc(transactionId).get();
    
    if (!txDoc.exists) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const txData = txDoc.data()!;
    context.repository.assertEntityIsolation(txData);

    const allocationsSnapshot = await context.repository.getAllocationsQuery()
      .where('transactionId', '==', transactionId)
      .get();
      
    const allocations = allocationsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => a.sequence - b.sequence);

    // Capabilities effective
    const canEdit = hasFinanceCapability(sessionList, 'finance.create_drafts') 
                    && (txData.status === 'draft' || txData.status === 'ready_for_review');

    return res.status(200).json({
      transaction: {
        id: txData.id,
        direction: txData.direction,
        status: txData.status,
        amountCents: txData.amountCents,
        currency: txData.currency,
        occurredAt: txData.occurredAt,
        recordedAt: txData.recordedAt,
        competenceDate: txData.competenceDate,
        paymentMethod: txData.paymentMethod,
        sourceContext: txData.sourceContext,
        description: txData.description,
        counterparty: txData.counterparty,
        reconciliationStatus: txData.reconciliationStatus,
        accountId: txData.accountId,
        version: txData.version,
        createdBy: txData.createdBy,
        updatedAt: txData.updatedAt
      },
      allocations: allocations.map(a => ({
        id: a.id,
        categoryId: (a as any).categoryId,
        amountCents: (a as any).amountCents,
        fundId: (a as any).fundId,
        costCenterId: (a as any).costCenterId,
        memo: (a as any).memo,
        sequence: (a as any).sequence
      })),
      capabilities: {
        canEdit
      }
    });

  } catch (error: any) {
    console.error('Detail Transaction Error:', error);
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error.message === 'FINANCE_ENTITY_NOT_FOUND' || error.message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
