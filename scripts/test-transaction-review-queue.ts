import * as fs from 'fs';
import * as path from 'path';
import { TRANSACTION_REVIEW_COPY } from '../src/pages/finance/transactions/transactionReviewCopy';
import {
  formatReviewDate,
  formatReviewMoney,
  normalizeReviewDirection,
  normalizeReviewOrder,
} from '../src/pages/finance/transactions/transactionReviewModel';

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
  path.resolve('src/pages/finance/transactions/ReviewPage.tsx'),
  'utf8',
);

console.log('Running Transaction Review 2.0 queue checks...');

verify('invalid direction filter fails closed to all', normalizeReviewDirection('owner') === 'all');
verify('invalid order filter fails closed to oldest', normalizeReviewOrder('random') === 'oldest');
verify('newest order remains supported', normalizeReviewOrder('newest') === 'newest');
verify('PT BRL uses Brazilian decimal presentation', /1\.234,56/.test(formatReviewMoney(123456, 'PT')));
verify('EN BRL uses English decimal presentation', /1,234\.56/.test(formatReviewMoney(123456, 'EN')));
verify('localized date is valid in PT', Boolean(formatReviewDate('2026-08-14T12:00:00.000Z', 'PT')));
verify('localized date is valid in EN', Boolean(formatReviewDate('2026-08-14T12:00:00.000Z', 'EN')));
verify('localized date is valid in ES', Boolean(formatReviewDate('2026-08-14T12:00:00.000Z', 'ES')));

verify('queue keeps finance.review capability gate', page.includes("'finance.review'"));
verify('queue requests only ready_for_review items', page.includes("status: 'ready_for_review'"));
verify('queue preserves 25 item page size', page.includes('listTransactions(filters, cursor, 25)'));
verify('queue preserves entity epoch stale-response protection', page.includes('currentEpoch !== epochRef.current'));
verify('queue opens dedicated review-detail route', page.includes('APP_ROUTES.transactionReviewDetail'));
verify('queue no longer depends on reviewMode query contract', !page.includes('?reviewMode=true'));
verify('queue preserves direction query parameter', page.includes("next.set('direction', value)"));
verify('queue preserves order query parameter', page.includes("next.set('order', value)"));
verify('queue uses locale-aware money and date formatters', page.includes('formatReviewMoney') && page.includes('formatReviewDate'));
verify('queue delegates index recovery to human-safe component', page.includes('FirestoreIndexRemediationCard'));
verify('queue does not render raw backend error messages', !page.includes('{error.message}') && !page.includes('{err.message}') && !page.includes('setError(err.message'));
verify('queue does not call transaction mutations', !/createDraft|createAndSubmit|updateDraft|submitForReview|returnToDraft|approveForPosting/.test(page));
verify('queue does not reference posting or ledger writes', !/financeJournalEntries|financeJournalLines|financeAggregates|posting-real|ledger-post/.test(page));
verify('queue uses premium foundation primitives', page.includes("import { Button, Surface }"));

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = TRANSACTION_REVIEW_COPY[language];
  verify(`${language} copy has human review title`, Boolean(copy.pageTitle && copy.pageSubtitle && copy.review));
  verify(`${language} copy has controlled recovery state`, Boolean(copy.errorTitle && copy.errorBody && copy.retry && copy.supportCode));
  verify(`${language} copy has all direction labels`, Boolean(copy.directions.all && copy.directions.income && copy.directions.expense && copy.directions.transfer && copy.directions.liability_settlement));
}

console.log(`\nTransaction Review 2.0 totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
