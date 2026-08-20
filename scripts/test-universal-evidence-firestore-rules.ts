import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID; const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) throw new Error('Universal Evidence Rules tests require emulator environment');
const [host, portText] = emulatorHost.split(':'); const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(portText), rules } });
let passed = 0;
const denied = async (operation: Promise<unknown>, label: string) => { await assertFails(operation); passed++; console.log(`✅ ${label}`); };
try {
  const evidencePath = 'organizations/org-evidence/financeEntities/entity-a/universalEvidence/evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const hashPath = 'organizations/org-evidence/financeEntities/entity-a/universalEvidenceHashes/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'organizations/org-evidence'), { status: 'active' });
    await setDoc(doc(context.firestore(), evidencePath), { evidenceId: 'evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    await setDoc(doc(context.firestore(), hashPath), { evidenceId: 'evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  });
  const db = env.authenticatedContext('ceo-evidence', { mn_organization_id: 'org-evidence', systemRole: 'ceo' }).firestore();

  await denied(getDoc(doc(db, evidencePath)), 'universalEvidence read is denied');
  await denied(setDoc(doc(db, `${evidencePath}b`), { evidenceId: 'x' }), 'universalEvidence create is denied');
  await denied(updateDoc(doc(db, evidencePath), { processingState: 'accepted' }), 'universalEvidence update is denied');
  await denied(deleteDoc(doc(db, evidencePath)), 'universalEvidence delete is denied');

  await denied(getDoc(doc(db, hashPath)), 'universalEvidenceHashes read is denied');
  await denied(setDoc(doc(db, `${hashPath.slice(0, -1)}b`), { evidenceId: 'x' }), 'universalEvidenceHashes create is denied');
  await denied(updateDoc(doc(db, hashPath), { evidenceId: 'evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }), 'universalEvidenceHashes update is denied');
  await denied(deleteDoc(doc(db, hashPath)), 'universalEvidenceHashes delete is denied');

  console.log(`\nUniversal Evidence Rules totals: ${passed} Passed`);
} finally { await env.cleanup(); }
