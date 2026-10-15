import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const training = readFileSync('src/pages/finance/count/CountTrainingPage.tsx', 'utf8');
for (const source of ['PT:', 'EN:', 'ES:']) assert.ok(training.includes(source));
for (const fragment of [
  "exercise === 'paper'",
  "exercise === 'amounts'",
  "setPaperReviewed(false)",
  "setPaperReviewed(true)",
  "paperValues.tithe === 35_000",
  "paperValues.offering === 12_000",
  "paperTotal === 47_000",
  "formatReviewMoney(47_000",
  "paperCorrect",
  "paperIncorrect",
  "copy.fictitiousPaper",
  "copy.paperBody",
  "copy.checkPaper",
  "copy.total",
  "copy.tithe",
  "copy.offering",
  "APP_ROUTES.count",
]) assert.ok(training.includes(fragment), fragment);
assert.ok(!training.includes('countService'));
assert.ok(!training.includes('fetch('));
assert.ok(!training.includes('localStorage'));
assert.ok(!training.includes('transactionService'));
assert.ok(!training.includes('financeJournalEntries'));
assert.ok(!training.includes('nestAiProxy'));
console.log('✅ T15 paper review training stays synthetic, accessible and finance-isolated');
