import assert from 'assert';
import { FakeFirestore } from './fakeFirestore.js';
import { resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../api/_lib/ecosystemSessionResolver.js';

process.env.NODE_ENV = 'test';

async function run() {
  console.log('Running canonical Ecosystem Session Resolver tests...');

  const db: any = new FakeFirestore();
  (globalThis as any)[Symbol.for('TEST_FIRESTORE')] = db;
  resetFirebaseAdminForTests();

  const orgId = 'org_resolver_test';
  await db.collection('organizations').doc(orgId).set({
    name: 'Resolver Test Org',
    enabledApps: ['nestfinance'],
    entitlements: { nestfinance: { active: true, status: 'active' } }
  });

  let passed = 0;
  let failed = 0;

  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error: any) {
      console.error(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }

  async function setUser(uid: string, data: Record<string, unknown>) {
    await db.collection('users').doc(uid).set(data);
  }

  await check('ceo canônico recebe acesso global ao NestFinance', async () => {
    await setUser('u_ceo', { displayName: 'CEO', systemRole: 'ceo' });
    const result: any = await resolveEcosystemSession('u_ceo', orgId);
    assert.strictEqual(result.granted, true);
    assert.strictEqual(result.isGlobalAccess, true);
    assert.strictEqual(result.accessSource, 'global_system_role');
    assert.deepStrictEqual(result.permissions, ['*']);
    assert.deepStrictEqual(result.scopes, { '*': ['*'] });
  });

  await check('global_admin canônico recebe acesso', async () => {
    await setUser('u_global_admin', { systemRole: 'global_admin' });
    const result: any = await resolveEcosystemSession('u_global_admin', orgId);
    assert.strictEqual(result.granted, true);
  });

  await check('ecosystem_owner canônico recebe acesso', async () => {
    await setUser('u_ecosystem_owner', { systemRole: 'ecosystem_owner' });
    const result: any = await resolveEcosystemSession('u_ecosystem_owner', orgId);
    assert.strictEqual(result.granted, true);
  });

  await check('founder é global canônico mas permanece fora do gate de desenvolvimento', async () => {
    await setUser('u_founder', { systemRole: 'founder' });
    const result: any = await resolveEcosystemSession('u_founder', orgId);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'NESTFINANCE_DEVELOPMENT_ACCESS_RESTRICTED');
  });

  await check('admin legado não recebe acesso global', async () => {
    await setUser('u_admin', { systemRole: 'admin' });
    const result: any = await resolveEcosystemSession('u_admin', orgId);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'NESTFINANCE_DEVELOPMENT_ACCESS_RESTRICTED');
  });

  await check('appRole não pode promover usuário a global', async () => {
    await setUser('u_app_role', { appRole: 'ceo' });
    const result: any = await resolveEcosystemSession('u_app_role', orgId);
    assert.strictEqual(result.granted, false);
  });

  await check('role não pode promover usuário a global', async () => {
    await setUser('u_role', { role: 'global_admin' });
    const result: any = await resolveEcosystemSession('u_role', orgId);
    assert.strictEqual(result.granted, false);
  });

  await check('ecosystem_support não entra no gate de desenvolvimento', async () => {
    await setUser('u_support', { systemRole: 'ecosystem_support' });
    const result: any = await resolveEcosystemSession('u_support', orgId);
    assert.strictEqual(result.granted, false);
  });

  await check('usuário inativo falha fechado antes da autorização', async () => {
    await setUser('u_inactive', { systemRole: 'ceo', status: 'inactive' });
    const result: any = await resolveEcosystemSession('u_inactive', orgId);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'USER_INACTIVE');
  });

  await check('usuário disabled falha fechado', async () => {
    await setUser('u_disabled', { systemRole: 'ceo', disabled: true });
    const result: any = await resolveEcosystemSession('u_disabled', orgId);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'USER_INACTIVE');
  });

  await check('organização inativa falha fechado', async () => {
    const inactiveOrg = 'org_inactive';
    await db.collection('organizations').doc(inactiveOrg).set({ status: 'inactive' });
    await setUser('u_active_ceo', { systemRole: 'ceo' });
    const result: any = await resolveEcosystemSession('u_active_ceo', inactiveOrg);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'ORGANIZATION_INACTIVE');
  });

  await check('ownerId da organização não concede autoridade global', async () => {
    const ownerOrg = 'org_owner_only';
    await db.collection('organizations').doc(ownerOrg).set({ name: 'Owner Org', ownerId: 'u_owner_only' });
    await setUser('u_owner_only', { systemRole: 'user' });
    const result: any = await resolveEcosystemSession('u_owner_only', ownerOrg);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'NESTFINANCE_DEVELOPMENT_ACCESS_RESTRICTED');
  });

  await check('membership legado organizations/{org}/users não é fonte de autorização', async () => {
    await setUser('u_legacy_nested', { systemRole: 'user' });
    await db.collection('organizations').doc(orgId).collection('users').doc('u_legacy_nested').set({
      capabilities: ['finance.manage']
    });
    const result: any = await resolveEcosystemSession('u_legacy_nested', orgId);
    assert.strictEqual(result.granted, false);
  });

  await check('organization_members legado na raiz não é fonte de autorização', async () => {
    await setUser('u_legacy_root', { systemRole: 'user' });
    await db.collection('organization_members').doc('legacy_root').set({
      uid: 'u_legacy_root',
      organizationId: orgId,
      capabilities: ['finance.manage']
    });
    const result: any = await resolveEcosystemSession('u_legacy_root', orgId);
    assert.strictEqual(result.granted, false);
  });

  console.log(`\nResolver Totals: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
