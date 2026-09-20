import { readFile } from 'node:fs/promises';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Transaction Search Rules tests require emulator environment');
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
  const orgId = 'org-search-rules';
  const entityId = 'ent-search-rules';
  const uid = 'ceo-search-rules';
  const indexPath =
    'organizations/' + orgId + '/financeEntities/' + entityId +
    '/transactionSearchIndex/tx_rules';
  const coveragePath =
    'organizations/' + orgId + '/financeSearchCoverage/txsearchcov_rules';

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'organizations/' + orgId), { status: 'active' });
    await setDoc(doc(context.firestore(), 'users/' + uid), { systemRole: 'ceo' });
    await setDoc(doc(context.firestore(), 'organizations/' + orgId + '/financeEntities/' + entityId), {
      active: true,
    });
    await setDoc(doc(context.firestore(), indexPath), {
      transactionId: 'tx_rules',
      organizationId: orgId,
      financeEntityId: entityId,
      sourceVersion: 1,
      searchKeys: ['of', 'ofe'],
      schemaVersion: 1,
    });
    await setDoc(doc(context.firestore(), coveragePath), {
      organizationId: orgId,
      financeEntityId: entityId,
      status: 'certified',
    });
  });

  const db = env.authenticatedContext(uid, {
    mn_organization_id: orgId,
    systemRole: 'ceo',
  }).firestore();

  await denied(getDoc(doc(db, indexPath)), 'browser cannot read transaction search index directly');
  await denied(
    setDoc(doc(db, indexPath + '-new'), { searchKeys: ['x'] }),
    'browser cannot create transaction search index',
  );
  await denied(
    updateDoc(doc(db, indexPath), { searchKeys: ['tampered'] }),
    'browser cannot mutate transaction search index',
  );
  await denied(
    getDoc(doc(db, coveragePath)),
    'browser cannot read search coverage directly',
  );
  await denied(
    updateDoc(doc(db, coveragePath), { status: 'certified' }),
    'browser cannot forge search coverage',
  );

  console.log('\nTransaction Search Rules totals: ' + passed + ' Passed');
} finally {
  await env.cleanup();
}
