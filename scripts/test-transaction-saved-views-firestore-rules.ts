import { readFile } from 'node:fs/promises';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Saved Views Rules tests require emulator environment');
}

const [host, portText] = emulatorHost.split(':');
const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host, port: Number(portText), rules },
});

let passed = 0;
const denied = async (operation: Promise<unknown>, label: string) => {
  await assertFails(operation);
  passed++;
  console.log('✅ ' + label);
};

try {
  const orgId = 'org-saved-view-rules';
  const entityId = 'ent-saved-view-rules';
  const uid = 'ceo-saved-view-rules';
  const viewId = 'fview_aaaaaaaaaaaaaaaaaaaaaaaa';
  const viewPath =
    'organizations/' + orgId +
    '/financeEntities/' + entityId +
    '/workspaceViewOwners/' + uid +
    '/views/' + viewId;

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'organizations/' + orgId), {
      name: 'Rules Org',
      status: 'active',
    });
    await setDoc(doc(context.firestore(), 'users/' + uid), {
      systemRole: 'ceo',
    });
    await setDoc(doc(context.firestore(), 'organizations/' + orgId + '/financeEntities/' + entityId), {
      name: 'Entity',
      active: true,
    });
    await setDoc(doc(context.firestore(), viewPath), {
      viewId,
      organizationId: orgId,
      financeEntityId: entityId,
      ownerUid: uid,
      name: 'Server-created view',
      filters: { direction: 'all', status: 'draft' },
      schemaVersion: 1,
    });
  });

  const db = env.authenticatedContext(uid, {
    mn_organization_id: orgId,
    systemRole: 'ceo',
  }).firestore();

  await denied(getDoc(doc(db, viewPath)), 'browser cannot read server-owned saved views directly');
  await denied(
    setDoc(doc(db, viewPath + '-new'), {
      organizationId: orgId,
      financeEntityId: entityId,
      ownerUid: uid,
      name: 'Direct write',
    }),
    'browser cannot create saved views directly',
  );
  await denied(
    updateDoc(doc(db, viewPath), { name: 'Direct update' }),
    'browser cannot update saved views directly',
  );
  await denied(
    deleteDoc(doc(db, viewPath)),
    'browser cannot delete saved views directly',
  );

  console.log('\nTransaction Saved Views Rules totals: ' + passed + ' Passed');
} finally {
  await env.cleanup();
}
