import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Intelligence coverage Rules tests require emulator environment');
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
  const coveragePath =
    'intelligenceCoverage/coverage_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), coveragePath), {
      coverageId:
        'coverage_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      organizationId: 'org-coverage',
      financeEntityId: 'ent-coverage',
      sourceApp: 'NESTFINANCE',
      coverageKind: 'needs_attention',
      status: 'certified',
      factSchemaVersion: 1,
      signalSchemaVersion: 1,
      backfillVersion: 1,
    });
  });

  const db = env.authenticatedContext('ceo-coverage', {
    mn_organization_id: 'org-coverage',
    systemRole: 'ceo',
  }).firestore();

  await denied(getDoc(doc(db, coveragePath)), 'coverage read is denied to browser clients');
  await denied(
    setDoc(
      doc(
        db,
        'intelligenceCoverage/coverage_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ),
      { organizationId: 'org-coverage', status: 'certified' },
    ),
    'coverage create is denied to browser clients',
  );
  await denied(
    updateDoc(doc(db, coveragePath), { status: 'incomplete' }),
    'coverage update is denied to browser clients',
  );
  await denied(deleteDoc(doc(db, coveragePath)), 'coverage delete is denied to browser clients');

  console.log(`\nIntelligence Coverage Rules totals: ${passed} Passed`);
} finally {
  await env.cleanup();
}
