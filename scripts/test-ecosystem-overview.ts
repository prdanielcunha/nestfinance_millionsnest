import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import {
  canUseEcosystemOverview,
  hasNestFinanceEntitlement,
  organizationOverviewState,
} from '../server/vercel-handlers/finance/ecosystemOverview.js';

async function run() {
  assert.strictEqual(
    canUseEcosystemOverview({ granted: true, isGlobalAccess: true }),
    true,
  );
  assert.strictEqual(
    canUseEcosystemOverview({ granted: true, isGlobalAccess: false }),
    false,
  );
  assert.strictEqual(
    canUseEcosystemOverview({ granted: false, isGlobalAccess: true }),
    false,
  );

  assert.strictEqual(
    hasNestFinanceEntitlement({
      enabledApps: ['nestfinance'],
      entitlements: { nestfinance: { active: true } },
    }),
    true,
  );
  assert.strictEqual(
    hasNestFinanceEntitlement({
      enabledApps: ['nestfinance'],
      entitlements: { nestfinance: { status: 'active' } },
    }),
    true,
  );
  assert.strictEqual(
    hasNestFinanceEntitlement({
      enabledApps: ['nestfinance'],
      entitlements: { nestfinance: { active: false } },
    }),
    false,
  );
  assert.strictEqual(
    hasNestFinanceEntitlement({
      enabledApps: [],
      entitlements: { nestfinance: { active: true } },
    }),
    false,
  );

  assert.strictEqual(
    organizationOverviewState({ readyForReview: 2, openTransactions: 5 }),
    'attention',
  );
  assert.strictEqual(
    organizationOverviewState({ readyForReview: 0, openTransactions: 4 }),
    'active',
  );
  assert.strictEqual(
    organizationOverviewState({ readyForReview: 0, openTransactions: 0 }),
    'clear',
  );

  const root = process.cwd();
  const server = await fs.readFile(
    path.join(root, 'server/vercel-handlers/finance/ecosystemOverview.ts'),
    'utf8',
  );
  const panel = await fs.readFile(
    path.join(root, 'src/components/finance/EcosystemOverviewPanel.tsx'),
    'utf8',
  );
  const service = await fs.readFile(
    path.join(root, 'src/services/ecosystemOverviewService.ts'),
    'utf8',
  );
  const directEntry = await fs.readFile(
    path.join(root, 'server/vercel-handlers/auth/directEntry.ts'),
    'utf8',
  );
  const today = await fs.readFile(
    path.join(root, 'src/pages/finance/TodayActionCenter.tsx'),
    'utf8',
  );

  assert.ok(server.includes('verifyIdToken(authorization.slice(7), true)'));
  assert.ok(server.includes('resolveEcosystemSession(uid, activeOrganizationId)'));
  assert.ok(server.includes('canUseEcosystemOverview(activeSession)'));
  assert.ok(server.includes(".where('enabledApps', 'array-contains', 'nestfinance')"));
  assert.ok(server.includes('hasNestFinanceEntitlement(data)'));
  assert.ok(server.includes("collection('financeEntities')"));
  assert.ok(server.includes("collection('financeTransactions')"));
  assert.ok(!server.includes("req.body?.organizationIds"));
  assert.ok(!server.includes("req.body.organizationIds"));

  assert.ok(service.includes('/api/finance/ecosystem/overview'));
  assert.ok(panel.includes('if (!accessState.isGlobalAccess) return null'));
  assert.ok(panel.includes('chooseCurrentSessionOrganization'));
  assert.ok(panel.includes('refreshAccessibleFinanceEntities'));
  assert.ok(panel.includes('accessState.organizationId'));
  assert.ok(panel.includes("PT: {"));
  assert.ok(panel.includes("EN: {"));
  assert.ok(panel.includes("ES: {"));

  const requestedOrgResolver = directEntry.indexOf(
    'const resolution = await resolveEcosystemSession(uid, selectedId)',
  );
  const broadCandidateDiscovery = directEntry.indexOf(
    "collection('organizations').limit(MAX_ORGANIZATIONS)",
  );
  assert.ok(requestedOrgResolver >= 0);
  assert.ok(broadCandidateDiscovery >= 0);
  assert.ok(
    requestedOrgResolver < broadCandidateDiscovery,
    'explicit CEO organization selection must be revalidated before broad discovery',
  );

  assert.ok(today.includes('canReviewTransactions'));
  assert.ok(today.includes('canApproveTransactions'));
  assert.ok(today.includes('canReview: canReviewTransactions'));
  assert.ok(today.includes('canApprove: canApproveTransactions'));

  console.log(
    '✅ CEO ecosystem overview is global-only, entitlement-aware, tenant-safe, multilingual and role-aware',
  );
}

run().catch((error) => {
  console.error('❌ Ecosystem overview quality failed', error);
  process.exit(1);
});
