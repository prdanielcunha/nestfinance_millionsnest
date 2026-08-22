import { readFile } from 'node:fs/promises';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Count Rules tests require emulator environment');
}
const [host, portText] = emulatorHost.split(':');
const port = Number(portText);
const rules = await readFile('firestore.rules', 'utf8');

const env = await initializeTestEnvironment({
  projectId,
  firestore: { host, port, rules },
});

try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'organizations/org-count'), {
      name: 'Count Rules Org',
      status: 'active',
    });
    await setDoc(doc(db, 'users/ceo-count'), { systemRole: 'ceo' });
    await setDoc(doc(db, 'users/common-count'), { displayName: 'Common' });
    await setDoc(doc(db, 'organizations/org-count/members/common-count'), {
      uid: 'common-count',
      role: 'member',
      status: 'active',
    });
    await setDoc(doc(db, 'organizations/org-count/financeEntities/entity-count'), {
      name: 'Entity Count',
      active: true,
    });
    await setDoc(
      doc(
        db,
        'organizations/org-count/financeEntities/entity-count/countSessions/cnt_aaaaaaaaaaaaaaaaaaaaaaaa',
      ),
      {
        organizationId: 'org-count',
        financeEntityId: 'entity-count',
        status: 'counting_a',
        version: 1,
      },
    );
  });

  const globalDb = env.authenticatedContext('ceo-count').firestore();
  const commonDb = env.authenticatedContext('common-count').firestore();
  const countPath =
    'organizations/org-count/financeEntities/entity-count/countSessions/cnt_aaaaaaaaaaaaaaaaaaaaaaaa';

  await assertFails(getDoc(doc(globalDb, countPath)));
  console.log('✅ global development user cannot bypass gateway to read nested Count session directly');
  await assertFails(
    setDoc(
      doc(
        globalDb,
        'organizations/org-count/financeEntities/entity-count/countSessions/cnt_bbbbbbbbbbbbbbbbbbbbbbbb',
      ),
      { status: 'counting_a', version: 1 },
    ),
  );
  console.log('✅ global development user cannot create nested Count session directly');
  await assertFails(updateDoc(doc(globalDb, countPath), { version: 2 }));
  console.log('✅ global development user cannot update nested Count session directly');
  await assertFails(getDoc(doc(commonDb, countPath)));
  console.log('✅ organization member cannot read nested Count session directly');
  await assertFails(updateDoc(doc(commonDb, countPath), { version: 2 }));
  console.log('✅ organization member cannot update nested Count session directly');
} finally {
  await env.cleanup();
}
