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

    let approverName = undefined;
    if (txData.approvedBy) {
       try {
           const uDoc = await admin.firestore().collection('user_profiles').doc(txData.approvedBy).get();
           if (uDoc.exists) {
               approverName = uDoc.data()?.name || uDoc.data()?.displayName || txData.approvedBy;
           } else {
               approverName = txData.approvedBy;
           }
       } catch (e) {
           approverName = txData.approvedBy;
       }
    }

    let returnedByName = undefined;
    if (txData.returnedToDraftBy) {
       try {
           const uDoc = await admin.firestore().collection('user_profiles').doc(txData.returnedToDraftBy).get();
           if (uDoc.exists) {
               returnedByName = uDoc.data()?.name || uDoc.data()?.displayName || txData.returnedToDraftBy;
           } else {
               returnedByName = txData.returnedToDraftBy;
           }
       } catch (e) {
           returnedByName = txData.returnedToDraftBy;
       }
    }

    // Capabilities effective
    const canEdit = hasFinanceCapability(sessionList, 'finance.create_drafts') 
                    && (txData.status === 'draft' || txData.status === 'ready_for_review');

    // Review Readiness and Accounting Effect
    const { evaluateReviewReadiness } = await import('../../../shared/finance/ledger/evaluateReviewReadiness.js');
    
    // We need active accounts for readiness
    const accountsSnapshot = await context.repository.getAccountsRef().where('active', '==', true).get();
    const activeAccounts = accountsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const reviewReadiness = evaluateReviewReadiness({
       ...txData,
       allocations: resolvedAllocations
    } as any, activeAccounts);

    const formatMoneyEffect = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    let accountingEffect = 'Nenhum efeito contabilizado ainda';
    
    if (txData.direction === 'income') {
       accountingEffect = `Entrada de ${formatMoneyEffect(txData.amountCents)} na conta ${txData.accountSnapshot?.name || 'selecionada'}.`;
    } else if (txData.direction === 'expense') {
       accountingEffect = `Saída de ${formatMoneyEffect(txData.amountCents)} da conta ${txData.accountSnapshot?.name || 'selecionada'}.`;
    } else if (txData.direction === 'transfer') {
       accountingEffect = `Transferência de ${formatMoneyEffect(txData.amountCents)} da conta ${txData.accountSnapshot?.name || 'selecionada'} para a conta ${txData.destinationAccountSnapshot?.name || 'de destino'}.`;
    } else if (txData.direction === 'liability_settlement') {
       accountingEffect = `Liquidação de ${formatMoneyEffect(txData.amountCents)} do passivo ${txData.liabilityAccountSnapshot?.name || 'selecionado'} usando a conta ${txData.accountSnapshot?.name || 'selecionada'}.`;
    }

    const eventsSnapshot = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('events')
      .where('transactionId', '==', transactionId)
      .get();

    const events = eventsSnapshot.docs
      .map(doc => {
         const d = doc.data();
         return {
           id: doc.id,
           eventId: d.eventId,
           eventType: d.eventType,
           actorUid: d.actorUid,
           actorDisplayNameSnapshot: d.actorDisplayNameSnapshot || 'Usuário da equipe',
           versionBefore: d.versionBefore,
           versionAfter: d.versionAfter,
           reasonCode: d.reasonCode,
           comment: d.comment,
           sourceHash: d.sourceHash,
           requestId: d.requestId,
           createdAt: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : d.createdAt) : null
         };
      })
      .sort((a: any, b: any) => {
         const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
         const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
         return tA - tB;
      });

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
        updatedAt: txData.updatedAt,
        destinationAccountId: txData.destinationAccountId,
        destinationAccountSnapshot: txData.destinationAccountSnapshot,
        liabilityAccountId: txData.liabilityAccountId,
        liabilityAccountSnapshot: txData.liabilityAccountSnapshot,
        settlementType: txData.settlementType,
        returnedToDraftReason: txData.returnedToDraftReason,
        returnedToDraftComment: txData.returnedToDraftComment,
        returnedToDraftAt: txData.returnedToDraftAt,
        returnedToDraftBy: txData.returnedToDraftBy,
        returnedByName,
        approvedBy: txData.approvedBy,
        approvedWithName: approverName,
        approvedAt: txData.approvedAt,
        approvedVersion: txData.approvedVersion,
        approvalSourceHash: txData.approvalSourceHash,
        approvalComment: txData.approvalComment,
        approvalStatus: txData.approvalStatus || null,
        invalidatedBy: txData.invalidatedBy || null,
        invalidatedAt: txData.invalidatedAt || null,
        invalidatedReason: txData.invalidatedReason || null,
        invalidatedComment: txData.invalidatedComment || null
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
      events,
      reviewReadiness,
      accountingEffect,
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
