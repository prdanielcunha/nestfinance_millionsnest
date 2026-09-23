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
  throw new Error('Reconciliation reversal Rules tests require emulator environment');
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
  const orgId = 'org-rec-reverse-rules';
  const uid = 'ceo-rec-reverse-rules';
  const lockId =
    'rlock_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const reversalId =
    'rrev_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const lockPath =
    'organizations/' + orgId + '/financeReconciliationLineLocks/' + lockId;
  const reversalPath =
    'organizations/' + orgId + '/financeReconciliationReversals/' + reversalId;

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'organizations/' + orgId), {
      name: 'Rules Org',
      status: 'active',
    });
    await setDoc(doc(context.firestore(), 'users/' + uid), {
      systemRole: 'ceo',
      ecosystemSessionVersion: 1,
    });
    await setDoc(doc(context.firestore(), lockPath), {
      lineLockId: lockId,
      organizationId: orgId,
      financeEntityId: 'ent-rules',
      evidenceId: 'evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      statementLineFingerprint:
        'line_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'released',
      schemaVersion: 1,
    });
    await setDoc(doc(context.firestore(), reversalPath), {
      reversalId,
      reconciliationId:
        'rec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      organizationId: orgId,
      financeEntityId: 'ent-rules',
      transactionId: 'tx_aaaaaaaaaaaaaaaa',
      reasonCode: 'wrong_transaction',
      schemaVersion: 1,
    });
  });

  const db = env.authenticatedContext(uid, {
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: orgId,
    mn_session_version: 1,
    systemRole: 'ceo',
  }).firestore();

  await ok(getDoc(doc(db, lockPath)), 'authorized browser can read server-created reconciliation line lock');
  await ok(getDoc(doc(db, reversalPath)), 'authorized browser can read server-created reversal trace');

  for (const [path, payload, label] of [
    [
      'organizations/' + orgId +
        '/financeReconciliationLineLocks/rlock_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      { organizationId: orgId, financeEntityId: 'ent-rules', status: 'active' },
      'line lock',
    ],
    [
      'organizations/' + orgId +
        '/financeReconciliationReversals/rrev_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      { organizationId: orgId, financeEntityId: 'ent-rules', reasonCode: 'other' },
      'reversal',
    ],
  ] as const) {
    await denied(setDoc(doc(db, path), payload), 'browser cannot create ' + label + ' directly');
  }

  await denied(
    updateDoc(doc(db, lockPath), { status: 'active' }),
    'browser cannot reactivate reconciliation line lock directly',
  );
  await denied(
    updateDoc(doc(db, reversalPath), { reasonCode: 'other' }),
    'browser cannot alter reversal history directly',
  );
  await denied(
    deleteDoc(doc(db, lockPath)),
    'browser cannot delete reconciliation line lock directly',
  );
  await denied(
    deleteDoc(doc(db, reversalPath)),
    'browser cannot delete reconciliation reversal directly',
  );

  console.log('\nReconciliation Reversal Rules totals: ' + passed + ' Passed');
} finally {
  await env.cleanup();
}
