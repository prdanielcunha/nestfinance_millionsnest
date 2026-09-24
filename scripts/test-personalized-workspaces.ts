import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import { buildTodayWorkspace } from '../src/pages/finance/todayWorkspaceModel.js';

const snapshot = {
  returnedCorrections: 3,
  drafts: 4,
  readyForReview: 5,
  approvedForPosting: 2,
  inboxNeedsClassification: 6,
  inboxPendingReview: 7,
  countDivergences: 2,
  countChecks: 1,
};

const fullAuthority = {
  canView: true,
  canCreate: true,
  canReview: true,
  canApprove: true,
  canManage: true,
  canClassifyInbox: true,
  canReviewInbox: true,
  canCount: true,
};

function kinds(value: ReturnType<typeof buildTodayWorkspace>) {
  return value.tasks.map((item) => item.kind);
}

async function run() {
  const admin = buildTodayWorkspace('organization_admin', snapshot, fullAuthority);
  assert.deepStrictEqual(kinds(admin), [
    'transaction_review',
    'inbox_review',
    'count_divergence',
  ]);
  assert.deepStrictEqual(admin.shortcuts, ['transactions', 'reports', 'audit', 'settings']);

  const ecosystem = buildTodayWorkspace('ecosystem', snapshot, fullAuthority);
  assert.deepStrictEqual(ecosystem.tasks, admin.tasks);
  assert.deepStrictEqual(ecosystem.shortcuts, admin.shortcuts);

  const reviewer = buildTodayWorkspace('review', snapshot, {
    ...fullAuthority,
    canCreate: false,
    canManage: false,
    canClassifyInbox: false,
    canCount: false,
  });
  assert.deepStrictEqual(kinds(reviewer), [
    'transaction_review',
    'inbox_review',
    'approved',
  ]);
  assert.ok(!kinds(reviewer).includes('drafts'));
  assert.ok(!kinds(reviewer).includes('returned_corrections'));
  assert.ok(!kinds(reviewer).includes('count_divergence'));
  assert.deepStrictEqual(reviewer.shortcuts, ['review', 'inbox', 'reports', 'transactions']);

  const operator = buildTodayWorkspace('operation', snapshot, {
    ...fullAuthority,
    canReview: false,
    canApprove: false,
    canManage: false,
    canReviewInbox: false,
  });
  assert.deepStrictEqual(kinds(operator), [
    'returned_corrections',
    'drafts',
    'inbox_identification',
  ]);
  assert.ok(!kinds(operator).includes('transaction_review'));
  assert.ok(!kinds(operator).includes('inbox_review'));
  assert.deepStrictEqual(operator.shortcuts, ['new_transaction', 'capture', 'count', 'transactions']);

  const viewer = buildTodayWorkspace('read_only', snapshot, {
    canView: true,
    canCreate: false,
    canReview: false,
    canApprove: false,
    canManage: false,
    canClassifyInbox: false,
    canReviewInbox: false,
    canCount: false,
  });
  assert.deepStrictEqual(viewer.tasks, []);
  assert.deepStrictEqual(viewer.shortcuts, ['transactions', 'balance', 'reports', 'audit']);

  const noFinancePermission = buildTodayWorkspace('read_only', snapshot, {
    canView: false,
    canCreate: false,
    canReview: false,
    canApprove: false,
    canManage: false,
    canClassifyInbox: false,
    canReviewInbox: false,
    canCount: false,
  });
  assert.deepStrictEqual(noFinancePermission.tasks, []);
  assert.deepStrictEqual(noFinancePermission.shortcuts, []);

  const root = process.cwd();
  const panel = await fs.readFile(
    path.join(root, 'src/components/finance/RoleWorkspacePanel.tsx'),
    'utf8',
  );
  const today = await fs.readFile(
    path.join(root, 'src/pages/finance/TodayActionCenter.tsx'),
    'utf8',
  );
  const priorityModel = await fs.readFile(
    path.join(root, 'src/pages/finance/todayPriorityModel.ts'),
    'utf8',
  );

  assert.ok(panel.includes("organization_admin: {"));
  assert.ok(panel.includes("review: {"));
  assert.ok(panel.includes("operation: {"));
  assert.ok(panel.includes("read_only: {"));
  assert.ok(panel.includes("PT: {"));
  assert.ok(panel.includes("EN: {"));
  assert.ok(panel.includes("ES: {"));
  assert.ok(panel.includes('sm:grid-cols-2'));
  assert.ok(panel.includes('lg:grid-cols-[1.35fr_0.85fr]'));

  assert.ok(today.includes('<RoleWorkspacePanel'));
  assert.ok(today.includes('const experienceMode = getFinanceExperienceMode(accessState)'));
  assert.ok(today.includes("if (experienceMode === 'review') return [review, approved]"));
  assert.ok(today.includes("if (experienceMode === 'operation') return [returned, drafts]"));
  assert.ok(today.includes('if (!canViewFinance)'));
  assert.ok(today.includes('canCount,'));

  assert.ok(priorityModel.includes('transactionAuthority.canCount && divergent.length > 0'));
  assert.ok(priorityModel.includes('transactionAuthority.canCount && activeIndependentChecks.length > 0'));

  console.log('✅ Personalized finance workspaces keep role, authority, navigation and responsive UX aligned');
}

run().catch((error) => {
  console.error('❌ Personalized workspace quality failed', error);
  process.exit(1);
});
