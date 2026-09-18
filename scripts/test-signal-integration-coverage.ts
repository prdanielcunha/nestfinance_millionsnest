import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  projection,
  evidenceFinalize,
  evidenceClassify,
  evidenceReview,
  createAndSubmit,
  submit,
  returned,
  approved,
  invalidated,
  secondCount,
  recount,
] = await Promise.all([
  read('server/vercel-handlers/finance/signalProjection.ts'),
  read('server/vercel-handlers/finance/universalEvidenceFinalize.ts'),
  read('server/vercel-handlers/finance/universalEvidenceClassify.ts'),
  read('server/vercel-handlers/finance/universalEvidenceReview.ts'),
  read('server/vercel-handlers/finance/transactionsCreateAndSubmit.ts'),
  read('server/vercel-handlers/finance/transactionsSubmitForReview.ts'),
  read('server/vercel-handlers/finance/transactionsReturnToDraft.ts'),
  read('server/vercel-handlers/finance/transactionsApproveForPosting.ts'),
  read('server/vercel-handlers/finance/transactionsInvalidateApproval.ts'),
  read('server/vercel-handlers/finance/countSessionsSubmitSecondCount.ts'),
  read('server/vercel-handlers/finance/countSessionsSubmitRecount.ts'),
]);

let passed = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

check(
  projection.includes("db.collection('intelligenceSignals')"),
  'signals use the top-level server-only projection collection',
);
check(
  !projection.includes("collection('organizations')") &&
    !projection.includes('financeTransactions') &&
    !projection.includes('financeJournal') &&
    !projection.includes('financeBalances'),
  'signal projection helper has no financial-domain mutation path',
);
check(
  !projection.includes('generateContent') &&
    !projection.includes('GEMINI') &&
    !projection.includes('OpenAI') &&
    !projection.includes('anthropic'),
  'Signal Foundation has no LLM dependency',
);

check(
  evidenceFinalize.includes("signalType: 'INBOX_IDENTIFICATION_REQUIRED'") &&
    evidenceFinalize.includes('if (!duplicate)'),
  'accepted non-duplicate evidence opens identification work',
);
check(
  evidenceClassify.includes("signalType: 'INBOX_IDENTIFICATION_REQUIRED'") &&
    evidenceClassify.includes("signalType: 'INBOX_REVIEW_REQUIRED'") &&
    evidenceClassify.includes('stageFinanceSignalResolve') &&
    evidenceClassify.includes('stageFinanceSignalOpen'),
  'classification transitions identification work into review work',
);
check(
  evidenceReview.includes("signalType: 'INBOX_REVIEW_REQUIRED'") &&
    evidenceReview.includes('stageFinanceSignalResolve'),
  'human review resolves Inbox review work',
);

check(
  createAndSubmit.includes("signalType: 'TRANSACTION_REVIEW_REQUIRED'") &&
    createAndSubmit.includes('sourceFactId: submittedFactId'),
  'create-and-submit opens transaction review from TRANSACTION_SUBMITTED',
);
check(
  submit.includes("signalType: 'TRANSACTION_REVIEW_REQUIRED'") &&
    submit.includes("signalType: 'TRANSACTION_CORRECTION_REQUIRED'") &&
    submit.includes('if (isResubmission)'),
  'resubmission closes correction and opens review work',
);
check(
  returned.includes("signalType: 'TRANSACTION_REVIEW_REQUIRED'") &&
    returned.includes("signalType: 'TRANSACTION_CORRECTION_REQUIRED'") &&
    returned.includes('stageFinanceSignalResolve') &&
    returned.includes('stageFinanceSignalOpen'),
  'return-to-draft closes review and opens correction work',
);
check(
  approved.includes("signalType: 'TRANSACTION_REVIEW_REQUIRED'") &&
    approved.includes('stageFinanceSignalResolve'),
  'approval closes transaction review work',
);
check(
  invalidated.includes("signalType: 'TRANSACTION_CORRECTION_REQUIRED'") &&
    invalidated.includes('stageFinanceSignalOpen'),
  'approval invalidation reopens correction work',
);

check(
  secondCount.includes("signalType: 'COUNT_DIVERGENCE_REVIEW_REQUIRED'") &&
    secondCount.includes('if (!comparison.matched)'),
  'initial Count divergence opens warning work only when values differ',
);
check(
  recount.includes("signalType: 'COUNT_DIVERGENCE_REVIEW_REQUIRED'") &&
    recount.includes('stageFinanceSignalRefresh') &&
    recount.includes('stageFinanceSignalResolve') &&
    recount.includes('if (matched)'),
  'recount refreshes unresolved evidence or resolves the same signal',
);

for (const source of [
  evidenceFinalize,
  evidenceClassify,
  evidenceReview,
  createAndSubmit,
  submit,
  returned,
  approved,
  invalidated,
  secondCount,
  recount,
]) {
  check(
    source.includes('sourceFactId:'),
    'each signal transition is causally tied to a canonical fact id',
  );
}

check(
  !projection.includes('comment') &&
    !projection.includes('amountCents') &&
    !projection.includes('sourceHash') &&
    !projection.includes('description'),
  'signal helper does not model free-form or material financial payloads',
);

console.log(`\nSignal Integration Coverage totals: ${passed} Passed`);
