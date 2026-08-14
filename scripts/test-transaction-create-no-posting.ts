import * as fs from 'fs';
import * as path from 'path';

const page = fs.readFileSync(
  path.resolve('src/pages/finance/transactions/TransactionCreatePage.tsx'),
  'utf8',
);

const forbidden = [
  'approveForPosting',
  'getPostingPlanPreview',
  'financeJournalEntries',
  'financeJournalLines',
  'financeAggregates',
  'posting-real',
  'ledger-post',
];

let failed = 0;
for (const token of forbidden) {
  if (page.includes(token)) {
    console.error(`❌ Transaction Create must not reference ${token}`);
    failed++;
  } else {
    console.log(`✅ no ${token}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
