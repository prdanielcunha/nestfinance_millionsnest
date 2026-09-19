import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import { getFinanceExperienceMode } from '../src/lib/financeExperience.js';
import { hasAnyEffectiveCapability, hasEffectiveCapability } from '../src/lib/permissions.js';
import type { EcosystemAccessState } from '../src/types/access.js';

function granted(overrides: Partial<EcosystemAccessState> = {}): EcosystemAccessState {
  return {
    status: 'granted',
    organizationId: 'org_role_test',
    accessSource: 'organization_membership',
    isGlobalAccess: false,
    capabilities: [],
    ...overrides,
  };
}

async function run() {
  const global = granted({ isGlobalAccess: true, systemRole: 'ceo' });
  assert.strictEqual(hasEffectiveCapability(global, 'finance.view'), true);
  assert.strictEqual(hasEffectiveCapability(global, 'organization.manage_entities'), true);
  assert.strictEqual(getFinanceExperienceMode(global), 'ecosystem');

  const financeManager = granted({ capabilities: ['finance.manage'] });
  assert.strictEqual(hasEffectiveCapability(financeManager, 'finance.view'), true);
  assert.strictEqual(hasEffectiveCapability(financeManager, 'finance.create_drafts'), true);
  assert.strictEqual(hasEffectiveCapability(financeManager, 'finance.review'), true);
  assert.strictEqual(hasEffectiveCapability(financeManager, 'organization.manage_entities'), false);
  assert.strictEqual(getFinanceExperienceMode(financeManager), 'organization_admin');

  const orgAdmin = granted({
    organizationRole: 'admin',
    capabilities: ['finance.view'],
  });
  assert.strictEqual(getFinanceExperienceMode(orgAdmin), 'organization_admin');
  assert.strictEqual(hasEffectiveCapability(orgAdmin, 'finance.review'), true);
  assert.strictEqual(hasEffectiveCapability(orgAdmin, 'finance.accounts.manage'), true);
  assert.strictEqual(hasEffectiveCapability(orgAdmin, 'organization.manage_entities'), true);

  const reviewer = granted({
    organizationRole: 'member',
    capabilities: ['finance.view', 'finance.review'],
  });
  assert.strictEqual(getFinanceExperienceMode(reviewer), 'review');

  const operator = granted({
    organizationRole: 'member',
    capabilities: ['finance.view', 'finance.create_drafts'],
  });
  assert.strictEqual(getFinanceExperienceMode(operator), 'operation');

  const viewer = granted({
    organizationRole: 'member',
    capabilities: ['finance.view'],
  });
  assert.strictEqual(getFinanceExperienceMode(viewer), 'read_only');
  assert.strictEqual(
    hasAnyEffectiveCapability(viewer, ['finance.review', 'finance.view']),
    true,
  );

  const root = process.cwd();
  const shell = await fs.readFile(path.join(root, 'src/app/layouts/ShellLayout.tsx'), 'utf8');
  const router = await fs.readFile(path.join(root, 'src/app/router/index.tsx'), 'utf8');
  const more = await fs.readFile(path.join(root, 'src/pages/finance/MorePage.tsx'), 'utf8');
  const session = await fs.readFile(path.join(root, 'src/services/sessionResolutionService.ts'), 'utf8');
  const directEntry = await fs.readFile(path.join(root, 'src/services/directEntryService.ts'), 'utf8');

  assert.ok(shell.includes("requiredAnyCapabilities: ['finance.view']"));
  assert.ok(shell.includes("requiredAnyCapabilities: ['finance.manage', 'organization.manage_entities']"));
  assert.ok(shell.includes('getFinanceExperienceMode(accessState)'));
  assert.ok(shell.includes('resolveCurrentSessionOrganizations'));
  assert.ok(shell.includes('chooseCurrentSessionOrganization'));
  assert.ok(shell.includes('accessState.isGlobalAccess'));

  assert.ok(more.includes('hasAnyEffectiveCapability(accessState, item.requiredAnyCapabilities)'));

  assert.ok(router.includes('FinanceCapabilityBoundary'));
  assert.ok(router.includes("const CREATE_FINANCE = ['finance.create_drafts'] as const"));
  assert.ok(router.includes("const REVIEW_FINANCE = ['finance.review', 'finance.approve_for_posting'] as const"));
  assert.ok(router.includes("const MANAGE_FINANCE = ['finance.manage', 'organization.manage_entities'] as const"));

  for (const field of ['systemRole', 'organizationRole', 'roles', 'permissions', 'scopes']) {
    assert.ok(session.includes(field), `session mapping dropped ${field}`);
  }

  assert.ok(directEntry.includes('resolveCurrentSessionOrganizations'));
  assert.ok(directEntry.includes('chooseCurrentSessionOrganization'));
  assert.ok(directEntry.includes("'current_session'"));

  console.log('✅ Role-aware workspace keeps navigation, routes and organization switching aligned to canonical access');
}

run().catch((error) => {
  console.error('❌ Role-aware workspace quality failed', error);
  process.exit(1);
});
