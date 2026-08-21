import type { VercelRequest, VercelResponse } from '@vercel/node';

import setupInitialize from '../server/vercel-handlers/finance/setupInitialize.js';
import accountsList from '../server/vercel-handlers/finance/accountsList.js';
import accountsCreate from '../server/vercel-handlers/finance/accountsCreate.js';
import accountsArchive from '../server/vercel-handlers/finance/accountsArchive.js';
import accountsReactivate from '../server/vercel-handlers/finance/accountsReactivate.js';
import accountsUpdate from '../server/vercel-handlers/finance/accountsUpdate.js';
import fundsList from '../server/vercel-handlers/finance/fundsList.js';
import fundsCreate from '../server/vercel-handlers/finance/fundsCreate.js';
import fundsArchive from '../server/vercel-handlers/finance/fundsArchive.js';
import fundsReactivate from '../server/vercel-handlers/finance/fundsReactivate.js';
import categoriesList from '../server/vercel-handlers/finance/categoriesList.js';
import categoriesCreate from '../server/vercel-handlers/finance/categoriesCreate.js';
import categoriesArchive from '../server/vercel-handlers/finance/categoriesArchive.js';
import categoriesReactivate from '../server/vercel-handlers/finance/categoriesReactivate.js';
import categoriesUpdate from '../server/vercel-handlers/finance/categoriesUpdate.js';
import entitiesCnpjLookup from '../server/vercel-handlers/finance/entitiesCnpjLookup.js';
import entitiesCreate from '../server/vercel-handlers/finance/entitiesCreate.js';
import entitiesList from '../server/vercel-handlers/finance/entitiesList.js';
import entitiesDetail from '../server/vercel-handlers/finance/entitiesDetail.js';
import entitiesUpdate from '../server/vercel-handlers/finance/entitiesUpdate.js';
import entitiesBootstrapStatus from '../server/vercel-handlers/finance/entitiesBootstrapStatus.js';
import entitiesBootstrapPreview from '../server/vercel-handlers/finance/entitiesBootstrapPreview.js';
import entitiesBootstrapApply from '../server/vercel-handlers/finance/entitiesBootstrapApply.js';
import entitiesBootstrapVerify from '../server/vercel-handlers/finance/entitiesBootstrapVerify.js';
import transactionsList from '../server/vercel-handlers/finance/transactionsList.js';
import transactionsSummary from '../server/vercel-handlers/finance/transactionsSummary.js';
import transactionsDetail from '../server/vercel-handlers/finance/transactionsDetail.js';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';
import transactionsUpdateDraft from '../server/vercel-handlers/finance/transactionsUpdateDraft.js';
import transactionsSubmitForReview from '../server/vercel-handlers/finance/transactionsSubmitForReview.js';
import transactionsCreateAndSubmit from '../server/vercel-handlers/finance/transactionsCreateAndSubmit.js';
import transactionsReturnToDraft from '../server/vercel-handlers/finance/transactionsReturnToDraft.js';
import transactionsApproveForPosting from '../server/vercel-handlers/finance/transactionsApproveForPosting.js';
import transactionsInvalidateApproval from '../server/vercel-handlers/finance/transactionsInvalidateApproval.js';
import transactionsPostingPlanPreview from '../server/vercel-handlers/finance/transactionsPostingPlanPreview.js';
import transactionsRepairApprovalVerification from '../server/vercel-handlers/finance/transactionsRepairApprovalVerification.js';
import accountsRepairCanonical from '../server/vercel-handlers/finance/accountsRepairCanonical.js';
import accountsConfigureCustom from '../server/vercel-handlers/finance/accountsConfigureCustom.js';
import countSessionsList from '../server/vercel-handlers/finance/countSessionsList.js';
import countSessionsCreate from '../server/vercel-handlers/finance/countSessionsCreate.js';
import countSessionsDetail from '../server/vercel-handlers/finance/countSessionsDetail.js';
import countSessionsSaveFirstCount from '../server/vercel-handlers/finance/countSessionsSaveFirstCount.js';
import countSessionsStartSecondCount from '../server/vercel-handlers/finance/countSessionsStartSecondCount.js';
import countSessionsSubmitSecondCount from '../server/vercel-handlers/finance/countSessionsSubmitSecondCount.js';
import countSessionsStartRecount from '../server/vercel-handlers/finance/countSessionsStartRecount.js';
import countSessionsSubmitRecount from '../server/vercel-handlers/finance/countSessionsSubmitRecount.js';
import countPaperFormsGenerate from '../server/vercel-handlers/finance/countPaperFormsGenerate.js';
import countPaperFormsDetail from '../server/vercel-handlers/finance/countPaperFormsDetail.js';
import countCapturesStart from '../server/vercel-handlers/finance/countCapturesStart.js';
import countCapturesFinalize from '../server/vercel-handlers/finance/countCapturesFinalize.js';
import countCapturesDetail from '../server/vercel-handlers/finance/countCapturesDetail.js';
import countCapturesExtractCandidates from '../server/vercel-handlers/finance/countCapturesExtractCandidates.js';
import countCapturesExtractDenominations from '../server/vercel-handlers/finance/countCapturesExtractDenominations.js';
import countCapturesSaveReview from '../server/vercel-handlers/finance/countCapturesSaveReview.js';
import countCapturesSaveDenominationReview from '../server/vercel-handlers/finance/countCapturesSaveDenominationReview.js';
import universalEvidenceStart from '../server/vercel-handlers/finance/universalEvidenceStart.js';
import universalEvidenceFinalize from '../server/vercel-handlers/finance/universalEvidenceFinalize.js';
import universalEvidenceList from '../server/vercel-handlers/finance/universalEvidenceList.js';
import universalEvidenceDetail from '../server/vercel-handlers/finance/universalEvidenceDetail.js';
import universalEvidencePreview from '../server/vercel-handlers/finance/universalEvidencePreview.js';
import universalEvidencePdfInspect from '../server/vercel-handlers/finance/universalEvidencePdfInspect.js';
import universalEvidencePdfText from '../server/vercel-handlers/finance/universalEvidencePdfText.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let operation = req.query.operation;
  if (Array.isArray(operation)) {
    operation = operation[0];
  }

  if (req.query) {
    delete req.query.operation;
  }

  switch (operation) {
    case 'setup-initialize':
      return setupInitialize(req, res);
    case 'accounts-list':
      return accountsList(req, res);
    case 'accounts-create':
      return accountsCreate(req, res);
    case 'accounts-archive':
      return accountsArchive(req, res);
    case 'accounts-reactivate':
      return accountsReactivate(req, res);
    case 'accounts-update':
      return accountsUpdate(req, res);
    case 'funds-list':
      return fundsList(req, res);
    case 'funds-create':
      return fundsCreate(req, res);
    case 'funds-archive':
      return fundsArchive(req, res);
    case 'funds-reactivate':
      return fundsReactivate(req, res);
    case 'categories-list':
      return categoriesList(req, res);
    case 'categories-create':
      return categoriesCreate(req, res);
    case 'categories-archive':
      return categoriesArchive(req, res);
    case 'categories-reactivate':
      return categoriesReactivate(req, res);
    case 'categories-update':
      return categoriesUpdate(req, res);
    case 'entities-cnpj-lookup':
      return entitiesCnpjLookup(req, res);
    case 'entities-create':
      return entitiesCreate(req, res);
    case 'entities-detail':
      return entitiesDetail(req, res);
    case 'entities-list':
      return entitiesList(req, res);
    case 'entities-update':
      return entitiesUpdate(req, res);
    case 'entities-bootstrap-status':
      return entitiesBootstrapStatus(req, res);
    case 'entities-bootstrap-preview':
      return entitiesBootstrapPreview(req, res);
    case 'entities-bootstrap-apply':
      return entitiesBootstrapApply(req, res);
    case 'entities-bootstrap-verify':
      return entitiesBootstrapVerify(req, res);
    case 'transactions-list':
      return transactionsList(req, res);
    case 'transactions-summary':
      return transactionsSummary(req, res);
    case 'transactions-detail':
      return transactionsDetail(req, res);
    case 'transactions-create-draft':
      return transactionsCreateDraft(req, res);
    case 'transactions-create-and-submit':
      return transactionsCreateAndSubmit(req, res);
    case 'accounts-repair-canonical':
      return accountsRepairCanonical(req, res);
    case 'accounts-configure-custom':
      return accountsConfigureCustom(req, res);
    case 'transactions-update-draft':
      return transactionsUpdateDraft(req, res);
    case 'transactions-submit-review':
      return transactionsSubmitForReview(req, res);
    case 'transactions-return-to-draft':
      return transactionsReturnToDraft(req, res);
    case 'transactions-invalidate-approval':
      return transactionsInvalidateApproval(req, res);
    case 'transactions-approve-for-posting':
      return transactionsApproveForPosting(req, res);
    case 'transactions-repair-approval-verification':
      return transactionsRepairApprovalVerification(req, res);
    case 'transactions-posting-plan-preview':
      return transactionsPostingPlanPreview(req, res);
    case 'count-sessions-list':
      return countSessionsList(req, res);
    case 'count-sessions-create':
      return countSessionsCreate(req, res);
    case 'count-sessions-detail':
      return countSessionsDetail(req, res);
    case 'count-sessions-save-first-count':
      return countSessionsSaveFirstCount(req, res);
    case 'count-sessions-start-second-count':
      return countSessionsStartSecondCount(req, res);
    case 'count-sessions-submit-second-count':
      return countSessionsSubmitSecondCount(req, res);
    case 'count-sessions-start-recount':
      return countSessionsStartRecount(req, res);
    case 'count-sessions-submit-recount':
      return countSessionsSubmitRecount(req, res);
    case 'count-paper-forms-generate':
      return countPaperFormsGenerate(req, res);
    case 'count-paper-forms-detail':
      return countPaperFormsDetail(req, res);
    case 'count-captures-start':
      return countCapturesStart(req, res);
    case 'count-captures-finalize':
      return countCapturesFinalize(req, res);
    case 'count-captures-detail':
      return countCapturesDetail(req, res);
    case 'count-captures-extract-candidates':
      return countCapturesExtractCandidates(req, res);
    case 'count-captures-extract-denominations':
      return countCapturesExtractDenominations(req, res);
    case 'count-captures-save-review':
      return countCapturesSaveReview(req, res);
    case 'count-captures-save-denomination-review':
      return countCapturesSaveDenominationReview(req, res);
    case 'universal-evidence-start':
      return universalEvidenceStart(req, res);
    case 'universal-evidence-finalize':
      return universalEvidenceFinalize(req, res);
    case 'universal-evidence-list':
      return universalEvidenceList(req, res);
    case 'universal-evidence-detail':
      return universalEvidenceDetail(req, res);
    case 'universal-evidence-preview':
      return universalEvidencePreview(req, res);
    case 'universal-evidence-pdf-inspect':
      return universalEvidencePdfInspect(req, res);
    case 'universal-evidence-pdf-text':
      return universalEvidencePdfText(req, res);
    default:
      return res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
  }
}
