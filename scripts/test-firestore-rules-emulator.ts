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
    await setDoc(doc(db, 'users/ceo'), { systemRole: 'ceo' });
    await setDoc(doc(db, 'users/global-admin'), { systemRole: 'global_admin' });
    await setDoc(doc(db, 'users/ecosystem-owner'), { systemRole: 'ecosystem_owner' });
    await setDoc(doc(db, 'users/founder'), { systemRole: 'founder' });
    await setDoc(doc(db, 'organizations/org-a/financeTransactions/readable'), { amount: 100 });
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
    const globalAdminDb = testEnv.authenticatedContext('global-admin').firestore();
    const globalRoleDbs = [
      ['ceo', testEnv.authenticatedContext('ceo').firestore()],
      ['global-admin', globalAdminDb],
      ['ecosystem-owner', testEnv.authenticatedContext('ecosystem-owner').firestore()],
      ['founder', testEnv.authenticatedContext('founder').firestore()],
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
    for (const [roleId, roleDb] of globalRoleDbs) {
      await assertSucceeds(setDoc(doc(roleDb, `system_settings/${roleId}-allowed`), { enabled: true }));
    }

    for (const collectionName of serverOnlyCollections) {
      await assertFails(setDoc(
        doc(commonDb, `organizations/org-a/${collectionName}/direct-client-write`),
        { injected: true },
      ));
    }

    await assertSucceeds(getDoc(doc(commonDb, 'organizations/org-a/financeTransactions/readable')));
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
