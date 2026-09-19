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

  await check('founder canônico recebe acesso global', async () => {
    await setUser('u_founder', { systemRole: 'founder' });
    const result: any = await resolveEcosystemSession('u_founder', orgId);
    assert.strictEqual(result.granted, true);
    assert.strictEqual(result.isGlobalAccess, true);
    assert.strictEqual(result.accessSource, 'global_system_role');
  });

  await check('admin de sistema não vira global sem membership canônico', async () => {
    await setUser('u_admin', { systemRole: 'admin' });
    const result: any = await resolveEcosystemSession('u_admin', orgId);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'MEMBERSHIP_NOT_FOUND');
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

  await check('ecosystem_support não recebe autoridade global implícita', async () => {
    await setUser('u_support', { systemRole: 'ecosystem_support' });
    const result: any = await resolveEcosystemSession('u_support', orgId);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'MEMBERSHIP_NOT_FOUND');
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
    assert.strictEqual(result.denialReason, 'MEMBERSHIP_NOT_FOUND');
  });

  await check('membro canônico com entitlement e appAccess recebe somente as permissões concedidas', async () => {
    await setUser('u_member', { displayName: 'Finance Admin', systemRole: 'user' });
    await db.collection('organizations').doc(orgId).collection('members').doc('u_member').set({
      status: 'active',
      role: 'admin',
      appAccess: {
        nestFinance: {
          enabled: true,
          roles: ['finance_admin'],
          permissions: ['finance.view', 'finance.create_drafts', 'finance.review'],
          scopes: { financeEntityIds: ['entity_a'] }
        }
      }
    });

    const result: any = await resolveEcosystemSession('u_member', orgId);
    assert.strictEqual(result.granted, true);
    assert.strictEqual(result.isGlobalAccess, false);
    assert.strictEqual(result.accessSource, 'organization_membership');
    assert.strictEqual(result.organizationRole, 'admin');
    assert.deepStrictEqual(result.roles, ['finance_admin']);
    assert.deepStrictEqual(result.permissions, ['finance.view', 'finance.create_drafts', 'finance.review']);
    assert.deepStrictEqual(result.capabilities, result.permissions);
    assert.deepStrictEqual(result.scopes, { financeEntityIds: ['entity_a'] });
  });

  await check('membership inativo falha fechado', async () => {
    await setUser('u_inactive_member', { systemRole: 'user' });
    await db.collection('organizations').doc(orgId).collection('members').doc('u_inactive_member').set({
      status: 'inactive',
      appAccess: { nestFinance: { enabled: true, permissions: ['finance.view'] } }
    });

    const result: any = await resolveEcosystemSession('u_inactive_member', orgId);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'MEMBERSHIP_INACTIVE');
  });

  await check('appAccess do NestFinance é obrigatório para membership comum', async () => {
    await setUser('u_no_app_access', { systemRole: 'user' });
    await db.collection('organizations').doc(orgId).collection('members').doc('u_no_app_access').set({
      status: 'active',
      role: 'member',
      appAccess: { nestFinance: { enabled: false, permissions: ['finance.view'] } }
    });

    const result: any = await resolveEcosystemSession('u_no_app_access', orgId);
    assert.strictEqual(result.granted, false);
    assert.strictEqual(result.denialReason, 'MEMBER_APP_ACCESS_DISABLED');
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
