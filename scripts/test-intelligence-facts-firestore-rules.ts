import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Intelligence Facts Rules tests require emulator environment');
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
  console.log(`✅ ${label}`);
};

try {
  const factPath = 'intelligenceFacts/fact_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), factPath), {
      eventId: 'fact_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      organizationId: 'org-intelligence',
      sourceApp: 'NESTFINANCE',
      eventType: 'COUNT_OPENED',
      entityType: 'count_session',
      entityId: 'count_test',
      version: 1,
    });
  });

  const db = env.authenticatedContext('ceo-intelligence', {
    mn_organization_id: 'org-intelligence',
    systemRole: 'ceo',
  }).firestore();

  await denied(getDoc(doc(db, factPath)), 'canonical fact read is denied to browser clients');
  await denied(
    setDoc(doc(db, 'intelligenceFacts/fact_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), {
      organizationId: 'org-intelligence',
      sourceApp: 'NESTFINANCE',
      eventType: 'COUNT_OPENED',
    }),
    'canonical fact create is denied to browser clients',
  );
  await denied(updateDoc(doc(db, factPath), { eventType: 'COUNT_COMPLETED' }), 'canonical fact update is denied to browser clients');
  await denied(deleteDoc(doc(db, factPath)), 'canonical fact delete is denied to browser clients');

  console.log(`\nIntelligence Facts Rules totals: ${passed} Passed`);
} finally {
  await env.cleanup();
}
