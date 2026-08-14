import { readFile } from 'node:fs/promises';
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Count Paper Rules tests require emulator environment');
}
const [host, portText] = emulatorHost.split(':');
const port = Number(portText);
const rules = await readFile('firestore.rules', 'utf8');

const env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules } });

try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'organizations/org-count-paper'), { name: 'Count Paper Rules Org', status: 'active' });
    await setDoc(doc(db, 'users/ceo-count-paper'), { systemRole: 'ceo' });
    await setDoc(doc(db, 'users/common-count-paper'), { displayName: 'Common' });
    await setDoc(doc(db, 'organizations/org-count-paper/members/common-count-paper'), {
      uid: 'common-count-paper',
      role: 'member',
      status: 'active',
    });
    await setDoc(doc(db, 'organizations/org-count-paper/financeEntities/entity-count-paper'), {
      name: 'Entity Count Paper',
      active: true,
    });
    await setDoc(
      doc(
        db,
        'organizations/org-count-paper/financeEntities/entity-count-paper/countPaperForms/cpf_aaaaaaaaaaaaaaaa',
      ),
      {
        id: 'cpf_aaaaaaaaaaaaaaaa',
        organizationId: 'org-count-paper',
        financeEntityId: 'entity-count-paper',
        countSessionId: 'cnt_aaaaaaaaaaaaaaaaaaaaaaaa',
        stage: 'count_a',
        templateVersion: 1,
      },
    );
  });

  const globalDb = env.authenticatedContext('ceo-count-paper').firestore();
  const commonDb = env.authenticatedContext('common-count-paper').firestore();
  const formPath = 'organizations/org-count-paper/financeEntities/entity-count-paper/countPaperForms/cpf_aaaaaaaaaaaaaaaa';

  await assertFails(getDoc(doc(globalDb, formPath)));
  console.log('✅ global development user cannot bypass gateway to read Count Paper forms');
  await assertFails(
    setDoc(
      doc(globalDb, 'organizations/org-count-paper/financeEntities/entity-count-paper/countPaperForms/cpf_bbbbbbbbbbbbbbbb'),
      { stage: 'count_b', templateVersion: 1 },
    ),
  );
  console.log('✅ global development user cannot create Count Paper forms directly');
  await assertFails(updateDoc(doc(globalDb, formPath), { stage: 'count_b' }));
  console.log('✅ global development user cannot mutate Count Paper forms directly');
  await assertFails(getDoc(doc(commonDb, formPath)));
  console.log('✅ organization member cannot read nested Count Paper form directly');
  await assertFails(updateDoc(doc(commonDb, formPath), { templateVersion: 2 }));
  console.log('✅ organization member cannot update nested Count Paper form directly');
} finally {
  await env.cleanup();
}
