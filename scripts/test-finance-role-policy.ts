import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import { hasEffectiveCapability } from '../server/vercel-handlers/finance/accessHelpers.js';

function session(overrides: Record<string, unknown> = {}) {
  return {
    granted: true,
    isGlobalAccess: false,
    organizationRole: 'member',
    permissions: [],
    capabilities: [],
    ...overrides,
  };
}

async function run() {
  assert.strictEqual(hasEffectiveCapability(session({ isGlobalAccess: true }), 'finance.anything'), true);

  for (const role of ['owner', 'admin']) {
    const admin = session({ organizationRole: role });
    assert.strictEqual(hasEffectiveCapability(admin, 'finance.view'), true);
    assert.strictEqual(hasEffectiveCapability(admin, 'finance.create_drafts'), true);
    assert.strictEqual(hasEffectiveCapability(admin, 'finance.review'), true);
    assert.strictEqual(hasEffectiveCapability(admin, 'finance.accounts.manage'), true);
    assert.strictEqual(hasEffectiveCapability(admin, 'finance.funds.manage'), true);
    assert.strictEqual(hasEffectiveCapability(admin, 'finance.categories.manage'), true);
    assert.strictEqual(hasEffectiveCapability(admin, 'organization.manage_entities'), true);
  }

  const financeManager = session({ permissions: ['finance.manage'] });
  assert.strictEqual(hasEffectiveCapability(financeManager, 'finance.view'), true);
  assert.strictEqual(hasEffectiveCapability(financeManager, 'finance.accounts.manage'), true);
  assert.strictEqual(hasEffectiveCapability(financeManager, 'finance.funds.manage'), true);
  assert.strictEqual(hasEffectiveCapability(financeManager, 'finance.categories.manage'), true);
  assert.strictEqual(hasEffectiveCapability(financeManager, 'organization.manage_entities'), false);

  const structureManager = session({ permissions: ['organization.manage_entities'] });
  assert.strictEqual(hasEffectiveCapability(structureManager, 'finance.accounts.manage'), true);
  assert.strictEqual(hasEffectiveCapability(structureManager, 'finance.accounts.repair'), true);
  assert.strictEqual(hasEffectiveCapability(structureManager, 'finance.funds.manage'), true);
  assert.strictEqual(hasEffectiveCapability(structureManager, 'finance.categories.manage'), true);
  assert.strictEqual(hasEffectiveCapability(structureManager, 'finance.review'), false);

  const accountManager = session({ permissions: ['finance.accounts.manage'] });
  assert.strictEqual(hasEffectiveCapability(accountManager, 'finance.accounts.manage'), true);
  assert.strictEqual(hasEffectiveCapability(accountManager, 'finance.funds.manage'), false);

  const viewer = session({ permissions: ['finance.view'] });
  assert.strictEqual(hasEffectiveCapability(viewer, 'finance.view'), true);
  assert.strictEqual(hasEffectiveCapability(viewer, 'finance.accounts.manage'), false);

  const structuralHandlers: Record<string, string> = {
    'accountsCreate.ts': 'finance.accounts.manage',
    'accountsUpdate.ts': 'finance.accounts.manage',
    'accountsArchive.ts': 'finance.accounts.manage',
    'accountsReactivate.ts': 'finance.accounts.manage',
    'accountsConfigureCustom.ts': 'finance.accounts.manage',
    'accountsRepairCanonical.ts': 'finance.accounts.repair',
    'fundsCreate.ts': 'finance.funds.manage',
    'fundsArchive.ts': 'finance.funds.manage',
    'fundsReactivate.ts': 'finance.funds.manage',
    'categoriesCreate.ts': 'finance.categories.manage',
    'categoriesUpdate.ts': 'finance.categories.manage',
    'categoriesArchive.ts': 'finance.categories.manage',
    'categoriesReactivate.ts': 'finance.categories.manage',
  };

  const root = path.join(process.cwd(), 'server', 'vercel-handlers', 'finance');
  for (const [file, capability] of Object.entries(structuralHandlers)) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    assert.ok(source.includes('hasEffectiveCapability'), `${file} bypasses shared capability semantics`);
    assert.ok(source.includes(capability), `${file} is not tied to ${capability}`);
    assert.ok(
      !source.includes('sessionList.isGlobalAccess !== true'),
      `${file} still contains a global-only authorization gate`,
    );
  }

  console.log('✅ Canonical owner/admin and finance management authority is aligned across structural finance handlers');
}

run().catch((error) => {
  console.error('❌ Finance role policy test failed', error);
  process.exit(1);
});
