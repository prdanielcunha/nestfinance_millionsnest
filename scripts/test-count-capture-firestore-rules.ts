import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) throw new Error('Count Capture Rules tests require emulator environment');
const [host, portText] = emulatorHost.split(':');
const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(portText), rules } });

try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'organizations/org-count-capture'), { name: 'Count Capture Rules Org', status: 'active' });
    await setDoc(doc(db, 'users/ceo-count-capture'), { systemRole: 'ceo' });
    await setDoc(doc(db, 'users/common-count-capture'), { displayName: 'Common' });
    await setDoc(doc(db, 'organizations/org-count-capture/members/common-count-capture'), { uid: 'common-count-capture', role: 'member', status: 'active' });
    await setDoc(doc(db, 'organizations/org-count-capture/financeEntities/entity-count-capture'), { name: 'Entity', active: true });
    await setDoc(doc(db, 'organizations/org-count-capture/financeEntities/entity-count-capture/countCaptures/cpc_aaaaaaaaaaaaaaaaaaaaaaaa'), {
      id: 'cpc_aaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org-count-capture', financeEntityId: 'entity-count-capture', status: 'captured', version: 2,
    });
    await setDoc(doc(db, `organizations/org-count-capture/financeEntities/entity-count-capture/countCaptureHashes/${'a'.repeat(64)}`), {
      captureId: 'cpc_aaaaaaaaaaaaaaaaaaaaaaaa', originalSha256: 'a'.repeat(64),
    });
  });

  const globalDb = env.authenticatedContext('ceo-count-capture').firestore();
  const commonDb = env.authenticatedContext('common-count-capture').firestore();
  const capturePath = 'organizations/org-count-capture/financeEntities/entity-count-capture/countCaptures/cpc_aaaaaaaaaaaaaaaaaaaaaaaa';
  const hashPath = `organizations/org-count-capture/financeEntities/entity-count-capture/countCaptureHashes/${'a'.repeat(64)}`;

  await assertFails(getDoc(doc(globalDb, capturePath)));
  await assertFails(updateDoc(doc(globalDb, capturePath), { status: 'reviewed' }));
  await assertFails(setDoc(doc(globalDb, 'organizations/org-count-capture/financeEntities/entity-count-capture/countCaptures/cpc_bbbbbbbbbbbbbbbbbbbbbbbb'), { status: 'captured' }));
  await assertFails(getDoc(doc(commonDb, capturePath)));
  await assertFails(updateDoc(doc(commonDb, capturePath), { version: 3 }));
  await assertFails(getDoc(doc(globalDb, hashPath)));
  await assertFails(setDoc(doc(globalDb, `organizations/org-count-capture/financeEntities/entity-count-capture/countCaptureHashes/${'b'.repeat(64)}`), { captureId: 'x' }));
  console.log('✅ Count Capture documents and hash index remain server-only under financeEntities');
} finally {
  await env.cleanup();
}
