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

    const { validateAccountMetadata, validateCategoryMetadata, validateFundMetadata } = await import('../../../shared/finance/smartLogic.js');

    let accountSnapshot = txData.accountSnapshot;
    let isSnapshotValid = false;
    if (accountSnapshot) {
      const snapMeta = validateAccountMetadata(accountSnapshot);
      if (snapMeta.valid) {
        isSnapshotValid = true;
      }
    }

    if (!isSnapshotValid && txData.accountId) {
       const accDoc = await context.repository.getAccountsRef().doc(txData.accountId).get();
       if (accDoc.exists && accDoc.data()!.financeEntityId === financeEntityId) {
          const aData = accDoc.data()!;
          const accMeta = validateAccountMetadata(aData);
          if (accMeta.valid) {
             accountSnapshot = { 
               id: aData.id, 
               name: accMeta.name!, 
               type: accMeta.type!,
               nature: accMeta.nature!
             };
          } else {
             accountSnapshot = {
               id: txData.accountId,
               name: 'Conta ainda não configurada',
               code: 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE'
             };
          }
       } else {
          accountSnapshot = {
            id: txData.accountId,
            name: 'Conta ainda não configurada',
            code: 'FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE'
          };
       }
    }

    const resolvedAllocations = await Promise.all(allocations.map(async (a: any) => {
       let catSnap = a.categorySnapshot;
       let isCatValid = false;
       if (catSnap) {
          const catMeta = validateCategoryMetadata(catSnap);
          if (catMeta.valid) {
             isCatValid = true;
          }
       }
       
       if (!isCatValid && a.categoryId) {
          const cDoc = await context.repository.getCategoriesRef().doc(a.categoryId).get();
          if (cDoc.exists && cDoc.data()!.financeEntityId === financeEntityId) {
             const cData = cDoc.data()!;
             const catMeta = validateCategoryMetadata(cData);
             if (catMeta.valid) {
                catSnap = { id: cData.id, kind: catMeta.kind!, name: catMeta.name!, icon: catMeta.icon };
             } else {
                catSnap = { id: a.categoryId, name: 'Categoria ainda não configurada', code: 'FINANCE_CATEGORY_CONFIGURATION_INCOMPLETE' };
             }
          } else {
             catSnap = { id: a.categoryId, name: 'Categoria ainda não configurada', code: 'FINANCE_CATEGORY_CONFIGURATION_INCOMPLETE' };
          }
       }

       let fundSnap = a.fundSnapshot;
       let isFundValid = false;
       if (fundSnap) {
          const fundMeta = validateFundMetadata(fundSnap);
          if (fundMeta.valid) {
             isFundValid = true;
          }
       }

       if (!isFundValid && a.fundId) {
          const fDoc = await context.repository.getFundsRef().doc(a.fundId).get();
          if (fDoc.exists && fDoc.data()!.financeEntityId === financeEntityId) {
             const fData = fDoc.data()!;
             const fundMeta = validateFundMetadata(fData);
             if (fundMeta.valid) {
                fundSnap = { id: fData.id, name: fundMeta.name! };
             } else {
                fundSnap = { id: a.fundId, name: 'Fundo ainda não configurado', code: 'FINANCE_FUND_CONFIGURATION_INCOMPLETE' };
             }
          } else {
             fundSnap = { id: a.fundId, name: 'Fundo ainda não configurado', code: 'FINANCE_FUND_CONFIGURATION_INCOMPLETE' };
          }
       }

       return {
         ...a,
         categorySnapshot: catSnap,
         fundSnapshot: fundSnap
       };
    }));

    // Resolve user name
    let creatorName = 'Usuário da equipe';
    if (txData.createdBy) {
       try {
           const uDoc = await admin.firestore().collection('user_profiles').doc(txData.createdBy).get();
           if (uDoc.exists) {
               creatorName = uDoc.data()?.name || uDoc.data()?.displayName || 'Usuário da equipe';
           }
       } catch (e) {
           // ignore
       }
    }

    // Capabilities effective
    const canEdit = hasFinanceCapability(sessionList, 'finance.create_drafts') 
                    && (txData.status === 'draft' || txData.status === 'ready_for_review');

    return res.status(200).json({
      transaction: {
        id: txData.id,
        transactionKind: txData.transactionKind || txData.direction,
        direction: txData.direction || txData.transactionKind,
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
        accountSnapshot,
        version: txData.version,
        createdBy: txData.createdBy,
        creatorName,
        updatedAt: txData.updatedAt
      },
      allocations: resolvedAllocations.map(a => ({
        id: a.id,
        categoryId: a.categoryId,
        categorySnapshot: a.categorySnapshot,
        amountCents: a.amountCents,
        fundId: a.fundId,
        fundSnapshot: a.fundSnapshot,
        costCenterId: a.costCenterId,
        memo: a.memo,
        sequence: a.sequence
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
