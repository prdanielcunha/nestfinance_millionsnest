import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Intelligence Signals Rules tests require emulator environment');
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
  const signalPath = 'intelligenceSignals/signal_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), signalPath), {
      signalId: 'signal_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      organizationId: 'org-intelligence',
      financeEntityId: 'ent-intelligence',
      sourceApp: 'NESTFINANCE',
      signalType: 'TRANSACTION_REVIEW_REQUIRED',
      entityType: 'finance_transaction',
      entityId: 'tx_test',
      status: 'open',
      requiredCapability: 'finance.review',
      version: 1,
    });
  });

  const db = env.authenticatedContext('ceo-intelligence', {
    mn_organization_id: 'org-intelligence',
    systemRole: 'ceo',
  }).firestore();

  await denied(getDoc(doc(db, signalPath)), 'canonical signal read is denied to browser clients');
  await denied(
    setDoc(
      doc(db, 'intelligenceSignals/signal_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      {
        organizationId: 'org-intelligence',
        sourceApp: 'NESTFINANCE',
        signalType: 'TRANSACTION_REVIEW_REQUIRED',
        status: 'open',
      },
    ),
    'canonical signal create is denied to browser clients',
  );
  await denied(updateDoc(doc(db, signalPath), { status: 'resolved' }), 'canonical signal update is denied to browser clients');
  await denied(deleteDoc(doc(db, signalPath)), 'canonical signal delete is denied to browser clients');

  console.log(`\nIntelligence Signals Rules totals: ${passed} Passed`);
} finally {
  await env.cleanup();
}
