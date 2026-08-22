import * as fs from 'fs';
import * as path from 'path';
import { TRANSACTION_REVIEW_DETAIL_COPY } from '../src/pages/finance/transactions/transactionReviewDetailCopy';
import { formatReviewDate, formatReviewMoney } from '../src/pages/finance/transactions/transactionReviewModel';

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
  path.resolve('src/pages/finance/transactions/TransactionReviewDetailPage.tsx'),
  'utf8',
);
const routes = fs.readFileSync(path.resolve('src/app/router/routes.ts'), 'utf8');
const router = fs.readFileSync(path.resolve('src/app/router/index.tsx'), 'utf8');

console.log('Running Transaction Review Detail 2.0 checks...');

verify('dedicated route is canonical', routes.includes("transactionReviewDetail: '/finance/review/:transactionId'"));
verify('router lazy-loads dedicated review detail', router.includes('TransactionReviewDetailPage') && router.includes('APP_ROUTES.transactionReviewDetail'));
verify('detail preserves finance.view capability gate', page.includes("'finance.view'"));
verify('detail preserves finance.review capability gate', page.includes("'finance.review'"));
verify('detail loads through existing detail contract', page.includes('getTransactionDetail(transactionId)'));
verify('detail accepts decisions only for ready_for_review', page.includes("status !== 'ready_for_review'") && page.includes("status !== 'ready_for_review'"));
verify('detail preserves entity epoch stale-response protection', page.includes('currentEpoch !== epochRef.current') && page.includes('actionEpoch !== epochRef.current'));
verify('approval keeps retry-safe idempotency state', page.includes('approveIdempotencyKeyRef') && page.includes("makeRequestToken('idap')"));
verify('return keeps retry-safe idempotency state', page.includes('returnIdempotencyKeyRef') && page.includes("makeRequestToken('idre')"));
verify('existing approval transition is preserved', page.includes('approveForPosting('));
verify('existing return transition is preserved', page.includes('returnToDraft('));
verify('detail does not introduce other transaction mutations', !/createDraft|createAndSubmit|updateDraft|submitForReview|invalidateApproval/.test(page));
verify('detail has no real posting, journal, aggregate or posting-plan calls', !/posting-real|ledger-post|financeJournalEntries|financeJournalLines|financeAggregates|getPostingPlanPreview/.test(page));
verify('detail does not write financial state to localStorage', !page.includes('localStorage'));
verify('detail never renders raw backend error messages', !page.includes('{error.message}') && !page.includes('{err.message}') && !page.includes('setActionError(error.message)'));
verify('detail uses locale-aware money formatter', page.includes('formatReviewMoney'));
verify('detail uses locale-aware date formatter', page.includes('formatReviewDate'));
verify('PT localized money remains valid', /1\.234,56/.test(formatReviewMoney(123456, 'PT')));
verify('EN localized money remains valid', /1,234\.56/.test(formatReviewMoney(123456, 'EN')));
verify('ES localized date remains valid', Boolean(formatReviewDate('2026-08-14T12:00:00.000Z', 'ES')));
verify('detail explicitly communicates no balance change', page.includes('copy.noBalanceChange'));
verify('detail uses premium foundation primitives', page.includes("import { Button, Surface }"));

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = TRANSACTION_REVIEW_DETAIL_COPY[language];
  verify(`${language} has focused review copy`, Boolean(copy.pageTitle && copy.pageSubtitle && copy.decisionTitle && copy.noBalanceChange));
  verify(`${language} has safe recovery copy`, Boolean(copy.errorTitle && copy.errorBody && copy.retry && copy.actionError));
  verify(`${language} has all controlled return reasons`, Boolean(copy.reasons.need_correction && copy.reasons.missing_evidence && copy.reasons.incorrect_classification && copy.reasons.other));
  verify(`${language} has approval confirmation copy`, Boolean(copy.approveConfirmTitle && copy.approveConfirmBody && copy.confirmApprove));
}

console.log(`\nTransaction Review Detail 2.0 totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
