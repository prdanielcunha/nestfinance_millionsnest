import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Rules tests require an emulator project and FIRESTORE_EMULATOR_HOST');
}

const [host, portText] = emulatorHost.split(':');
const port = Number(portText);

if (!host || !Number.isInteger(port)) {
  throw new Error(`Invalid FIRESTORE_EMULATOR_HOST: ${emulatorHost}`);
}

const authorityUpdates: Record<string, unknown>[] = [
  { systemRole: 'admin' },
  { appRole: 'global_admin' },
  { role: 'ceo' },
  { capabilities: ['finance.manage'] },
  { permissions: { systemAdmin: true } },
  { scopes: ['*'] },
  { appAccess: { nestfinance: 'admin' } },
  { entitlement: 'enterprise' },
  { entitlements: ['all'] },
  { lifetimeAccess: true },
  { isGlobalAccess: true },
];

const serverOnlyCollections = [
  'financeSettings',
  'financeCategories',
  'financeAccounts',
  'financeEntities',
  'financeFunds',
  'financeTransactions',
  'financeAllocations',
  'financeAuditLogs',
  'financeIdempotency',
  'financeJournalEntries',
  'financeJournalLines',
  'financeAggregates',
];

const financeReadableCollections = [
  'financeSettings',
  'financeCategories',
  'financeAccounts',
  'financeEntities',
  'financeFunds',
  'financeTransactions',
  'financeAllocations',
  'financeAuditLogs',
  'financeIdempotency',
  'financeJournalEntries',
  'financeJournalLines',
  'financeAggregates',
];

async function seed(testEnv: RulesTestEnvironment) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'organizations/org-a'), { ownerUid: 'org-owner', name: 'Org A' });
    await setDoc(doc(db, 'organizations/org-b'), { ownerUid: 'other-owner', name: 'Org B' });
    await setDoc(doc(db, 'organizations/org-inactive'), { name: 'Inactive', status: 'inactive' });
    await setDoc(doc(db, 'organizations/org-suspended'), { name: 'Suspended', status: 'suspended' });
    await setDoc(doc(db, 'organizations/org-disabled-status'), { name: 'Disabled Status', status: 'disabled' });
    await setDoc(doc(db, 'organizations/org-archived'), { name: 'Archived', status: 'archived' });
    await setDoc(doc(db, 'organizations/org-disabled-flag'), { name: 'Disabled Flag', disabled: true });

    await setDoc(doc(db, 'organization_members/common_org-a'), {
      uid: 'common',
      organizationId: 'org-a',
      role: 'member',
      capabilities: [],
    });

    await setDoc(doc(db, 'users/common'), { displayName: 'Common user' });
    await setDoc(doc(db, 'users/org-owner'), { displayName: 'Org owner', systemRole: 'owner' });
    await setDoc(doc(db, 'users/system-admin'), { systemRole: 'admin' });
    await setDoc(doc(db, 'users/app-role-only'), { appRole: 'global_admin' });
    await setDoc(doc(db, 'users/role-only'), { role: 'ceo' });
    await setDoc(doc(db, 'users/ecosystem-support'), { systemRole: 'ecosystem_support' });
    await setDoc(doc(db, 'users/ceo'), { systemRole: 'ceo' });
    await setDoc(doc(db, 'users/global-admin'), { systemRole: 'global_admin' });
    await setDoc(doc(db, 'users/ecosystem-owner'), { systemRole: 'ecosystem_owner' });
    await setDoc(doc(db, 'users/founder'), { systemRole: 'founder' });

    for (const collectionName of financeReadableCollections) {
      await setDoc(doc(db, `organizations/org-a/${collectionName}/readable`), {
        financeEntityId: 'entity-a',
        marker: collectionName,
      });
    }

    for (const orgId of ['org-inactive', 'org-suspended', 'org-disabled-status', 'org-archived', 'org-disabled-flag']) {
      await setDoc(doc(db, `organizations/${orgId}/financeTransactions/readable`), {
        financeEntityId: 'entity-a',
        amount: 100,
      });
    }
  });
}

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port,
      rules: await readFile('firestore.rules', 'utf8'),
    },
  });

  try {
    await seed(testEnv);
    const commonDb = testEnv.authenticatedContext('common').firestore();
    const ownerDb = testEnv.authenticatedContext('org-owner').firestore();
    const systemAdminDb = testEnv.authenticatedContext('system-admin').firestore();
    const appRoleOnlyDb = testEnv.authenticatedContext('app-role-only').firestore();
    const roleOnlyDb = testEnv.authenticatedContext('role-only').firestore();
    const supportDb = testEnv.authenticatedContext('ecosystem-support').firestore();
    const ceoDb = testEnv.authenticatedContext('ceo').firestore();
    const globalAdminDb = testEnv.authenticatedContext('global-admin').firestore();
    const ecosystemOwnerDb = testEnv.authenticatedContext('ecosystem-owner').firestore();
    const founderDb = testEnv.authenticatedContext('founder').firestore();

    const canonicalGlobalRoleDbs = [
      ['ceo', ceoDb],
      ['global-admin', globalAdminDb],
      ['ecosystem-owner', ecosystemOwnerDb],
      ['founder', founderDb],
    ] as const;

    const nestFinanceDevelopmentDbs = [
      ['ceo', ceoDb],
      ['global-admin', globalAdminDb],
      ['ecosystem-owner', ecosystemOwnerDb],
    ] as const;

    await assertFails(setDoc(doc(commonDb, 'users/new-common'), {
      displayName: 'Privileged profile',
      organizationId: 'org-a',
      systemRole: 'admin',
    }));

    for (const authorityUpdate of authorityUpdates) {
      await assertFails(updateDoc(doc(commonDb, 'users/common'), authorityUpdate));
    }

    await assertSucceeds(updateDoc(doc(commonDb, 'users/common'), { displayName: 'Updated safely' }));

    await assertFails(setDoc(doc(commonDb, 'organization_members/common_org-b'), {
      uid: 'common',
      organizationId: 'org-b',
      role: 'member',
    }));
    await assertFails(updateDoc(doc(commonDb, 'organization_members/common_org-a'), {
      role: 'owner',
      capabilities: ['organization.manage'],
    }));

    await assertFails(setDoc(doc(commonDb, 'organizations/org-b/members/common'), {
      uid: 'common',
      role: 'member',
      status: 'active',
    }));
    await assertFails(getDoc(doc(commonDb, 'organizations/org-b')));

    await assertFails(getDocs(collection(commonDb, 'organization_members')));
    await assertSucceeds(getDocs(collection(globalAdminDb, 'organization_members')));

    await assertFails(setDoc(doc(ownerDb, 'system_settings/org-owner-denied'), { enabled: true }));
    await assertFails(setDoc(doc(systemAdminDb, 'system_settings/admin-denied'), { enabled: true }));
    await assertFails(setDoc(doc(appRoleOnlyDb, 'system_settings/app-role-only-denied'), { enabled: true }));
    await assertFails(setDoc(doc(roleOnlyDb, 'system_settings/role-only-denied'), { enabled: true }));
    for (const [roleId, roleDb] of canonicalGlobalRoleDbs) {
      await assertSucceeds(setDoc(doc(roleDb, `system_settings/${roleId}-allowed`), { enabled: true }));
    }

    // Current NestFinance development gate must be enforced at the Firestore boundary too.
    for (const collectionName of financeReadableCollections) {
      await assertFails(getDoc(doc(commonDb, `organizations/org-a/${collectionName}/readable`)));
      await assertFails(getDoc(doc(founderDb, `organizations/org-a/${collectionName}/readable`)));
      await assertFails(getDoc(doc(appRoleOnlyDb, `organizations/org-a/${collectionName}/readable`)));
      await assertFails(getDoc(doc(roleOnlyDb, `organizations/org-a/${collectionName}/readable`)));
      await assertFails(getDoc(doc(supportDb, `organizations/org-a/${collectionName}/readable`)));

      for (const [, roleDb] of nestFinanceDevelopmentDbs) {
        await assertSucceeds(getDoc(doc(roleDb, `organizations/org-a/${collectionName}/readable`)));
      }
    }

    // Explicitly unusable organizations fail closed even for users allowed by the dev gate.
    for (const orgId of ['org-inactive', 'org-suspended', 'org-disabled-status', 'org-archived', 'org-disabled-flag']) {
      await assertFails(getDoc(doc(ceoDb, `organizations/${orgId}/financeTransactions/readable`)));
    }

    // All finance configuration and ledger writes must go through backend gateways/Admin SDK.
    for (const collectionName of serverOnlyCollections) {
      await assertFails(setDoc(
        doc(commonDb, `organizations/org-a/${collectionName}/direct-client-write`),
        { injected: true },
      ));
      await assertFails(setDoc(
        doc(ceoDb, `organizations/org-a/${collectionName}/global-direct-client-write`),
        { injected: true },
      ));
    }

    // Non-financial behavior intentionally preserved in this focused phase.
    await assertSucceeds(getDoc(doc(commonDb, 'organizations/org-a')));
    await assertSucceeds(setDoc(doc(commonDb, 'organizations/org-a/timeline/client-event'), {
      event: 'allowed-non-financial-write',
    }));

    console.log('✅ Authenticated Firestore Rules hardening scenarios passed');
  } finally {
    await testEnv.cleanup();
  }
}

run().catch((error) => {
  console.error('❌ Firestore Rules tests failed', error);
  process.exitCode = 1;
});
