import * as fs from 'fs';
import * as path from 'path';
import { TRANSACTION_EDIT_COPY } from '../src/pages/finance/transactions/transactionEditCopy';
import {
  buildTransactionCreateMaterialFingerprint,
  formatTransactionInputAmount,
} from '../src/pages/finance/transactions/transactionCreateModel';

let passed = 0;
let failed = 0;

function verify(name: string, condition: boolean) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name}`);
    failed++;
  }
}

const page = fs.readFileSync(
  path.resolve('src/pages/finance/transactions/TransactionEditGuidedPage.tsx'),
  'utf8',
);
const routes = fs.readFileSync(path.resolve('src/app/router/routes.ts'), 'utf8');
const router = fs.readFileSync(path.resolve('src/app/router/index.tsx'), 'utf8');

console.log('Running Transaction Edit 2.0 checks...');

verify('guided edit keeps finance.create_drafts gate', page.includes("'finance.create_drafts'"));
verify('guided edit keeps finance.submit_for_review gate', page.includes("'finance.submit_for_review'"));
verify('guided edit fetches canonical transaction detail', page.includes('getTransactionDetail(transactionId)'));
verify('guided edit preserves updateDraft transition', page.includes('updateDraft('));
verify('guided edit preserves submitForReview transition', page.includes('submitForReview('));
verify('guided edit preserves optimistic version', page.includes('expectedVersion'));
verify('guided edit preserves entity epoch stale-response protection', page.includes('currentEpoch !== epochRef.current') && page.includes('actionEpoch !== epochRef.current'));
verify('guided edit uses complete material fingerprint helper', page.includes('buildTransactionCreateMaterialFingerprint'));
verify('draft retry keeps an idempotency attempt ref', page.includes('draftAttemptRef.current') && page.includes('draftAttemptRef.current.key'));
verify('submit retry keeps saved version/material/key together', page.includes('pendingSubmitRef.current') && page.includes('fingerprint') && page.includes('version') && page.includes('attempt.key'));
const submitCallIndex = page.indexOf('await submitForReview');
const confirmedSubmitClearIndex = page.indexOf(
  'pendingSubmitRef.current = null;',
  submitCallIndex,
);
verify(
  'submit key is cleared only after confirmed success path',
  submitCallIndex >= 0 && confirmedSubmitClearIndex > submitCallIndex,
);
verify('page never assigns arbitrary backend text directly to saveError', !/setSaveError\((?:error|err)(?:\?|\.|\))/i.test(page));
verify('page uses controlled finance error mapping', page.includes('FINANCE_VERSION_CONFLICT') && page.includes('FINANCE_ACCOUNT_MISMATCH') && page.includes('FINANCE_IDEMPOTENCY_CONFLICT'));
verify('page does not hardcode pt-BR amount formatting', !page.includes('pt-BR'));
verify('page uses locale-aware amount formatter', page.includes('formatTransactionInputAmount'));
verify('page preserves deterministic readiness', page.includes('validateSubmissionReadiness'));
verify('page preserves inline account repair', page.includes('AccountRepairCard'));
verify('page preserves evidence upload', page.includes('TransactionEvidenceUpload'));
verify('page preserves category fund and cost-center allocation fields', page.includes("'categoryId'") && page.includes("'fundId'") && page.includes("'costCenterId'"));
verify('page preserves split allocation behavior', page.includes('isSplit') && page.includes('addAllocation') && page.includes('removeAllocation'));
verify('default edit route resolves to guided editor', router.includes('TransactionEditGuidedPage') && router.includes('path: APP_ROUTES.transactionEdit'));
verify('legacy edit remains on separate fallback route', routes.includes("transactionEditLegacy: '/finance/transactions/:transactionId/edit/advanced'") && router.includes('TransactionEditLegacyPage'));
verify('guided editor has no approval/posting mutation ownership', !/approveForPosting|returnToDraft|invalidateApproval|getPostingPlanPreview|transactions-repair-approval-verification/.test(page));
verify('guided editor has no ledger side effects', !/financeJournalEntries|financeJournalLines|financeAggregates|posting-real|ledger-post/.test(page));

const basePayload = {
  direction: 'expense',
  amountCents: 12345,
  occurredAt: '2026-08-14T12:00:00.000Z',
  accountId: 'acc-a',
  destinationAccountId: '',
  paymentMethod: 'pix',
  description: 'Energy',
  counterparty: 'Supplier',
  evidenceIds: ['ev-1'],
  evidenceJustification: '',
  settlementType: '',
  liabilityAccountId: '',
  allocations: [
    {
      categoryId: 'cat-a',
      fundId: 'fund-a',
      costCenterId: 'cost-a',
      amountCents: 12345,
    },
  ],
};
const baseFingerprint = buildTransactionCreateMaterialFingerprint(basePayload);
const materialMutations: Array<[string, any]> = [
  ['destinationAccountId', { ...basePayload, destinationAccountId: 'acc-b' }],
  ['counterparty', { ...basePayload, counterparty: 'Another supplier' }],
  ['evidenceIds', { ...basePayload, evidenceIds: ['ev-2'] }],
  ['evidenceJustification', { ...basePayload, evidenceJustification: 'No document' }],
  ['settlementType', { ...basePayload, settlementType: 'reimbursement' }],
  ['liabilityAccountId', { ...basePayload, liabilityAccountId: 'liability-a' }],
  [
    'allocation costCenterId',
    {
      ...basePayload,
      allocations: [{ ...basePayload.allocations[0], costCenterId: 'cost-b' }],
    },
  ],
  [
    'allocation fundId',
    {
      ...basePayload,
      allocations: [{ ...basePayload.allocations[0], fundId: 'fund-b' }],
    },
  ],
];

for (const [name, payload] of materialMutations) {
  verify(
    `material fingerprint changes with ${name}`,
    buildTransactionCreateMaterialFingerprint(payload) !== baseFingerprint,
  );
}

verify('PT input amount is localized', /1\.234,56/.test(formatTransactionInputAmount(123456, 'PT')));
verify('EN input amount is localized', /1,234\.56/.test(formatTransactionInputAmount(123456, 'EN')));
verify('ES input amount is localized', Boolean(formatTransactionInputAmount(123456, 'ES')));

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = TRANSACTION_EDIT_COPY[language];
  verify(`${language} edit copy has core navigation language`, Boolean(copy.pageTitle && copy.pageSubtitle && copy.back));
  verify(`${language} edit copy has controlled recovery language`, Boolean(copy.loadErrorTitle && copy.loadErrorBody && copy.retry && copy.supportCode));
  verify(`${language} edit copy has conflict language`, Boolean(copy.conflictTitle && copy.conflictBody && copy.reloadLatest));
  verify(`${language} edit copy explains no-balance-change workflow`, Boolean(copy.draftSavedNoBalance && copy.reviewSentNoBalance));
}

console.log(`\nTransaction Edit 2.0 totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
