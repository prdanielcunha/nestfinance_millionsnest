import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceEntityAccess } from './accessHelpers.js';
import { FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { buildPostingPlan, describePostingPlan } from '../../../shared/finance/ledger/postingPlan.js';

import { loadPostingConfiguration } from './loadPostingConfiguration.js';
import { computeApprovalSourceHash } from '../../../shared/finance/ledger/approvalSourceHash.js';

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

  const { mappings, policy, referenceFingerprintHash } = await loadPostingConfiguration(db, organizationId, financeEntityId, transaction);

  let sealStatus: 'verified' | 'seal_missing' | 'transaction_stale' | 'references_changed' | 'plan_mismatch' = 'verified';

  if (!approval || !approval.approvedPlanHash) {
    sealStatus = 'seal_missing';
  } else if (transaction.version !== approval.approvedVersion) {
    sealStatus = 'transaction_stale';
  }

  const plan = buildPostingPlan({
    transaction,
    allocations,
    approval,
    mappings,
    policy
  });

  const calculatedPlanHash = plan.planHash;
  const approvedPlanHash = approval?.approvedPlanHash;

  if (sealStatus === 'verified') {
    if (referenceFingerprintHash !== approval.approvedReferenceFingerprintHash) {
      sealStatus = 'references_changed';
    } else if (calculatedPlanHash !== approvedPlanHash) {
      sealStatus = 'plan_mismatch';
    }
  }

  const getAccountName = (accId: string) => {
    if ((transaction as any).accountSnapshot && accId === (transaction as any).accountId) return (transaction as any).accountSnapshot.name;
    if ((transaction as any).destinationAccountSnapshot && accId === (transaction as any).destinationAccountId) return (transaction as any).destinationAccountSnapshot.name;
    if ((transaction as any).liabilityAccountSnapshot && accId === (transaction as any).liabilityAccountId) return (transaction as any).liabilityAccountSnapshot.name;
    if (accId === (transaction as any).reimbursement?.payableId) return (transaction as any).reimbursement.personName;
    return accId;
  };

  const getCategoryName = (catId: string) => {
    const alloc = allocations.find(a => a.categoryId === catId);
    return (alloc as any)?.categorySnapshot?.name || catId;
  };

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100).replace(/\u00A0/g, ' '); // ensure normal space
  };

  const humanExplanation = describePostingPlan(plan, {
    getAccountName,
    getCategoryName,
    formatMoney
  });

  return res.status(200).json({
    sealStatus,
    plan: sealStatus === 'plan_mismatch' ? undefined : plan,
    approvedPlanHash,
    calculatedPlanHash,
    humanExplanation: sealStatus === 'plan_mismatch' ? [] : humanExplanation,
    requestId: req.body?.requestId || 'unknown'
  });
  } catch (error: any) {
    console.error('transactions-posting-plan-preview error:', error);
    return res.status(400).json({ error: error.message });
  }
}
