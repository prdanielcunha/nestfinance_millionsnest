import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID; const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) throw new Error('Universal Evidence Rules tests require emulator environment');
const [host, portText] = emulatorHost.split(':'); const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(portText), rules } });
try {
  const path = 'organizations/org-evidence/financeEntities/entity-a/universalEvidence/evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'organizations/org-evidence'), { status: 'active' }); await setDoc(doc(context.firestore(), path), { evidenceId: 'evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }); });
  const db = env.authenticatedContext('ceo-evidence', { mn_organization_id: 'org-evidence', systemRole: 'ceo' }).firestore();
  await assertFails(getDoc(doc(db, path))); await assertFails(setDoc(doc(db, `${path}b`), { evidenceId: 'x' })); await assertFails(updateDoc(doc(db, path), { processingState: 'accepted' })); await assertFails(deleteDoc(doc(db, path)));
  console.log('✅ Universal evidence direct read/create/update/delete remain fail-closed');
} finally { await env.cleanup(); }
