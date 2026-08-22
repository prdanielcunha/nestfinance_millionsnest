import { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
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
    const { financeEntityId, transactionId } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    if (!transactionId || typeof transactionId !== 'string') return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.view');

    const txDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeTransactions')
      .doc(transactionId)
      .get();

    if (!txDoc.exists) {
      throw new Error('Transaction not found');
    }

    const transaction = { id: txDoc.id, ...txDoc.data() } as unknown as LedgerTransaction;
    // A transactionId from the same organization must never be usable to cross finance-entity boundaries.
    context.repository.assertEntityIsolation(transaction);

    let previewMode: 'review_preview' | 'approved_posting_preview';
    if (transaction.status === 'ready_for_review') {
      previewMode = 'review_preview';
    } else if (transaction.status === 'approved_for_posting') {
      previewMode = 'approved_posting_preview';
    } else {
      return res.status(400).json({
        error: 'TRANSACTION_NOT_READY_FOR_REVIEW',
        details: `Transaction in status '${transaction.status}' is not eligible for posting plan preview.`
      });
    }

    // Keep the single-field transaction query to avoid a new composite-index dependency, then
    // fail closed on every returned document before any accounting calculation uses it.
    const allocationsSnap = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeAllocations')
      .where('transactionId', '==', transactionId)
      .get();

    const allocations = allocationsSnap.docs.map((d) => {
      const allocation = { id: d.id, ...d.data() } as unknown as FinanceAllocation;
      context.repository.assertEntityIsolation(allocation);
      return allocation;
    });

    const approvalDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeTransactions')
      .doc(transactionId)
      .collection('approvals')
      .doc('latest')
      .get();

    const approval = approvalDoc.exists ? approvalDoc.data() as any : undefined;

    const { mappings, policy, referenceFingerprintHash } = await loadPostingConfiguration(db, organizationId, financeEntityId, transaction);

    let sealStatus: 'verified' | 'seal_missing' | 'transaction_stale' | 'references_changed' | 'plan_mismatch' = 'verified';

    if (previewMode === 'review_preview') {
      sealStatus = 'seal_missing';
    } else {
      if (!approval || !approval.approvedPlanHash) {
        sealStatus = 'seal_missing';
      } else {
        let algoVer = approval.approvalAlgorithmVersion || 1;
        let expectedSourceHash = approval.approvalSourceHash;

        if ((transaction as any).approvalVerificationRepair) {
          const repair = (transaction as any).approvalVerificationRepair;
          if (repair.originalApprovalSourceHash === approval.approvalSourceHash &&
              repair.originalApprovedVersion === approval.approvedVersion) {
            algoVer = repair.verificationAlgorithmVersion;
            expectedSourceHash = repair.verificationHash;
          }
        }

        const currentSourceHash = computeApprovalSourceHash(transaction, allocations, algoVer);

        if (currentSourceHash !== expectedSourceHash) {
          sealStatus = 'transaction_stale';
        }
      }
    }

    const patchedTxForPlan = { ...transaction } as any;
    const patchedApproval = approval ? { ...approval } : undefined;

    if (approvalDoc.exists && (transaction as any).approvalVerificationRepair) {
      const repair = (transaction as any).approvalVerificationRepair;
      if (repair.originalApprovalSourceHash === approval.approvalSourceHash &&
          repair.originalApprovedVersion === approval.approvedVersion) {
        patchedTxForPlan.approvalSourceHash = repair.verificationHash;
        patchedTxForPlan.approvedVersion = approval.approvedVersion;
        patchedTxForPlan.version = approval.approvedVersion;
        if (patchedApproval) {
          patchedApproval.approvalSourceHash = repair.verificationHash;
          patchedApproval.approvalAlgorithmVersion = repair.verificationAlgorithmVersion;
        }
      }
    } else if (approvalDoc.exists) {
      patchedTxForPlan.approvalSourceHash = approval.approvalSourceHash;
      patchedTxForPlan.approvedVersion = approval.approvedVersion;
      patchedTxForPlan.version = approval.approvedVersion;
    }

    const plan = buildPostingPlan({
      transaction: patchedTxForPlan,
      allocations,
      approval: patchedApproval,
      mappings,
      policy,
      isPreview: true
    });

    const calculatedPlanHash = plan.planHash;
    let approvedPlanHash = approval?.approvedPlanHash;
    let expectedReferenceHash = approval?.approvedReferenceFingerprintHash;

    if (approvalDoc.exists && (transaction as any).approvalVerificationRepair) {
      const repair = (transaction as any).approvalVerificationRepair;
      if (repair.originalApprovalSourceHash === approval.approvalSourceHash &&
          repair.originalApprovedVersion === approval.approvedVersion) {
        approvedPlanHash = repair.verificationPlanHash || approvedPlanHash;
      }
    }

    if (sealStatus === 'verified') {
      if (expectedReferenceHash && referenceFingerprintHash !== expectedReferenceHash) {
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
      }).format(cents / 100).replace(/\u00A0/g, ' ');
    };

    const humanExplanation = describePostingPlan(plan, {
      getAccountName,
      getCategoryName,
      formatMoney
    });

    let verificationState: any = { status: sealStatus };

    if (sealStatus === 'transaction_stale' || sealStatus === 'plan_mismatch') {
      const isLegacy = !approval.approvalAlgorithmVersion || approval.approvalAlgorithmVersion < 2;
      if (isLegacy) {
        if (!approval.materialSnapshot) {
          verificationState = { status: 'unverifiable', repairEligible: false, reasonCode: 'snapshot_missing' };
        } else {
          const legacyTxData = { ...transaction, version: approval.approvedVersion };
          const expectedOldHash = computeApprovalSourceHash(legacyTxData, allocations, 1);
          if (expectedOldHash === approval.approvalSourceHash) {
            verificationState = { status: 'legacy_false_stale', repairEligible: true, reasonCode: 'workflow_version_only' };
          } else {
            verificationState = { status: 'stale', repairEligible: false, materialChanges: [] };
          }
        }
      } else {
        verificationState = { status: 'stale', repairEligible: false, materialChanges: [] };
      }
    } else if (sealStatus === 'verified') {
      verificationState = { status: 'verified', algorithmVersion: approval.approvalAlgorithmVersion || 1 };
    } else if (sealStatus === 'seal_missing') {
      verificationState = { status: 'unverifiable', repairEligible: false, reasonCode: 'seal_missing' };
    } else {
      verificationState = { status: 'stale', repairEligible: false, materialChanges: [] };
    }

    return res.status(200).json({
      sealStatus,
      verificationState,
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
