import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.includes('emulator') || !emulatorHost) {
  throw new Error('Period close review Rules tests require emulator environment');
}

const [host, portText] = emulatorHost.split(':');
const rules = await readFile('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host, port: Number(portText), rules },
});

let passed = 0;
const ok = async (operation: Promise<unknown>, label: string) => {
  await assertSucceeds(operation);
  passed++;
  console.log('✅ ' + label);
};
const denied = async (operation: Promise<unknown>, label: string) => {
  await assertFails(operation);
  passed++;
  console.log('✅ ' + label);
};

try {
  const orgId = 'org-pcr-rules';
  const uid = 'ceo-pcr-rules';
  const reviewId = 'pcr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const path = 'organizations/' + orgId + '/financePeriodCloseReviews/' + reviewId;

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'organizations/' + orgId), {
      name: 'Rules Org',
      status: 'active',
    });
    await setDoc(doc(context.firestore(), 'users/' + uid), {
      systemRole: 'ceo',
    });
    await setDoc(doc(context.firestore(), path), {
      reviewId,
      organizationId: orgId,
      financeEntityId: 'ent-rules',
      periodKey: '2026-09',
      status: 'reviewed_current_snapshot',
      immutable: true,
    });
  });

  const db = env.authenticatedContext(uid, {
    mn_organization_id: orgId,
    systemRole: 'ceo',
  }).firestore();

  await ok(getDoc(doc(db, path)), 'authorized browser can read server-created period review trace');
  await denied(
    setDoc(doc(db, 'organizations/' + orgId + '/financePeriodCloseReviews/pcr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), {
      organizationId: orgId,
      financeEntityId: 'ent-rules',
      periodKey: '2026-09',
    }),
    'browser cannot create period review directly',
  );
  await denied(updateDoc(doc(db, path), { status: 'closed' }), 'browser cannot mutate period review');
  await denied(deleteDoc(doc(db, path)), 'browser cannot delete period review history');

  console.log('\nPeriod Close Human Review Rules totals: ' + passed + ' Passed');
} finally {
  await env.cleanup();
}
