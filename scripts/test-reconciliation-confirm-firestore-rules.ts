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
  throw new Error('Reconciliation Rules tests require emulator environment');
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
  const orgId = 'org-rec-rules';
  const uid = 'ceo-rec-rules';
  const reconciliationId =
    'rec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const path = 'organizations/' + orgId + '/financeReconciliations/' + reconciliationId;

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'organizations/' + orgId), {
      name: 'Rules Org',
      status: 'active',
    });
    await setDoc(doc(context.firestore(), 'users/' + uid), {
      systemRole: 'ceo',
    });
    await setDoc(doc(context.firestore(), path), {
      reconciliationId,
      organizationId: orgId,
      financeEntityId: 'ent-rules',
      transactionId: 'tx_aaaaaaaaaaaaaaaa',
      evidenceId: 'evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'confirmed',
      schemaVersion: 1,
    });
  });

  const db = env.authenticatedContext(uid, {
    mn_organization_id: orgId,
    systemRole: 'ceo',
  }).firestore();

  await ok(getDoc(doc(db, path)), 'authorized browser can read server-created reconciliation trace');
  await denied(
    setDoc(
      doc(
        db,
        'organizations/' + orgId +
          '/financeReconciliations/rec_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ),
      {
        organizationId: orgId,
        financeEntityId: 'ent-rules',
        status: 'confirmed',
      },
    ),
    'browser cannot create reconciliation confirmation directly',
  );
  await denied(
    updateDoc(doc(db, path), { status: 'cancelled' }),
    'browser cannot update reconciliation confirmation directly',
  );
  await denied(
    deleteDoc(doc(db, path)),
    'browser cannot delete reconciliation confirmation directly',
  );

  console.log('\nReconciliation Confirmation Rules totals: ' + passed + ' Passed');
} finally {
  await env.cleanup();
}
