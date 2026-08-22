import * as fs from 'fs';
import * as path from 'path';
import { TRANSACTION_DETAIL_OVERVIEW_COPY } from '../src/pages/finance/transactions/transactionDetailOverviewCopy';
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
  path.resolve('src/pages/finance/transactions/TransactionDetailOverviewPage.tsx'),
  'utf8',
);
const advanced = fs.readFileSync(
  path.resolve('src/pages/finance/transactions/TransactionAdvancedDetailPage.tsx'),
  'utf8',
);
const routes = fs.readFileSync(path.resolve('src/app/router/routes.ts'), 'utf8');
const router = fs.readFileSync(path.resolve('src/app/router/index.tsx'), 'utf8');

console.log('Running Transaction Detail 2.0 overview checks...');

verify('general detail keeps finance.view capability gate', page.includes("'finance.view'"));
verify('advanced fallback requires finance.review', advanced.includes("'finance.review'"));
verify('general detail uses entity-scoped detail hook', page.includes('getTransactionDetail(transactionId)'));
verify('draft detail preserves deterministic submission readiness', page.includes('validateSubmissionReadiness'));
verify('draft detail preserves submitForReview transition', page.includes('submitForReview('));
verify('submit uses retry-safe idempotency ref', page.includes('submitIdempotencyKeyRef.current') && page.includes("makeRequestToken('idsm')"));
verify('submit idempotency resets only after success', page.includes('submitIdempotencyKeyRef.current = null;'));
verify('detail preserves entity epoch stale-response protection', page.includes('currentEpoch !== epochRef.current') && page.includes('actionEpoch !== epochRef.current'));
verify('ready review hands off to dedicated review route', page.includes('APP_ROUTES.transactionReviewDetail'));
verify('approved state keeps advanced fallback route', page.includes('APP_ROUTES.transactionDetailLegacy'));
verify('default transaction detail route resolves to overview page', router.includes('TransactionDetailOverviewPage') && router.includes('path: APP_ROUTES.transactionDetail'));
verify('legacy tools have a separate route', routes.includes("transactionDetailLegacy: '/finance/transactions/:transactionId/advanced'"));
verify('router lazy-loads guarded advanced detail wrapper', router.includes('TransactionAdvancedDetailPage'));
verify('page renders controlled errors instead of raw backend messages', !page.includes('{error.message}') && !page.includes('{err.message}') && !page.includes('setActionError(error.message)'));
verify('general overview does not own approval or return mutations', !/approveForPosting|returnToDraft|invalidateApproval|getPostingPlanPreview/.test(page));
verify('general overview has no real posting or ledger side effects', !/financeJournalEntries|financeJournalLines|financeAggregates|posting-real|ledger-post|transactions-repair-approval-verification/.test(page));
verify('page does not hardcode pt-BR formatting', !page.includes('pt-BR'));
verify('PT BRL presentation is localized', /1\.234,56/.test(formatReviewMoney(123456, 'PT')));
verify('EN BRL presentation is localized', /1,234\.56/.test(formatReviewMoney(123456, 'EN')));
verify('localized date works in ES', Boolean(formatReviewDate('2026-08-14T12:00:00.000Z', 'ES')));

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = TRANSACTION_DETAIL_OVERVIEW_COPY[language];
  verify(`${language} copy has core page language`, Boolean(copy.pageTitle && copy.pageSubtitle && copy.backToList));
  verify(`${language} copy has safe recovery language`, Boolean(copy.errorTitle && copy.errorBody && copy.retry && copy.supportCode));
  verify(`${language} copy has all workflow states`, Boolean(copy.statuses.draft && copy.statuses.returned && copy.statuses.ready_for_review && copy.statuses.approved_for_posting && copy.statuses.posted && copy.statuses.reversed));
  verify(`${language} copy explains no-balance-change state`, Boolean(copy.noBalanceChange));
  verify(`${language} copy covers draft/review/approved actions`, Boolean(copy.editDraft && copy.submitForReview && copy.openReview && copy.advancedVerification));
}

console.log(`\nTransaction Detail 2.0 totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
