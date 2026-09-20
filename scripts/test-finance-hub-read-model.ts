import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import type { PeriodCloseReadinessResponse } from '../shared/finance/periodCloseReadiness.js';
import { buildFinanceHubReadModel } from '../shared/intelligence/financeHubReadModel.js';

function readiness(overrides: Partial<PeriodCloseReadinessResponse> = {}): PeriodCloseReadinessResponse {
  const base: PeriodCloseReadinessResponse = {
    version: 1,
    financeEntityId: 'fe_main',
    period: { key: '2026-09', startDate: '2026-09-01', endDateExclusive: '2026-10-01' },
    scope: {
      transactions: 'occurred_at_in_period',
      countSessions: 'service_date_in_period',
      documents: 'captured_in_period',
      reconciliation: 'posted_bank_account_transactions_in_period',
    },
    authority: {
      readOnly: true,
      financialMutation: false,
      closeMutation: false,
      canClosePeriod: false,
      canDeclarePeriodClosed: false,
      officialReport: false,
    },
    readiness: { state: 'attention_required', blockerCount: 5, blockers: [
      { code: 'transactions_waiting_review', count: 2, routeHint: 'review' },
      { code: 'divergent_count_sessions', count: 1, routeHint: 'count' },
      { code: 'documents_waiting_review', count: 1, routeHint: 'inbox' },
      { code: 'bank_transactions_unreconciled', count: 1, routeHint: 'balance' },
    ] },
    humanReview: {
      state: 'not_reviewed',
      reviewId: null,
      reviewedAt: null,
      reviewedByDisplayName: null,
      sourceSnapshotMatches: false,
      changedAreas: [],
    },
    transactions: {
      total: 9,
      capturedIncomeCents: 123456789,
      capturedExpenseCents: 98765432,
      postedIncomeCents: 99999999,
      postedExpenseCents: 77777777,
      statusCounts: {
        draft: 1,
        readyForReview: 2,
        approvedForPosting: 1,
        posted: 5,
        reversed: 0,
        other: 0,
      },
    },
    countSessions: { total: 3, matched: 2, divergent: 1, incomplete: 0 },
    documents: { total: 4, reviewed: 3, waitingReview: 1, unfinishedUploads: 0 },
    reconciliation: {
      configuredBankAccounts: 2,
      postedBankTransactions: 4,
      reconciledBankTransactions: 3,
      unreconciledBankTransactions: 1,
    },
  };
  return { ...base, ...overrides };
}

async function run() {
  const attention = buildFinanceHubReadModel({
    organizationId: 'org_a',
    readiness: readiness(),
    generatedAt: '2026-09-20T10:00:00.000Z',
  });

  assert.strictEqual(attention.state, 'attention_required');
  assert.strictEqual(attention.report.state, 'blocked');
  assert.strictEqual(attention.attention.blockerCount, 5);
  assert.deepStrictEqual(attention.transactions, {
    drafts: 1,
    waitingReview: 2,
    waitingPosting: 1,
  });
  assert.strictEqual(attention.count.divergent, 1);
  assert.strictEqual(attention.reconciliation.unreconciledBankTransactions, 1);
  assert.strictEqual(attention.privacy.containsMonetaryAmounts, false);
  assert.strictEqual(attention.authority.pastoralClassification, false);
  assert.strictEqual(attention.authority.journeySignalSource, false);

  const serialized = JSON.stringify(attention);
  for (const forbidden of [
    'capturedIncomeCents',
    'capturedExpenseCents',
    'postedIncomeCents',
    'postedExpenseCents',
    'reviewedByDisplayName',
    'description',
    'documentText',
  ]) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
  assert.ok(!serialized.includes('123456789'));
  assert.ok(!serialized.includes('98765432'));

  const ready = buildFinanceHubReadModel({
    organizationId: 'org_a',
    readiness: readiness({
      readiness: { state: 'ready_for_review', blockerCount: 0, blockers: [] },
      humanReview: {
        state: 'not_reviewed',
        reviewId: null,
        reviewedAt: null,
        reviewedByDisplayName: null,
        sourceSnapshotMatches: false,
        changedAreas: [],
      },
    }),
    generatedAt: '2026-09-20T10:00:00.000Z',
  });
  assert.strictEqual(ready.state, 'ready_for_review');
  assert.strictEqual(ready.report.state, 'ready_for_human_review');

  const reviewed = buildFinanceHubReadModel({
    organizationId: 'org_a',
    readiness: readiness({
      readiness: { state: 'ready_for_review', blockerCount: 0, blockers: [] },
      humanReview: {
        state: 'reviewed_current_snapshot',
        reviewId: 'pcr_1',
        reviewedAt: '2026-09-20T09:00:00.000Z',
        reviewedByDisplayName: 'Sensitive Name',
        sourceSnapshotMatches: true,
        changedAreas: [],
      },
    }),
    generatedAt: '2026-09-20T10:00:00.000Z',
  });
  assert.strictEqual(reviewed.state, 'reviewed_current_snapshot');
  assert.strictEqual(reviewed.report.state, 'reviewed_current_snapshot');
  assert.ok(!JSON.stringify(reviewed).includes('Sensitive Name'));

  const root = process.cwd();
  const server = await fs.readFile(
    path.join(root, 'server/vercel-handlers/finance/financeHubReadModel.ts'),
    'utf8',
  );
  const gateway = await fs.readFile(path.join(root, 'api/finance-gateway.ts'), 'utf8');
  const contracts = await fs.readFile(path.join(root, 'scripts/check-api-contracts.mjs'), 'utf8');
  const vercel = await fs.readFile(path.join(root, 'vercel.json'), 'utf8');

  assert.ok(server.includes("resolveFinanceRequestContext(req, 'finance.view')"));
  assert.ok(server.includes('loadPeriodCloseReadModel({'));
  assert.ok(server.includes('buildFinanceHubReadModel({'));
  assert.ok(!server.includes("collection('financeTransactions')"));
  assert.ok(!server.includes("collection('universalEvidence')"));
  assert.ok(!server.includes("collection('countSessions')"));

  assert.ok(gateway.includes("case 'finance-hub-read-model'"));
  assert.ok(contracts.includes("operation: 'finance-hub-read-model'"));
  assert.ok(contracts.includes("url: '/api/finance/intelligence/read-model'"));
  assert.ok(vercel.includes('/api/finance/intelligence/read-model'));

  console.log('✅ Finance Hub read model is scoped, read-only and excludes sensitive financial detail');
}

run().catch((error) => {
  console.error('❌ Finance Hub read model quality failed', error);
  process.exit(1);
});
