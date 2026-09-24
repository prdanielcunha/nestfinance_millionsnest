import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCountProposalLines, COUNT_WORKFLOW_STATES } from '../shared/finance/countProposal.js';
import { buildCountProposalPreview, resolveCanonicalCountEntries } from '../server/vercel-handlers/finance/countProposalHelpers.js';

const read = (path: string) => readFileSync(path, 'utf8');

assert.deepEqual(COUNT_WORKFLOW_STATES, ['counted', 'reviewed', 'deposited', 'reconciled', 'closed']);

const matchedSession = {
  id: 'cnt_111111111111111111111111',
  status: 'matched',
  version: 7,
  serviceLabel: 'Culto de domingo',
  serviceDate: '2026-09-20',
  comparison: { matched: true, resolvedBy: 'direct_match' },
  countA: {
    totalCents: 16500,
    countedByLabel: 'Ana',
    sourceCaptureId: 'cpc_111111111111111111111111',
    entries: [
      { type: 'tithe', channel: 'cash', method: 'total', totalCents: 10000, denominations: {} },
      { type: 'offering', channel: 'cash', method: 'total', totalCents: 5000, denominations: {} },
      { type: 'pix', channel: 'pix', method: 'total', totalCents: 1500, denominations: {} },
    ],
  },
  countB: {
    totalCents: 16500,
    countedByLabel: 'Bruno',
    entries: [
      { type: 'tithe', channel: 'cash', method: 'total', totalCents: 10000, denominations: {} },
      { type: 'offering', channel: 'cash', method: 'total', totalCents: 5000, denominations: {} },
      { type: 'pix', channel: 'pix', method: 'total', totalCents: 1500, denominations: {} },
    ],
  },
};

assert.equal(resolveCanonicalCountEntries(matchedSession).length, 3);
assert.deepEqual(
  buildCountProposalLines(resolveCanonicalCountEntries(matchedSession)).map((line) => [line.entryType, line.paymentMethod]),
  [['tithe', 'cash'], ['offering', 'cash'], ['pix', 'pix']],
);

const preview = buildCountProposalPreview({
  session: matchedSession,
  accounts: [
    { id: 'cash', name: 'Caixa', type: 'cash', templateKey: 'church.account.cash' },
    { id: 'checking', name: 'Conta corrente', type: 'bank_checking', templateKey: 'church.account.checking' },
  ],
  categories: [
    { id: 'tithe-cat', name: 'Dízimos', kind: 'income' },
    { id: 'offering-cat', name: 'Ofertas', kind: 'income' },
  ],
  funds: [],
});

const tithe = preview.lines.find((line) => line.entryType === 'tithe');
const offering = preview.lines.find((line) => line.entryType === 'offering');
const pix = preview.lines.find((line) => line.entryType === 'pix');
assert.equal(tithe?.suggestedAccountId, 'cash');
assert.equal(tithe?.suggestedCategoryId, 'tithe-cat');
assert.equal(offering?.suggestedCategoryId, 'offering-cat');
assert.equal(pix?.suggestedAccountId, 'checking');
assert.equal(pix?.suggestedCategoryId, null);
assert.deepEqual(preview.sourceCaptureIds, ['cpc_111111111111111111111111']);
assert.equal(preview.workflowState, 'counted');

assert.throws(
  () => resolveCanonicalCountEntries({ ...matchedSession, status: 'divergent' }),
  /COUNT_PROPOSAL_REQUIRES_MATCHED_COUNT/,
);

const createHandler = read('server/vercel-handlers/finance/countSessionsCreateProposedDrafts.ts');
const previewHandler = read('server/vercel-handlers/finance/countSessionsProposalPreview.ts');
const helper = read('server/vercel-handlers/finance/countProposalHelpers.ts');
const page = read('src/pages/finance/count/CountProposalPage.tsx');
const resultPanel = read('src/pages/finance/count/CountH2Panels.tsx');
const detail = read('server/vercel-handlers/finance/transactionsDetail.ts');
const provenance = read('src/pages/finance/transactions/CountTransactionProvenance.tsx');
const review = read('src/pages/finance/transactions/TransactionReviewDetailPage.tsx');
const gateway = read('api/finance-gateway.ts');
const routes = read('src/app/router/routes.ts');
const router = read('src/app/router/index.tsx');

assert.ok(previewHandler.includes("resolveFinanceRequestContext(req, 'finance.view')"));
assert.ok(previewHandler.includes('buildCountProposalPreview'));
assert.ok(helper.includes('church.account.cash'));
assert.ok(helper.includes('church.account.checking'));
assert.ok(helper.includes("missingFields"));

assert.ok(createHandler.includes("status: 'ready_for_review'"));
assert.ok(createHandler.includes("sourceContext: 'count_session'"));
assert.ok(createHandler.includes('countSource'));
assert.ok(createHandler.includes("workflowState: 'reviewed'"));
assert.ok(createHandler.includes('countProposal'));
assert.ok(createHandler.includes('existingTransactionIds'));
assert.ok(createHandler.includes('executeWithIdempotency'));
assert.ok(createHandler.includes('resolveCanonicalCountEntries'));
assert.ok(createHandler.includes("postingPerformed: false"));
for (const forbidden of ['financeJournalEntries', 'transactions-posting-plan-preview', "status: 'posted'"]) {
  assert.ok(!createHandler.includes(forbidden), `Count proposal handler must not perform posting: ${forbidden}`);
}

assert.ok(page.includes('Nada será contabilizado agora.'));
assert.ok(page.includes('Nothing will be posted now.'));
assert.ok(page.includes('Nada se contabilizará ahora.'));
assert.ok(page.includes('suggestedAccountId'));
assert.ok(page.includes('suggestedCategoryId'));
assert.ok(page.includes('missingCount'));
assert.ok(page.includes('sourceCaptureIds'));
assert.ok(page.includes('APP_ROUTES.financeReview'));

assert.ok(resultPanel.includes('APP_ROUTES.countProposal'));
assert.ok(resultPanel.includes('prepareEntries'));
assert.ok(resultPanel.includes('openReview'));
assert.ok(resultPanel.includes('workflowLabels'));

assert.ok(detail.includes('countSource: txData.countSource || null'));
assert.ok(detail.includes('evidenceIds: Array.isArray(txData.evidenceIds)'));
assert.ok(provenance.includes('countSessionId'));
assert.ok(provenance.includes('sourceCaptureIds'));
assert.ok(provenance.includes('Nenhum valor foi contabilizado automaticamente.'));
assert.ok(review.includes('CountTransactionProvenance countSource={transaction.countSource}'));

assert.ok(gateway.includes("case 'count-sessions-proposal-preview'"));
assert.ok(gateway.includes("case 'count-sessions-create-proposed-drafts'"));
assert.ok(routes.includes("countProposal: '/finance/count/:sessionId/proposals'"));
assert.ok(router.includes('<CountProposalPage />'));

console.log('✅ Roadmap Cycle 05 Count-to-proposed-entries gate passed');
