import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

/**
 * A real Firestore Rules emulator regression for blind Count v3 records.
 * Static string checks do not prove access is denied: overlapping match rules
 * are OR-composed. Run this with firebase emulators:exec, never in production.
 */
const projectId = process.env.FIREBASE_PROJECT_ID;
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !endpoint) {
  throw new Error('Count v3 Firestore Rules tests require an isolated emulator environment');
}
const [host, portText] = endpoint.split(':');
const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host, port: Number(portText), rules },
});

const root = 'organizations/org-countv3-rules/financeEntities/entity-test';
const sessionPath = root + '/countVerificationSessions/session-test';
const archivePath = sessionPath + '/archivedCycles/archive-test';
const invitePath = root + '/countVerificationInvites/invite-test';
const accountPath = 'organizations/org-countv3-rules/financeAccounts/account-test';
let checks = 0;
async function denied(promise: Promise<unknown>, message: string) {
  await assertFails(promise);
  checks++;
  console.log('✅ ' + message);
}

try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'organizations/org-countv3-rules'), {
      status: 'active',
      ownerUid: 'org-owner-test',
    });
    await setDoc(doc(db, 'users/global-admin-test'), {
      systemRole: 'ceo',
      ecosystemSessionVersion: 1,
    });
    await setDoc(doc(db, accountPath), { name: 'Synthetic account' });
    await setDoc(doc(db, sessionPath), { status: 'pending', confirmations: [{ amountCents: 12345 }] });
    await setDoc(doc(db, archivePath), { confirmations: [{ amountCents: 12345 }] });
    await setDoc(doc(db, invitePath), { codeHash: 'synthetic-hash' });
  });

  const unauthed = env.unauthenticatedContext().firestore();
  const owner = env.authenticatedContext('org-owner-test').firestore();
  const admin = env.authenticatedContext('global-admin-test', {
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: 'org-countv3-rules',
    mn_session_version: 1,
  }).firestore();

  // Positive control: global finance admin can read an existing ordinary account.
  await assertSucceeds(getDoc(doc(admin, accountPath)));
  checks++;
  console.log('✅ Positive control: finance admin can read a normal account');

  for (const [who, db] of [['anonymous', unauthed], ['organization owner', owner], ['global finance admin', admin]] as const) {
    for (const [name, path] of [['session', sessionPath], ['archived cycle', archivePath], ['invitation', invitePath]] as const) {
      await denied(getDoc(doc(db, path)), who + ' cannot read ' + name);
      await denied(setDoc(doc(db, path), { malicious: true }), who + ' cannot overwrite ' + name);
      await denied(updateDoc(doc(db, path), { malicious: true }), who + ' cannot update ' + name);
      await denied(deleteDoc(doc(db, path)), who + ' cannot delete ' + name);
    }
    await denied(
      getDocs(collection(db, root + '/countVerificationSessions')),
      who + ' cannot list blind sessions',
    );
    await denied(
      getDocs(collection(db, root + '/countVerificationInvites')),
      who + ' cannot list invitation records',
    );
    await denied(
      setDoc(doc(db, root + '/countVerificationSessions/new-session'), { malicious: true }),
      who + ' cannot create a blind session',
    );
    await denied(
      setDoc(doc(db, root + '/countVerificationInvites/new-invite'), { malicious: true }),
      who + ' cannot create an invitation',
    );
  }
  console.log('\nCount v3 Firestore Rules emulator: ' + checks + ' verified operations');
} finally {
  await env.cleanup();
}
