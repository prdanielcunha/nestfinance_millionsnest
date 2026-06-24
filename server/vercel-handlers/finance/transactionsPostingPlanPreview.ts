import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceEntityAccess } from './accessHelpers.js';
import { FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { buildPostingPlan, describePostingPlan } from '../../../shared/finance/ledger/postingPlan.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { organizationId: bodyOrgId, financeEntityId, transactionId } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const token = authHeader.split('Bearer ')[1];
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const decodedToken = await admin.auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const organizationId = (req.headers['x-organization-id'] as string) || bodyOrgId;

    if (!organizationId) return res.status(400).json({ error: 'MISSING_ORGANIZATION_ID' });

    const sessionList = await resolveEcosystemSession(uid, organizationId);

    const { financeEntity } = await requireFinanceEntityAccess({
      db,
      uid,
      organizationId,
      financeEntityId,
      requiredPermission: 'finance.view'
    } as any);

  const txDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('financeEntities')
    .doc(financeEntityId)
    .collection('transactions')
    .doc(transactionId)
    .get();

  if (!txDoc.exists) {
    throw new Error('Transaction not found');
  }

  const transaction = { id: txDoc.id, ...txDoc.data() } as unknown as LedgerTransaction;

  const allocationsSnap = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('financeEntities')
    .doc(financeEntityId)
    .collection('allocations')
    .where('transactionId', '==', transactionId)
    .get();

  const allocations = allocationsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() } as unknown as FinanceAllocation)
  );

  const approvalDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('financeEntities')
    .doc(financeEntityId)
    .collection('transactions')
    .doc(transactionId)
    .collection('approvals')
    .doc('latest')
    .get();
  
  const approval = approvalDoc.exists ? approvalDoc.data() as any : undefined;

  // Resolve accounts and categories from financeEntityData
  // We need to shape this as PostingMappingSnapshot and PostingPreviewPolicy
  // For the sake of the engine, let's read the real finance accounts and categories.

  const accountsSnap = await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('accounts').get();
  const categoriesSnap = await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).collection('categories').get();
  
  const financeAccounts: any[] = [];
  const ledgerAccounts: any[] = [];
  accountsSnap.forEach(doc => {
    const acc = doc.data();
    financeAccounts.push({
      accountId: doc.id,
      ledgerAccountId: acc.ledgerMapping || `la_default_asset_${doc.id}`,
      type: acc.type === 'credit_card' ? 'liability' : 'asset'
    });
    ledgerAccounts.push({
      id: acc.ledgerMapping || `la_default_asset_${doc.id}`,
      organizationId,
      financeEntityId,
      active: true, // simplified
      postingAllowed: true // simplified
    });
  });

  const categoriesMappings: any[] = [];
  categoriesSnap.forEach(doc => {
    const cat = doc.data();
    categoriesMappings.push({
      categoryId: doc.id,
      ledgerAccountId: cat.ledgerMapping || `la_default_${cat.kind}_${doc.id}`,
      kind: cat.kind
    });
    ledgerAccounts.push({
      id: cat.ledgerMapping || `la_default_${cat.kind}_${doc.id}`,
      organizationId,
      financeEntityId,
      active: true,
      postingAllowed: true
    });
  });

  // Also fake a liability account for reimbursements if they exist in people
  // We'll just assume any payableId can be mapped to a virtual ledger liability account
  if (transaction.transactionKind === 'expense' && (transaction as any).reimbursement) {
     const payableId = (transaction as any).reimbursement.payableId;
     financeAccounts.push({
       accountId: payableId,
       ledgerAccountId: `la_reimbursement_${payableId}`,
       type: 'liability'
     });
     ledgerAccounts.push({
      id: `la_reimbursement_${payableId}`,
      organizationId,
      financeEntityId,
      active: true,
      postingAllowed: true
    });
  }
  
  if (transaction.transactionKind === 'liability_settlement') {
    const liabId = (transaction as any).liabilityAccountId;
    if (!financeAccounts.find(fa => fa.accountId === liabId)) {
      financeAccounts.push({
        accountId: liabId,
        ledgerAccountId: `la_liability_${liabId}`,
        type: 'liability'
      });
      ledgerAccounts.push({
        id: `la_liability_${liabId}`,
        organizationId,
        financeEntityId,
        active: true,
        postingAllowed: true
      });
    }
  }

  const mappings = {
    financeAccounts,
    categories: categoriesMappings
  };

  const policy = {
    ledgerAccounts
  };

  const plan = buildPostingPlan({
    transaction,
    allocations,
    approval,
    mappings,
    policy
  });

  const getAccountName = (accId: string) => {
    if ((transaction as any).accountSnapshot && accId === transaction.accountId) return (transaction as any).accountSnapshot.name;
    if ((transaction as any).destinationAccountSnapshot && accId === (transaction as any).destinationAccountId) return (transaction as any).destinationAccountSnapshot.name;
    if ((transaction as any).liabilityAccountSnapshot && accId === (transaction as any).liabilityAccountId) return (transaction as any).liabilityAccountSnapshot.name;
    if (accId === (transaction as any).reimbursement?.payableId) return (transaction as any).reimbursement.personName;
    return accId;
  };

  const getCategoryName = (catId: string) => {
    const alloc = allocations.find(a => a.categoryId === catId);
    return (alloc as any)?.categorySnapshot?.name || catId;
  };

  const formatMoney = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  const humanExplanation = describePostingPlan(plan, {
    getAccountName,
    getCategoryName,
    formatMoney
  });

  return res.status(200).json({ plan, humanExplanation });
  } catch (error: any) {
    console.error('transactions-posting-plan-preview error:', error);
    return res.status(400).json({ error: error.message });
  }
}
